// 初始化冒烟测试：防止「new MarkdownEditor() 构造时同步抛错 → 被初始化 catch 吞掉、
// 错误条因 window.editor 未就绪而不显示 → 整页白屏」这类致命回归。
//
// 历史上一次白屏正是 initEditor 中 IME 适配代码误用未声明的局部变量 `cm`
// （应为 this.cm），导致构造即抛 ReferenceError。本测试用 jsdom 真实加载
// index.html + app.js + 全部模块脚本，stub 好 Tauri API 与浏览器 API，
// 触发 DOMContentLoaded 后断言：① window.editor 成功创建；② 未出现致命错误条。
//
// 真实 WebView 具备 ResizeObserver / matchMedia 等浏览器 API，jsdom 缺失，故在此 stub。

const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup } = require('./helpers/app-env.cjs');

test('smoke: 应用初始化成功，window.editor 被创建', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  // 初始化包含 await，给一个 microtask 周期让同步构造完成
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.ok(!!w.editor, 'window.editor 应被成功创建（new MarkdownEditor() 未抛错）');
      cleanup(w);
      resolve();
    }, 300);
  });
});

test('smoke: 初始化过程未触发致命错误条', async () => {
  const { w, getInitErr } = await buildEnv({ captureInitErr: true });
  return new Promise((resolve) => {
    setTimeout(() => {
      assert.strictEqual(getInitErr(), null, '不应出现 Initialization error');
      // #backend-banner（后端健康探测条）常驻 DOM 且复用 .fatal-error-bar 样式类，
      // 即使 hidden 也会被 querySelector 选中，须排除后再断言真正由初始化失败创建的致命错误条
      const bars = [...w.document.querySelectorAll('.fatal-error-bar')]
        .filter((b) => b.id !== 'backend-banner');
      assert.strictEqual(bars.length, 0, '不应显示致命错误条（否则等同于白屏）');
      cleanup(w);
      resolve();
    }, 300);
  });
});

test('ui: 快捷键对话框无旧版残留分组标题', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  return new Promise((resolve) => {
    setTimeout(() => {
      // 旧版在 #shortcuts-list 外用两个 settings-group-title div 做分组标题，
      // 弹框重构为可折叠两区块（内置/方案与自定义）后属残留，已删除。
      assert.strictEqual(w.document.getElementById('shortcuts-scheme-label'), null, '#shortcuts-scheme-label 应为空（旧版残留标题已删除）');
      assert.strictEqual(w.document.getElementById('shortcuts-list-title'), null, '#shortcuts-list-title 应为空（旧版残留标题已删除）');
      // 弹框正文仍由 renderShortcutsList 渲染进 #shortcuts-list 容器
      assert.ok(w.document.getElementById('shortcuts-list'), '#shortcuts-list 容器应存在');
      cleanup(w);
      resolve();
    }, 300);
  });
});
