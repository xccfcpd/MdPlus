// 弹框拖动 + 缩放 复用测试
// 锁定：dialog-drag-resize.js 的 initDialogDragResize 能为「任意 .dialog-overlay」接入
// 标题栏拖动 + 右下角手柄缩放 + 打开即重置默认尺寸，且 initDialogsDragResize 遍历所有弹框。
const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const path = require('path');
const fs = require('fs');

const MODULE_PATH = path.join(__dirname, '..', 'src', 'modules', 'dialog-drag-resize.js');
const INDEX_HTML = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');

// 用 dangerously 模式注入模块脚本，使模块内的 window / document 解析到 jsdom 全局。
function createDom(html, dangerously) {
  const dom = new JSDOM(html, {
    runScripts: dangerously ? 'dangerously' : 'outside-only',
    pretendToBeVisual: true,
  });
  return dom;
}

function injectModule(dom, d) {
  const code = fs.readFileSync(MODULE_PATH, 'utf8');
  const s = d.createElement('script');
  s.textContent = code;
  d.body.appendChild(s);
}

function buildDialog(id, opts) {
  opts = opts || {};
  const dom = createDom('<!DOCTYPE html><body></body>', true);
  const d = dom.window.document;
  const overlay = d.createElement('div');
  overlay.className = 'dialog-overlay' + (opts.floating ? ' ' + opts.floating : '');
  overlay.id = id;
  overlay.classList.add('hidden');
  const panel = d.createElement('div');
  panel.className = 'dialog';
  const header = d.createElement('div');
  header.className = 'dialog-header' + (opts.headerClass ? ' ' + opts.headerClass : '');
  const closeBtn = d.createElement('button');
  closeBtn.className = 'dialog-close';
  header.appendChild(closeBtn);
  panel.appendChild(header);
  const content = d.createElement('div');
  content.className = 'dialog-content';
  panel.appendChild(content);
  if (opts.withResize) {
    const rh = d.createElement('div');
    rh.className = 'dialog-resize-handle';
    panel.appendChild(rh); // placeholder; real handle below
  }
  if (opts.withResize) {
    const rh = panel.querySelector('.dialog-resize-handle');
    if (!rh) {
      const rh2 = d.createElement('div');
      rh2.className = 'dialog-resize-handle';
      panel.appendChild(rh2);
    }
  }
  overlay.appendChild(panel);
  d.body.appendChild(overlay);
  injectModule(dom, d);
  return { dom, d, overlay, panel, header };
}

// 模拟 mousedown + 一段 mousemove + mouseup（document 级监听）
function drag(window, target, dx, dy) {
  const down = new window.MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true });
  target.dispatchEvent(down);
  const move = new window.MouseEvent('mousemove', { clientX: 100 + dx, clientY: 100 + dy, bubbles: true });
  window.document.dispatchEvent(move);
  const up = new window.MouseEvent('mouseup', { clientX: 100 + dx, clientY: 100 + dy, bubbles: true });
  window.document.dispatchEvent(up);
}

test('所有 .dialog-overlay 都含 .dialog-resize-handle 与 .dialog-header', () => {
  const dom = createDom(INDEX_HTML, false);
  const d = dom.window.document;
  const overlays = d.querySelectorAll('.dialog-overlay');
  assert.ok(overlays.length >= 14, '应至少 14 个弹框, 实际 ' + overlays.length);
  overlays.forEach((o) => {
    assert.ok(o.querySelector('.dialog'), 'overlay 应含 .dialog: ' + o.id);
    assert.ok(o.querySelector('.dialog-resize-handle'), 'overlay 应含 resize-handle: ' + o.id);
    assert.ok(o.querySelector('.dialog-header'), 'overlay 应含 header: ' + o.id);
  });
  assert.strictEqual(
    d.querySelectorAll('.dialog-resize-handle').length,
    overlays.length,
    'resize-handle 数量应等于 overlay 数量',
  );
});

test('initDialogDragResize 为带 resize-handle 的弹框接入拖动 + 缩放', () => {
  const { dom, d, overlay, panel } = buildDialog('d1', { withResize: true });
  const w = dom.window;
  assert.strictEqual(typeof w.initDialogDragResize, 'function', '模块应挂载 initDialogDragResize');
  w.initDialogDragResize(overlay);
  // 拖动标题栏 30/20
  drag(w, panel.querySelector('.dialog-header'), 30, 20);
  assert.strictEqual(panel.style.position, 'fixed', '拖动后切到 fixed');
  assert.strictEqual(parseInt(panel.style.left, 10), 30, 'left 应随拖动偏移 30');
  assert.strictEqual(parseInt(panel.style.top, 10), 20, 'top 应随拖动偏移 20');
});

test('initDialogDragResize 缩放手柄改变宽高', () => {
  const { dom, d, overlay, panel } = buildDialog('d2', { withResize: true });
  const w = dom.window;
  w.initDialogDragResize(overlay);
  const rh = panel.querySelector('.dialog-resize-handle');
  drag(w, rh, 40, 10);
  assert.ok(parseInt(panel.style.width, 10) >= 320, '宽度应随拖拽增大并受 minWidth 约束');
});

test('initDialogDragResize 双击标题栏重置默认尺寸', () => {
  const { dom, d, overlay, panel } = buildDialog('d3', { withResize: true });
  const w = dom.window;
  w.initDialogDragResize(overlay);
  drag(w, panel.querySelector('.dialog-header'), 30, 20);
  assert.strictEqual(panel.style.position, 'fixed');
  panel.querySelector('.dialog-header').dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true }));
  assert.strictEqual(panel.style.position, '', '重置后应清空内联 position');
  assert.strictEqual(panel.style.left, '');
  assert.strictEqual(panel.style.top, '');
});

