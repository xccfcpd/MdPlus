// 文件编码保真测试（2026-09-27 核心功能体检引入）
//
// 背景：read_file 此前只回传文本、不回传源编码，write_file 恒按 UTF-8 写。后果——
//   1) GBK/GB2312 文件保存后被静默转成 UTF-8（内容不丢但文件性质变了，git diff 整文件变更）；
//   2) 带 BOM 的 UTF-8 文件保存后 BOM 丢失；
//   3) 既非 UTF-8 也非 GB18030 的文件（Big5、含非法字节）读取时用 U+FFFD 顶替且无任何提示，
//      一旦保存，原始字节被替换字符永久覆盖，不可恢复（A 级：静默数据丢失）。
// 本文件钉住修复后的契约：read_file 回传 { content, encoding, bom, hadErrors }，
// 保存时按源编码 + 原 BOM 写回；hadErrors 为真时拦截保存。
const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, delay, waitForEditor } = require('./helpers/app-env.cjs');

async function makeEditor(invokeImpl) {
  const { w } = await buildEnv({ captureInitErr: true, invokeImpl });
  const ed = await waitForEditor(w);
  // 公共副作用桩
  ed.saveSession = () => {};
  ed.setStatus = () => {};
  ed.updatePreview = async () => {};
  ed.updateTabDisplay = () => {};
  ed.refreshFileMeta = async () => {};
  ed.updateWordCount = () => {};
  return { w, ed };
}

test('encoding: 打开 GB18030 文件后保存，按源编码回写（不再静默转 UTF-8）', async () => {
  const writes = [];
  const { w, ed } = await makeEditor(async (cmd, args) => {
    if (cmd === 'read_file') return { content: '中文内容', encoding: 'gb18030', bom: false, hadErrors: false };
    if (cmd === 'write_file') { writes.push(args); return null; }
    return undefined;
  });
  try {
    await ed.openFilePath('C:/docs/gbk.md');
    await delay(10);
    await ed.saveFile();
    await delay(10);
    assert.strictEqual(writes.length, 1, '应写入一次');
    assert.strictEqual(writes[0].encoding, 'gb18030', '应带上源编码，交由后端按 GB18030 写回');
    assert.strictEqual(writes[0].bom, false);
    assert.strictEqual(writes[0].content, '中文内容', '正文应原样传递');
  } finally { cleanup(w); }
});

test('encoding: 带 BOM 的 UTF-8 文件保存后仍带 BOM', async () => {
  const writes = [];
  const { w, ed } = await makeEditor(async (cmd, args) => {
    if (cmd === 'read_file') return { content: '带 BOM 的正文', encoding: 'utf-8', bom: true, hadErrors: false };
    if (cmd === 'write_file') { writes.push(args); return null; }
    return undefined;
  });
  try {
    await ed.openFilePath('C:/docs/bom.md');
    await delay(10);
    await ed.saveFile();
    await delay(10);
    assert.strictEqual(writes.length, 1);
    assert.strictEqual(writes[0].encoding, 'utf-8');
    assert.strictEqual(writes[0].bom, true, '应保留 BOM');
  } finally { cleanup(w); }
});

test('encoding: 后端返回纯字符串（旧后端 / 桩）时保持原写入契约，不额外附加字段', async () => {
  const writes = [];
  const { w, ed } = await makeEditor(async (cmd, args) => {
    if (cmd === 'read_file') return '普通内容';
    if (cmd === 'write_file') { writes.push(args); return null; }
    return undefined;
  });
  try {
    await ed.openFilePath('C:/docs/plain.md');
    await delay(10);
    await ed.saveFile();
    await delay(10);
    assert.strictEqual(writes.length, 1);
    assert.deepStrictEqual(Object.keys(writes[0]).sort(), ['content', 'path'], '无元数据时只传 path/content');
  } finally { cleanup(w); }
});

