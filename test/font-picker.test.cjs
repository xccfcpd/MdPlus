// FontPicker 组件单元测试：纯 jsdom，不经过 app harness（不经 Tauri）。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><body></body>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;

const FontPicker = require('../src/modules/font-picker.js');

function makePicker(opts = {}) {
  const root = document.createElement('div');
  root.id = opts.id || 'set-editor-font';
  document.body.appendChild(root);
  const calls = [];
  const picker = new FontPicker(root, {
    value: opts.value || '',
    placeholder: opts.placeholder || '默认',
    t: opts.t || ((k) => ({ defaultFont: '默认', noMatchingFonts: '无匹配字体' }[k] || k)),
    onChange: (v) => calls.push(v),
    groups: opts.groups || [
      { label: '系统字体', items: [{ value: 'DengXian', label: 'DengXian', fontFamily: '"DengXian"' }, { value: 'Consolas', label: 'Consolas', fontFamily: '"Consolas"' }] },
      { label: '自定义字体', items: [{ value: 'cfA', label: '我的字体', fontFamily: "'tizumark-custom-cfA'" }] },
    ],
  });
  return { root, picker, calls };
}

function open(p) {
  p.picker.input.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
}

function key(p, k) {
  p.picker.input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true }));
}

test('font-picker: 展开渲染「默认」+ 系统分组 + 自定义分组', () => {
  const p = makePicker();
  try {
    assert.ok(p.root.querySelector('.font-picker-input'), '应有输入框');
    assert.ok(p.root.querySelector('.font-picker-dropdown').classList.contains('hidden'), '初始收起');
    open(p);
    const dd = p.root.querySelector('.font-picker-dropdown');
    assert.ok(!dd.classList.contains('hidden'), '点击展开');
    const items = [...dd.querySelectorAll('.font-picker-item')];
    assert.strictEqual(items.length, 4, '应有 默认+DengXian+Consolas+我的字体 4 项');
    assert.strictEqual(items[0].getAttribute('data-value'), '', '首项为空值（默认）');
    assert.strictEqual(items[0].textContent, '默认');
    const labels = [...dd.querySelectorAll('.font-picker-group-label')].map((e) => e.textContent);
    assert.deepStrictEqual(labels, ['系统字体', '自定义字体'], '两个分组标签');
    const vals = [...dd.querySelectorAll('.font-picker-item')].map((e) => e.getAttribute('data-value'));
    assert.deepStrictEqual(vals, ['', 'DengXian', 'Consolas', 'cfA'], '值=空/族名原文/自定义id');
  } finally { p.root.remove(); }
});

test('font-picker: 输入过滤只留匹配项，默认项在过滤时隐藏', () => {
  const p = makePicker();
  try {
    open(p);
    p.picker.input.value = 'den';
    p.picker.input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    const items = [...p.root.querySelectorAll('.font-picker-item')];
    assert.strictEqual(items.length, 1, '过滤 den 只剩 DengXian');
    assert.strictEqual(items[0].textContent, 'DengXian');
    // 无匹配
    p.picker.input.value = 'zzz';
    p.picker.input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    assert.strictEqual(p.root.querySelectorAll('.font-picker-item').length, 0, '无匹配项');
    assert.ok(p.root.querySelector('.font-picker-empty'), '显示无匹配提示');
  } finally { p.root.remove(); }
});

test('font-picker: ArrowDown+Enter 选中并触发 onChange', () => {
  const p = makePicker();
  try {
    open(p);
    key(p, 'ArrowDown'); // 高亮默认项(索引0) → 系统组? 循环: 默认=0
    key(p, 'ArrowDown'); // 索引1 = DengXian
    key(p, 'Enter');
    assert.deepStrictEqual(p.calls, ['DengXian'], 'Enter 选中 DengXian 并回调');
    assert.ok(p.root.querySelector('.font-picker-dropdown').classList.contains('hidden'), '选中后关闭');
    assert.strictEqual(p.picker.input.value, 'DengXian', '输入框显示选中字体');
    assert.strictEqual(p.picker.getValue(), 'DengXian');
  } finally { p.root.remove(); }
});

