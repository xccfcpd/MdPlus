// Ctrl+方向键「按词移动 / 选择」回归测试（方案 B：Intl.Segmenter 中文分词）。
// 背景：项目在 applyShortcuts() 末尾硬编码这 4 条 extraKeys（非可配置键），
// Ctrl+←/→ 按「词」移动（中文按词跳，如 地基/承载 分开；英文/数字按词跳），
// Ctrl+Shift+←/→ 选择词。复用 CodeMirror extendSelectionsBy（Shift 自动扩展选区）。
// 复用 withEditor harness（完整真实 app 实例 + 真实 CodeMirror），直接调用注册进
// extraKeys 的 handler 验证行为；Shift 版用 triggerOnKeyDown 走真实事件路径以激活
// display.shift（扩展选区依赖它）。
//
// 注意：CodeMirror 的 Pos 对象除 line/ch 外还含 sticky 字段，故用字段比较而非整对象 deepEqual。

const test = require('node:test');
const assert = require('node:assert');
const { withEditor } = require('./helpers/app-env.cjs');

function ekOf(ed) { return ed.cm.getOption('extraKeys'); }

function assertCursorAt(cm, line, ch, msg) {
  const c = cm.getCursor();
  assert.strictEqual(c.line, line, msg + ' (line)');
  assert.strictEqual(c.ch, ch, msg + ' (ch)');
}

function assertSelectionAt(cm, fLine, fCh, tLine, tCh, msg) {
  const from = cm.getCursor('from');
  const to = cm.getCursor('to');
  assert.strictEqual(from.line, fLine, msg + ' (from line)');
  assert.strictEqual(from.ch, fCh, msg + ' (from ch)');
  assert.strictEqual(to.line, tLine, msg + ' (to line)');
  assert.strictEqual(to.ch, tCh, msg + ' (to ch)');
}

function fakeEvent(keyCode, key, ctrlKey, shiftKey) {
  return {
    type: 'keydown', keyCode, key, ctrlKey: !!ctrlKey, shiftKey: !!shiftKey,
    altKey: false, metaKey: false, preventDefault() {}, stopPropagation() {},
  };
}

const ARROW_LEFT = 37;
const ARROW_RIGHT = 39;

test('注册存在性：四个方向词导航键均为函数', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  const ek = ekOf(ed);
  for (const k of ['Ctrl-Left', 'Ctrl-Right', 'Shift-Ctrl-Left', 'Shift-Ctrl-Right']) {
    assert.strictEqual(typeof ek[k], 'function', `${k} 应注册为 extraKeys 函数`);
  }
}));

test('英文：Ctrl+→ 从行首依次跳到 hello/world/foo 词尾', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  ed.cm.setValue('hello world foo');
  ed.cm.setCursor({ line: 0, ch: 0 });
  const ek = ekOf(ed);
  ek['Ctrl-Right'](ed.cm); assertCursorAt(ed.cm, 0, 5, '应跳到 hello 词尾');
  ek['Ctrl-Right'](ed.cm); assertCursorAt(ed.cm, 0, 11, '应跳到 world 词尾');
  ek['Ctrl-Right'](ed.cm); assertCursorAt(ed.cm, 0, 15, '应跳到 foo 词尾');
}));

// 用与 app 相同的分词逻辑（Intl.Segmenter 优先，正则降级）计算一行内各词尾位置，
// 避免把字典切分细节硬编码进断言（如「橙子」可能被切成 橙/子）。
function wordEnds(lineText) {
  let words = [];
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    try {
      const seg = new Intl.Segmenter('zh', { granularity: 'word' });
      for (const s of seg.segment(lineText)) if (s.isWordLike) words.push([s.index, s.index + s.segment.length]);
    } catch (e) { /* 降级 */ }
  }
  if (words.length === 0) {
    const re = /[\w一-鿿]+/g;
    let m;
    while ((m = re.exec(lineText)) !== null) words.push([m.index, m.index + m[0].length]);
  }
  return [...new Set(words.map((w) => w[1]))].sort((a, b) => a - b);
}

