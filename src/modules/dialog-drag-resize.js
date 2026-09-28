// dialog 拖动 + 缩放工具
//
// 让普通居中弹框（设置 / 快捷键 / 关于 等使用 .dialog-overlay > .dialog 结构的弹窗）
// 支持：标题栏拖动、右下角手柄缩放、双击标题栏还原默认居中尺寸。
//
// 设计要点：
//  - 初始保持 .dialog-overlay 的 flex 居中 + CSS 默认尺寸，不动它（满足「每次打开重置默认」）；
//  - 拖动/缩放**任一开始**时，把 .dialog 从 flex 流无缝切到 position:fixed 并锁定当前
//    getBoundingClientRect 矩形，之后自由拖动 / 缩放，不影响初始居中；
//  - 双击标题栏 / 调用 resetDialog 时清空内联样式，回到 CSS 默认（居中 + 默认尺寸）；
//  - 视区内边界裁剪，避免拖出屏幕或缩放超出可视区；
//  - 首次拖动或缩放时通过 onFirstInteract 回调给出一次性提示（由调用方决定 toast 文案）。
//
// 经典 script（与 file-search.js 同风格）：挂载到 window，供 app.js 直接调用。

(function (global) {
  'use strict';

  // 从 flex 居中无缝切到 fixed + 锁定当前矩形，避免拖动/缩放时跳变
  function ensureFixed(panel) {
    if (panel.style.position === 'fixed') return;
    const rect = panel.getBoundingClientRect();
    panel.style.position = 'fixed';
    panel.style.margin = '0';
    panel.style.left = rect.left + 'px';
    panel.style.top = rect.top + 'px';
    panel.style.width = rect.width + 'px';
    panel.style.height = rect.height + 'px';
  }

  // 清空内联样式，回到 CSS 默认（flex 居中 + 默认尺寸）—— 满足「每次打开重置」
  function resetDialog(panel) {
    panel.style.position = '';
    panel.style.margin = '';
    panel.style.left = '';
    panel.style.top = '';
    panel.style.width = '';
    panel.style.height = '';
  }

  // 仅重置尺寸（清 width/height），保留 panel 的 position/left/top —— 浮动面板（Ctrl+P / Ctrl+H）
  // 关闭后再打开时回到 CSS 默认尺寸、但保留上次拖动位置，与各自 open 流程的
  // 「panel.style.left 存在则用之、否则用默认」逻辑配合（openCrossSearchDialog / openFileSearchDialog）。
  function resetSize(panel) {
    panel.style.width = '';
    panel.style.height = '';
  }

  /**
   * 为单个弹框初始化拖动 + 缩放。
   * @param {HTMLElement} dialogEl .dialog-overlay 容器
   * @param {object} [opts]
   * @param {number} [opts.minWidth=320]
   * @param {number} [opts.minHeight=240]
   * @param {(kind: 'drag'|'resize') => void} [opts.onFirstInteract] 首次交互一次性回调
   */
  function initDialogDragResize(dialogEl, opts) {
    opts = opts || {};
    const panel = dialogEl.querySelector('.dialog');
    if (!panel) return;
    const header = panel.querySelector('.dialog-header');
    const resizeHandle = panel.querySelector('.dialog-resize-handle');
    if (!header) return;

    // 打开即重置：每次显示（hidden 被移除）时回到 CSS 默认。
    //   - 浮动面板（file-search / cross-search）：用 resetSize 只清尺寸，保留位置
    //     （位置由 open 流程根据 style.left 是否存在决定「恢复上次拖动」或「用默认」）。
    //   - 其余居中弹框：用 resetDialog 完全清，回到 flex 居中 + 默认尺寸。
    const isFloating = dialogEl.classList.contains('file-search-overlay') ||
      dialogEl.classList.contains('cross-search-overlay');
    if (typeof MutationObserver !== 'undefined') {
      const mo = new MutationObserver(() => {
        if (!dialogEl.classList.contains('hidden')) {
          (isFloating ? resetSize : resetDialog)(panel);
        }
      });
      mo.observe(dialogEl, { attributes: true, attributeFilter: ['class'] });
    }

    const minWidth = opts.minWidth || 320;
    const minHeight = opts.minHeight || 240;
    let interacted = false;

    const fireFirstInteract = (kind) => {
      if (interacted) return;
      interacted = true;
      if (typeof opts.onFirstInteract === 'function') opts.onFirstInteract(kind);
    };

    // 双击标题栏还原默认居中尺寸
    header.addEventListener('dblclick', (e) => {
      if (e.target.closest('.dialog-close')) return;
      resetDialog(panel);
    });

    // 拖动：从标题栏拖动面板到其他位置（避开关闭按钮）
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.dialog-close')) return;
      e.preventDefault();
      ensureFixed(panel);
      const rect = panel.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = rect.left;
      const startTop = rect.top;
      const onMove = (ev) => {
        let nl = startLeft + (ev.clientX - startX);
        let nt = startTop + (ev.clientY - startY);
        nl = Math.max(0, Math.min(nl, window.innerWidth - panel.offsetWidth));
        nt = Math.max(0, Math.min(nt, window.innerHeight - panel.offsetHeight));
        panel.style.left = nl + 'px';
        panel.style.top = nt + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';
      };
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      fireFirstInteract('drag');
    });

    // 缩放：右下角手柄（se 方向）拖动改变宽高
    if (resizeHandle) {
      resizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        ensureFixed(panel);
        const rect = panel.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;
        const startW = rect.width;
        const startH = rect.height;
        const onMove = (ev) => {
          let nw = Math.max(minWidth, startW + (ev.clientX - startX));
          let nh = Math.max(minHeight, startH + (ev.clientY - startY));
          // 不超出可视区（以固定后的 left/top 为基准）
          nw = Math.min(nw, window.innerWidth - rect.left);
          nh = Math.min(nh, window.innerHeight - rect.top);
          panel.style.width = nw + 'px';
          panel.style.height = nh + 'px';
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          document.body.style.userSelect = '';
        };
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        fireFirstInteract('resize');
      });
    }
  }

  global.initDialogDragResize = initDialogDragResize;
  global.resetDialog = resetDialog;
  global.resetSize = resetSize;
})(window);

