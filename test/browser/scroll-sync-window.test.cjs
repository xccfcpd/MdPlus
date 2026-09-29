/**
 * 无头浏览器回归测试：大文档「滑动窗口」滚动同步（端到端）
 *
 * 为什么需要这个用例（2026-09-29）：
 *   超过 MAX_PREVIEW_LINES(5000) 或 MAX_PREVIEW_CHARS(4MB) 的文档，预览不再渲染全文，
 *   而是只渲染「围绕焦点行的一段源码」（PREVIEW_WINDOW_LINES=1200，见 constants.js /
 *   preview-controller.js 的滑动窗口分支），并在编辑器滚动时**重排窗口**。
 *
 *   这条路径此前**完全没有自动化关卡**，结果漏掉了一个真实回归：v2 局部锚定被插在
 *   `_syncEditorToPreview` 的窗口判断**之前**，而局部锚定只能看见"当前已渲染的那一片窗口"、
 *   在窗口内总能返回 true ⇒ 窗口逻辑永远轮不到 ⇒ 焦点行不再更新、窗口卡死在首个切片。
 *   实测（8 万行文档）：编辑器滚到 76000 行，预览仍停在 1~1202 行，两栏内容完全不相干。
 *
 * 本用例断言（全部为端到端可观察量，不依赖实现内部映射函数）：
 *   ① 进窗口模式：previewWindow 非 null，窗口宽度 ≤ 2200（N18 不变式）；
 *   ② **窗口内容覆盖目标行**：滚到任意位置后，渲染出的锚点行区间必须包含该位置；
 *   ③ **窗口随滚动移动**：previewWindow.start 随位置单调递增，且 ≈ 目标行 − PREVIEW_WINDOW_LEAD(200)；
 *   ④ **窗口像素表不陈旧**：_windowLineTops 里该行的偏移与现测偏移之差 ≤ 8px；
 *   ⑤ **窗口内对齐**：实现把「≤ 实际顶行的最大锚点行」放在预览视口顶下方 ≈24px
 *      （_focusPreviewToLine 的 bestTop − 24 设计值）。
 *
 * 运行：
 *   node test/browser/scroll-sync-window.test.cjs
 * 前置：dev-server 在 1420 跑着（run-tests.cjs 会自动拉起）。无 Chromium 系浏览器则自动 SKIP。
 */
'use strict';
const path = require('path');
const fs = require('fs');

const { launch, findBrowser, skipReason, openApp } = require('./_cdp.cjs');
const CHROME_PATH = process.env.CHROME_PATH || findBrowser();
const URL = 'http://localhost:1420/';
const SKIP_REASON = skipReason();
if (SKIP_REASON || !CHROME_PATH || !fs.existsSync(CHROME_PATH)) {
  console.log('SKIP: ' + (SKIP_REASON || '未探测到 Chrome / Edge'));
  process.exit(0);
}
const puppeteer = { launch };

// 门槛
const WIN_MAX = 2200;        // 窗口宽度上限（N18：windowLines + 2*guardMax）
const LEAD = 200;            // PREVIEW_WINDOW_LEAD：焦点行前预留行数
const LEAD_TOL = 600;        // start 与「目标行 − LEAD」的容差（含块边界回退）
const DRIFT_MAX = 8;         // 窗口像素表陈旧判定（px）
const IMPL_OFFSET = 24;      // _focusPreviewToLine 的上下文偏移（设计值）
const OFFSET_TOL = 60;       // 该偏移的容差（px；实测 10/10 精确 24，留出同步时点差异）
const MIN_SAMPLES = 4;

function assert(name, cond, detail) {
  if (cond) {
    console.log(`  ✅ PASS  ${name}` + (detail ? `  (${detail})` : ''));
    return true;
  }
  console.log(`  ❌ FAIL  ${name}` + (detail ? `  (${detail})` : ''));
  return false;
}

