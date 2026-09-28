/**
 * 无头浏览器回归测试：18 项声明功能的**真实渲染**验收（真 Chromium 内核）
 *
 * 为什么需要它（补 test/feature-matrix.test.cjs 的盲区）：
 *   feature-matrix.test.cjs 走 jsdom —— 能证明「管线把占位/属性/错误态摆对了」，但 jsdom
 *   **不执行外链脚本**、**没有真实布局**，所以图表引擎（Mermaid / Graphviz / ECharts /
 *   WaveDrom / Markmap）在该文件里全部走"引擎不可用"分支（真实渲染交给 diagram-engines.test.cjs
 *   的桩）。也就是说：「18 项在真实引擎里都真的画出来了」这件事，此前**没有任何用例钉住**。
 *   本用例把它钉在真 Chromium 上：加载真实应用，灌入同一篇 18 项文档，等占位清理干净后
 *   逐项断言 DOM 里真的有 svg / canvas / .katex，并对产物截图留证（写系统临时目录，不入库）。
 *
 * 运行：由 scripts/run-tests.cjs 的 browser/ 分支自动拉起 dev-server(1420) 后执行。
 *   （手动：node test/browser/feature-render.test.cjs，需 dev-server 在 1420）
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { launch, findBrowser, skipReason, openApp } = require('./_cdp.cjs');

const CHROME_PATH = process.env.CHROME_PATH || findBrowser();
const URL = 'http://localhost:1420/';
const SKIP_REASON = skipReason();
if (SKIP_REASON || !CHROME_PATH || !fs.existsSync(CHROME_PATH)) {
  console.log('SKIP: ' + (SKIP_REASON || '未探测到 Chrome / Edge'));
  process.exit(0);
}

const B = String.fromCharCode(96);   // 反引号（避免与 markdown 围栏冲突）
const F = B + B + B;

// 与 test/feature-matrix.test.cjs 的 DOC 同源：同一篇文档，一端在 jsdom 验管线，一端在真内核验渲染。
const DOC = [
  '# 一级标题', '', '## 二级标题', '',
  '段落：**加粗**、*斜体*、' + B + '行内代码' + B + '、~~删除线~~、==高亮==、[链接](https://example.com)、脚注[^1]。', '',
  '[^1]: 脚注内容。', '',
  '- [x] 已完成任务', '- [ ] 未完成任务', '',
  '| 列 A | 列 B |', '| ---- | ---- |', '| 1 | 2 |', '',
  '术语', ': 定义', '',
  '::: tip 容器提示', '这是 ::: 容器语法的正文', ':::', '',
  '!!! warning "警告标题"', '    这是 !!! 提示块的正文（必须缩进）', '',
  '??? note "折叠块"', '    这是 ??? 折叠块的正文', '',
  '> [!NOTE]', '> GitHub 风格提示', '',
  '行内公式 $E = mc^2$，物理单位 $\\si{kg m}$，化学式 $\\ce{2H2 + O2 -> 2H2O}$。', '',
  '$$', 'E = mc^2 \\label{eq:e}', '$$', '',
  '见式 $\\eqref{eq:e}$。', '',
  'Emoji：:fire: :rocket:', '',
  '缩写：HTML 是 Web 基础。', '', '*[HTML]: HyperText Markup Language', '',
  F + 'javascript', 'const x = 1;', 'function f() { return x; }', F, '',
  F + 'plantuml', '@startuml', 'Alice -> Bob : hi', '@enduml', F, '',
  F + 'mermaid', 'flowchart LR', '  A --> B', F, '',
  F + 'graphviz', 'digraph { 来料 -> 检验 }', F, '',
  // ⚠ 与 feature-matrix.test.cjs 的 DOC 唯一不同处：那边 jsdom 无引擎、走"失败态"分支，option 可省坐标系；
  //    真 ECharts 的 bar 系列必须有 xAxis/yAxis，否则 setOption 直接报错。
  F + 'echarts',
  '{"xAxis":{"type":"category","data":["A","B"]},"yAxis":{"type":"value"},"series":[{"type":"bar","data":[1,2]}]}',
  F, '',
  F + 'wavedrom', '{ "signal": [ { "name": "clk", "wave": "p..." } ] }', F, '',
  F + 'tikz', '\\draw (0,0) -- (1,1);', F, '',
  F + 'plot', 'plot sin(x)', F, '',
  F + 'markmap', '# 根节点', '## 子节点', F,
].join('\n');

const DIAGRAM_TYPES = ['mermaid', 'graphviz', 'echarts', 'wavedrom', 'tikz', 'plot', 'markmap'];
// 导出链路真正加载的本地资源（exportHTML / exportPDF / exportWord 用到的全部外链）
const EXPORT_ASSETS = [
  'styles.css', 'lib/katex/katex.min.css', 'lib/highlight.js/highlight.min.js',
  'lib/docx.min.js', 'lib/mathml2omml.min.js', 'lib/html2canvas.min.js',
  'lib/echarts.min.js', 'lib/graphviz.min.js', 'lib/wavedrom/wavedrom.min.js',
  'lib/markmap/markmap.min.js', 'lib/mermaid/mermaid.min.js',
];

// 页面脚本运行前注入：EULA 已接受 + Tauri IPC mock（与同目录另两支用例一致）
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

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { console.log('  ✅ PASS  ' + name + (detail ? '  (' + detail + ')' : '')); pass++; return true; }
  console.log('  ❌ FAIL  ' + name + (detail ? '  (' + detail + ')' : '')); fail++; return false;
}

/** 页面内探针（必须自包含，不可引用外部变量）。一次性收集全部证据。 */
function probe() {
  const pv = document.getElementById('preview');
  const html = pv.innerHTML;
  const text = pv.textContent;
  const qsa = (s) => Array.prototype.slice.call(pv.querySelectorAll(s));
  const containers = {};
  ['mermaid', 'graphviz', 'echarts', 'wavedrom', 'tikz', 'plot', 'markmap'].forEach((t) => {
    const els = qsa('.diagram-container[data-diagram-type="' + t + '"]');
    containers[t] = {
      count: els.length,
      graphic: els.filter((e) => !!e.querySelector('svg, canvas')).length,
      svg: els.filter((e) => !!e.querySelector('svg')).length,
      canvas: els.filter((e) => !!e.querySelector('canvas')).length,
      error: els.filter((e) => e.classList.contains('diagram-error')).length,
      errorMsg: els.reduce((n, e) => n + e.querySelectorAll('.diagram-error-msg').length, 0),
      hasCode: els.filter((e) => (e.getAttribute('data-code') || '').length > 0).length,
      hasTheme: els.filter((e) => e.hasAttribute('data-theme')).length,
      // PlantUML → Mermaid 的证据：容器里的源码已是转换后的 sequenceDiagram
      seq: els.filter((e) => /^\s*sequenceDiagram/.test(e.getAttribute('data-code') || '')).length,
    };
  });
  // mhchem：直接问真 KaTeX —— \ce 未注册时会抛 "Undefined control sequence"。
  // 比"字符串里出现过 \ce{" 强：后者在 mhchem 缺失时也成立（KaTeX 失败会原样回退）。
  let mhchemOK = false, mhchemErr = '';
  try {
    const scratch = document.createElement('div');
    document.body.appendChild(scratch);
    window.katex.render('\\ce{2H2 + O2 -> 2H2O}', scratch, { throwOnError: true });
    mhchemOK = scratch.textContent.replace(/\s+/g, '').indexOf('2H2') >= 0;
    scratch.parentNode.removeChild(scratch);
  } catch (e) { mhchemErr = String((e && e.message) || e); }
  return {
    html: {
      mathblock: html.indexOf('MATHBLOCK'),
      siResidue: html.indexOf('\\si{'),
      siExpanded: /kg\\,m/.test(html),   // \si{kg m} → kg\,m（细空格）
      eqrefResidue: html.indexOf('\\eqref'),   // ⚠ title="\eqref{...}" 是「点编号复制」的有意产物（preview-post.js:272）
      eqrefText: text.indexOf('\\eqref'),      // 可见文本里不该再有 \eqref（应已展开成编号引用）
      labelResidue: html.indexOf('\\label'),
    },
    mhchem: { ok: mhchemOK, err: mhchemErr },
    katex: qsa('.katex').length,
    eqAnchor: qsa('[id*="eq-"], .katex-display .tag').length,
    eqCopy: qsa('[title*="eqref"]').length,   // 「点一下复制 \eqref{label}」的 title 载体
    base: {
      h1Id: !!pv.querySelector('h1') && !!pv.querySelector('h1').id,
      h2Id: !!pv.querySelector('h2') && !!pv.querySelector('h2').id,
      table: qsa('table').length,
      link: qsa('a[href="https://example.com"]').length,
      checkbox: qsa('input[type="checkbox"]').length,
      del: qsa('del').length,
      mark: qsa('mark').length,
      dd: qsa('dd').length,
      footnote: qsa('.footnotes, [id^="fn"], a[href^="#fn"]').length,
      abbr: qsa('abbr[title]').length,
      abbrData: qsa('#abbr-data').length,
    },
    code: {
      hljs: qsa('pre code.hljs').length,
      highlighted: qsa('pre code[data-highlighted="yes"]').length,
      tokens: qsa('pre code .code-scroll span[class*="hljs-"]').length,
      langClass: qsa('pre code.language-javascript').length,
      lineNum: qsa('.code-line-num').length,
      scroll: qsa('.code-scroll').length,
    },
    emoji: { fire: text.indexOf('\uD83D\uDD25') >= 0, rocket: text.indexOf('\uD83D\uDE80') >= 0, residue: text.indexOf(':fire:') },
    alert: {
      total: qsa('.alert, .admonition').length,
      tip: qsa('.alert-tip').length,
      warning: qsa('.alert-warning').length,
      note: qsa('.alert-note').length,
      details: qsa('details[data-admonition]').length,
      detailsOpen: qsa('details[data-admonition]').filter((d) => d.open).length,
    },
    containers: containers,
    containerTotal: qsa('.diagram-container').length,
    pending: { src: qsa('pre.diagram-src-pending').length, box: qsa('.diagram-container.diagram-pending').length },
    exportEntry: {
      html: typeof window.editor.exportHTML === 'function',
      pdf: typeof window.editor.exportPDF === 'function',
      word: typeof window.editor.exportWord === 'function',
    },
    // 失败时的定位证据（不是断言，只在有失败时打印）
    diag: {
      echartsErr: (function () {
        const e = pv.querySelector('.diagram-container[data-diagram-type="echarts"] .diagram-error-msg');
        return e ? e.textContent.trim().slice(0, 240) : '';
      })(),
      wdErr: (function () {
        const e = pv.querySelector('.diagram-container[data-diagram-type="wavedrom"] .diagram-error-msg');
        return e ? e.textContent.trim().slice(0, 200) : '';
      })(),
      codeSample: (function () {
        const c = pv.querySelector('pre code');
        return c ? c.outerHTML.slice(0, 360) : '';
      })(),
      eqrefCtx: (function () {
        const out = [];
        let i = -1;
        while (out.length < 3 && (i = html.indexOf('\\eqref', i + 1)) >= 0) {
          out.push(html.slice(Math.max(0, i - 100), i + 40).replace(/\s+/g, ' '));
        }
        return out;
      })(),
    },
  };
}

