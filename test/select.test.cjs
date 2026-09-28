// Select 通用自绘下拉组件单元测试：纯 jsdom，不经过 app harness。
// 覆盖 ARIA 语义、键盘导航、type-ahead、视口边界翻转、i18n 重渲染、disabled。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><body></body>', { pretendToBeVisual: true });
global.window = dom.window;
global.document = dom.window.document;

const Select = require('../src/modules/select.js');

const ZH = (k) => ({ themeMode: '主题模式', themeLight: '明亮', themeDark: '暗黑', followSystem: '跟随系统' }[k] || k);
const EN = (k) => ({ themeMode: 'Theme Mode', themeLight: 'Light', themeDark: 'Dark', followSystem: 'Follow System' }[k] || k);

function makeSelect(opts = {}) {
  const root = document.createElement('div');
  root.id = opts.id || 'set-theme-mode';
  document.body.appendChild(root);
  const calls = [];
  const inst = new Select(root, {
    value: opts.value || 'light',
    t: opts.t || ZH,
    ariaLabelKey: opts.ariaLabelKey || 'themeMode',
    optionsProvider: opts.optionsProvider || ((t) => ([
      { value: 'light', label: t('themeLight') },
      { value: 'dark', label: t('themeDark') },
      { value: 'system', label: t('followSystem') },
    ])),
    onChange: (v) => calls.push(v),
    disabled: opts.disabled || false,
  });
  return { root, inst, calls };
}

function open(s) {
  s.inst.input.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
}
function key(s, k) {
  s.inst.input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true }));
}
function items(s) {
  return [...s.root.querySelectorAll('.select-component-item')];
}

test('select: ARIA 语义完整（combobox/listbox/option/expanded/controls/label）', () => {
  const s = makeSelect();
  try {
    const input = s.inst.input;
    assert.strictEqual(input.getAttribute('role'), 'combobox');
    assert.strictEqual(input.getAttribute('aria-haspopup'), 'listbox');
    assert.strictEqual(input.getAttribute('aria-expanded'), 'false', '初始收起');
    const ddId = input.getAttribute('aria-controls');
    assert.ok(ddId, 'aria-controls 指向 listbox id');
    const dd = s.root.querySelector('.select-component-dropdown');
    assert.strictEqual(dd.id, ddId, 'dropdown id 与 aria-controls 一致');
    assert.strictEqual(dd.getAttribute('role'), 'listbox');
    assert.strictEqual(input.getAttribute('aria-label'), '主题模式', 'aria-label 来自 ariaLabelKey');
    // 收起时不渲染选项（延迟到 open），但结构占位存在
    assert.strictEqual(dd.classList.contains('hidden'), true);
  } finally { if (s.inst && s.inst.destroy) s.inst.destroy(); s.root.remove(); }
});

test('select: getValue/setValue 与 onChange', () => {
  const s = makeSelect({ value: 'light' });
  try {
    assert.strictEqual(s.inst.getValue(), 'light');
    s.inst.setValue('dark');
    assert.strictEqual(s.inst.getValue(), 'dark');
    assert.deepStrictEqual(s.calls, ['dark'], 'setValue 触发 onChange');
    s.inst.setValue('dark'); // 同值不重复触发
    assert.strictEqual(s.calls.length, 1);
    s.inst.setValue('system', true); // silent
    assert.strictEqual(s.calls.length, 1, 'silent 不触发 onChange');
    assert.strictEqual(s.inst.getValue(), 'system');
    assert.strictEqual(s.inst.input.value, '跟随系统', '输入框显示当前值标签');
  } finally { if (s.inst && s.inst.destroy) s.inst.destroy(); s.root.remove(); }
});

test('select: open/close 切换 aria-expanded 并渲染选项', () => {
  const s = makeSelect();
  try {
    assert.strictEqual(s.inst.input.getAttribute('aria-expanded'), 'false');
    open(s);
    assert.strictEqual(s.inst.input.getAttribute('aria-expanded'), 'true', '展开');
    const its = items(s);
    assert.strictEqual(its.length, 3, '渲染 3 个选项');
    assert.strictEqual(its[0].getAttribute('role'), 'option');
    assert.strictEqual(its[0].getAttribute('aria-selected'), 'true', '当前值项 aria-selected');
    assert.strictEqual(its[1].getAttribute('aria-selected'), 'false');
    s.inst.close();
    assert.strictEqual(s.inst.input.getAttribute('aria-expanded'), 'false', '收起');
    assert.strictEqual(s.inst.input.getAttribute('aria-activedescendant'), null, '收起清除 activedescendant');
  } finally { if (s.inst && s.inst.destroy) s.inst.destroy(); s.root.remove(); }
});

test('select: 键盘 ArrowDown + Enter 选中', () => {
  const s = makeSelect({ value: 'light' });
  try {
    open(s);
    key(s, 'ArrowDown'); // 从 light(0) 移到 dark(1)
    const its = items(s);
    assert.ok(its[1].classList.contains('active'), 'dark 高亮');
    assert.strictEqual(s.inst.input.getAttribute('aria-activedescendant'), its[1].id, 'aria-activedescendant 指向高亮项');
    key(s, 'Enter');
    assert.strictEqual(s.inst.getValue(), 'dark', 'Enter 选中 dark');
    assert.deepStrictEqual(s.calls, ['dark']);
    assert.strictEqual(s.inst.input.getAttribute('aria-expanded'), 'false', '选中后自动收起');
  } finally { if (s.inst && s.inst.destroy) s.inst.destroy(); s.root.remove(); }
});

