// 表格行内 Enter 自动补充结构测试
// 测试 _handleTableEnter 方法的各种场景
const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, delay } = require('./helpers/app-env.cjs');

async function makeEditor(initialContent) {
  const { w } = await buildEnv({ captureInitErr: true });
  await delay(300);
  const ed = w.editor;
  if (initialContent) ed.cm.setValue(initialContent);
  return { w, ed };
}

function content(ed) {
  return ed.cm.getValue();
}

test('table-enter: 光标在表格行尾按 Enter 自动补齐分隔行并插入等列新行（3 列）', async () => {
  const { w, ed } = await makeEditor('| a | b | c |');
  try {
    // 光标定位到行尾
    ed.cm.setCursor({ line: 0, ch: 13 });
    ed._handleTableEnter(ed.cm);
    const lines = content(ed).split('\n');
    assert.strictEqual(lines.length, 3, '应生成 3 行（表头 + 分隔行 + 空白行）');
    assert.strictEqual(lines[0], '| a | b | c |', '第一行内容不变');
    // 缺分隔行 → 自动补齐
    assert.strictEqual(lines[1], '| --- | --- | --- |', '应自动补齐分隔行');
    // 第三行应为 3 列空白行
    const cols = lines[2].split('|').length - 2; // 去掉首尾空
    assert.strictEqual(cols, 3, '第三行应是 3 列');
    // 光标应在空白行第一格
    const cursor = ed.cm.getCursor();
    assert.strictEqual(cursor.line, 2, '光标应在第 3 行');
    assert.strictEqual(cursor.ch, 2, '光标应在第一格');
  } finally { cleanup(w); }
});

test('table-enter: 4 列表格行按 Enter 生成 4 列空白行', async () => {
  const { w, ed } = await makeEditor('| h1 | h2 | h3 | h4 |');
  try {
    ed.cm.setCursor({ line: 0, ch: 19 });
    ed._handleTableEnter(ed.cm);
    const lines = content(ed).split('\n');
    // lines[0]=表头, lines[1]=分隔行, lines[2]=空白行
    const cols = lines[2].split('|').length - 2;
    assert.strictEqual(cols, 4, '4 列表格应生成 4 列空白行');
  } finally { cleanup(w); }
});

test('table-enter: 空表格行按 Enter 退出表格（删除行）', async () => {
  const { w, ed } = await makeEditor('|   |   |   |');
  try {
    ed.cm.setCursor({ line: 0, ch: 13 });
    ed._handleTableEnter(ed.cm);
    // 空行应被删除，文件应为空
    assert.strictEqual(content(ed), '', '空表格行应按 Enter 删除');
  } finally { cleanup(w); }
});

test('table-enter: 空表格行在非最后一行时退出保留后续行', async () => {
  const { w, ed } = await makeEditor('| a | b |\n|   |   |\n| c | d |');
  try {
    ed.cm.setCursor({ line: 1, ch: 8 });
    ed._handleTableEnter(ed.cm);
    const lines = content(ed).split('\n');
    assert.strictEqual(lines.length, 2, '中间空行删除后应剩 2 行');
    assert.strictEqual(lines[0], '| a | b |', '第一行不变');
    assert.strictEqual(lines[1], '| c | d |', '第三行上移');
  } finally { cleanup(w); }
});

test('table-enter: 分隔行按 Enter 不生成表格结构（走正常列表延续/换行）', async () => {
  const { w, ed } = await makeEditor('|---|---|---|');
  try {
    // 光标置于行尾，使 newlineAndIndent 在行尾换行
    const lineLen = ed.cm.getLine(0).length;
    ed.cm.setCursor({ line: 0, ch: lineLen });
    ed._handleTableEnter(ed.cm);
    const lines = content(ed).split('\n');
    // 分隔行应视为非表格行，只做普通换行 - 不创建表格列
    assert.strictEqual(lines.length, 2, '分隔行 Enter 应产生 2 行（普通换行）');
    assert.strictEqual(lines[0], '|---|---|---|', '分隔行不变');
    assert.strictEqual(lines[1], '', '第二行应为空');
  } finally { cleanup(w); }
});