test('encoding: 含无法解码字节（hadErrors）的文件保存被拦截，且不写盘', async () => {
  const writes = [];
  const toasts = [];
  const { w, ed } = await makeEditor(async (cmd, args) => {
    if (cmd === 'read_file') return { content: '正文\uFFFD结尾', encoding: 'gb18030', bom: false, hadErrors: true };
    if (cmd === 'write_file') { writes.push(args); return null; }
    return undefined;
  });
  try {
    ed.showToast = (msg, type) => { toasts.push({ msg, type }); };
    await ed.openFilePath('C:/docs/broken.md');
    await delay(10);
    await ed.saveFile();
    await delay(10);
    assert.strictEqual(writes.length, 0, '不得写盘，避免用 U+FFFD 覆盖原始字节');
    assert.ok(toasts.length >= 1, '应提示用户存在编码损失');
  } finally { cleanup(w); }
});

test('encoding: 另存为新路径后按 UTF-8 写入（新文件无源编码）', async () => {
  const writes = [];
  const { w, ed } = await makeEditor(async (cmd, args) => {
    if (cmd === 'read_file') return { content: 'gbk 正文', encoding: 'gb18030', bom: false, hadErrors: false };
    if (cmd === 'write_file') { writes.push(args); return null; }
    return undefined;
  });
  try {
    await ed.openFilePath('C:/docs/src-gbk.md');
    await delay(10);
    // 直接对「无元数据的新路径」调用 fileSaveArgs：验证不会误用旧编码
    const args = ed.fileSaveArgs('C:/docs/brand-new.md', '新正文');
    assert.deepStrictEqual(Object.keys(args).sort(), ['content', 'path'], '新路径不应带 encoding/bom');
  } finally { cleanup(w); }
});

test('encoding: 保存遇 InvalidEncoding 时走错误卡片，并带上后端精确原因', async () => {
  const backendJson = JSON.stringify({
    kind: 'InvalidEncoding',
    path: '',
    encoding: 'gb18030',
    message: '内容包含 GB18030 无法表示的字符，已取消保存以免损坏文件',
  });
  const { w, ed } = await makeEditor(async (cmd) => {
    if (cmd === 'read_file') return { content: '正文', encoding: 'gb18030', bom: false, hadErrors: false };
    if (cmd === 'write_file') throw new Error(backendJson);
    return undefined;
  });
  try {
    await ed.openFilePath('C:/docs/gbk-enc-err.md');
    await delay(10);
    const captured = [];
    ed.reportError = (code, opts) => { captured.push({ code, opts }); };
    await ed.saveFile();
    await delay(10);
    assert.strictEqual(captured.length, 1, '应走 reportError 错误卡片（而非状态栏原文）');
    assert.strictEqual(captured[0].code, 'E_ENCODING');
    assert.ok(
      String(captured[0].opts.detail).includes('GB18030 无法表示'),
      '应优先采用后端精确原因，而非通用 i18n 文案'
    );
    assert.strictEqual(captured[0].opts.params.encoding, 'gb18030', '应填充 {encoding} 占位符');
  } finally { cleanup(w); }
});

test('encoding: 保存遇普通 IO 错误时保持原状态栏行为，不被改成错误卡片', async () => {
  const statuses = [];
  const { w, ed } = await makeEditor(async (cmd) => {
    if (cmd === 'read_file') return { content: '正文', encoding: 'utf-8', bom: false, hadErrors: false };
    if (cmd === 'write_file') throw new Error('disk full');
    return undefined;
  });
  try {
    await ed.openFilePath('C:/docs/plain-io-err.md');
    await delay(10);
    ed.setStatus = (s) => { statuses.push(s); };
    const captured = [];
    ed.reportError = (code, opts) => { captured.push({ code, opts }); };
    await ed.saveFile();
    await delay(10);
    assert.strictEqual(captured.length, 0, '普通错误不应误走编码卡片');
    assert.ok(statuses.some((s) => String(s).includes('disk full')), '应保留原状态栏提示');
  } finally { cleanup(w); }
});