test('select: Escape 关闭不选中', () => {
  const s = makeSelect();
  try {
    open(s);
    key(s, 'ArrowDown');
    key(s, 'Escape');
    assert.strictEqual(s.inst.input.getAttribute('aria-expanded'), 'false', 'Esc 收起');
    assert.strictEqual(s.inst.getValue(), 'light', '值未改变');
    assert.strictEqual(s.calls.length, 0, '未触发 onChange');
  } finally { if (s.inst && s.inst.destroy) s.inst.destroy(); s.root.remove(); }
});

test('select: 首字母 type-ahead 跳转到匹配项', () => {
  const s = makeSelect({ value: 'light' });
  try {
    open(s);
    key(s, 's'); // system 以 s 开头
    const its = items(s);
    assert.ok(its[2].classList.contains('active'), 'system 高亮');
    assert.strictEqual(s.inst.input.getAttribute('aria-activedescendant'), its[2].id);
  } finally { if (s.inst && s.inst.destroy) s.inst.destroy(); s.root.remove(); }
});

test('select: 视口底部空间不足时向上展开', () => {
  const s = makeSelect();
  try {
    dom.window.innerHeight = 500;
    // jsdom 无布局，offsetHeight 恒为 0；桩一个真实高度让翻转条件基于实际尺寸生效
    Object.defineProperty(s.inst.dropdown, 'offsetHeight', { configurable: true, value: 200 });
    s.inst.input.getBoundingClientRect = () => ({ left: 0, top: 100, right: 100, bottom: 480, width: 100, height: 20, x: 0, y: 100 });
    open(s);
    const dd = s.root.querySelector('.select-component-dropdown');
    assert.ok(dd.classList.contains('select-component-dropdown-up'), '下方空间(20) < 面板高(200) 应向上展开');
  } finally { if (s.inst && s.inst.destroy) s.inst.destroy(); dom.window.innerHeight = 768; s.root.remove(); }
});

test('select: 视口空间充足时向下展开', () => {
  const s = makeSelect();
  try {
    dom.window.innerHeight = 800;
    Object.defineProperty(s.inst.dropdown, 'offsetHeight', { configurable: true, value: 200 });
    s.inst.input.getBoundingClientRect = () => ({ left: 0, top: 100, right: 100, bottom: 120, width: 100, height: 20, x: 0, y: 100 });
    open(s);
    const dd = s.root.querySelector('.select-component-dropdown');
    assert.ok(!dd.classList.contains('select-component-dropdown-up'), '下方空间充足(680) 向下展开');
  } finally { if (s.inst && s.inst.destroy) s.inst.destroy(); dom.window.innerHeight = 768; s.root.remove(); }
});

test('select: applyI18n 重渲染选项文案并更新 aria-label', () => {
  const s = makeSelect({ t: ZH });
  try {
    assert.strictEqual(s.inst.input.getAttribute('aria-label'), '主题模式');
    s.inst.applyI18n(EN);
    assert.strictEqual(s.inst.input.getAttribute('aria-label'), 'Theme Mode', 'aria-label 随语言更新');
    open(s);
    const labels = items(s).map((e) => e.textContent);
    assert.deepStrictEqual(labels, ['Light', 'Dark', 'Follow System'], '选项文案随语言刷新');
    // 收起后输入框显示当前值的新标签
    s.inst.close();
    assert.strictEqual(s.inst.input.value, 'Light', '输入框显示英文标签');
  } finally { if (s.inst && s.inst.destroy) s.inst.destroy(); s.root.remove(); }
});

test('select: disabled 时不可展开且 aria-disabled', () => {
  const s = makeSelect({ disabled: true });
  try {
    assert.strictEqual(s.inst.input.getAttribute('aria-disabled'), 'true');
    open(s);
    assert.strictEqual(s.inst.input.getAttribute('aria-expanded'), 'false', 'disabled 不可展开');
    const dd = s.root.querySelector('.select-component-dropdown');
    assert.ok(dd.classList.contains('hidden'), '下拉保持隐藏');
  } finally { if (s.inst && s.inst.destroy) s.inst.destroy(); s.root.remove(); }
});

test('select: 点击选项选中并触发 onChange', () => {
  const s = makeSelect({ value: 'light' });
  try {
    open(s);
    const its = items(s);
    its[2].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    assert.strictEqual(s.inst.getValue(), 'system');
    assert.deepStrictEqual(s.calls, ['system']);
  } finally { if (s.inst && s.inst.destroy) s.inst.destroy(); s.root.remove(); }
});

test('select: 普通下拉框展开后输入框不应出现蓝色全选背景', () => {
  const s = makeSelect({ value: 'light' });
  try {
    open(s);
    const inp = s.inst.input;
    const len = inp.value.length;
    // 普通下拉框只读展示，不应有整段选区（selectionStart===0 && selectionEnd===len）
    assert.ok(!(inp.selectionStart === 0 && inp.selectionEnd === len && len > 0),
      '只读展示下拉框不应全选输入框文字，避免蓝色选中背景');
  } finally { if (s.inst && s.inst.destroy) s.inst.destroy(); s.root.remove(); }
});
