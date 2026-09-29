// 格式工具栏测试：通过真实 executeMenuAction 分发，覆盖行内格式 / 标题 / 块插入 / 列表 / 链接图片对话框
const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, delay } = require('./helpers/app-env.cjs');

async function makeEditor() {
  const { w } = await buildEnv({ captureInitErr: true });
  await delay(300);
  return { w, ed: w.editor };
}

function setContent(ed, text) {
  ed.cm.setValue(text);
}

test('format: 行内格式 wrapSelection（粗/斜/删除线/行内代码/高亮/上下标）', async () => {
  const { w, ed } = await makeEditor();
  try {
    const cases = [
      ['insert-bold', '**', '**'],
      ['insert-italic', '*', '*'],
      ['insert-strikethrough', '~~', '~~'],
      ['insert-inline-code', '`', '`'],
      ['insert-highlight', '==', '=='],
      ['insert-superscript', '<sup>', '</sup>'],
      ['insert-subscript', '<sub>', '</sub>'],
    ];
    for (const [action, before, after] of cases) {
      setContent(ed, 'Hello');
      ed.cm.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 5 });
      ed.executeMenuAction(action);
      assert.strictEqual(ed.cm.getValue(), before + 'Hello' + after, `${action} 应包裹选中文本`);
    }
  } finally { cleanup(w); }
});

test('format: 无选中 bold 插入占位并定位光标到中间', async () => {
  const { w, ed } = await makeEditor();
  try {
    setContent(ed, '');
    ed.cm.setCursor({ line: 0, ch: 0 });
    ed.executeMenuAction('insert-bold');
    assert.strictEqual(ed.cm.getValue(), '****', '无选中应插入 **** 占位');
    const cur = ed.cm.getCursor();
    assert.strictEqual(cur.ch, 2, '光标应定位到 ** 之间');
  } finally { cleanup(w); }
});

test('format: 标题 H1-H6 在行首加 # 前缀', async () => {
  const { w, ed } = await makeEditor();
  try {
    const map = [['insert-h1', '# '], ['insert-h2', '## '], ['insert-h3', '### '], ['insert-h4', '#### '], ['insert-h5', '##### '], ['insert-h6', '###### ']];
    for (const [action, prefix] of map) {
      setContent(ed, '标题');
      ed.cm.setCursor({ line: 0, ch: 0 });
      ed.executeMenuAction(action);
      assert.strictEqual(ed.cm.getValue(), prefix + '标题', `${action} 应生成「${prefix}标题」`);
    }
  } finally { cleanup(w); }
});

test('format: 标题层级切换原位替换（## 标题 + H3 → ### 标题，不叠加 #）', async () => {
  const { w, ed } = await makeEditor();
  try {
    setContent(ed, '## 标题');
    ed.cm.setCursor({ line: 0, ch: 6 }); // 行尾
    ed.executeMenuAction('insert-h3');
    assert.strictEqual(ed.cm.getValue(), '### 标题', 'H2 应按 H3 原位替换，而不是「### ## 标题」');
    assert.strictEqual(ed.cm.getCursor().ch, 6, '光标应保持在行尾');
  } finally { cleanup(w); }
});

test('format: 同级标题再按一次取消标题（### 标题 + H3 → 标题）', async () => {
  const { w, ed } = await makeEditor();
  try {
    setContent(ed, '### 标题');
    ed.cm.setCursor({ line: 0, ch: 6 });
    ed.executeMenuAction('insert-h3');
    assert.strictEqual(ed.cm.getValue(), '标题', '同级按 H3 应移除标题标记回到正文');
    assert.strictEqual(ed.cm.getCursor().ch, 2, '光标应随前缀移除左移');
  } finally { cleanup(w); }
});

test('format: 无空格标题标记同样被替换（##标题 + H3 → ### 标题）', async () => {
  const { w, ed } = await makeEditor();
  try {
    setContent(ed, '##标题');
    ed.cm.setCursor({ line: 0, ch: 4 });
    ed.executeMenuAction('insert-h3');
    assert.strictEqual(ed.cm.getValue(), '### 标题', '无空格 # 前缀应被规范替换');
  } finally { cleanup(w); }
});

test('format: 多行选区统一标题层级（# A / B / ## C + H3 → 全 ###）', async () => {
  const { w, ed } = await makeEditor();
  try {
    setContent(ed, '# A\nB\n## C');
    ed.cm.setSelection({ line: 0, ch: 0 }, { line: 2, ch: 4 });
    ed.executeMenuAction('insert-h3');
    assert.strictEqual(ed.cm.getValue(), '### A\n### B\n### C', '选区每行应统一为 H3（已有标题替换、普通行追加）');
  } finally { cleanup(w); }
});