// 最小 Tauri mock：让纯前端 app 能在无 Tauri 环境下启动（与其它浏览器用例同源）
const TauriMock = `
(function(){
  try { localStorage.setItem('tizumark-eula-accepted','true'); } catch(e){}
  window.__TAURI__ = {
    core: {
      invoke: async function(cmd, args){
        args = args || {};
        switch(cmd){
          case 'read_bundled_file':
            if (args.filename === 'demo.md') return { content: '# demo\\n\\n正文' };
            if (args.filename === 'guide.md') return { content: '# 使用说明\\n\\n' };
            return { content: '' };
          case 'read_file': return '';
          case 'app_data_dir': return 'C:\\\\fake\\\\appdata';
          case 'resource_dir': return 'C:\\\\fake\\\\resource';
          case 'list_dir': return [];
          case 'is_directory': return false;
          case 'file_meta': return { size:0, isDir:false, modified:0 };
          case 'write_file': case 'write_binary_file': case 'ensure_dir':
          case 'save_image_to_assets': case 'watch_folder': case 'stop_watch':
          case 'set_window_behavior': case 'generate_toc': case 'get_cli_args':
          case 'quit_app': case 'open_devtools': return null;
          case 'search_in_files': return [];
          case 'get_version': return '0.0.0-test';
          case 'plugin:dialog|open': case 'plugin:dialog|save':
          case 'plugin:webview|internal_toggle_devtools': return null;
          default: return null;
        }
      },
      Channel: class { constructor(){} }
    },
    event: { listen: function(){ return Promise.resolve(function(){}); } },
    window: { getCurrentWindow: function(){ return { unminimize(){}, show(){}, setFocus(){}, close(){} }; } },
    app: { getVersion: function(){ return Promise.resolve('0.0.0-test'); } },
    path: { resourceDir: function(){ return Promise.resolve('C:\\\\fake\\\\resource'); } },
    shell: { open: function(){ return Promise.resolve(); } },
    webview: {}
  };
})();
`;