test('table-enter: 无序列表行按 Enter 延续列表结构', async () => {
  const { w, ed } = await makeEditor('- item');
  try {
    const lineLen = ed.cm.getLine(0).length;
    ed.cm.setCursor({ line: 0, ch: lineLen });
    ed._handleTableEnter(ed.cm);
    const lines = content(ed).split('\n');
    assert.strictEqual(lines.length, 2, '列表行 Enter 应产生 2 行');
    assert.strictEqual(lines[0], '- item', '原行不变');
    assert.strictEqual(lines[1], '', '第二行应为普通空行（测试环境无 continuelsit 插件）');
  } finally { cleanup(w); }
});

test('table-enter: 光标在中间时仍生成完整新行（含自动补齐分隔行）', async () => {
  const { w, ed } = await makeEditor('| a | b | c |');
  try {
    // 光标在第一个格中间
    ed.cm.setCursor({ line: 0, ch: 3 });
    ed._handleTableEnter(ed.cm);
    const lines = content(ed).split('\n');
    assert.strictEqual(lines.length, 3, '应生成 3 行');
    assert.strictEqual(lines[1], '| --- | --- | --- |', '应自动补齐分隔行');
    const cols = lines[2].split('|').length - 2;
    assert.strictEqual(cols, 3, '第三行应是 3 列');
  } finally { cleanup(w); }
});

// ===== 表格自动整理（用户反馈）=====
test('table-enter: 整理不规范表格（缺分隔行 + 单元格无空格 + 列数不统一）', async () => {
  const { w, ed } = await makeEditor('|a|b|c|\n|1|2|3|');
  try {
    ed.cm.setCursor({ line: 0, ch: 8 });
    ed._handleTableEnter(ed.cm);
    const lines = content(ed).split('\n');
    assert.strictEqual(lines[0], '| a | b | c |', '首行单元格应规范加空格');
    assert.strictEqual(lines[1], '| --- | --- | --- |', '应补齐分隔行');
    assert.strictEqual(lines[2], '|  |  |  |', '应插入等列空白行');
    assert.strictEqual(lines[3], '| 1 | 2 | 3 |', '次行单元格应规范加空格');
  } finally { cleanup(w); }
});

test('table-enter: 分隔行不规范（|--|）按 Enter 整理为 | --- |', async () => {
  const { w, ed } = await makeEditor('| a | b |\n|--|\n| 1 | 2 |');
  try {
    ed.cm.setCursor({ line: 0, ch: 9 });
    ed._handleTableEnter(ed.cm);
    const lines = content(ed).split('\n');
    assert.strictEqual(lines[1], '| --- | --- |', '不规范分隔行应规范为 | --- |');
  } finally { cleanup(w); }
});

test('addTableColumn: 在光标列右侧插入空白列', async () => {
  const { w, ed } = await makeEditor('| a | b | c |');
  try {
    ed.cm.setCursor({ line: 0, ch: 5 }); // 落在第 1 列（b）
    ed._addTableColumn(ed.cm);
    const line = content(ed);
    const cols = line.split('|').length - 2;
    assert.strictEqual(cols, 4, '应在原 3 列基础上新增 1 列');
    assert.strictEqual(line, '| a | b |  | c |', '新列应插在第 1 列右侧（b 与 c 之间）');
  } finally { cleanup(w); }
});

test('addTableRow: 在表格数据行下方插入等列空白行', async () => {
  const { w, ed } = await makeEditor('| a | b | c |\n| --- | --- | --- |');
  try {
    ed.cm.setCursor({ line: 0, ch: 9 });
    ed._addTableRow(ed.cm);
    const lines = content(ed).split('\n');
    assert.strictEqual(lines.length, 3, '应新增一行');
    assert.strictEqual(lines[2], '|  |  |  |', '新行应为 3 列空白行');
    const cursor = ed.cm.getCursor();
    assert.strictEqual(cursor.line, 2, '光标应在新行');
    assert.strictEqual(cursor.ch, 2, '光标应在第一格');
  } finally { cleanup(w); }
});