test('format: 文件树复制/剪切后清除 _fileTreeCtx，避免劫持编辑器/预览区 Ctrl+C/V', async () => {
  const { w, ed } = await makeEditor();
  try {
    const fakeNode = w.document.createElement('div');
    ed._fileTreeCtx = { path: '/tmp/a.md', isDir: false, nodeEl: fakeNode };
    ed.fileTreeCopy();
    assert.strictEqual(ed._fileTreeCtx, null, 'fileTreeCopy 后应清除 _fileTreeCtx');

    ed._fileTreeCtx = { path: '/tmp/b.md', isDir: false, nodeEl: fakeNode };
    ed.fileTreeCut();
    assert.strictEqual(ed._fileTreeCtx, null, 'fileTreeCut 后应清除 _fileTreeCtx');
  } finally { cleanup(w); }
});

test('format: 块插入 代码块/表格/引用/数学/Mermaid/分隔线/TOC/callout', async () => {
  const { w, ed } = await makeEditor();
  try {
    // 代码块
    setContent(ed, '');
    ed.executeMenuAction('insert-code-block');
    assert.ok(ed.cm.getValue().includes('```javascript'), '应插入 javascript 代码块');

    // 表格
    setContent(ed, '');
    ed.executeMenuAction('insert-table');
    assert.ok(ed.cm.getValue().includes('| 列1 | 列2 | 列3 |'), '应插入三列表格');

    // 引用
    setContent(ed, '');
    ed.executeMenuAction('insert-quote');
    assert.ok(ed.cm.getValue().includes('> '), '应插入引用前缀');

    // 数学块
    setContent(ed, '');
    ed.executeMenuAction('insert-math-block');
    assert.ok(ed.cm.getValue().includes('$$'), '应插入 $$ 数学块');

    // Mermaid
    setContent(ed, '');
    ed.executeMenuAction('insert-mermaid');
    assert.ok(ed.cm.getValue().includes('```mermaid'), '应插入 mermaid 代码块');

    // 分隔线
    setContent(ed, '');
    ed.executeMenuAction('insert-hr');
    assert.ok(ed.cm.getValue().includes('---'), '应插入分隔线');

    // TOC
    setContent(ed, '');
    ed.executeMenuAction('insert-toc');
    assert.ok(ed.cm.getValue().includes('[TOC]'), '应插入 [TOC]');

    // callout
    setContent(ed, '');
    ed.executeMenuAction('insert-callout-note');
    assert.ok(ed.cm.getValue().includes('> [!NOTE]'), '应插入 NOTE callout');
  } finally { cleanup(w); }
});

test('format: 列表 无序/有序/任务', async () => {
  const { w, ed } = await makeEditor();
  try {
    setContent(ed, '项目');
    ed.cm.setCursor({ line: 0, ch: 0 });
    ed.executeMenuAction('insert-ul');
    assert.strictEqual(ed.cm.getValue(), '- 项目', '无序列表应加 - 前缀');

    setContent(ed, '项目');
    ed.cm.setCursor({ line: 0, ch: 0 });
    ed.executeMenuAction('insert-ol');
    assert.strictEqual(ed.cm.getValue(), '1. 项目', '有序列表应加 1. 前缀');

    setContent(ed, '项目');
    ed.cm.setCursor({ line: 0, ch: 0 });
    ed.executeMenuAction('insert-task');
    assert.strictEqual(ed.cm.getValue(), '- [ ] 项目', '任务列表应加 - [ ] 前缀');
  } finally { cleanup(w); }
});

test('format: 链接对话框显示并填入当前选区', async () => {
  const { w, ed } = await makeEditor();
  try {
    for (const id of ['insert-link-text', 'insert-link-url', 'insert-link-dialog']) {
      if (!w.document.getElementById(id)) {
        const el = w.document.createElement('input'); el.id = id; w.document.body.appendChild(el);
      }
    }
    setContent(ed, '示例文字');
    ed.cm.setSelection({ line: 0, ch: 0 }, { line: 0, ch: 4 });
    ed.executeMenuAction('insert-link');
    const dialog = w.document.getElementById('insert-link-dialog');
    assert.ok(!dialog.classList.contains('hidden'), '链接对话框应显示');
    assert.strictEqual(w.document.getElementById('insert-link-text').value, '示例文字', '选区应填入链接文本');
  } finally { cleanup(w); }
});

test('format: 图片 web 路径 OK 插入 ![alt](url)', async () => {
  const { w, ed } = await makeEditor();
  try {
    for (const id of ['insert-image-alt', 'insert-image-url', 'insert-image-local-field', 'insert-image-dialog']) {
      if (!w.document.getElementById(id)) {
        const el = w.document.createElement('input'); el.id = id; w.document.body.appendChild(el);
      }
    }
    w.document.getElementById('insert-image-local-field').classList.add('hidden'); // 模拟 web 来源
    w.document.getElementById('insert-image-alt').value = 'pic';
    w.document.getElementById('insert-image-url').value = 'https://x.com/a.png';
    ed.settings.imageInsertMode = 'url'; // web 分支不检查 filePath
    await ed.handleInsertImageOk();
    assert.ok(ed.cm.getValue().includes('![pic](https://x.com/a.png)'), 'web 图片应插入 markdown 图片语法');
    assert.ok(w.document.getElementById('insert-image-dialog').classList.contains('hidden'), '确认后对话框应关闭');
  } finally { cleanup(w); }
});