(async () => {
  let pass = 0, fail = 0;
  const bump = (ok) => { ok ? pass++ : fail++; };

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
           '--disable-gpu', '--window-size=1400,900'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const t = m.text();
      if (/favicon\.ico|404/.test(t)) return;
      pageErrors.push('console.error: ' + t);
    }
  });

  await page.evaluateOnNewDocument(TauriMock);

  console.log('\n[启动] 打开 ' + URL + ' 并等待 app 初始化…');
  try {
    await openApp(page, URL, {
      ready: "window.editor && window.editor.cm && window.editor.preview "
        + "&& document.querySelectorAll('#preview [data-source-line]').length > 5",
      timeout: 20000,
    });
  } catch (e) {
    console.log('  ❌ FAIL  应用未在预期时间内初始化（预览未渲染）');
    console.log('  页面错误:', pageErrors.slice(0, 10).join(' | ') || '(无)');
    await browser.close();
    process.exit(1);
  }

  // 注入超过 MAX_PREVIEW_LINES(5000) 的文档 → 触发滑动窗口
  console.log('[注入] 约 7000 行文档（> MAX_PREVIEW_LINES=5000）→ 应进入滑动窗口模式');
  await page.evaluate(async () => {
    const L = ['# 滑窗滚动同步（端到端）'];
    for (let i = 1; i <= 1000; i++) {
      L.push('', `## 第 ${i} 节（源行约 ${i * 7}）`, '', '正文内容。'.repeat(10), '');
      if (i % 5 === 0) L.push('```js', 'const a = 1;', 'const b = 2;', '```', '');
    }
    window.editor.cm.setValue(L.join('\n'));
    return window.editor.updatePreview();
  });
  await page.waitForFunction(
    "!!window.editor.previewWindow && document.querySelectorAll('#preview [data-source-line]').length > 100",
    { timeout: 20000 }
  );
  bump(assert('大文档已进入滑动窗口模式（previewWindow 非 null）', true));

  // 双栏：预览独占模式下编辑器宽度为 0，无从验证"跟着编辑器走"
  await page.evaluate(() => { window.editor.setViewMode('edit'); });
  await page.waitForFunction(
    "(() => { const e = document.querySelector('.CodeMirror'); return !!e && e.getBoundingClientRect().width > 50; })()",
    { timeout: 8000 }
  );
  bump(assert('已切到双栏（编辑器有可见宽度）', true));

  // 先确认被测代码含窗口分支（旧实现无此方法 ⇒ 用例结论会完全不同）
  const hasWinPath = await page.evaluate(() =>
    typeof window.editor._syncEditorToPreviewWindow === 'function'
    && typeof window.editor._windowLineTops !== 'undefined');
  bump(assert('被测代码含滑动窗口分支（_syncEditorToPreviewWindow）', hasWinPath));

  console.log('\n[采样] 按绝对行号跳（强制跨窗口）→ 记录窗口是否跟随');
  const res = await page.evaluate(async () => {
    const ed = window.editor, cm = ed.cm, pv = ed.preview;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const settle = async () => {
      let last = null, stable = 0;
      for (let i = 0; i < 50; i++) {
        await sleep(100);
        const now = Math.round(pv.scrollTop);
        if (now === last) { if (++stable >= 3) return true; }
        else { stable = 0; last = now; }
      }
      return false;
    };
    // 窗口重排会替换预览 DOM ⇒ 每轮必须重新采集锚点（旧引用会失效）
    const snap = () => {
      const arr = [...pv.querySelectorAll('[data-source-line]')]
        .filter((e) => !e.closest('.footnotes'))
        .map((e) => ({ el: e, line: +e.dataset.sourceLine }))
        .filter((o) => o.line > 0);
      const first = new Map();
      for (const o of arr) if (!first.has(o.line)) first.set(o.line, o.el);
      return { first, lines: [...first.keys()].sort((a, b) => a - b) };
    };

    const total = cm.lineCount();
    const rows = [];
    for (const f of [0.05, 0.25, 0.5, 0.75, 0.95]) {
      const want = Math.max(1, Math.floor(total * f));
      const winBefore = ed.previewWindow ? ed.previewWindow.start : null;
      cm.scrollTo(0, cm.heightAtLine(want - 1, 'local'));
      await settle();
      await sleep(900);                    // 窗口重排去抖（约 120ms）+ 重渲染
      await settle();
      const win = ed.previewWindow ? { start: ed.previewWindow.start, end: ed.previewWindow.end } : null;
      const { first, lines } = snap();
      if (!win || !lines.length) { rows.push({ want, winBefore, win, empty: true }); continue; }
      const si = cm.getScrollInfo();
      const realTop = cm.lineAtHeight(si.top, 'local') + 1;
      // 与实现同源：≤ 实际顶行的最大锚点行
      let aLine = null;
      for (const x of lines) if (x <= realTop && (aLine == null || x > aLine)) aLine = x;
      const a = aLine != null ? first.get(aLine) : null;
      if (!a) { rows.push({ want, winBefore, win, realTop, noAnchor: true }); continue; }
      const pvTop = pv.getBoundingClientRect().top;
      const rA = a.getBoundingClientRect();
      const errImpl = Math.round(rA.top - pvTop);
      // 窗口像素表新鲜度：_windowLineTops 里该行的值 − 现测偏移
      const nowTop = Math.round(rA.top - pvTop + pv.scrollTop);
      let tblTop = null;
      const tops = ed._windowLineTops;
      if (tops && tops.length) for (const [ln, t] of tops) { if (ln === aLine) { tblTop = Math.round(t); break; } }
      const pvMax = Math.round(pv.scrollHeight - pv.clientHeight);
      rows.push({
        want, winBefore, win, realTop, aLine, errImpl,
        tblTop, drift: tblTop == null ? null : tblTop - nowTop,
        covered: win.start <= want && want <= win.end,
        inWindow: win.start <= realTop && realTop <= win.end,
        coveredByAnchors: lines[0] <= realTop && realTop <= lines[lines.length - 1],
        pvAtMax: Math.round(pv.scrollTop) >= pvMax - 1,
        anchors: lines.length,
      });
    }
    const w = ed.previewWindow;
    return { rows, total, windowWidth: w ? w.end - w.start : null };
  });

  for (const r of res.rows) {
    if (r.empty || r.noAnchor) { console.log(`  行 ${r.want} → ⚠ ${r.empty ? '窗口/锚点为空' : '无锚点'}`); continue; }
    console.log(`  目标行 ${String(r.want).padStart(5)} → 窗口 ${String(r.win.start).padStart(5)}~${String(r.win.end).padStart(5)}`
      + `  实际顶行 ${String(r.realTop).padStart(5)}  锚点行 ${String(r.aLine).padStart(5)}`
      + `  窗口内err=${String(r.errImpl).padStart(4)}px  表偏差=${r.drift}`
      + (r.pvAtMax ? '  (预览贴底)' : ''));
  }

  const rows = res.rows.filter((r) => !r.empty && !r.noAnchor);
  console.log(`\n[判定] 文档 ${res.total} 行｜窗口宽度 ${res.windowWidth}｜可用样本 ${rows.length}/${res.rows.length}`);

  bump(assert('窗口宽度 ≤ 2200（N18 不变式）',
    res.windowWidth != null && res.windowWidth > 200 && res.windowWidth <= WIN_MAX,
    `宽度 ${res.windowWidth}`));
  bump(assert(`可用样本 ≥ ${MIN_SAMPLES}`, rows.length >= MIN_SAMPLES, `${rows.length} 个`));

  // ② 每个采样点的窗口必须覆盖该位置
  const notCovered = rows.filter((r) => !r.covered);
  bump(assert('每个采样点：渲染窗口覆盖目标行', notCovered.length === 0,
    notCovered.length ? `未覆盖：${notCovered.map((r) => r.want).join(', ')}` : '全部覆盖'));

  // ③ 窗口随滚动移动（单调 + start ≈ 目标行 − LEAD）
  const starts = rows.map((r) => r.win.start);
  const monotone = starts.every((v, i) => i === 0 || v >= starts[i - 1]);
  const moved = starts.length > 1 && starts[starts.length - 1] > starts[0];
  bump(assert('窗口随滚动移动（start 单调递增且确实变化）', monotone && moved,
    starts.join(' → ')));
  const badLead = rows.filter((r) => !(r.want - r.win.start >= 0 && r.want - r.win.start <= LEAD_TOL));
  bump(assert(`窗口起点 ≈ 目标行 − ${LEAD}（容差 ${LEAD_TOL}）`, badLead.length === 0,
    badLead.length ? `越界：${badLead.map((r) => `${r.want}→${r.win.start}`).join(', ')}`
      : `偏移 ${rows.map((r) => r.want - r.win.start).join(', ')}`));
  bump(assert('窗口内容锚点区间覆盖实际顶行', rows.every((r) => r.coveredByAnchors && r.inWindow),
    rows.map((r) => `${r.coveredByAnchors ? 'ok' : 'X'}${r.inWindow ? 'ok' : 'X'}`).join('')));

  // ④ 窗口像素表不陈旧（表值必须等于现测偏移）
  const drifts = rows.map((r) => r.drift).filter((d) => d != null);
  const worstDrift = drifts.length ? Math.max(...drifts.map(Math.abs)) : null;
  bump(assert(`窗口像素表不陈旧：|表值 − 现测| ≤ ${DRIFT_MAX}px（且至少 3 个样本取到表值）`,
    drifts.length >= 3 && worstDrift <= DRIFT_MAX,
    drifts.length ? `样本 ${drifts.length} 个、最大偏差 ${worstDrift}px` : '未取到表值（_windowLineTops 为空？）'));

  // ⑤ 窗口内对齐 = 设计值（bestTop − 24），排除预览已贴底的样本
  const alignRows = rows.filter((r) => !r.pvAtMax);
  const worstOffset = alignRows.length
    ? Math.max(...alignRows.map((r) => Math.abs(r.errImpl - IMPL_OFFSET))) : null;
  bump(assert(`窗口内对齐 ≈ ${IMPL_OFFSET}px（±${OFFSET_TOL}，排除预览贴底样本）`,
    worstOffset != null && worstOffset <= OFFSET_TOL,
    worstOffset == null ? '无可用样本' : `最大偏离 ${worstOffset}px（样本 ${alignRows.length}/${rows.length}）`));

  if (pageErrors.length) {
    console.log('\n[页面运行时错误] ' + pageErrors.slice(0, 8).join(' | '));
  }

  await browser.close();

  console.log(`\n========== 结果：✅ ${pass} 通过 / ❌ ${fail} 失败 ==========`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('测试运行异常:', e);
  process.exit(2);
});
