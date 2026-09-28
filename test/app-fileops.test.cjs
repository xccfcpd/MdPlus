// 文件保存盲点测试（整理测试库时补充）：
// saveFile 对有路径的活动标签应调用 invoke('write_file', {path, content})；
// 对无路径标签应先调用 plugin:dialog|save 取路径再 write_file。
// 副作用方法（refreshFileMeta / updateTabDisplay / updatePreview / saveSession 等）以桩隔离，
// invoke 通过 buildEnv 的 invokeImpl 注入以捕获命令分发（app.js 在 eval 时捕获 invoke 引用，
// 必须在构建阶段注入而非事后覆盖 window.__TAURI__.core.invoke）。不触发真实 Tauri / 磁盘写入。

const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, delay } = require('./helpers/app-env.cjs');

test('fileops: saveFile 对已有路径的标签调用 write_file', async () => {
  const calls = [];
  const { w } = await buildEnv({
    captureInitErr: true,
    invokeImpl: async (cmd, args) => { calls.push({ cmd, args }); return undefined; },
  });
  await delay(300);
  const ed = w.editor;

  ed.refreshFileMeta = async () => {};
  ed.updateTabDisplay = () => {};
  ed.updatePreview = async () => {};
  ed.setStatus = () => {};
  ed.saveSession = () => {};

  await ed.addTab('note.md', '初始内容', 'C:/tmp/note.md');
  ed.activeTab.content = '# 最终内容';
  ed.activeTab.savedContent = '旧内容';

  await ed.saveFile();

  const write = calls.find(c => c.cmd === 'write_file');
  assert.ok(write, 'saveFile 应调用 write_file 命令');
  assert.strictEqual(write.args.path, 'C:/tmp/note.md', 'write_file 的 path 应为标签 filePath');
  assert.strictEqual(write.args.content, '# 最终内容', 'write_file 的 content 应为标签当前内容');
  assert.strictEqual(ed.activeTab.savedContent, '# 最终内容', '保存后 savedContent 应更新');
  cleanup(w);
});

test('fileops: saveFile 对未保存标签先走 dialogSave 取路径再 write_file', async () => {
  const calls = [];
  const { w } = await buildEnv({
    captureInitErr: true,
    invokeImpl: async (cmd, args) => {
      calls.push({ cmd, args });
      if (cmd === 'plugin:dialog|save') return 'C:/tmp/new.md';
      return undefined;
    },
  });
  await delay(300);
  const ed = w.editor;
  ed.refreshFileMeta = async () => {};
  ed.updateTabDisplay = () => {};
  ed.updatePreview = async () => {};
  ed.setStatus = () => {};
  ed.saveSession = () => {};

  const active = ed.activeTab;
  assert.strictEqual(active.filePath, null, '前置：默认标签无 filePath');

  await ed.saveFile();

  const saveCall = calls.find(c => c.cmd === 'plugin:dialog|save');
  assert.ok(saveCall, '无路径时应调用 plugin:dialog|save（保存对话框）');
  const write = calls.find(c => c.cmd === 'write_file');
  assert.ok(write, '取路径后应调用 write_file');
  assert.strictEqual(write.args.path, 'C:/tmp/new.md', '写入路径应为对话框返回的路径');
  assert.strictEqual(ed.activeTab.filePath, 'C:/tmp/new.md', '保存后标签 filePath 应更新');
  cleanup(w);
});

// —— 保存安全闸（2026-09-27 审计）——
// Rust 侧 write_file 只是 fs::write，不拒绝空内容；而下面这两类标签的 content 都不是磁盘内容，
// 一旦放过就是「原文件被截成 0 字节 + 状态栏还报已保存」，且用户拿不到任何提示。
// 这些用例钉的是**拦截行为本身**（不写盘、不弹保存对话框、必须给提示），而不是提示的确切文案。

async function buildEnvWithToasts(onInvoke) {
  const calls = [];
  const toasts = [];
  const { w } = await buildEnv({
    captureInitErr: true,
    invokeImpl: async (cmd, args) => {
      calls.push({ cmd, args });
      return onInvoke ? onInvoke(cmd, args) : undefined;
    },
  });
  await delay(300);
  const ed = w.editor;
  ed.refreshFileMeta = async () => {};
  ed.updateTabDisplay = () => {};
  ed.updatePreview = async () => {};
  ed.setStatus = () => {};
  ed.saveSession = () => {};
  ed.showToast = (msg, type) => { toasts.push({ msg, type }); };
  return { w, ed, calls, toasts };
}

