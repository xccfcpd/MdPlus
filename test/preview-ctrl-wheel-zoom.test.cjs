// 预览区 Ctrl + 鼠标滚轮缩放字号测试
// 覆盖：基础放大/缩小/上下限、顶部提示、重置按钮、3 秒消失、hover、与编辑器共用提示条。
// 与 test/ctrl-wheel-zoom.test.cjs（编辑器缩放）保持同构，差异仅在作用对象为预览。
// 顶部提示与编辑器共用同一 zoomHint 元素（showZoomHint('preview')），同一时刻只显示一个。
const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, waitForEditor } = require('./helpers/app-env.cjs');

async function makeEnv() {
  const { w } = await buildEnv({ captureInitErr: true });
  const ed = await waitForEditor(w);
  return { w, ed };
}

// 在预览滚动容器（#preview-pane）上派发带 ctrlKey / deltaY 的 wheel 事件
// （jsdom 下 WheelEvent 的 ctrlKey/deltaY 为只读，用 defineProperty 注入）
function dispatchWheel(w, ed, { ctrlKey, deltaY }) {
  const pane = ed.previewPane || w.document.getElementById('preview-pane');
  const ev = new w.Event('wheel', { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'ctrlKey', { value: ctrlKey, configurable: true });
  Object.defineProperty(ev, 'deltaY', { value: deltaY, configurable: true });
  pane.dispatchEvent(ev);
  return ev;
}

test('ctrl+wheel 向上滚动放大预览字体 1px 并拦截默认行为', async () => {
  const { w, ed } = await makeEnv();
  try {
    const base = ed.settings.previewFontSize;
    assert.strictEqual(parseInt(ed.preview.style.fontSize, 10), base, '初始化后字号应等于 settings.previewFontSize');
    const ev = dispatchWheel(w, ed, { ctrlKey: true, deltaY: -100 });
    assert.strictEqual(ev.defaultPrevented, true, 'Ctrl+滚轮应阻止默认（页面/预览滚动）');
    assert.strictEqual(parseInt(ed.preview.style.fontSize, 10), base + 1, '放大后应为基准 +1px');
    assert.strictEqual(ed.previewZoom, base + 1, '应写入运行时 previewZoom');
  } finally { cleanup(w); }
});

test('ctrl+wheel 向下滚动缩小预览字体 1px', async () => {
  const { w, ed } = await makeEnv();
  try {
    const base = ed.settings.previewFontSize;
    const ev = dispatchWheel(w, ed, { ctrlKey: true, deltaY: 100 });
    assert.strictEqual(parseInt(ed.preview.style.fontSize, 10), base - 1, '缩小后应为基准 -1px');
    assert.strictEqual(ed.previewZoom, base - 1);
    assert.strictEqual(ev.defaultPrevented, true);
  } finally { cleanup(w); }
});

test('ctrl+wheel 放大到上限 72px 后不再增大', async () => {
  const { w, ed } = await makeEnv();
  try {
    for (let i = 0; i < 100; i++) dispatchWheel(w, ed, { ctrlKey: true, deltaY: -100 });
    assert.strictEqual(parseInt(ed.preview.style.fontSize, 10), 72, '应钳制在 72px');
    assert.strictEqual(ed.previewZoom, 72);
    dispatchWheel(w, ed, { ctrlKey: true, deltaY: -100 });
    assert.strictEqual(parseInt(ed.preview.style.fontSize, 10), 72, '上限处再次放大仍保持 72px');
  } finally { cleanup(w); }
});

test('ctrl+wheel 缩小到下限 8px 后不再减小', async () => {
  const { w, ed } = await makeEnv();
  try {
    for (let i = 0; i < 100; i++) dispatchWheel(w, ed, { ctrlKey: true, deltaY: 100 });
    assert.strictEqual(parseInt(ed.preview.style.fontSize, 10), 8, '应钳制在 8px');
    assert.strictEqual(ed.previewZoom, 8);
    dispatchWheel(w, ed, { ctrlKey: true, deltaY: 100 });
    assert.strictEqual(parseInt(ed.preview.style.fontSize, 10), 8);
  } finally { cleanup(w); }
});

test('普通滚轮（无 Ctrl）不改变预览字号且不拦截', async () => {
  const { w, ed } = await makeEnv();
  try {
    const before = ed.preview.style.fontSize;
    const ev = dispatchWheel(w, ed, { ctrlKey: false, deltaY: -100 });
    assert.strictEqual(ed.preview.style.fontSize, before, '无 Ctrl 不应改变字号');
    assert.strictEqual(ev.defaultPrevented, false, '无 Ctrl 不应拦截默认滚动');
  } finally { cleanup(w); }
});

test('ctrl+wheel 缩放后顶部居中显示字号提示（含设置字号与重置按钮）', async () => {
  const { w, ed } = await makeEnv();
  try {
    const base = ed.settings.previewFontSize;
    dispatchWheel(w, ed, { ctrlKey: true, deltaY: -100 });
    const hint = ed.zoomHint;
    assert.ok(hint.classList.contains('show'), '顶部提示应可见');
    const textEl = hint.querySelector('.zoom-hint-text');
    assert.strictEqual(textEl.textContent, ed.t('previewFontSizeHint', { size: base + 1 }), '左侧应显示当前预览字号');
    const resetEl = hint.querySelector('.zoom-hint-reset');
    assert.ok(!resetEl.classList.contains('hidden'), '偏离设置字号时重置按钮应可见');
    assert.strictEqual(resetEl.textContent, ed.t('fontSizeReset', { base }), '右侧按钮应为「还原 Npx」');
  } finally { cleanup(w); }
});

test('命中设置字号时提示仅显示当前字号、重置按钮隐藏', async () => {
  const { w, ed } = await makeEnv();
  try {
    const textEl = ed.zoomHint.querySelector('.zoom-hint-text');
    const resetEl = ed.zoomHint.querySelector('.zoom-hint-reset');
    // 主动调用 resetPreviewFontSize，让预览回到设置字号
    ed.resetPreviewFontSize();
    const base = ed.settings.previewFontSize;
    assert.strictEqual(ed.previewZoom, null, '重置后 previewZoom 应为 null');
    assert.ok(ed.zoomHint.classList.contains('show'));
    assert.strictEqual(textEl.textContent, ed.t('previewFontSizeHint', { size: base }));
    assert.ok(resetEl.classList.contains('hidden'), '命中设置字号时重置按钮应隐藏');
  } finally { cleanup(w); }
});

test('点击 ⟲ 重置按钮恢复到出厂默认字号', async () => {
  const { w, ed } = await makeEnv();
  try {
    const base = ed.settings.previewFontSize;
    dispatchWheel(w, ed, { ctrlKey: true, deltaY: -100 });
    assert.strictEqual(ed.previewZoom, base + 1, '缩放后 previewZoom 偏离');
    const resetEl = ed.zoomHint.querySelector('.zoom-hint-reset');
    resetEl.click();
    assert.strictEqual(ed.previewZoom, null, '重置后 previewZoom 应为 null');
    assert.strictEqual(parseInt(ed.preview.style.fontSize, 10), base, '预览字号应同步回默认');
    assert.strictEqual(ed.settings.previewFontSize, base, '设置应写回默认字号');
    const textEl = ed.zoomHint.querySelector('.zoom-hint-text');
    assert.strictEqual(textEl.textContent, ed.t('previewFontSizeHint', { size: base }));
  } finally { cleanup(w); }
});

test('应用设置后预览运行时缩放回落到设置字号', async () => {
  const { w, ed } = await makeEnv();
  try {
    const base = ed.settings.previewFontSize;
    dispatchWheel(w, ed, { ctrlKey: true, deltaY: -100 });
    assert.strictEqual(ed.previewZoom, base + 1, '缩放后 previewZoom 应偏离设置');
    // 重新应用设置（模拟用户在设置面板更改/确认）
    await ed.applySettings();
    assert.strictEqual(ed.previewZoom, null, '应用设置后 previewZoom 应回落为 null');
    assert.strictEqual(parseInt(ed.preview.style.fontSize, 10), base, '预览字号应回到设置字号');
  } finally { cleanup(w); }
});

test('编辑器与预览共用同一提示条：先后缩放不重叠，内容按模式切换', async () => {
  const { w, ed } = await makeEnv();
  try {
    // 先在编辑器上 Ctrl+滚轮放大
    const wrapper = ed.cm.getWrapperElement();
    const evEditor = new w.Event('wheel', { bubbles: true, cancelable: true });
    Object.defineProperty(evEditor, 'ctrlKey', { value: true, configurable: true });
    Object.defineProperty(evEditor, 'deltaY', { value: -100, configurable: true });
    wrapper.dispatchEvent(evEditor);
    const hint = ed.zoomHint;
    const editorBase = ed.settings.fontSize;
    assert.ok(hint.classList.contains('show'), '编辑缩放后提示条应显示');
    assert.strictEqual(hint.querySelector('.zoom-hint-text').textContent, ed.t('fontSizeHint', { size: editorBase + 1 }), '此时应显示编辑器字号');
    // 再在预览上 Ctrl+滚轮放大：同一提示条内容切换为预览字号，不产生第二个提示条
    dispatchWheel(w, ed, { ctrlKey: true, deltaY: -100 });
    const previewBase = ed.settings.previewFontSize;
    assert.ok(hint.classList.contains('show'), '预览缩放后提示条仍显示');
    assert.strictEqual(hint.querySelector('.zoom-hint-text').textContent, ed.t('previewFontSizeHint', { size: previewBase + 1 }), '内容应切换为预览字号');
    assert.strictEqual(w.document.querySelectorAll('.zoom-hint').length, 1, '应只有一个提示条元素，不会重叠遮挡');
    // 两侧字号互不影响
    assert.strictEqual(ed.editorZoom, editorBase + 1, '编辑器字号应保留');
    assert.strictEqual(ed.previewZoom, previewBase + 1, '预览字号应保留');
  } finally { cleanup(w); }
});

test('共用提示条重置按钮按当前模式分派：预览模式点重置恢复预览字号', async () => {
  const { w, ed } = await makeEnv();
  try {
    const editorBase = ed.settings.fontSize;
    const previewBase = ed.settings.previewFontSize;
    // 先编辑缩放（提示条为编辑器模式），再预览缩放（切换到预览模式）
    const wrapper = ed.cm.getWrapperElement();
    const evEditor = new w.Event('wheel', { bubbles: true, cancelable: true });
    Object.defineProperty(evEditor, 'ctrlKey', { value: true, configurable: true });
    Object.defineProperty(evEditor, 'deltaY', { value: -100, configurable: true });
    wrapper.dispatchEvent(evEditor);
    dispatchWheel(w, ed, { ctrlKey: true, deltaY: -100 });
    assert.strictEqual(ed.previewZoom, previewBase + 1, '预览已缩放');
    // 点重置：应恢复预览字号，而非编辑器字号
    ed.zoomHint.querySelector('.zoom-hint-reset').click();
    assert.strictEqual(ed.previewZoom, null, '预览字号应回设置字号');
    assert.strictEqual(parseInt(ed.preview.style.fontSize, 10), previewBase, '预览字号应同步');
    assert.strictEqual(ed.editorZoom, editorBase + 1, '编辑器字号应不受影响');
  } finally { cleanup(w); }
});

test('停止缩放 3 秒后顶部提示自动消失', async () => {
  const { w, ed } = await makeEnv();
  try {
    dispatchWheel(w, ed, { ctrlKey: true, deltaY: -100 });
    assert.ok(ed.zoomHint.classList.contains('show'), '触发后顶部提示应显示');
    await new Promise((r) => setTimeout(r, 3100));
    assert.ok(!ed.zoomHint.classList.contains('show'), '3 秒后顶部提示应自动隐藏');
  } finally { cleanup(w); }
});

test('hover 时顶部提示不消失，移出后 3 秒消失', async () => {
  const { w, ed } = await makeEnv();
  try {
    dispatchWheel(w, ed, { ctrlKey: true, deltaY: -100 });
    assert.ok(ed.zoomHint.classList.contains('show'), '触发后顶部提示应显示');
    // 模拟鼠标移入：标记 hovering 并派发 mouseenter
    ed._zoomHintHovering = true;
    ed.zoomHint.dispatchEvent(new w.Event('mouseenter'));
    assert.ok(ed._zoomHintHovering, 'hovering 标志应为真');
    // 即便等过 3 秒也不应消失
    await new Promise((r) => setTimeout(r, 3200));
    assert.ok(ed.zoomHint.classList.contains('show'), 'hover 期间顶部提示应保持显示');
    // 移出：重启 3 秒倒计时
    ed.zoomHint.dispatchEvent(new w.Event('mouseleave'));
    assert.ok(!ed._zoomHintHovering, '移出后 hovering 标志应为假');
    await new Promise((r) => setTimeout(r, 3100));
    assert.ok(!ed.zoomHint.classList.contains('show'), '移出 3 秒后顶部提示应隐藏');
  } finally { cleanup(w); }
});

test('预览字号调整后 3 秒回写设置并落盘，重启保持', async () => {
  const { w, ed } = await makeEnv();
  try {
    const base = ed.settings.previewFontSize;
    dispatchWheel(w, ed, { ctrlKey: true, deltaY: -100 });
    assert.strictEqual(ed.settings.previewFontSize, base, '3 秒还原窗口期内不应立即写回设置');
    await new Promise((r) => setTimeout(r, 3100));
    assert.strictEqual(ed.settings.previewFontSize, base + 1, 'hint 消失后应写回 settings.previewFontSize');
    const stored = JSON.parse(w.localStorage.getItem('tizumark-settings'));
    assert.strictEqual(stored.previewFontSize, base + 1, '应落盘到 localStorage');
  } finally { cleanup(w); }
});