test('font-picker: 选择「默认」空值项触发 onChange("")', () => {
  const p = makePicker({ value: 'Consolas' });
  try {
    open(p);
    const def = p.root.querySelector('.font-picker-item-default');
    def.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    assert.deepStrictEqual(p.calls, [''], '选中默认触发空值回调');
    assert.strictEqual(p.picker.getValue(), '');
    assert.strictEqual(p.picker.input.value, '默认', '空值时显示占位符');
  } finally { p.root.remove(); }
});

test('font-picker: 候选项以真实字体渲染（fontFamily 内联样式）', () => {
  const p = makePicker();
  try {
    open(p);
    const items = [...p.root.querySelectorAll('.font-picker-item')];
    // 默认项无 fontFamily；系统/自定义项应用各自 fontFamily
    assert.strictEqual(items[0].style.fontFamily, '', '默认项不应带字体样式');
    assert.strictEqual(items[1].style.fontFamily, '"DengXian"', 'DengXian 项以该字体渲染');
    assert.strictEqual(items[2].style.fontFamily, '"Consolas"', 'Consolas 项以该字体渲染');
    assert.strictEqual(items[3].style.fontFamily, '"tizumark-custom-cfA"', '自定义字体项以 tizumark-custom 渲染');
    // 输入框在选中后也以所选字体呈现
    p.picker.setValue('Consolas');
    assert.strictEqual(p.picker.input.style.fontFamily, '"Consolas"', '选中后输入框以所选字体呈现');
    p.picker.setValue('');
    assert.strictEqual(p.picker.input.style.fontFamily, '', '清空后输入框恢复无字体样式');
  } finally { p.root.remove(); }
});

test('font-picker: 外部点击关闭，组件内点击不关闭', () => {
  const p = makePicker();
  try {
    open(p);
    document.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
    assert.ok(p.root.querySelector('.font-picker-dropdown').classList.contains('hidden'), '外部点击关闭');
    open(p);
    p.picker.root.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
    assert.ok(!p.root.querySelector('.font-picker-dropdown').classList.contains('hidden'), '组件内点击不关闭');
  } finally { p.root.remove(); }
});

test('font-picker: setValue silent 不触发 onChange，非 silent 触发', () => {
  const p = makePicker();
  try {
    p.picker.setValue('Consolas', true);
    assert.deepStrictEqual(p.calls, [], 'silent 不回调');
    assert.strictEqual(p.picker.input.value, 'Consolas', '显示更新');
    p.picker.setValue('cfA');
    assert.deepStrictEqual(p.calls, ['cfA'], '非 silent 触发回调');
    assert.strictEqual(p.picker.input.value, '我的字体', '自定义字体显示导入名');
  } finally { p.root.remove(); }
});

test('font-picker: 值不在列表中时显示原文（系统族名未加载完也合法）', () => {
  const p = makePicker({ value: 'NotInList' });
  try {
    assert.strictEqual(p.picker.input.value, 'NotInList', '未命中列表直接显示原文');
  } finally { p.root.remove(); }
});

test('font-picker: Escape 关闭并恢复显示当前值', () => {
  const p = makePicker({ value: 'Consolas' });
  try {
    open(p);
    p.picker.input.value = 'zzz';
    p.picker.input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    key(p, 'Escape');
    assert.ok(p.root.querySelector('.font-picker-dropdown').classList.contains('hidden'), 'Esc 关闭');
    assert.strictEqual(p.picker.input.value, 'Consolas', '关闭后恢复显示当前值');
  } finally { p.root.remove(); }
});

