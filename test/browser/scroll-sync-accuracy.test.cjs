/**
 * 无头浏览器回归测试：滚动同步「对齐精度」（绝对度量）
 *
 * 为什么需要这个用例（2026-09-28）：
 *   已有的 scroll-sync-headless.test.cjs 用 ed._lineAtPreviewTop(pvTop) 做判据 —— 那是
 *   **正反映射共用同一张位置表**，偏差会自相消，因此它恒通过：真实存在 88px 常量偏移时
 *   它也报 ok（已实测）。这类"自证式指标"没有证明力。
 *
 * 本用例改用**绝对度量**：把编辑器精确停在某个锚点行的行首，等同步落定后，直接量该锚点的
 *   DOM 顶部到预览视口顶部的像素距离。理想 0px；它与实现内部用哪张表、哪个公式无关。
 *
 * 因此本用例的作用是**给滚动同步立一道可回归的门槛**：
 *   · 任何"预览恒定多滚/少滚一个常量"的实现都会在这里露出来
 *     （实测：旧实现稳定 −88px；改用局部按需锚定后中位 3px）；
 *   · 非末尾样本门槛取 max ≤ 48px、中位 ≤ 16px —— 远小于历史 88px 常量偏移，又容得下插值残差；
 *   · **末尾样本（编辑器距底不足一屏）单独判定**：该区段顶部对齐数学上不可达（预览可滚范围
 *     比编辑器短，硬夹是唯一连续解，代价 ≈ 1.0×视口高），改用"底部对齐"后残差上限降为两栏
 *     "每屏行数差"这一固有量级，故门槛取 0.5×预览视口高；并要求非末尾样本 ≥ 5 个，
 *     防止"全靠末尾样本"把门槛架空。
 *
 * 运行：
 *   node test/browser/scroll-sync-accuracy.test.cjs
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

// 样本门槛（px）。历史 88px 常量偏移会双双失败；正常实现应远低于此。
const MEDIAN_MAX = 16;
const ABS_MAX = 48;

// 刻意混排「块高 ≠ 行数」的元素：代码块/表格/列表/引用/长段落，让逐行线性插值的残差暴露出来
function buildDemo() {
  const lines = [];
  lines.push('# 滚动同步对齐精度（绝对度量）');
  lines.push('');
  lines.push('本用例把编辑器精确停在锚点行首，再量该锚点到预览视口顶的像素距离。');
  lines.push('');
  for (let i = 1; i <= 14; i++) {
    lines.push(`## 第 ${i} 节 混排内容`);
    lines.push('');
    lines.push('这是一段足够长的普通正文，用来制造折行，从而让预览里的行高与源码行数不成简单比例。');
    lines.push('');
    const kind = i % 4;
    if (kind === 1) {
      lines.push('```js');
      for (let k = 1; k <= 7; k++) lines.push(`const 变量${k} = ${k} * ${k};`);
      lines.push('```');
      lines.push('');
    } else if (kind === 2) {
      lines.push('| 列 A | 列 B | 列 C |');
      lines.push('| --- | --- | --- |');
      for (let k = 1; k <= 4; k++) lines.push(`| 值 ${k} | 数据 ${k} | 说明 ${k} |`);
      lines.push('');
    } else if (kind === 3) {
      lines.push('- 列表项一：用于制造紧凑高度的块');
      lines.push('- 列表项二');
      lines.push('- 列表项三');
      lines.push('');
    } else {
      lines.push('> 引用块：与段落、列表的渲染高度都不同。');
      lines.push('');
    }
  }
  return lines.join('\n');
}
const DEMO = buildDemo();

const TauriMock = `
(function(){
  try { localStorage.setItem('tizumark-eula-accepted','true'); } catch(e){}
  window.__TAURI__ = {
    core: {
      invoke: async function(cmd, args){
        args = args || {};
        switch(cmd){
          case 'read_bundled_file':
            if (args.filename === 'demo.md') return { content: window.__DEMO__ };
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

function assert(name, cond, detail) {
  if (cond) {
    console.log(`  ✅ PASS  ${name}` + (detail ? `  (${detail})` : ''));
    return true;
  }
  console.log(`  ❌ FAIL  ${name}` + (detail ? `  (${detail})` : ''));
  return false;
}

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

  await page.evaluateOnNewDocument((demo) => { window.__DEMO__ = demo; }, DEMO);
  await page.evaluateOnNewDocument(TauriMock);

  console.log('\n[启动] 打开 ' + URL + ' 并等待 app 初始化…');
  try {
    await openApp(page, URL, {
      ready: "window.editor && window.editor.cm && window.editor.preview && document.querySelectorAll('#preview [data-source-line]').length > 5",
      timeout: 20000,
    });
  } catch (e) {
    console.log('  ❌ FAIL  应用未在预期时间内初始化（预览未渲染）');
    console.log('  页面错误:', pageErrors.slice(0, 10).join(' | ') || '(无)');
    await browser.close();
    process.exit(1);
  }

  await page.evaluate((demo) => {
    const ed = window.editor;
    ed.cm.setValue(demo);
    if (typeof ed.updatePreview === 'function') ed.updatePreview();
    else if (typeof ed.debounceUpdatePreview === 'function') ed.debounceUpdatePreview();
  }, DEMO);
  await page.waitForFunction("document.querySelectorAll('#preview [data-source-line]').length > 20", { timeout: 10000 });
  bump(assert('应用启动且预览已渲染', true));

  // 双栏模式：preview-only 下编辑器宽度塌成 0，滚动同步无从验证
  await page.evaluate(() => { window.editor.setViewMode('edit'); });
  await page.waitForFunction(
    "(() => { const e = document.querySelector('.CodeMirror'); if (!e) return false; return e.getBoundingClientRect().width > 50; })()",
    { timeout: 8000 }
  );
  bump(assert('已切到双栏（编辑器有可见宽度）', true));

  // ---------- 对齐精度采样（绝对度量）----------
  console.log('\n[采样] 编辑器精确停在锚点行首 → 量「锚点顶部 ↔ 预览视口顶」的像素距离（理想 0）');
  const res = await page.evaluate(async () => {
    const ed = window.editor, cm = ed.cm, pv = ed.preview;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    const anchors = [...pv.querySelectorAll('[data-source-line]')]
      .filter(e => !e.closest('.footnotes'))
      .map(e => ({ el: e, line: +e.dataset.sourceLine }))
      .filter(o => o.line > 0);

    // 落定判据：预览 scrollTop 连续 3 次采样（间隔 100ms）不变
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

    // 预热：先走一遍全文，让 CodeMirror 完成行高测量（否则首点会被"未测量行"污染）
    cm.refresh();
    await sleep(150);
    const H = cm.getScrollInfo().height;
    cm.scrollTo(0, H); await settle();
    cm.scrollTo(0, 0); await settle();

    const out = [];
    for (const f of [0.06, 0.2, 0.35, 0.5, 0.65, 0.8, 0.92]) {
      const pick = anchors[Math.min(anchors.length - 1, Math.floor(anchors.length * f))];
      cm.scrollTo(0, cm.heightAtLine(pick.line - 1, 'local'));   // 该行行首对齐编辑器视口顶
      const settled = await settle();
      // 绝对度量：锚点 DOM 顶部相对预览视口顶的距离。不用任何内部表/映射函数。
      const err = pick.el.getBoundingClientRect().top - pv.getBoundingClientRect().top;
      const si = cm.getScrollInfo();
      const pvMax = Math.round(pv.scrollHeight - pv.clientHeight);
      const edDist = Math.round(si.height - (si.top + si.clientHeight));
      out.push({ line: pick.line, err: Math.round(err * 10) / 10, settled,
                 clamped: Math.round(pv.scrollTop) >= pvMax - 1,
                 // 末尾区段：编辑器距底部不足一屏 —— 该区段"顶部对齐"数学上不可达（见实现注释）
                 tail: edDist < si.clientHeight,
                 pvClientH: Math.round(pv.clientHeight), edDist,
                 edTop: Math.round(si.top), pvTop: Math.round(pv.scrollTop) });
    }

    return {
      out,
      docLines: cm.lineCount(),
      anchorCount: anchors.length,
      previewScrollable: Math.round(pv.scrollHeight - pv.clientHeight),
      editorScrollable: Math.round(H - cm.getScrollInfo().clientHeight),
    };
  });

  for (const s of res.out) {
    console.log(`  行 ${String(s.line).padStart(4)} → err=${String(s.err).padStart(7)}px`
      + `   editorTop=${s.edTop}  previewTop=${s.pvTop}`
      + (s.tail ? `  (末尾区段：距底 ${s.edDist}px < 视口 ${s.pvClientH}px → 按"底部对齐"门槛判定)` : '')
      + (s.settled ? '' : '  ⚠ 未落定'));
  }

  // 分两段判定（理由见 preview-sync.js 里「末尾区段」的注释）：
  //   · 非末尾样本：顶部对齐可用 → 严格门槛（中位 ≤16px、最大 ≤48px）。
  //   · 末尾样本（编辑器距底不足一屏）：预览可滚范围比编辑器短，**顶部对齐数学上不可达**
  //     —— 「连续 + 单调 + 不越界 + 精确遵守锚点」四者不可兼得，硬夹是唯一解，其代价
  //     恰好是 |err| ≈ 1.0 × 预览视口高。尾部改用「底部对齐」后，顶部残差上限降为两栏
  //     "每屏行数差"这一固有量级（实测约 0.25 屏）。故末尾门槛取 0.5 × 预览视口高：
  //     既能挡住旧的硬夹取行为，又不给固有差异设假门槛。
  const nonTail = res.out.filter(o => !o.tail && o.settled);
  const tail = res.out.filter(o => o.tail && o.settled);
  const errs = nonTail.map(o => o.err);
  const abs = errs.map(Math.abs).sort((a, b) => a - b);
  const median = abs.length ? abs[Math.floor(abs.length / 2)] : null;
  const max = abs.length ? abs[abs.length - 1] : null;
  const tailWorst = tail.length ? Math.max(...tail.map(o => Math.abs(o.err))) : null;
  const tailLimit = tail.length ? Math.round(0.5 * tail[0].pvClientH) : null;

  console.log(`\n[判定] 文档 ${res.docLines} 行 / 锚点 ${res.anchorCount} 个；`
    + `可滚范围 编辑器 ${res.editorScrollable}px、预览 ${res.previewScrollable}px`);
  console.log(`  非末尾样本 ${nonTail.length} 个 / 末尾样本 ${tail.length} 个（共 ${res.out.length}）`);

  bump(assert('文档与锚点数量足够（前提）',
    res.docLines > 80 && res.anchorCount > 20, `${res.docLines} 行 / ${res.anchorCount} 锚点`));
  bump(assert('编辑器与预览都有可滚动范围（前提）',
    res.editorScrollable > 200 && res.previewScrollable > 200,
    `编辑器 ${res.editorScrollable}px / 预览 ${res.previewScrollable}px`));
  bump(assert('每个采样点都完成了同步落定', res.out.every(o => o.settled),
    res.out.map(o => o.settled ? 'ok' : 'X').join('')));
  bump(assert('至少 5 个样本处于非末尾区段（否则严格门槛形同虚设）', nonTail.length >= 5,
    `非末尾 ${nonTail.length} / 共 ${res.out.length}`));
  bump(assert(`非末尾样本：中位对齐误差 ≤ ${MEDIAN_MAX}px`,
    median != null && median <= MEDIAN_MAX, `中位 ${median}px，全部=[${errs.join(', ')}]`));
  bump(assert(`非末尾样本：最大对齐误差 ≤ ${ABS_MAX}px（远小于历史 88px 常量偏移）`,
    max != null && max <= ABS_MAX, `最大 ${max}px`));
  bump(assert(`末尾样本：最大误差 ≤ 0.5×预览视口高（阈值 ${tailLimit}px；旧硬夹取约 1.0×视口高）`,
    tailWorst == null || tailWorst <= tailLimit, `最大 ${tailWorst}px / 阈值 ${tailLimit}px`));

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