/** 第二趟：fetch 导出/渲染依赖的本地资源（证明"离线可导出"的实质依赖到位，而非只查函数名）。 */
async function assetProbe(list) {
  const out = {};
  for (let i = 0; i < list.length; i++) {
    try {
      const r = await fetch(list[i], { cache: 'no-store' });
      out[list[i]] = r.ok ? 'ok' : 'HTTP ' + r.status;
    } catch (e) { out[list[i]] = 'ERR:' + String((e && e.message) || e); }
  }
  return out;
}
// 完成判据：占位必须全部摘干净（preview-post.js 的清理契约），且 8 个图表容器都已立起来
const PENDING_GONE =
  "(function(){var p=document.getElementById('preview');" +
  "return p.querySelectorAll('pre.diagram-src-pending').length===0" +
  " && p.querySelectorAll('.diagram-container.diagram-pending').length===0" +
  " && p.querySelectorAll('.diagram-container').length>=8;})()";

// 逐项断言表：name → 判定函数 / 证据文本（失败时打印的证据要能直接定位问题）
const CHECKS = [
  ['[1] 标题渲染且带 id（供大纲跳转）', (r) => r.base.h1Id && r.base.h2Id, (r) => 'h1.id=' + r.base.h1Id + ' h2.id=' + r.base.h2Id],
  ['[1] 表格 / 链接 / 任务列表', (r) => r.base.table >= 1 && r.base.link >= 1 && r.base.checkbox >= 2,
    (r) => 'table=' + r.base.table + ' link=' + r.base.link + ' checkbox=' + r.base.checkbox],
  ['[1] 删除线 <del> 与高亮 <mark>', (r) => r.base.del >= 1 && r.base.mark >= 1, (r) => 'del=' + r.base.del + ' mark=' + r.base.mark],
  ['[1] 定义列表 <dd> 与脚注', (r) => r.base.dd >= 1 && r.base.footnote >= 1, (r) => 'dd=' + r.base.dd + ' footnote=' + r.base.footnote],
  ['[1] 缩写 <abbr title> 且隐藏容器被移除', (r) => r.base.abbr >= 1 && r.base.abbrData === 0,
    (r) => 'abbr=' + r.base.abbr + ' #abbr-data=' + r.base.abbrData],

  // 判据用 hljs-* token span，不用 data-highlighted：后者只在 hljs 缓存**未命中**路径写入
  // （code-block.js:138），命中路径只设 innerHTML + hljs class（有意为之，见其注释）。
  ['[2] 代码块被 hljs 真高亮（产出 hljs-* token）', (r) => r.code.hljs >= 1 && r.code.tokens >= 3,
    (r) => 'code.hljs=' + r.code.hljs + ' hljs-* token=' + r.code.tokens + ' data-highlighted=' + r.code.highlighted],
  ['[2] 语言类 / 行号 / .code-scroll 结构', (r) => r.code.langClass >= 1 && r.code.lineNum >= 2 && r.code.scroll >= 1,
    (r) => 'language-javascript=' + r.code.langClass + ' 行号=' + r.code.lineNum + ' .code-scroll=' + r.code.scroll],

  ['[3] KaTeX 真渲染出 .katex（行内 + 块级）', (r) => r.katex >= 3, (r) => '.katex=' + r.katex],
  ['[3] 无 MATHBLOCK 残留', (r) => r.html.mathblock < 0, (r) => 'MATHBLOCK=' + r.html.mathblock],
  ['[3] siunitx：\\si{kg m} → kg\\,m 且无 \\si{ 残留', (r) => r.html.siExpanded && r.html.siResidue < 0,
    (r) => '展开=' + r.html.siExpanded + ' \\si{ 残留=' + r.html.siResidue],
  ['[3] mhchem：真 KaTeX 可渲染 \\ce{...}（扩展已注册）', (r) => r.mhchem.ok, (r) => r.mhchem.ok ? '' : r.mhchem.err],
  ['[3] 公式自动编号：\\eqref 已展开、\\label 已剥离、锚点与复制入口就位',
    (r) => r.html.eqrefText < 0 && r.html.labelResidue < 0 && r.eqAnchor >= 1 && r.eqCopy >= 1,
    (r) => '正文 \\eqref 残留=' + r.html.eqrefText + ' \\label 残留=' + r.html.labelResidue +
      ' 锚点=' + r.eqAnchor + ' 复制 title=' + r.eqCopy],

  ['[4] Emoji 短码替换且正文无 :fire: 残留',
    (r) => r.emoji.fire && r.emoji.rocket && r.emoji.residue < 0,
    (r) => 'fire=' + r.emoji.fire + ' rocket=' + r.emoji.rocket + ' 残留=' + r.emoji.residue],

  ['[5] Admonition 四种写法各出提示块', (r) => r.alert.tip >= 1 && r.alert.warning >= 1 && r.alert.note >= 1 && r.alert.details >= 1,
    (r) => 'tip=' + r.alert.tip + ' warning=' + r.alert.warning + ' note=' + r.alert.note + ' details=' + r.alert.details],

  ['[6] 图表容器齐备（8 个）且占位归零',
    (r) => r.containerTotal >= 8 && r.pending.src === 0 && r.pending.box === 0,
    (r) => '容器=' + r.containerTotal + ' pending(src/box)=' + r.pending.src + '/' + r.pending.box],
  ['[6] 每类图表都拿到真实产物（svg / canvas）且非错误态',
    (r) => DIAGRAM_TYPES.every((t) => r.containers[t].count >= 1 && r.containers[t].graphic >= r.containers[t].count && r.containers[t].error === 0),
    (r) => DIAGRAM_TYPES.map((t) => t + ':' + r.containers[t].graphic + '/' + r.containers[t].count + (r.containers[t].error ? '(err' + r.containers[t].error + ')' : '')).join(' ')],
  ['[6] Mermaid / PlantUML 均落到 mermaid 容器', (r) => r.containers.mermaid.count >= 2,
    (r) => 'mermaid 容器=' + r.containers.mermaid.count],
  ['[6] PlantUML 已转成 Mermaid 源码（sequenceDiagram）', (r) => r.containers.mermaid.seq >= 1,
    (r) => 'sequenceDiagram 容器=' + r.containers.mermaid.seq],
  ['[6] ECharts 走 canvas 渲染器', (r) => r.containers.echarts.canvas >= 1,
    (r) => 'canvas=' + r.containers.echarts.canvas],
  ['[6] Mermaid / Graphviz 走 svg 渲染器',
    (r) => r.containers.mermaid.svg >= 2 && r.containers.graphviz.svg >= 1,
    (r) => 'mermaid.svg=' + r.containers.mermaid.svg + ' graphviz.svg=' + r.containers.graphviz.svg],
  ['[6] 容器携带 data-code / data-theme（可重绘、可导出）',
    (r) => DIAGRAM_TYPES.every((t) => r.containers[t].hasCode >= r.containers[t].count && r.containers[t].hasTheme >= r.containers[t].count),
    (r) => DIAGRAM_TYPES.map((t) => t + ':' + r.containers[t].hasCode + '/' + r.containers[t].hasTheme).join(' ')],
  ['[6] 无引擎错误说明残留（真内核里不该有 .diagram-error-msg）',
    (r) => DIAGRAM_TYPES.reduce((n, t) => n + r.containers[t].errorMsg, 0) === 0,
    (r) => DIAGRAM_TYPES.map((t) => t + ':' + r.containers[t].errorMsg).join(' ')],

  ['[7] 导出入口齐备（HTML / PDF / DOCX）',
    (r) => r.exportEntry.html && r.exportEntry.pdf && r.exportEntry.word,
    (r) => 'exportHTML=' + r.exportEntry.html + ' exportPDF=' + r.exportEntry.pdf + ' exportWord=' + r.exportEntry.word],
];