// 提示必须真的落到界面上，且不能是「未翻译的 key 原文」——防新增 i18n key 拼错后静默兜底。
function assertWarnedOnce(toasts, key) {
  assert.strictEqual(toasts.length, 1, '拦截时必须给出且只给一次提示，实际：' + JSON.stringify(toasts));
  assert.strictEqual(toasts[0].type, 'warning', '提示应为 warning 级');
  const msg = toasts[0].msg;
  assert.ok(typeof msg === 'string' && msg.length > 0 && msg !== key,
    `提示文案不应为空、也不应是未翻译的 key（${key}），实际：${msg}`);
}

test('fileops: 图片标签保存必须被拦住（否则会把图片文件写成 0 字节）', async () => {
  const { w, ed, calls, toasts } = await buildEnvWithToasts();
  await ed.addTab('pic.png', '', 'C:/tmp/pic.png', 'image');
  assert.strictEqual(ed.activeTab.kind, 'image', '前置：图片标签 kind 应为 image');
  assert.strictEqual(ed.activeTab.content, '', '前置：图片标签 content 恒为空串');

  await ed.saveFile();

  assert.ok(!calls.find(c => c.cmd === 'write_file'), '不得调用 write_file：空内容会把图片截成 0 字节');
  assertWarnedOnce(toasts, 'editUnsupported');
  cleanup(w);
});

test('fileops: 读取失败的标签保存必须被拦住（否则会用空内容覆盖原文件）', async () => {
  const { w, ed, calls, toasts } = await buildEnvWithToasts();
  await ed.addTab('note.md', '', 'C:/tmp/note.md');
  // 复现懒加载失败落地后的状态（files.js 读盘 catch 分支）：content 与 savedContent 都被置空，
  // isModified 因此为 false —— 标签看起来像「干净的空文档」，这正是该缺陷的隐蔽之处。
  ed.activeTab.content = '';
  ed.activeTab.savedContent = '';
  ed.activeTab._loadError = true;
  assert.strictEqual(ed.activeTab.isModified, false, '前置：读盘失败的标签 isModified 为 false');

  await ed.saveFile();

  assert.ok(!calls.find(c => c.cmd === 'write_file'),
    '不得调用 write_file：原文件还在磁盘上，只是这次没读到');
  assertWarnedOnce(toasts, 'saveBlockedLoadFailed');
  cleanup(w);
});

test('fileops: 重新加载成功后必须解除保存拦截（否则标签被永久锁死）', async () => {
  const { w, ed, calls, toasts } = await buildEnvWithToasts(
    (cmd) => (cmd === 'read_file' ? '# 重新加载的内容' : undefined));
  await ed.addTab('note.md', '', 'C:/tmp/note.md');
  // 前置：复现「首次读盘失败」后的落地状态
  ed.activeTab.content = '';
  ed.activeTab.savedContent = '';
  ed.activeTab._loadError = true;
  ed.showLoading = () => {};
  ed.hideLoading = () => {};

  await ed.reloadFile();
  assert.strictEqual(ed.activeTab._loadError, false, '重新加载成功后必须解除 _loadError');

  await ed.saveFile();
  const write = calls.find(c => c.cmd === 'write_file');
  assert.ok(write, '重新加载后应恢复可保存（不能一直被拦截）');
  assert.strictEqual(write.args.content, '# 重新加载的内容', '应写入重新读到的内容');
  assert.strictEqual(toasts.length, 0, '恢复后不应再出现拦截提示');
  cleanup(w);
});

test('fileops: 另存为同样拦住非文本标签，且不弹保存对话框', async () => {
  const { w, ed, calls, toasts } = await buildEnvWithToasts(
    (cmd) => (cmd === 'plugin:dialog|save' ? 'C:/tmp/x.md' : undefined));
  await ed.addTab('pic.png', '', 'C:/tmp/pic.png', 'image');

  await ed.saveAsFile();

  assert.ok(!calls.find(c => c.cmd === 'plugin:dialog|save'),
    '不应弹出保存对话框：用户选了路径也只会写出一个空文件');
  assert.ok(!calls.find(c => c.cmd === 'write_file'), '不得调用 write_file');
  assertWarnedOnce(toasts, 'editUnsupported');
  cleanup(w);
});

test('fileops: text 类标签仍可正常保存（安全闸不得误拦）', async () => {
  const { w, ed, calls, toasts } = await buildEnvWithToasts();
  await ed.addTab('data.json', '{"a":1}', 'C:/tmp/data.json', 'text');
  ed.activeTab.content = '{"a":2}';

  await ed.saveFile();

  const write = calls.find(c => c.cmd === 'write_file');
  assert.ok(write, 'text 类标签应正常写盘');
  assert.strictEqual(write.args.content, '{"a":2}');
  assert.strictEqual(toasts.length, 0, '正常保存不应出现拦截提示');
  cleanup(w);
});