test('中文：Ctrl+→ 按词依次跳到各词尾（字典无关）', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  const line = '苹果 香蕉 橙子';
  ed.cm.setValue(line);
  ed.cm.setCursor({ line: 0, ch: 0 });
  const ek = ekOf(ed);
  const expected = wordEnds(line); // 依字典可能为 [2,5,7,8] 等
  for (const exp of expected) {
    ek['Ctrl-Right'](ed.cm);
    assertCursorAt(ed.cm, 0, exp, `应跳到词尾 ${exp}`);
  }
  // 越过最后一个词尾后，再按一次应落行尾
  ek['Ctrl-Right'](ed.cm);
  assertCursorAt(ed.cm, 0, line.length, '最终应落行尾');
}));

test('跳过标点：Ctrl+→ 从 (0,0) 落在 (5.2.5) 内数字串末尾、跳过左括号', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  ed.cm.setValue('(5.2.5)');
  ed.cm.setCursor({ line: 0, ch: 0 });
  ekOf(ed)['Ctrl-Right'](ed.cm);
  assertCursorAt(ed.cm, 0, 6, '应跳到 5.2.5 末尾（右括号前）');
}));

test('向左：Ctrl+← 从 world 词尾跳到词头，再跳到行首', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  ed.cm.setValue('hello world');
  ed.cm.setCursor({ line: 0, ch: 11 });
  const ek = ekOf(ed);
  ek['Ctrl-Left'](ed.cm); assertCursorAt(ed.cm, 0, 6, '应跳到 world 词头');
  ek['Ctrl-Left'](ed.cm); assertCursorAt(ed.cm, 0, 0, '应跳到行首（hello 词头）');
}));

test('跨行：两行中文 Ctrl+→ 先停在首行词尾，再跨到次行词尾', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  ed.cm.setValue('苹果\n香蕉');
  ed.cm.setCursor({ line: 0, ch: 0 });
  const ek = ekOf(ed);
  ek['Ctrl-Right'](ed.cm); assertCursorAt(ed.cm, 0, 2, '首行 苹果 词尾');
  ek['Ctrl-Right'](ed.cm); assertCursorAt(ed.cm, 1, 2, '跨到次行 香蕉 词尾');
}));

test('事件路径：Ctrl+Shift+→ 通过 triggerOnKeyDown 选中从 (0,0) 到 hello 词尾', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  ed.cm.setValue('hello world');
  ed.cm.setCursor({ line: 0, ch: 0 });
  ed.cm.focus();
  ed.cm.triggerOnKeyDown(fakeEvent(ARROW_RIGHT, 'ArrowRight', true, true));
  assert.strictEqual(ed.cm.somethingSelected(), true, '应产生选区');
  assertSelectionAt(ed.cm, 0, 0, 0, 5, '选区应从行首到 hello 词尾');
}));

test('事件路径：Ctrl+Shift+← 从行尾向左选中到 world 词头', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  ed.cm.setValue('hello world');
  ed.cm.setCursor({ line: 0, ch: 11 });
  ed.cm.focus();
  ed.cm.triggerOnKeyDown(fakeEvent(ARROW_LEFT, 'ArrowLeft', true, true));
  assert.strictEqual(ed.cm.somethingSelected(), true, '应产生选区');
  assertSelectionAt(ed.cm, 0, 6, 0, 11, '选区应从 world 词头到行尾');
}));

test('空文档边界：Ctrl+← / Ctrl+→ 在空文档不抛错且光标为 (0,0)', async () => withEditor({ captureInitErr: true }, async (w, ed) => {
  ed.cm.setValue('');
  assert.doesNotThrow(() => ekOf(ed)['Ctrl-Left'](ed.cm), '空文档 Ctrl+← 不应抛错');
  assertCursorAt(ed.cm, 0, 0, '空文档 Ctrl+← 光标应为 (0,0)');
  assert.doesNotThrow(() => ekOf(ed)['Ctrl-Right'](ed.cm), '空文档 Ctrl+→ 不应抛错');
  assertCursorAt(ed.cm, 0, 0, '空文档 Ctrl+→ 光标应为 (0,0)');
}));