(async () => {
  const browser = await launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });

  const pageErrors = [];
  const failedReq = [];
  page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/favicon\.ico|404/.test(t)) return;   // 静态服务无 favicon，属噪音
    pageErrors.push('console.error: ' + t);
  });
  // 资源加载失败 = 离线依赖没到位，必须红（favicon 类型为 Other，天然被过滤）
  page.on('requestfailed', (r) => {
    const t = r && r.type;
    if (t === 'Script' || t === 'Stylesheet' || t === 'Fetch' || t === 'XHR' || t === 'Font') {
      failedReq.push(t + ': ' + (r.errorText || 'unknown'));
    }
  });

  // 启动用一篇**互不相关的小占位文档**，而不是 DOC：否则 app 会在启动时先渲染一遍 DOC，
  // 我们随后的 setValue(DOC) 就会命中 hljs 的**内容缓存**（code-block.js 缓存命中路径只设
  // innerHTML + hljs class，不重设 data-highlighted），断言的不再是"首次渲染"的结果。
  await page.evaluateOnNewDocument(() => {
    window.__DEMO__ = ['# 启动占位', '', '第一段占位正文。', '', '第二段占位正文。', '',
      '## 小节一', '', '第一段占位正文。', '', '## 小节二', '', '第二段占位正文。'].join('\n');
  }, null);
  await page.evaluateOnNewDocument(TauriMock);

  console.log('\n[启动] 打开 ' + URL + ' 并等待 app 初始化…');
  try {
    await openApp(page, URL, {
      ready: "window.editor && window.editor.cm && window.editor.preview && document.querySelectorAll('#preview [data-source-line]').length > 5",
      timeout: 20000,
    });
  } catch (e) {
    console.log('  ❌ FAIL  应用未在预期时间内初始化');
    console.log('  页面错误:', pageErrors.slice(0, 10).join(' | ') || '(无)');
    await browser.close();
    process.exit(1);
  }
  assert('应用启动且初始预览已渲染', true);

  // 切「编辑+预览」双栏：与同目录另两支用例一致，保证预览面板有真实宽度（图表量尺寸需要布局）
  await page.evaluate(() => { window.editor.setViewMode('edit'); });
  await page.waitForFunction(
    "(() => { const e = document.querySelector('.CodeMirror'); return !!e && e.getBoundingClientRect().width > 50; })()",
    { timeout: 8000 }
  );

  console.log('\n[灌入] 写入 18 项功能文档并驱动完整预览管线…');
  // ⚠ cm.setValue 会触发 change → 300ms 防抖二次渲染；二次渲染会重新 prepare 占位，与我们
  // 的断言窗口重叠 → 偶发读到 diagram-pending>0。本用例只验"渲染结果"，故把防抖入口实例级
  // 置空，只跑主动触发的那一次（真内核渲染路径仍完整）。
  await page.evaluate(async (md) => {
    const ed = window.editor;
    ed.debounceUpdatePreview = function () {};
    // 默认 6s；冷启动首次要从本地磁盘解析 graphviz(数 MB base64) / echarts / markmap，放宽到 20s
    if (window.DiagramRenderers && window.DiagramRenderers.setEngineLoadTimeout) {
      window.DiagramRenderers.setEngineLoadTimeout(20000);
    }
    ed.cm.setValue(md);
    await ed.updatePreview(true, md);
  }, DOC);

  let rendered = true, renderErr = '';
  try {
    await page.waitForFunction(PENDING_GONE, { timeout: 90000 });
  } catch (e) { rendered = false; renderErr = e.message; }
  await new Promise((r) => setTimeout(r, 800));   // 让最后一个引擎的收尾落定
  if (rendered) {
    try { await page.waitForFunction(PENDING_GONE, { timeout: 20000 }); }
    catch (e) { rendered = false; renderErr = e.message; }
  }
  if (!rendered) {
    const diag = await page.evaluate(() => {
      const p = document.getElementById('preview');
      return {
        containers: p.querySelectorAll('.diagram-container').length,
        pendingSrc: p.querySelectorAll('pre.diagram-src-pending').length,
        pendingBox: p.querySelectorAll('.diagram-container.diagram-pending').length,
        errors: Array.prototype.slice.call(p.querySelectorAll('.diagram-error-msg')).map((e) => e.textContent.trim().slice(0, 100)),
      };
    });
    console.log('  诊断:', JSON.stringify(diag));
  }
  assert('图表占位全部清理完毕且容器齐备', rendered, rendered ? '' : String(renderErr).slice(0, 160));

  const r = await page.evaluate(probe);
  const assets = await page.evaluate(assetProbe, EXPORT_ASSETS);

  console.log('\n[断言] 逐项核对渲染产物');
  CHECKS.forEach((c) => assert(c[0], c[1](r), c[2](r)));

  // 导出依赖的本地资源必须全部取到（这才是"离线可导出"的实质依赖）
  const badAssets = EXPORT_ASSETS.filter((u) => assets[u] !== 'ok');
  assert('[7] 导出/渲染依赖的本地资源全部可取（离线可导出）', badAssets.length === 0,
    badAssets.length ? badAssets.map((u) => u + '=' + assets[u]).join(' ') : EXPORT_ASSETS.length + ' 项全部 ok');

  assert('[7] 无 Script/Stylesheet/Fetch 资源加载失败', failedReq.length === 0,
    failedReq.length ? failedReq.slice(0, 5).join(' | ') : '0 失败');
  assert('[7] 页面无未捕获运行时错误', pageErrors.length === 0,
    pageErrors.length ? pageErrors.slice(0, 5).join(' | ') : '0 错误');

  // ---- 截图留证（写系统临时目录，不入库）----
  const shotDir = path.join(os.tmpdir(), 'tizumark-feature-render');
  try {
    fs.mkdirSync(shotDir, { recursive: true });
    const shots = DIAGRAM_TYPES.concat(['katex', 'admonition']);
    for (const key of shots) {
      const sel = key === 'katex' ? '.katex-display, .katex'
        : key === 'admonition' ? '.alert, details[data-admonition]'
          : '.diagram-container[data-diagram-type="' + key + '"]';
      const found = await page.evaluate((s) => {
        const el = document.querySelector('#preview ' + s);
        if (!el) return false;
        el.scrollIntoView({ block: 'center' });
        return true;
      }, sel);
      if (!found) continue;
      await new Promise((res) => setTimeout(res, 250));
      await page.screenshot({ path: path.join(shotDir, key + '.png') });
    }
    console.log('\n[留证] 截图目录: ' + shotDir);
  } catch (e) {
    console.log('\n[留证] 截图失败（不影响结论）: ' + String((e && e.message) || e));
  }

  if (pageErrors.length) console.log('\n[页面运行时错误] ' + pageErrors.slice(0, 8).join(' | '));

  await browser.close();
  console.log(`\n========== 结果：✅ ${pass} 通过 / ❌ ${fail} 失败 ==========`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('测试运行异常:', e);
  process.exit(2);
});

