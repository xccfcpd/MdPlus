/**
 * 无头浏览器回归测试：滚动同步「对齐精度」（绝对度量）
 *
 * 为什么需要这个用例（2026-09-28）：
 *   已有的 scroll-sync-headless.test.cjs 用 ed._lineAtPreviewTop(pvTop) 做判据 —— 那是
 *   **正反映射共用同一张位置表**，偏差会自相消，因此它恒通过：真实存在 88px 常量偏移时
 *   它也报 ok（已实测）。这类"自证式指标"没有证明力。
 *
 * 本用例改用**绝对度量**，且「基准」与实现同源，避免把取样误差记成产品误差（2026-09-29 重写）：
 *   · 基准取「落定后**实际**的视口顶行」`lineAtHeight(scrollTop)+1`，**不是**"我打算滚到的行"
 *     —— `scrollTo(heightAtLine(L-1))` 对离屏行用的是估算行高，落点常差 1~2 行；按"打算的行"
 *     取元素会凭空多出 1~2 行（实测：曾把正确实现量成恒定 −86px / −709px 的假失败）；
 *   · 被测元素取「**≤ 实际顶行的最大锚点行**」（与 `_anchorPairByLine` 同源）；
 *   · 由此得到局部「跨度」= 该锚点 → 下一个锚点的预览像素距离，`t = |err| / 跨度`。
 *
 * 门槛（全部建立在上述绝对度量上，不调用实现内部映射函数）：
 *   · **t ≤ 1**：实现按设计把预览定位在锚点括号之内；任何常量偏移都会在**小跨度**样本上
 *     越界（历史 −88px 常量偏移在跨度 40~88px 的样本上必然失败）；
 *   · **无常量偏移**：err 取值数 ≥ 3 且极差 ≥ 8px —— "恒定 −88px"那类 bug 的正面指纹；
 *   · **单调**：编辑器采样位置递增 ⇒ 预览 scrollTop 不回弹；
 *   · **反向跟手**：把锚点贴到预览视口顶后，编辑器必须把同一行拉回顶（±1 行）；
 *   · **末尾贴底**：编辑器滚到底 ⇒ 预览滚到上限，且内容末端贴住视口底（≤ 40px）；
 *   · 顶部对齐"数学上不可达"的样本（顶部对齐目标可能越过预览上限）不计入 t/符号门槛，
 *     并要求可用样本 ≥ 6 个，防止"全靠不可达样本"把门槛架空。
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

// 门槛常量（全部作用于"绝对度量"，不依赖实现内部映射函数）
const T_MAX = 1;        // t = |err| / 局部括号跨度：锚点不得越过整个括号
const REV_MAX = 40;     // 反向跟手：编辑器落点与目标行的像素差（≈1 行）
const TAIL_MAX = 40;    // 末尾：预览内容末端距视口底（≈ 底部内边距 16px + 余量）
const MIN_USABLE = 5;   // 可用样本下限（防止"全靠不可达样本"架空门槛）
const MIN_SPREAD = 8;   // err 极差下限（"恒定常量偏移"的正面指纹）

// 刻意混排「块高 ≠ 行数」的元素：代码块/表格/列表/引用/长段落，让逐行线性插值的残差暴露出来
function buildDemo() {
  const lines = [];
  lines.push('# 滚动同步对齐精度（绝对度量）');
  lines.push('');
  lines.push('本用例把编辑器精确停在锚点行首，再量该锚点到预览视口顶的像素距离。');
  lines.push('');
  for (let i = 1; i <= 26; i++) {
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

  // 先确认被测的是 v2 局部锚定实现：若跑的是旧实现，本用例的结论会完全相反（实测差 29 倍）
  const isV2 = await page.evaluate(() =>
    typeof window.editor._anchorIndex === 'function' &&
    typeof window.editor._syncEditorToPreviewLocal === 'function');
  bump(assert('被测代码为 v2 局部锚定版（防止在旧实现上误判）', isV2,
    isV2 ? '_anchorIndex / _syncEditorToPreviewLocal 均存在' : '缺少 v2 方法'));

  // ---------- 对齐精度采样（绝对度量）----------
  console.log('\n[采样] 编辑器精确停在锚点行首 → 量「锚点顶部 ↔ 预览视口顶」的像素距离（理想 0）');
  const res = await page.evaluate(async () => {
    const ed = window.editor, cm = ed.cm, pv = ed.preview;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    const anchors = [...pv.querySelectorAll('[data-source-line]')]
      .filter(e => !e.closest('.footnotes'))
      .map(e => ({ el: e, line: +e.dataset.sourceLine }))
      .filter(o => o.line > 0);
    // 与实现同源的取元素方式：同一源码行取 DOM 中最外层（第一个）元素
    const firstByLine = new Map();
    for (const o of anchors) if (!firstByLine.has(o.line)) firstByLine.set(o.line, o.el);

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

    const lines = [...firstByLine.keys()].sort((a, b) => a - b);
    // 与实现同源：≤ 给定行的最大锚点行（_anchorPairByLine 的左侧锚点）
    const atOrAbove = (line) => {
      let best = null;
      for (const x of lines) if (x <= line && (best == null || x > best)) best = x;
      return best;
    };
    const pvMax = Math.round(pv.scrollHeight - pv.clientHeight);
    const pvClientH = Math.round(pv.clientHeight);

    const sample = async (f) => {
      const pick = lines[Math.min(lines.length - 1, Math.floor(lines.length * f))];
      cm.scrollTo(0, cm.heightAtLine(pick - 1, 'local'));   // 该行行首对齐编辑器视口顶
      const settled = await settle();
      const si = cm.getScrollInfo();
      // ⚠ 基准取「落定后**实际**的视口顶行」，不是"我打算滚到的行"：
      //   对离屏行 scrollTo 用的是估算行高，落点常差 1~2 行；按"打算的行"取元素会凭空多出
      //   1~2 行的假误差（实测曾把正确实现量成恒定 −86px / −709px）。
      const realTop = cm.lineAtHeight(si.top, 'local') + 1;
      const aLine = atOrAbove(realTop);                      // ★ 与实现同源
      const a = aLine != null ? firstByLine.get(aLine) : null;
      if (!a) return null;
      const nl = lines.find((x) => x > aLine);
      const b = nl != null ? firstByLine.get(nl) : null;
      const pvTop = pv.getBoundingClientRect().top;
      const rA = a.getBoundingClientRect();
      const err = Math.round((rA.top - pvTop) * 10) / 10;    // 绝对度量，不用任何内部表/函数
      const span = b ? Math.round(b.getBoundingClientRect().top - rA.top) : null;
      const anchorTop = Math.round(rA.top - pvTop + pv.scrollTop);   // 锚点在预览内容坐标系里的绝对位置
      return {
        pickLine: pick, realTop, aLine, lineDelta: realTop - pick,
        blockH: Math.round(rA.height), err, span,
        t: span ? Math.round((Math.abs(err) / span) * 100) / 100 : null,
        // 顶部对齐目标可能越过预览上限 ⇒ 该点落在"顶部对齐数学上不可达"的区段
        // （推导见 preview-sync.js「末尾区段」注释），量它没有意义
        tailRisk: span != null && (anchorTop + span) > pvMax + 0.5,
        clamped: Math.round(pv.scrollTop) >= pvMax - 1,
        pvTop: Math.round(pv.scrollTop), settled,
      };
    };

    // ① 正向采样（中前段，避开尾部不可达区）
    const out = [];
    for (const f of [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85]) out.push(await sample(f));

    // ② 反向：把某锚点贴到预览视口顶 → 编辑器必须把同一源码行拉回顶
    const rev = [];
    for (const f of [0.25, 0.5, 0.75]) {
      const L = lines[Math.min(lines.length - 1, Math.floor(lines.length * f))];
      const a = firstByLine.get(L);
      if (!a) continue;
      const base = pv.getBoundingClientRect().top - pv.scrollTop;
      const off = a.getBoundingClientRect().top - base;      // 锚点在预览内容里的绝对偏移
      if (off > pvMax - 2) continue;                         // 超出可滚上限的样本跳过
      pv.scrollTop = off;
      const settled = await settle();
      const cmTop = cm.getScrollInfo().top;
      const expectTop = cm.heightAtLine(L - 1, 'local');
      rev.push({
        anchorLine: L, expectTop: Math.round(expectTop), cmTop: Math.round(cmTop),
        diffPx: Math.round(cmTop - expectTop), settled,
      });
    }

    // ③ 末尾：编辑器到底 → 预览必须滚到上限，且内容末端贴住视口底
    cm.scrollTo(0, cm.getScrollInfo().height);
    await settle();
    const siEnd = cm.getScrollInfo();
    const kids = [...pv.children].filter((e) => !e.classList.contains('pv-spacer'));
    const lastEl = kids.length ? kids[kids.length - 1] : null;
    const tail = {
      edAtBottom: siEnd.top + siEnd.clientHeight >= siEnd.height - 1,
      pvTop: Math.round(pv.scrollTop), pvMax,
      contentGap: lastEl ? Math.round(pv.getBoundingClientRect().bottom - lastEl.getBoundingClientRect().bottom) : null,
      lastTag: lastEl ? lastEl.tagName : '(无子元素)',
    };

    return {
      out, rev, tail,
      docLines: cm.lineCount(),
      anchorCount: anchors.length,
      previewScrollable: pvMax, pvClientH,
      editorScrollable: Math.round(H - cm.getScrollInfo().clientHeight),
    };
  });

  for (const s of res.out) {
    if (!s) { console.log('  ⚠ 采样失败（该位置无锚点），已跳过'); continue; }
    console.log(`  行 ${String(s.realTop).padStart(4)}（目标 ${s.pickLine}, Δ${s.lineDelta}）`
      + ` → err=${String(s.err).padStart(7)}px  跨度=${String(s.span).padStart(4)}  t=${String(s.t).padStart(4)}`
      + `  块高=${String(s.blockH).padStart(4)}  pvTop=${s.pvTop}`
      + (s.tailRisk ? '  (顶部对齐可能越界：不计 t/符号门槛)' : '')
      + (s.clamped ? '  (预览已贴底)' : '')
      + (s.settled ? '' : '  ⚠ 未落定'));
  }

  // 可用样本：未落定 / 已贴底 / 顶部对齐不可达 的样本都排除，并要求数量足够
  const usable = res.out.filter(o => o && !o.clamped && !o.tailRisk && o.settled && o.span);
  const errs = usable.map(o => o.err);
  const abs = errs.map(Math.abs).sort((a, b) => a - b);
  const median = abs.length ? abs[Math.floor(abs.length / 2)] : null;
  const max = abs.length ? abs[abs.length - 1] : null;
  const tMax = usable.length ? Math.max(...usable.map(o => o.t)) : null;
  const distinct = new Set(errs).size;
  const spread = abs.length ? Math.round((abs[abs.length - 1] - abs[0]) * 10) / 10 : null;
  const overshoot = usable.length ? Math.max(...usable.map(o => o.err)) : null;

  console.log(`\n[判定] 文档 ${res.docLines} 行 / 锚点 ${res.anchorCount} 个；`
    + `可滚范围 编辑器 ${res.editorScrollable}px、预览 ${res.previewScrollable}px（预览视口 ${res.pvClientH}px）`);
  console.log(`  可用样本 ${usable.length}/${res.out.length}｜|err| 中位 ${median}px、最大 ${max}px`
    + `｜t 最大 ${tMax}｜不同 err 值 ${distinct} 个｜极差 ${spread}px`);

  bump(assert('文档与锚点数量足够（前提）',
    res.docLines > 80 && res.anchorCount > 20, `${res.docLines} 行 / ${res.anchorCount} 锚点`));
  bump(assert('编辑器与预览都有可滚动范围（前提）',
    res.editorScrollable > 200 && res.previewScrollable > 200,
    `编辑器 ${res.editorScrollable}px / 预览 ${res.previewScrollable}px`));
  bump(assert('每个采样点都完成了同步落定', res.out.every(o => o && o.settled),
    res.out.map(o => (o && o.settled) ? 'ok' : 'X').join('')));
  bump(assert(`可用样本 ≥ ${MIN_USABLE}（否则门槛形同虚设）`, usable.length >= MIN_USABLE,
    `可用 ${usable.length} / 共 ${res.out.length}`));

  // ① 核心不变量：锚点必须落在"该行所在括号"之内（容差受局部跨度约束 ⇒ 常量偏移会越界）
  bump(assert(`t ≤ ${T_MAX}：锚点不会比预览视口顶高出一个括号跨度（历史 −88px 常量偏移在此失败）`,
    tMax != null && tMax <= T_MAX, `t 最大 ${tMax}`));

  // ② 无常量偏移：err 必须随样本变化（"恒定 −88px"那类 bug 的正面指纹）
  bump(assert(`err 非常数：取值数 ≥ 3 且极差 ≥ ${MIN_SPREAD}px`,
    distinct >= 3 && spread != null && spread >= MIN_SPREAD, `取值 ${distinct} 个、极差 ${spread}px`));

  // ③ 符号：顶部对齐 ⇒ 锚点不应落到视口顶下方（容 8px 取整误差）
  bump(assert('锚点不落在预览视口顶下方（err ≤ 8px）', overshoot != null && overshoot <= 8,
    `最大 err ${overshoot}px`));

  // ④ 单调：编辑器越往下，预览不允许回弹
  const seq = res.out.filter(o => o && o.settled).map(o => o.pvTop);
  const monotone = seq.every((v, i) => i === 0 || v >= seq[i - 1] - 1);
  bump(assert('单调：编辑器采样位置递增时，预览 scrollTop 不回弹', monotone, seq.join(' → ')));

  // ⑤ 反向跟手：锚点贴预览顶 ⇒ 编辑器把同一源码行拉回顶（±1 行）
  console.log('\n[反向] 预览 → 编辑器');
  for (const o of res.rev) {
    console.log(`  锚点行 ${String(o.anchorLine).padStart(4)} → 期望 cmTop ${o.expectTop}、实测 ${o.cmTop}`
      + `（差 ${o.diffPx}px）` + (o.settled ? '' : '  ⚠ 未落定'));
  }
  const revUse = res.rev.filter(o => o.settled);
  const revWorst = revUse.length ? Math.max(...revUse.map(o => Math.abs(o.diffPx))) : null;
  bump(assert('反向可用样本 ≥ 2', revUse.length >= 2, `${revUse.length} 个`));
  bump(assert(`反向跟手：|差px| ≤ ${REV_MAX}px（≈1 行）`,
    revWorst != null && revWorst <= REV_MAX, revWorst == null ? '无样本' : `最大 ${revWorst}px`));

  // ⑥ 末尾贴底：编辑器到底 ⇒ 预览滚到上限 + 内容末端贴住视口底
  console.log('\n[末尾] ' + JSON.stringify(res.tail));
  bump(assert('编辑器确实到底（前置）', res.tail.edAtBottom === true, `edAtBottom=${res.tail.edAtBottom}`));
  bump(assert('编辑器到底时预览滚到上限（底部对齐）',
    res.tail.pvTop >= res.tail.pvMax - 1, `pvTop ${res.tail.pvTop} / max ${res.tail.pvMax}`));
  bump(assert(`预览内容末端贴住视口底（≤ ${TAIL_MAX}px）`,
    res.tail.contentGap != null && res.tail.contentGap <= TAIL_MAX,
    `末端距底 ${res.tail.contentGap}px（最后子元素 ${res.tail.lastTag}）`));

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
