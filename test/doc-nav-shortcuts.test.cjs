// 文档首/末导航快捷键回归测试（Ctrl+Home / Ctrl+End / Ctrl+Shift+Home / Ctrl+Shift+End）。
// 背景：项目仅在 applyShortcuts() 末尾硬编码这 4 条 extraKeys（非可配置键），
// 修正 CM 默认 goDocStart/goDocEnd 的「选中」行为为「移动」，并让 Ctrl+End 落到末行末列。
// 复用 withEditor harness（完整真实 app 实例 + 真实 CodeMirror），不重实现逻辑，
// 直接调用注册进 extraKeys 的 handler 验证行为。
//
// 注意：CodeMirror 的 Pos 对象除 line/ch 外还含 sticky 字段，故用字段比较而非整对象 deepEqual。

const test = require('node:test');
const assert = require('node:assert');
const { withEditor } = require('./helpers/app-env.cjs');

// 取出当前 extraKeys（init 时已含本次新增的 4 条）
function ekOf(ed) { return ed.cm.getOption('extraKeys'); }

// 断言光标位于 (line, ch)
function assertCursorAt(cm, line, ch, msg) {
  const c = cm.getCursor();
  assert.strictEqual(c.line, line, msg + ' (line)');
  assert.strictEqual(c.ch, ch, msg + ' (ch)');
}

// 断言选区两端分别位于 (fLine,fCh) 与 (tLine,tCh)
function assertSelectionAt(cm, fLine, fCh, tLine, tCh, msg) {
  const from = cm.getCursor('from');
  const to = cm.getCursor('to');
  assert.strictEqual(from.line, fLine, msg + ' (from line)');
  assert.strictEqual(from.ch, fCh, msg + ' (from ch)');
  assert.strictEqual(to.line, tLine, msg + ' (to line)');
  assert.strictEqual(to.ch, tCh, msg + ' (to ch)');
}

test('注册存在性：四个文档导航键均为函数', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  const ek = ekOf(ed);
  for (const k of ['Ctrl-Home', 'Ctrl-End', 'Shift-Ctrl-Home', 'Shift-Ctrl-End']) {
    assert.strictEqual(typeof ek[k], 'function', `${k} 应注册为 extraKeys 函数`);
  }
}));

test('Ctrl+Home 从中间行跳到首行首列（移动，折叠选区）', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  ed.cm.setValue('第一行\n第二行\n第三行');
  ed.cm.setCursor({ line: 2, ch: 3 });
  ekOf(ed)['Ctrl-Home'](ed.cm);
  assertCursorAt(ed.cm, 0, 0, '应跳到文档开头');
  assert.strictEqual(ed.cm.somethingSelected(), false, '移动不应留下选区');
}));

test('Ctrl+End 从中间行跳到末行末列（区别于 CM 默认「末行首列」）', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  ed.cm.setValue('第一行\n第二行\n第三行abc');
  ed.cm.setCursor({ line: 0, ch: 0 });
  const last = ed.cm.lastLine();
  const len = ed.cm.getLine(last).length;
  ekOf(ed)['Ctrl-End'](ed.cm);
  assertCursorAt(ed.cm, last, len, '应落到末行末列');
  assert.strictEqual(ed.cm.somethingSelected(), false, '移动不应留下选区');
}));

test('Ctrl+Shift+Home 从 (1,2) 选中到首行首列', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  ed.cm.setValue('第一行\n第二行\n第三行');
  ed.cm.setCursor({ line: 1, ch: 2 });
  ekOf(ed)['Shift-Ctrl-Home'](ed.cm);
  assert.strictEqual(ed.cm.somethingSelected(), true, '应产生选区');
  assertSelectionAt(ed.cm, 0, 0, 1, 2, '选区应从文档开头到原光标');
}));

test('Ctrl+Shift+End 从 (1,2) 选中到末行末列', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  ed.cm.setValue('第一行\n第二行\n第三行abc');
  ed.cm.setCursor({ line: 1, ch: 2 });
  const last = ed.cm.lastLine();
  const len = ed.cm.getLine(last).length;
  ekOf(ed)['Shift-Ctrl-End'](ed.cm);
  assert.strictEqual(ed.cm.somethingSelected(), true, '应产生选区');
  assertSelectionAt(ed.cm, 1, 2, last, len, '选区应从原光标到末行末列');
}));

// 真实事件路径：直接调用 handler 只验证了注册，这里用 triggerOnKeyDown 走完整
// 事件→keyName→extraKeys 查找链路，确保真实按键也能命中（而非仅靠 handler 存在）。
function fakeEvent(keyCode, key, ctrlKey, shiftKey) {
  return {
    type: 'keydown', keyCode, key, ctrlKey: !!ctrlKey, shiftKey: !!shiftKey,
    altKey: false, metaKey: false, preventDefault() {}, stopPropagation() {},
  };
}

test('事件路径：Ctrl+Home 通过 triggerOnKeyDown 命中 extraKeys 跳到首行首列', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  ed.cm.setValue('第一行\n第二行\n第三行');
  ed.cm.setCursor({ line: 2, ch: 3 });
  ed.cm.focus();
  ed.cm.triggerOnKeyDown(fakeEvent(36, 'Home', true, false));
  assertCursorAt(ed.cm, 0, 0, '事件路径 Ctrl+Home 应跳到首行首列');
}));

test('事件路径：Ctrl+Shift+End 通过 triggerOnKeyDown 选中到末行末列', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  ed.cm.setValue('第一行\n第二行\n第三行abc');
  ed.cm.setCursor({ line: 1, ch: 2 });
  ed.cm.focus();
  const last = ed.cm.lastLine();
  const len = ed.cm.getLine(last).length;
  ed.cm.triggerOnKeyDown(fakeEvent(35, 'End', true, true));
  assert.strictEqual(ed.cm.somethingSelected(), true, '事件路径应产生选区');
  assertSelectionAt(ed.cm, 1, 2, last, len, '事件路径选区应从原光标到末行末列');
}));

test('空文档边界：Ctrl+End / Ctrl+Home 在空文档不抛错且光标为 (0,0)', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  ed.cm.setValue('');
  assert.doesNotThrow(() => ekOf(ed)['Ctrl-End'](ed.cm), '空文档 Ctrl+End 不应抛错');
  assertCursorAt(ed.cm, 0, 0, '空文档 Ctrl+End 光标应为 (0,0)');
  assert.doesNotThrow(() => ekOf(ed)['Ctrl-Home'](ed.cm), '空文档 Ctrl+Home 不应抛错');
  assertCursorAt(ed.cm, 0, 0, '空文档 Ctrl+Home 光标应为 (0,0)');
}));