test('font-picker: setGroups 重建选项，applyI18n 刷新文案', () => {
  const p = makePicker();
  try {
    p.picker.setGroups([{ label: '新组', items: [{ value: 'A', label: 'Arial' }] }]);
    open(p);
    const items = [...p.root.querySelectorAll('.font-picker-item')];
    assert.strictEqual(items.length, 2, '默认 + 新组 1 项');
    assert.strictEqual(items[1].textContent, 'Arial');
    // 换英文 i18n
    p.picker.applyI18n((k) => ({ defaultFont: 'Default', noMatchingFonts: 'No match' }[k] || k));
    const def = p.root.querySelector('.font-picker-item-default');
    assert.strictEqual(def.textContent, 'Default', 'applyI18n 更新默认项文案');
  } finally { p.root.remove(); }
});

test('font-picker: 靠近窗口底部时向上展开（视口边界翻转）', () => {
  const p = makePicker();
  const savedIH = window.innerHeight;
  try {
    Object.defineProperty(window, 'innerHeight', { value: 200, configurable: true, writable: true });
    // 输入框靠近底部（top=150, bottom=195），窗口高 200 → 下方仅 5px
    p.picker.input.getBoundingClientRect = () =>
      ({ top: 150, bottom: 195, left: 0, right: 100, width: 100, height: 20, x: 0, y: 150 });
    open(p);
    const dd = p.root.querySelector('.font-picker-dropdown');
    assert.ok(dd.classList.contains('font-picker-dropdown-up'), '靠近底部应向上展开');
    const mh = parseInt(dd.style.maxHeight, 10);
    assert.ok(mh > 0 && mh <= 280, '应按可用空间动态限制 maxHeight');
  } finally {
    Object.defineProperty(window, 'innerHeight', { value: savedIH, configurable: true, writable: true });
    p.root.remove();
  }
});

test('font-picker: 正常位置向下展开不翻转', () => {
  const p = makePicker();
  try {
    // 默认 innerHeight(768)、getBoundingClientRect 全 0 → 下方空间充足
    open(p);
    const dd = p.root.querySelector('.font-picker-dropdown');
    assert.ok(!dd.classList.contains('font-picker-dropdown-up'), '正常位置应向下展开');
  } finally { p.root.remove(); }
});

test('font-picker: 当前选中项加 font-picker-item-selected 类且 aria-selected=true', () => {
  const p = makePicker({ value: 'Consolas' });
  try {
    open(p);
    const dd = p.root.querySelector('.font-picker-dropdown');
    const sel = dd.querySelector('.font-picker-item-selected');
    assert.ok(sel, '应存在选中项元素');
    assert.strictEqual(sel.getAttribute('data-value'), 'Consolas', '选中项值=当前值');
    assert.strictEqual(sel.getAttribute('aria-selected'), 'true', '选中项 aria-selected=true');
    const others = [...dd.querySelectorAll('.font-picker-item')].filter((e) => !e.classList.contains('font-picker-item-selected'));
    assert.ok(others.length === 3, '其余 3 项不应有选中类');
    others.forEach((e) => assert.strictEqual(e.getAttribute('aria-selected'), 'false', '非选中项 aria-selected=false'));
  } finally { p.root.remove(); }
});

test('font-picker: 打开后输入框仍显示当前选中值，不全选时不清空', () => {
  const p = makePicker({ value: 'Consolas' });
  try {
    open(p);
    assert.strictEqual(p.picker.input.value, 'Consolas', '打开后输入框显示当前值');
    // 直接输入应替换全选内容并过滤（默认项在过滤时隐藏，只命中 DengXian）
    p.picker.input.value = 'den';
    p.picker.input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    const items = [...p.root.querySelectorAll('.font-picker-item')];
    assert.strictEqual(items.length, 1, '输入过滤后显示 DengXian');
    assert.strictEqual(items[0].getAttribute('data-value'), 'DengXian');
  } finally { p.root.remove(); }
});

test('font-picker: 默认空值选中时「默认」项标为选中', () => {
  const p = makePicker({ value: '' });
  try {
    open(p);
    const def = p.root.querySelector('.font-picker-item-default');
    assert.ok(def.classList.contains('font-picker-item-selected'), '空值当前选 → 默认项标选中');
    assert.strictEqual(def.getAttribute('aria-selected'), 'true');
  } finally { p.root.remove(); }
});