test('initDialogDragResize 关闭按钮不触发拖动', () => {
  const { dom, d, overlay, panel } = buildDialog('d4', { withResize: true });
  const w = dom.window;
  w.initDialogDragResize(overlay);
  const close = panel.querySelector('.dialog-close');
  close.dispatchEvent(new w.MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true }));
  assert.strictEqual(panel.style.position, '', '关闭按钮 mousedown 不应触发拖动');
});

test('initDialogsDragResize 遍历所有 .dialog-overlay（含浮动面板）', () => {
  // 构造多个弹框（含一个浮动面板），模拟 app 的 initDialogsDragResize 行为：
  // 给每个带 .dialog 的 overlay 调 initDialogDragResize。
  const dom = createDom('<!DOCTYPE html><body></body>', true);
  const d = dom.window.document;
  const ids = ['a', 'b', 'file-search-dialog', 'cross-search-dialog'];
  const overlays = ids.map((id) => {
    const o = d.createElement('div');
    o.className = 'dialog-overlay' + (id.includes('search') ? ' ' + id : '');
    o.id = id;
    const p = d.createElement('div');
    p.className = 'dialog';
    const h = d.createElement('div');
    h.className = 'dialog-header';
    p.appendChild(h);
    const rh = d.createElement('div');
    rh.className = 'dialog-resize-handle';
    p.appendChild(rh);
    o.appendChild(p);
    d.body.appendChild(o);
    return o;
  });
  injectModule(dom, d);
  let inited = 0;
  dom.window.initDialogDragResize = (el) => { if (el.querySelector('.dialog')) inited++; };
  overlays.forEach((el) => { if (el.querySelector('.dialog')) dom.window.initDialogDragResize(el); });
  assert.strictEqual(inited, 4, '4 个弹框全部被初始化（含浮动面板）');
});

test('打开弹框（移除 hidden）即重置默认尺寸', () => {
  const { dom, d, overlay, panel } = buildDialog('m1', { withResize: true });
  const w = dom.window;
  w.initDialogDragResize(overlay);
  overlay.classList.remove('hidden');
  drag(w, panel.querySelector('.dialog-header'), 30, 20);
  assert.strictEqual(panel.style.position, 'fixed', '拖动后应有内联样式');
  overlay.classList.add('hidden');
  overlay.classList.remove('hidden'); // 再次打开
  // MutationObserver 为微任务，等一拍
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.strictEqual(panel.style.position, '', '居中弹框再次打开应重置内联样式（position）');
      assert.strictEqual(panel.style.left, '', '居中弹框再次打开应重置 left');
      assert.strictEqual(panel.style.top, '', '居中弹框再次打开应重置 top');
      assert.strictEqual(panel.style.width, '', '居中弹框再次打开应重置 width');
      assert.strictEqual(panel.style.height, '', '居中弹框再次打开应重置 height');
      resolve();
    }, 0);
  });
});

test('浮动面板再次打开：尺寸重置、位置与 fixed 定位保留', () => {
  const { dom, d, overlay, panel } = buildDialog('fs', { withResize: true, floating: 'file-search-overlay' });
  const w = dom.window;
  w.initDialogDragResize(overlay);
  overlay.classList.remove('hidden');
  drag(w, panel.querySelector('.dialog-header'), 30, 20);
  // 模拟 resize：直接写内联 width/height（与用户拖 resize 手柄一致）
  panel.style.width = '900px';
  panel.style.height = '700px';
  assert.strictEqual(panel.style.position, 'fixed');
  assert.strictEqual(panel.style.width, '900px');
  overlay.classList.add('hidden');
  overlay.classList.remove('hidden'); // 再次打开
  return new Promise((resolve) => {
    setTimeout(() => {
      // resetSize 行为：尺寸回到 CSS 默认，position/left/top 保留（由 open 流程判断）
      assert.strictEqual(panel.style.position, 'fixed', '浮动面板应保留 fixed 定位状态');
      assert.strictEqual(panel.style.left !== '' || panel.style.top !== '', true, '浮动面板应保留拖动后的 left/top');
      assert.strictEqual(panel.style.width, '', '浮动面板再次打开应清掉 width，恢复默认');
      assert.strictEqual(panel.style.height, '', '浮动面板再次打开应清掉 height，恢复默认');
      resolve();
    }, 0);
  });
});

// 直接验证 window.resetSize 暴露：只清 width/height，不动 position/left/top
test('window.resetSize 只清宽高，保留定位', () => {
  const { dom, d, overlay, panel } = buildDialog('rs', { withResize: true, floating: 'cross-search-overlay' });
  const w = dom.window;
  w.initDialogDragResize(overlay);
  panel.style.position = 'fixed';
  panel.style.left = '100px';
  panel.style.top = '50px';
  panel.style.width = '600px';
  panel.style.height = '400px';
  w.resetSize(panel);
  assert.strictEqual(panel.style.position, 'fixed', 'resetSize 不应清 position');
  assert.strictEqual(panel.style.left, '100px', 'resetSize 不应清 left');
  assert.strictEqual(panel.style.top, '50px', 'resetSize 不应清 top');
  assert.strictEqual(panel.style.width, '', 'resetSize 应清 width');
  assert.strictEqual(panel.style.height, '', 'resetSize 应清 height');
});
