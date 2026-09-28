// 预览渲染与滚动同步、虚拟滚动
// 从 src/app.js 拆分而来：方法体原样搬运，经 mixin 挂到 MarkdownEditor.prototype，
// 因此方法内的 this 仍指向编辑器实例，模块之间可继续用 this.xxx() 互调。
(function () {
  'use strict';

  const mixin = {
      debounceUpdatePreview() {
        // 任务列表勾选来源：预览 DOM 已就地同步，跳过全量重渲染（不防抖，立即轻量刷新字数/大纲）
        if (this._suppressNextPreviewRerender) {
          this._suppressNextPreviewRerender = false;
          this.updateWordCount();
          this.updateOutline();
          return;
        }
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          // 一次防抖只读一次全文（2026-09-26 审计）：此前 updatePreview / updateWordCount /
          // updateOutline 各自 cm.getValue() —— 停键一次就是**三遍整篇字符串重建 + 三遍 O(N) 扫描**
          // （预览侧还要再数一遍行数）。三者都接受 content 参数，这里统一读一次传下去。
          const content = this.cm.getValue();
          this.updatePreview(true, content);
          this.updateWordCount(content);
          this.updateOutline(content);
        }, 300);
      },
      // 从预览元素获取对应的源文件行号（通过 unified 嵌入的 data-source-line）
      _getSourceLine(el) {
        if (el.dataset && el.dataset.sourceLine) {
          return parseInt(el.dataset.sourceLine, 10);
        }
        const inner = el.querySelector('[data-source-line]');
        if (inner) {
          return parseInt(inner.dataset.sourceLine, 10);
        }
        return null;
      },
      // 构建逐行密集位置映射（纯线性插值，无速度限制）
      // 每个编辑器行都有精确的 previewTop 插值
      // 无缓存：每次调用全量重建，与 legacy-master 行为一致（用户报告精准匹配）。
      // 3dac68c 引入的 dirty 缓存 + 布局指纹会造成某些场景下位置表过期（编辑器布局变化但
      // preview scrollHeight 未变时缓存命中 → 用旧表插值），此版本回退到 legacy 行为。
      // elements 可选：调用方（rebuildScrollSync）已查询过同一批元素时直接传入，
      // 省掉一次对整棵预览 DOM 的 querySelectorAll（2026-09-26）。
      _computedPosition(elements) {
        // 缓存：大文档（数千行/数千块级元素）下，原实现每次滚动 tick 都全量重算
        //（对所有行调 cm.heightAtLine + 重建与行数等长的数组），导致滚动掉帧。
        // 仅在「预览重渲染」（rebuildScrollSync 置脏）或「编辑器内容变化」（changeGeneration 改变）
        // 时才重算，滚动 tick 直接复用上次结果；内容没变则同步精度不变。
        // 仅以「预览重渲染」（rebuildScrollSync 置脏）与「行数变化」为失效条件：
        // 去掉原先的 changeGeneration 键——它每次键击都变，会使大文档每次输入后全量重算
        // （对所有行 cm.heightAtLine + 重建与行数等长的数组），造成打字/滚动偶发卡顿（2026-09-25 审计）。
        // 现在仅在内容真实改变结构（行数增减）或预览重渲后才重算，输入过程复用缓存、与延迟渲染中的预览一致。
        const lineCount = (typeof this.cm.lineCount === 'function') ? this.cm.lineCount() : 0;
        if (!this._positionCacheDirty && this._editorElementList && this._previewElementList &&
            this._positionLineCount === lineCount) {
          return;
        }
        this._positionCacheDirty = false;
        this._positionLineCount = lineCount;
        const allElements = elements || this.preview.querySelectorAll('[data-source-line]');
        const anchors = [];
        const seenLines = new Set();
  
        for (const el of allElements) {
          // 跳过脚注区域内的元素（source line 在文档中部但渲染在预览最底部）
          if (el.closest('.footnotes')) continue;
  
          const sourceLine = parseInt(el.dataset.sourceLine, 10);
          if (isNaN(sourceLine)) continue;
          if (seenLines.has(sourceLine)) continue;
          seenLines.add(sourceLine);
  
          const editorTop = this.cm.heightAtLine(Math.max(0, sourceLine - 1), 'local');
          const previewTop = this._getOffsetTop(el);
          if (typeof editorTop !== 'number' || typeof previewTop !== 'number') continue;
  
          anchors.push({ line: sourceLine, editorTop, previewTop });
        }
  
        if (anchors.length < 2) {
          this._editorElementList = null;
          this._previewElementList = null;
          return;
        }
  
        anchors.sort((a, b) => a.line - b.line);
  
        // 过滤非单调锚点（只检查 editorTop）
        const clean = [anchors[0]];
        for (let i = 1; i < anchors.length; i++) {
          if (anchors[i].editorTop > clean[clean.length - 1].editorTop) {
            clean.push(anchors[i]);
          }
        }
  
        if (clean.length < 2) {
          this._editorElementList = null;
          this._previewElementList = null;
          return;
        }
  
        // 逐行构建密集数组
        const totalLines = this.cm.lineCount();
        const editorList = new Array(totalLines);
        const rawPreviewList = new Array(totalLines);
        let anchorIdx = 0;
  
        for (let line = 0; line < totalLines; line++) {
          editorList[line] = this.cm.heightAtLine(line, 'local');
          const sourceLine = line + 1;
  
          while (anchorIdx + 1 < clean.length && clean[anchorIdx + 1].line <= sourceLine) {
            anchorIdx++;
          }
  
          if (anchorIdx >= clean.length - 1) {
            const last = clean[clean.length - 1];
            rawPreviewList[line] = last.previewTop + Math.max(0, sourceLine - last.line) * 20;
          } else {
            const a1 = clean[anchorIdx];
            const a2 = clean[anchorIdx + 1];
            const lineGap = a2.line - a1.line;
            if (lineGap <= 0) {
              rawPreviewList[line] = a1.previewTop;
            } else {
              rawPreviewList[line] = a1.previewTop + (sourceLine - a1.line) / lineGap * (a2.previewTop - a1.previewTop);
            }
          }
        }
  
        this._editorElementList = editorList;
        this._previewElementList = rawPreviewList;
      },
      // 返回预览视口顶部对应的源码行号（1-based）；测量失败返回 null。
      // 用于切换模式时把「预览像素位置」转成宽度无关的行锚点。
      _lineAtPreviewTop(pvTop) {
        this._computedPosition();
        const list = this._previewElementList;
        if (!list || list.length < 2) return null;
        // 二分找 previewList 中 <= pvTop 的最大行索引
        let lo = 0, hi = list.length - 1, ans = 0;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (list[mid] <= pvTop) { ans = mid; lo = mid + 1; }
          else hi = mid - 1;
        }
        return ans + 1; // 1-based 源码行
      },
      // 根据 unified 渲染结果重建滚动同步数据（仅在内容变化时调用）
      // content 可选：调用方（render）已持有同一份内容时传入，省一次 O(N) 的 cm.getValue() 大字符串重建。
      rebuildScrollSync(content) {
        const text = (content == null) ? this.cm.getValue() : content;
        // 行数按换行符扫描计数（不 split 分配）：空内容 = 1 行，与 split('\n').length 等价。
        let totalLines = 1;
        for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) totalLines++;

        // 预览内容变化：滚动同步位置表作废，下次 _computedPosition 重算（缓存守卫）
        this._positionCacheDirty = true;
        // 预览重渲染会整体替换 DOM，v2 局部锚定的「锚点元素清单」必须随之重建
        this._anchorDirty = true;
        // 一次性取出预览中所有 [data-source-line] 元素：位置表与下方的 _linePositions 共用
        // 这一次查询 —— 原先同一次重建对整棵 DOM 查了两遍（2026-09-26）。
        const allElements = Array.from(this.preview.querySelectorAll('[data-source-line]'));
        // 构建平行位置数组（使用 data-source-line）
        this._computedPosition(allElements);
  
        // 生成 _linePositions（兼容 updatePreview 滚动恢复）；allElements 复用上方那一次查询
        const previewRect = this.preview.getBoundingClientRect();
        const st = this.preview.scrollTop;
        const sh = this.preview.scrollHeight || 1;
        const positions = [{ line: 0, fraction: 0 }];
        const seen = new Set();
  
        // 超大预览：元素过多时只采样测量，未测行靠行号线性插值，避免全量 getBoundingClientRect 重排卡顿
        const MAX_SYNC_SAMPLES = 2000;
        const step = Math.max(1, Math.ceil(allElements.length / MAX_SYNC_SAMPLES));
  
        for (let i = 0; i < allElements.length; i++) {
          if (step > 1 && i % step !== 0 && i !== allElements.length - 1) continue;
          const child = allElements[i];
          const sourceLine = parseInt(child.dataset.sourceLine, 10);
          if (isNaN(sourceLine)) continue;
          if (seen.has(sourceLine)) continue;
          seen.add(sourceLine);
  
          const rect = child.getBoundingClientRect();
          const elTop = rect.top - previewRect.top + st;
          const elBottom = elTop + child.offsetHeight;
  
          positions.push({ line: sourceLine, fraction: Math.min(Math.max(elTop / sh, 0), 1) });
          positions.push({ line: sourceLine + 1, fraction: Math.min(Math.max(elBottom / sh, 0), 1) });
        }
  
        positions.push({ line: totalLines - 1, fraction: 1 });
        positions.sort((a, b) => a.line - b.line);
  
        const deduped = [];
        let lastLine = -1;
        for (const p of positions) {
          if (p.line !== lastLine) {
            deduped.push(p);
            lastLine = p.line;
          }
        }
        if (deduped.length === 0 || deduped[0].line > 0) deduped.unshift({ line: 0, fraction: 0 });
        if (deduped[deduped.length - 1].line < totalLines - 1) deduped.push({ line: totalLines - 1, fraction: 1 });
        this._linePositions = deduped;
        // v2 配套：图片解码 / 图表落定 / 字体加载可能在本帧之后才改高度 → 观察并在变化后重同步
        this._watchPreviewSettle();
      },
      // demo 的 getHeightToTop：计算元素到容器顶部的距离（offsetTop 遍历 offsetParent）
      _getOffsetTop(el) {
        let top = el.offsetTop;
        let parent = el.offsetParent;
        while (parent && parent !== this.preview) {
          top += parent.offsetTop;
          parent = parent.offsetParent;
        }
        return top;
      },
      // demo 风格：节流函数（首次立即执行，后续在 delay 内只保存最后一次调用）
      _throttleScroll(fn, delay) {
        if (this._scrollThrottleTimer) {
          this._scrollThrottlePending = fn;
          return;
        }
        fn();
        this._scrollThrottleTimer = setTimeout(() => {
          this._scrollThrottleTimer = null;
          if (this._scrollThrottlePending) {
            const pending = this._scrollThrottlePending;
            this._scrollThrottlePending = null;
            this._throttleScroll(pending, delay);
          }
        }, delay);
      },
      // demo 风格：防抖函数（每次调用重置计时器）
      _debounceScroll(fn, delay) {
        clearTimeout(this._scrollDebounceTimer);
        this._scrollDebounceTimer = setTimeout(fn, delay);
      },
      // demo 风格：恢复滚动（重置双标志锁）
      _resumeScroll() {
        // 程序化定位（大纲跳转等）设下的时间戳窗口内**不复位**。本函数在每次预览渲染收尾的
        // rAF 里被调用（见 preview-controller），而跳转后预览往往还要再落定一次（高亮/图表/图片
        // 改变上方高度 → Chrome 滚动锚定调整 scrollTop）。若无视窗判断，跳转设下的锁会被中途
        // 完成的渲染提前解除，落定中的预览滚动便反向把编辑器拽到错误位置 —— 实测「点大纲后
        // 编辑区没停在标题行」正是此路径：+0ms 编辑器落点正确(标题可见)，+80ms 被拽走（2026-09-26）。
        // 窗口过期由跳转方负责，这里只负责不提前解锁。
        if (Date.now() < (this._scrollSuppressUntil || 0)) return;
        this._canScroll.editor = true;
        this._canScroll.preview = true;
      },
      // ── v2：局部按需锚定 ────────────────────────────────────────────────
      // 为什么不再用「全文档逐行位置表」：
      //   · 表一旦建立就与真实布局脱钩 —— 预览异步变高（图片解码 / 图表落定 / 字体加载）、
      //     字号缩放、CodeMirror 渐进测量，都会改变高度却**不改变行数**，而失效条件只能靠猜；
      //     实测出现过表落后 402px 的情形。
      //   · 表里预览侧用的是「文档基准」坐标，与 preview.scrollTop 的基准不一致，会引入常量偏移。
      // 现在只缓存**锚点元素清单**（纯结构，随预览重渲染失效），每次同步**现测 2 个锚点**当场插值：
      //   位置永远新鲜（免疫上述异步变高）、误差只在局部不累积、每次仅 2~3 次 getBoundingClientRect。
      _anchorIndex() {
        const cached = this._anchorEls;
        // isConnected 兜底：预览重渲染会整体替换 DOM，缓存里的元素可能已脱离文档
        if (!this._anchorDirty && cached && cached.length >= 2 && cached[0].el.isConnected) return cached;
        const seen = new Set();
        const els = [];
        for (const el of this.preview.querySelectorAll('[data-source-line]')) {
          if (el.closest('.footnotes')) continue;        // 脚注：源码在中部、渲染在底部，不参与映射
          const line = parseInt(el.dataset.sourceLine, 10);
          if (isNaN(line) || seen.has(line)) continue;   // 同一源码行只保留 DOM 中最外层的一个
          seen.add(line);
          els.push({ line, el });
        }
        els.sort((a, b) => a.line - b.line);
        this._anchorEls = els;
        this._anchorDirty = false;
        return els;
      },
      // 预览内容坐标系原点：contentTop(el) = el.rect.top - this._previewContentBase()
      _previewContentBase() {
        return this.preview.getBoundingClientRect().top - this.preview.scrollTop;
      },
      // 按源码行取相邻锚点（结构二分，0 次布局测量）
      _anchorPairByLine(line) {
        const els = this._anchorIndex();
        const n = els.length;
        if (n < 2) return null;
        let lo = 0, hi = n - 1, idx = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (els[mid].line <= line) { idx = mid; lo = mid + 1; } else hi = mid - 1;
        }
        if (idx < 0) idx = 0;
        if (idx > n - 2) idx = n - 2;
        return [els[idx], els[idx + 1]];
      },
      // 按预览内容位置取相邻锚点（现测二分：O(log N) 次测量，而非全量建表）
      _anchorPairByPreviewPos(y) {
        const els = this._anchorIndex();
        const n = els.length;
        if (n < 2) return null;
        const base = this._previewContentBase();
        let lo = 0, hi = n - 1, idx = 0;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (els[mid].el.getBoundingClientRect().top - base <= y) { idx = mid; lo = mid + 1; }
          else hi = mid - 1;
        }
        if (idx > n - 2) idx = n - 2;
        return [els[idx], els[idx + 1]];
      },
      // 编辑器 → 预览：按源码行局部插值。返回 true 表示已处理（false 则交回旧实现兜底）。
      _syncEditorToPreviewLocal(editorTop) {
        // 大文档滑动窗口模式：预览里只有一片切片，全文档锚定不适用 —— 明确交回窗口逻辑。
        // 与派发处的「窗口优先」形成双保险，防止日后重排顺序时又被短路（见该处注释）。
        if (this.previewWindow) return false;
        const cmInfo = this.cm.getScrollInfo();
        const { scrollHeight, clientHeight } = this.preview;
        const top = (editorTop != null) ? editorTop : cmInfo.top;

        if (top <= 0.5) { this.preview.scrollTop = 0; return true; }
        if (top + clientHeight >= cmInfo.height - 0.5) {
          this.preview.scrollTop = Math.max(0, scrollHeight - clientHeight);
          return true;
        }
        const line = this.cm.lineAtHeight(top, 'local') + 1;   // 1-based 源码行
        const pair = this._anchorPairByLine(line);
        if (!pair) return false;                               // 锚点不足：交回旧实现

        const base = this._previewContentBase();
        const aE = this.cm.heightAtLine(pair[0].line - 1, 'local');
        const bE = this.cm.heightAtLine(pair[1].line - 1, 'local');
        const aP = pair[0].el.getBoundingClientRect().top - base;
        const bP = pair[1].el.getBoundingClientRect().top - base;

        const eSpan = bE - aE;
        let t = eSpan > 0 ? (top - aE) / eSpan : 0;
        if (!(t >= 0)) t = 0; else if (t > 1) t = 1;           // 夹取：防 NaN / 越界外推
        let target = aP + t * (bP - aP);
        const vMax = Math.max(0, scrollHeight - clientHeight);

        // ── 末尾区段：顶部对齐越界时，平滑过渡到「底部对齐」──────────────────
        // 为什么需要：预览内容比编辑器矮（行高不同）⇒ 顶部对齐的映射会先于编辑器触底就
        //   越过预览可滚上限；此时「连续 + 单调 + 不越界 + 精确遵守锚点」四者不可兼得，
        //   硬夹（scrollTop = vMax）是该约束下的唯一解，代价是最后一屏内容永远对不上
        //   （实测偏差 ≈ −clientHeight，即"编辑器还有一屏、预览已贴底"）。
        //   这里改用「底部对齐」（编辑器视口底行 ↔ 预览视口底行）：底部必然对齐，顶部残差
        //   降到两栏"每屏行数差"这一固有量级（≈0.25 屏）。
        // ⚠ 判据必须是「顶部对齐已越界」（target > vMax），**不能**写成"编辑器距底不足一屏"：
        //   预览比编辑器高的文档里，后者会把本来完全可达的顶部对齐也一起改掉（CI 实测踩过）。
        // 权重 w 由越界量给出：刚越界时 w=0（与旧行为连续），越界满一屏时 w=1。
        if (target > vMax + 0.5) {
          const w = Math.min(1, (target - vMax) / Math.max(1, clientHeight));
          const bottomLine = this.cm.lineAtHeight(top + clientHeight, 'local') + 1;
          const pb = this._anchorPairByLine(bottomLine);
          let bTarget = target;
          if (pb) {
            const bEa = this.cm.heightAtLine(pb[0].line - 1, 'local');
            const bEb = this.cm.heightAtLine(pb[1].line - 1, 'local');
            const bPa = pb[0].el.getBoundingClientRect().top - base;
            const bPb = pb[1].el.getBoundingClientRect().top - base;
            const bSpan = bEb - bEa;
            let tb = bSpan > 0 ? ((top + clientHeight) - bEa) / bSpan : 0;
            if (!(tb >= 0)) tb = 0; else if (tb > 1) tb = 1;
            bTarget = bPa + tb * (bPb - bPa) - clientHeight;     // 底行对齐 ⇒ 视口顶即为此值
          }
          target = (1 - w) * target + w * bTarget;
        }

        this.preview.scrollTop = Math.max(0, Math.min(target, vMax));
        return true;
      },
      // 预览 → 编辑器：按内容位置局部插值。返回 true 表示已处理。
      _syncPreviewToEditorLocal(previewTop) {
        if (this.previewWindow) return false;   // 同上：窗口模式交回 _syncPreviewToEditorWindow
        const cmInfo = this.cm.getScrollInfo();
        const { scrollHeight, clientHeight } = this.preview;
        const pvTop = (previewTop != null) ? previewTop : this.preview.scrollTop;

        if (pvTop <= 0.5) { this.cm.scrollTo(0, 0); return true; }
        if (pvTop + clientHeight >= scrollHeight - 0.5) {
          this.cm.scrollTo(0, Math.max(0, cmInfo.height - cmInfo.clientHeight));
          return true;
        }
        const pair = this._anchorPairByPreviewPos(pvTop);
        if (!pair) return false;

        const base = this._previewContentBase();
        const aP = pair[0].el.getBoundingClientRect().top - base;
        const bP = pair[1].el.getBoundingClientRect().top - base;

        const pSpan = bP - aP;
        let t = pSpan > 0 ? (pvTop - aP) / pSpan : 0;
        if (!(t >= 0)) t = 0; else if (t > 1) t = 1;
        const aE = this.cm.heightAtLine(pair[0].line - 1, 'local');
        const bE = this.cm.heightAtLine(pair[1].line - 1, 'local');
        this.cm.scrollTo(0, aE + t * (bE - aE));
        return true;
      },
      // ── v2 配套：异步内容落定后重同步 ────────────────────────────────────
      // 为什么还需要它：局部锚定每次同步都现测锚点，所以「表过期」已不存在；但**两次同步之间**
      //   预览内容仍可能变高（<img> 解码完成、ECharts/Markmap 落定、字体加载），
      //   此时 preview.scrollTop 没变、显示的内容却变了 → 观感就是"慢慢错开"。
      // 做法（全 JS，不动 CSS、不改任何尺寸）：
      //   ① 监听预览内 <img> 的 load（load 事件不冒泡，必须用捕获）；
      //   ② 渲染后短暂观察 scrollHeight，一旦变化就防抖重同步一次。
      _watchPreviewSettle() {
        // 无真实布局（jsdom：scrollHeight 恒为 0）直接返回，避免在测试里留下定时器
        if (!this.preview || !this.preview.scrollHeight) return;

        if (!this._previewImgLoadBound) {
          this._previewImgLoadBound = true;
          this.preview.addEventListener('load', (e) => {
            if (e.target && e.target.tagName === 'IMG') this._requestPreviewResync();
          }, true);
        }

        clearTimeout(this._settleWatchTimer);
        let lastH = this.preview.scrollHeight;
        let ticks = 0;
        const tick = () => {
          const h = this.preview.scrollHeight;
          if (Math.abs(h - lastH) > 1) { lastH = h; this._requestPreviewResync(); }
          if (++ticks < 8) this._settleWatchTimer = setTimeout(tick, 250);   // 最多观察约 2s
        };
        this._settleWatchTimer = setTimeout(tick, 250);
      },
      // 防抖重同步：只在「不在程序化定位窗口内、同步锁未被占、预览可见」时执行，
      // 避免与用户滚动或大纲跳转抢方向盘。
      _requestPreviewResync() {
        if (this._resyncTimer) return;
        this._resyncTimer = setTimeout(() => {
          this._resyncTimer = null;
          if (Date.now() < (this._scrollSuppressUntil || 0)) return;
          if (!this._canScroll || !this._canScroll.editor) return;
          if (this.settings && this.settings.scrollSync === false) return;
          const container = this._editorContainerEl
            || (this._editorContainerEl = document.querySelector('.editor-container'));
          if (!container) return;
          if (container.classList.contains('preview-collapsed')) return;
          if (container.classList.contains('preview-mode')) return;
          if (this.cm.getScrollInfo().top <= 0.5) return;   // 顶部无需校正
          this._syncEditorToPreview();
        }, 160);
      },
      // 编辑器 → 预览同步（旧路径：全文档位置表 + 逐行插值）
      // v2 局部锚定可用时由 _syncEditorToPreviewLocal 短路接管，这里只作锚点不足时的兜底。
      _syncEditorToPreview(editorTop) {
        // ⚠ 顺序关键：大文档滑动窗口模式必须**优先**交给窗口逻辑，不能放在局部锚定之后。
        //   原因：局部锚定只能看见「当前已渲染的那一片窗口」，而它在窗口内总能找到锚点并
        //   返回 true —— 一旦排在前面，窗口逻辑就永远轮不到，焦点行不再更新，窗口卡死在
        //   首个切片。实测（8 万行文档）：编辑器滚到 76000 行，预览仍停在 1~1202 行。
        if (this.previewWindow) { this._syncEditorToPreviewWindow(); return; }
        if (this._syncEditorToPreviewLocal(editorTop)) return;
        this._computedPosition();
  
        const editorList = this._editorElementList;
        const previewList = this._previewElementList;
        if (!editorList || editorList.length < 2) return;
  
        const { scrollHeight, clientHeight } = this.preview;
        const cmInfo = this.cm.getScrollInfo();
        const top = (editorTop != null) ? editorTop : cmInfo.top;
  
        if (top <= 0.5) { this.preview.scrollTop = 0; return; }
        if (top + clientHeight >= cmInfo.height - 0.5) {
          this.preview.scrollTop = Math.max(0, scrollHeight - clientHeight);
          return;
        }
  
        let lo = 0, hi = editorList.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (editorList[mid] <= top) lo = mid + 1;
          else hi = mid;
        }
        let idx = lo - 1;
        if (idx < 0) { this.preview.scrollTop = 0; return; }
        if (idx >= editorList.length - 1) {
          this.preview.scrollTop = Math.max(0, scrollHeight - clientHeight);
          return;
        }
  
        const editorStart = editorList[idx];
        const editorEnd = editorList[idx + 1];
        const previewStart = previewList[idx];
        const previewEnd = previewList[idx + 1];
  
        if (editorEnd <= editorStart || previewEnd < 0 || previewStart < 0) {
          this.preview.scrollTop = previewStart;
          return;
        }
  
        const targetScrollTop = previewStart + (top - editorStart) / (editorEnd - editorStart) * (previewEnd - previewStart);
        this.preview.scrollTop = Math.max(0, Math.min(targetScrollTop, scrollHeight - clientHeight));
      },
      // 预览 → 编辑器同步（逐行密集插值）
      // previewTop 可选：指定预览滚动位置作为来源；省略则读当前预览 scrollTop。
      // 切换模式时用它传入「已保存的预览位置」，避免依赖此刻可能不可靠的实时值。
      _syncPreviewToEditor(previewTop) {
        // ⚠ 同上：窗口模式优先。局部锚定只看得到当前窗口，排在前面会让
        //   _syncPreviewToEditorWindow（窗口内 scrollTop → 源码行）永远不执行。
        if (this.previewWindow) { this._syncPreviewToEditorWindow(); return; }
        if (this._syncPreviewToEditorLocal(previewTop)) return;   // v2：局部按需锚定
        this._computedPosition();
  
        const previewList = this._previewElementList;
        const editorList = this._editorElementList;
        if (!previewList || previewList.length < 2) return;
  
        const { scrollHeight, clientHeight } = this.preview;
        const cmInfo = this.cm.getScrollInfo();
        const pvTop = (previewTop != null) ? previewTop : this.preview.scrollTop;
  
        if (pvTop <= 0.5) { this.cm.scrollTo(0, 0); return; }
        if (pvTop + clientHeight >= scrollHeight - 0.5) {
          this.cm.scrollTo(0, Math.max(0, cmInfo.height - cmInfo.clientHeight));
          return;
        }
  
        let lo = 0, hi = previewList.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (previewList[mid] <= pvTop) lo = mid + 1;
          else hi = mid;
        }
        let idx = lo - 1;
        if (idx < 0) { this.cm.scrollTo(0, 0); return; }
        if (idx >= previewList.length - 1) {
          this.cm.scrollTo(0, Math.max(0, cmInfo.height - cmInfo.clientHeight));
          return;
        }
  
        const previewStart = previewList[idx];
        const previewEnd = previewList[idx + 1];
        const editorStart = editorList[idx];
        const editorEnd = editorList[idx + 1];
  
        if (previewEnd <= previewStart || editorEnd < 0 || editorStart < 0) {
          this.cm.scrollTo(0, editorStart);
          return;
        }
  
        const targetEditorTop = editorStart + (pvTop - previewStart) / (previewEnd - previewStart) * (editorEnd - editorStart);
        this.cm.scrollTo(0, targetEditorTop);
      },
      // 滑动窗口模式：编辑器滚动 → 预览
      // 焦点（编辑区视口顶部对应行）落在窗口内则直接定位预览；否则以焦点重新渲染窗口
      _syncEditorToPreviewWindow() {
        const win = this.previewWindow;
        if (!win) return;
        const cmInfo = this.cm.getScrollInfo();
        const focus = this.cm.lineAtHeight(cmInfo.top, 'local'); // 0-based
        if (focus < win.start + 8 || focus > win.end - 8) {
          this._previewFocusLine = Math.max(0, Math.min(focus, this.cm.lineCount() - 1));
          this.debounceUpdatePreview();
          return;
        }
        this._focusPreviewToLine(focus);
      },
      // 滑动窗口模式：预览滚动 → 编辑器
      // 预览仅含窗口片段，按当前预览滚动位置反查窗口内对应源码行，回滚编辑器
      _syncPreviewToEditorWindow() {
        if (!this._windowLineTops || !this._windowLineTops.length) return;
        const st = this.preview.scrollTop;
        let bestLine = this.previewWindow.start;
        let bestTop = -Infinity;
        for (const [ln, top] of this._windowLineTops) {
          if (top <= st + 1 && top > bestTop) { bestLine = ln - 1; bestTop = top; }
        }
        const targetTop = this.cm.heightAtLine(bestLine, 'local');
        if (this.activeTab) this.activeTab.scrollPos = { top: targetTop, left: 0 };
        this.cm.scrollTo(0, targetTop);
      },
      // P2-1 Strangler（ADR-3）：以下 5 个虚拟窗口方法逻辑已迁至 PreviewController，
      // 当前保留薄委托，待全部调用点迁移后删除。
      _buildWindowLineTops() {
        return this.previewController._buildWindowLineTops();
      },
      _focusPreviewToLine(line) {
        return this.previewController._focusPreviewToLine(line);
      },
      _renderPreviewWindowBlock(finalHtml, win, totalLines) {
        return this.previewController._renderPreviewWindowBlock(finalHtml, win, totalLines);
      },
      _updateVirtualScrollMetrics() {
        return this.previewController._updateVirtualScrollMetrics();
      },
      _syncPreviewVirtualScroll() {
        return this.previewController._syncPreviewVirtualScroll();
      },
        // content 可选：调用方已知编辑器当前内容时传入，省去 render() 内部一次 O(N) 的
        // cm.getValue()（切标签 / 防抖键入路径上尤其关键，2026-09-26）。
        async updatePreview(suppressLoading = false, content) {
          // P2-1 Strangler（ADR-3）：编排逻辑已迁至 PreviewController.render()，此处保留薄委托。
          return this.previewController.render(suppressLoading, content);
        },
      // P1-1：逻辑已抽到 src/modules/image-processor.js（纯函数 + 依赖注入）。
      // 这里只做 DI 适配：把实例字段/方法包成注入项，错误仍上交调用方（6772 处的 try/catch）。
      // hasImg 由渲染方按本次 HTML 预判传入：明确为 false 时无图可内联，直接跳过整棵预览 DOM
      // 的 img 查询与替换（2026-09-26）。不传（旧调用方 / 测试）时行为与原来完全一致。
      async processImages(hasImg) {
        if (hasImg === false) return;
        return ImageProcessor.processImages(this.preview, {
          activeTab: this.activeTab,
          imageCache: this._imageBase64Cache,
          tauri: TauriApi,
          getCachedImageURL: (dataUri) => this.getCachedImageURL(dataUri),
          getRenderGeneration: () => this._renderGeneration,
        });
      },
      processFootnotes() {
        this.preview.querySelectorAll('.footnote-ref a').forEach(link => {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            const href = link.getAttribute('href');
            if (!href) return;
            const target = this.preview.querySelector(href);
            if (target) {
              target.scrollIntoView({ behavior: 'smooth', block: 'center' });
              target.classList.add('footnote-flash');
              setTimeout(() => target.classList.remove('footnote-flash'), 1500);
            }
          });
        });
  
        this.preview.querySelectorAll('.footnote-backref').forEach(link => {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            const href = link.getAttribute('href');
            if (!href) return;
            const target = this.preview.querySelector(href);
            if (target) {
              target.scrollIntoView({ behavior: 'smooth', block: 'center' });
              target.classList.add('footnote-flash');
              setTimeout(() => target.classList.remove('footnote-flash'), 1500);
            }
          });
        });
      },
  };

  const api = { mixin };
  window.TMPreviewSync = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