test('format: 点击格式工具栏下拉项后菜单强制隐藏，鼠标移出后恢复', async () => {
  const { w, ed } = await makeEditor();
  try {
    const item = w.document.querySelector('#format-toolbar .fmt-dropdown .dropdown-item[data-action="insert-table"]');
    assert.ok(item, '应存在 结构插入→表格 菜单项');
    const menu = item.closest('.dropdown-menu');
    const dd = item.closest('.fmt-dropdown');

    // 点击前不应有 force-hide
    assert.ok(!menu.classList.contains('force-hide'), '点击前菜单不应处于 force-hide');

    // 真实派发 click，触发 initFormatToolbar 的点击委托
    item.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    assert.ok(menu.classList.contains('force-hide'), '点击菜单项后菜单应被强制隐藏（force-hide）');

    // 鼠标移出下拉区应清除 force-hide，恢复 hover 展开能力
    dd.dispatchEvent(new w.MouseEvent('mouseleave', { bubbles: true }));
    assert.ok(!menu.classList.contains('force-hide'), '鼠标移出后 force-hide 应被清除');
  } finally { cleanup(w); }
});

// ── 回归：光标在围栏代码块内时，工具栏插入不得把新块嵌进去（2026-09-29）──────────────
// 背景：insertBlock 是「在光标处插入」（不是行尾）。若光标停在已有 ``` 块内部，新块会嵌进那个块
//   ⇒ 外层块内容变成 "```d2 …" ⇒ 交给 Mermaid 就是
//   "No diagram type detected matching given configuration for text: ```d2"。
//   实测日志里三条 Mermaid 报错的文本逐条增大（仅 d2 → d2+markmap → 再吞进 $$/\label 区段），
//   正是「内容被不断吸进同一个外层块」的形态。
// 修复：插入点改到该围栏块的**闭合行行尾**（format.js 的 _fenceBlockEndAt）。
test('format: 光标在围栏代码块内 → 新块插到该代码块之后（不嵌套）', async () => {
  const { w, ed } = await makeEditor();
  try {
    setContent(ed, '```mermaid\ngraph TD; A-->B;\n```\n\ntail');
    ed.cm.setCursor({ line: 1, ch: 3 });          // 光标落在围栏块内部
    ed.executeMenuAction('insert-mermaid');
    // 按**行结构**断言：嵌套形态下第 2 行会被新块劈成 "gra" + 新块，第 3 行也不再是闭合围栏。
    const lines = ed.cm.getValue().split('\n');
    assert.strictEqual(lines[0], '```mermaid', '首块开口围栏应在第 1 行：' + JSON.stringify(lines));
    assert.strictEqual(lines[1], 'graph TD; A-->B;', '原图源码必须原样留在首块内（未被新块劈开）');
    assert.strictEqual(lines[2], '```', '首块应在第 3 行正常闭合（说明新块没有嵌进去）');
    assert.ok(lines.slice(3).some((l) => l.indexOf('```mermaid') === 0), '新块应出现在首块之后');
    assert.ok(lines.some((l) => l === 'tail'), '原文档其余内容必须保留');
  } finally { cleanup(w); }
});

test('format: 围栏未闭合（写到一半）时插入点退到文末，同样不嵌进去', async () => {
  const { w, ed } = await makeEditor();
  try {
    setContent(ed, '```mermaid\ngraph TD; A-->B;');   // 故意不闭合
    ed.cm.setCursor({ line: 1, ch: 3 });
    ed.executeMenuAction('insert-mermaid');
    const text = ed.cm.getValue();
    const second = text.indexOf('```mermaid', text.indexOf('```mermaid') + 3);
    assert.ok(second > text.indexOf('graph TD; A-->B;'),
      '未闭合围栏内插入应退到文末：' + JSON.stringify(text));
  } finally { cleanup(w); }
});

test('format: 光标在普通正文内 → 插入行为不变（不误改既有语义）', async () => {
  const { w, ed } = await makeEditor();
  try {
    setContent(ed, '第一段');
    ed.cm.setCursor({ line: 0, ch: 3 });
    ed.executeMenuAction('insert-code-block');
    const text = ed.cm.getValue();
    assert.ok(text.indexOf('第一段\n\n```') === 0,
      '普通行内插入应保持「先空两行再插入」的既有行为：' + JSON.stringify(text));
  } finally { cleanup(w); }
});
