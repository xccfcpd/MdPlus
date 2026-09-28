// Select —— 通用自绘下拉选择器，替代原生 <select>。
// 原生 select 的展开面板由操作系统/浏览器内核原生绘制，CSS 无法美化（Chromium/WebView2 尤甚）。
// 本组件自绘展开面板，使其与 FontPicker 一样支持主题化（圆角 + 主题色），并补全无障碍语义。
//
// 与 FontPicker 的区别：无搜索框、选项扁平（无分组/字体预览），更轻量，适合主题/配色/语言等普通枚举选择。
//
// 设计：
//   - 依赖注入：t（i18n 函数）、optionsProvider(t)（返回 [{value,label}]，随语言刷新）、
//     onChange(value)、ariaLabel（无障碍标签）、disabled。不隐式读取全局 this。
//   - 交互：点击/Enter/Space/方向键展开 → ArrowUp/Down 移动高亮、Home/End、Enter/Space 确认、
//     Esc/Tab 关闭、首字母 type-ahead、点击外部关闭。
//   - ARIA（WAI-ARIA combobox + listbox 模式）：input role=combobox、aria-haspopup=listbox、
//     aria-expanded、aria-controls、aria-activedescendant；dropdown role=listbox；
//     option role=option、aria-selected；input aria-label 关联行标签。
//   - 视口边界翻转：靠近窗口底部时向上展开（复用 FontPicker 已验证逻辑），任一方向尽量不裁切。
// 双导出：浏览器挂 window.Select；node 走 module.exports。

(function () {
  'use strict';

  let _uidSeq = 0;

  class Select {
    /**
     * @param {HTMLElement} rootEl 容器元素（调用方传带 id 的空 div，如 #set-theme-mode）
     * @param {Object} opts
     * @param {string} [opts.value] 初始值
     * @param {Function} opts.optionsProvider (t) => [{ value, label }]
     * @param {Function} [opts.t] i18n 取词函数 (key) => string
     * @param {string} [opts.ariaLabel] 无障碍标签（通常为该行标题，如「主题模式」）
     * @param {Function} [opts.onChange] (value) => void，选中时触发
     * @param {boolean} [opts.disabled]
     */
    constructor(rootEl, opts = {}) {
      if (!rootEl) throw new Error('Select: rootEl 不能为空');
      // 幂等保护：同一宿主被重复构造时，先销毁旧实例再重建。
      // 构造过程会向 document / window 挂监听（_onDocMousedown / _onResize），若宿主被二次构造
      // 而旧实例未 destroy()，监听会随构造次数累积（下拉越用越迟钝、resize 重复计算）。
      // 当前所有调用点（initSettings / initShortcutsDialog / initOutlineFilter …）都只执行一次，
      // 此处仅兜住「将来被重复调用」这条退化路径，不改变现有行为。
      if (rootEl.__tizumarkSelect && typeof rootEl.__tizumarkSelect.destroy === 'function') {
        rootEl.__tizumarkSelect.destroy();
      }
      rootEl.__tizumarkSelect = this;
      this.root = rootEl;
      this.root.classList.add('select-component');
      this.t = typeof opts.t === 'function' ? opts.t : ((k) => k);
      this.optionsProvider = typeof opts.optionsProvider === 'function' ? opts.optionsProvider : () => [];
      this.onChange = typeof opts.onChange === 'function' ? opts.onChange : (() => {});
      this._ariaLabelKey = opts.ariaLabelKey || null;
      this.ariaLabel = opts.ariaLabel || (this._ariaLabelKey ? this.t(this._ariaLabelKey) : '');
      this._value = typeof opts.value === 'string' ? opts.value : '';
      this._options = [];
      this._activeIndex = -1;
      this._typeahead = '';
      this._typeaheadTimer = null;
      this._dropdownId = 'select-' + (++_uidSeq) + '-listbox';
      this._build();
      this._bind();
      // 初始选项（依赖注入的 i18n 已在构造时绑定）
      this.setOptions(this.optionsProvider(this.t));
      this._renderInput();
      if (opts.disabled) this.setDisabled(true);
    }

    // -------- 内部结构 --------
    _build() {
      this.root.innerHTML = '';
      this.input = document.createElement('input');
      this.input.type = 'text';
      this.input.className = 'select-component-input';
      this.input.readOnly = true; // 始终只读：仅作展示 + 触发器，不承担输入
      this.input.autocomplete = 'off';
      this.input.spellcheck = false;
      this.input.tabIndex = 0;
      this.input.setAttribute('role', 'combobox');
      this.input.setAttribute('aria-haspopup', 'listbox');
      this.input.setAttribute('aria-expanded', 'false');
      this.input.setAttribute('aria-autocomplete', 'none');
      this.input.setAttribute('aria-controls', this._dropdownId);
      if (this.ariaLabel) this.input.setAttribute('aria-label', this.ariaLabel);
      this.dropdown = document.createElement('div');
      this.dropdown.className = 'select-component-dropdown hidden';
      this.dropdown.setAttribute('role', 'listbox');
      this.dropdown.id = this._dropdownId;
      if (this.ariaLabel) this.dropdown.setAttribute('aria-label', this.ariaLabel);
      this.root.appendChild(this.input);
      // 右侧小三角：与折叠面板标题 .collapse-caret 同款 Lucide chevron-down（24×24 / stroke 2 / currentColor），
      // 由 .picker-caret CSS 统一定位与尺寸（16px）。input 无法容纳子元素，故挂在容器上绝对定位。
      this.root.insertAdjacentHTML('beforeend',
        '<svg class="picker-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>');
      this.root.appendChild(this.dropdown);
    }

    _bind() {
      this._onInputClick = (e) => {
        e.stopPropagation();
        if (!this._disabled) this.toggle();
      };
      this._onKeydown = (e) => {
        if (this._disabled) return;
        if (this.dropdown.classList.contains('hidden')) {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.open();
          }
          return;
        }
        switch (e.key) {
          case 'ArrowDown': e.preventDefault(); this._moveActive(1); break;
          case 'ArrowUp': e.preventDefault(); this._moveActive(-1); break;
          case 'Home': e.preventDefault(); this._setActive(0); break;
          case 'End': e.preventDefault(); this._setActive(this._options.length - 1); break;
          case 'Enter':
          case ' ': e.preventDefault(); this._selectActive(); break;
          case 'Escape': e.preventDefault(); this.close(); break;
          case 'Tab': this.close(); break;
          default:
            // 首字母 type-ahead（与原生 select 行为一致，无障碍友好）
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
              this._typeaheadChar(e.key);
            }
        }
      };
      this._onDocMousedown = (e) => {
        if (!this.root.contains(e.target)) this.close();
      };
      this._onResize = () => {
        if (!this.dropdown.classList.contains('hidden')) this._positionDropdown();
      };
      this._onDropdownClick = (e) => {
        const item = e.target.closest('.select-component-item');
        if (item && !item.classList.contains('hidden')) this._select(item.getAttribute('data-value'));
      };
      // 普通下拉框为只读展示，禁止浏览器对输入框文字产生选区（避免蓝色选中背景）。
      // mousedown 阻止默认选区开始；focus/select 后立即把光标收拢到末尾；
      // open() 中再用 rAF 清一次，覆盖 WebView2 focus 后的异步默认全选。
      this._onInputMousedown = (e) => {
        e.preventDefault();
        if (!this._disabled) this.input.focus();
      };
      this._onInputFocus = () => {
        this._clearInputSelection();
        this._raf(() => this._clearInputSelection());
      };
      this._onInputSelect = (e) => {
        e.preventDefault();
        this._clearInputSelection();
      };
      this.input.addEventListener('click', this._onInputClick);
      this.input.addEventListener('mousedown', this._onInputMousedown);
      this.input.addEventListener('focus', this._onInputFocus);
      this.input.addEventListener('keydown', this._onKeydown);
      this.input.addEventListener('select', this._onInputSelect);
      this.dropdown.addEventListener('click', this._onDropdownClick);
      document.addEventListener('mousedown', this._onDocMousedown);
      window.addEventListener('resize', this._onResize);
    }

    // -------- 公开 API --------
    getValue() { return this._value; }

    setValue(v, silent) {
      const next = typeof v === 'string' ? v : '';
      if (next === this._value) return;
      this._value = next;
      this._renderInput();
      if (!this.dropdown.classList.contains('hidden')) this._renderList();
      if (!silent) this.onChange(next);
    }

    setOptions(options) {
      this._options = Array.isArray(options) ? options.slice() : [];
      if (!this.dropdown.classList.contains('hidden')) this._renderList();
      this._renderInput();
    }

    setDisabled(d) {
      this._disabled = !!d;
      this.input.readOnly = true;
      if (this._disabled) {
        this.input.setAttribute('aria-disabled', 'true');
        this.input.tabIndex = -1;
        this.root.classList.add('select-component-disabled');
        if (!this.dropdown.classList.contains('hidden')) this.close();
      } else {
        this.input.removeAttribute('aria-disabled');
        this.input.tabIndex = 0;
        this.root.classList.remove('select-component-disabled');
      }
    }

    open() {
      if (this._disabled) return;
      // 高亮当前已选值（未选中则停在首项）
      this._activeIndex = this._options.findIndex((o) => o.value === this._value);
      this.dropdown.classList.remove('hidden');
      this.input.setAttribute('aria-expanded', 'true');
      this._renderList();
      this._positionDropdown();
      this._highlight();
      this.input.focus();
      // 普通下拉框只读展示，focus 后确保光标在末尾且没有蓝色选区。
      this._clearInputSelection();
      this._raf(() => this._clearInputSelection());
    }

    _clearInputSelection() {
      const len = (this.input.value || '').length;
      try {
        this.input.setSelectionRange(len, len);
      } catch (_) {
        // readOnly input 在极少数旧内核可能抛错，忽略即可。
      }
    }

    // 兼容无 requestAnimationFrame 的环境（如测试桩）
    _raf(fn) {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fn);
      else setTimeout(fn, 0);
    }

    close() {
      this.dropdown.classList.add('hidden');
      this.input.setAttribute('aria-expanded', 'false');
      this.input.removeAttribute('aria-activedescendant');
      this._activeIndex = -1;
    }

    toggle() {
      if (this.dropdown.classList.contains('hidden')) this.open();
      else this.close();
    }

    // 语言切换：用新 t 重算选项文案并刷新显示（含无障碍标签）
    applyI18n(t) {
      if (typeof t === 'function') this.t = t;
      this.setOptions(this.optionsProvider(this.t));
      if (this._ariaLabelKey) {
        this.ariaLabel = this.t(this._ariaLabelKey);
        this.input.setAttribute('aria-label', this.ariaLabel);
        this.dropdown.setAttribute('aria-label', this.ariaLabel);
      }
    }

    destroy() {
      this.input.removeEventListener('click', this._onInputClick);
      this.input.removeEventListener('mousedown', this._onInputMousedown);
      this.input.removeEventListener('focus', this._onInputFocus);
      this.input.removeEventListener('keydown', this._onKeydown);
      this.input.removeEventListener('select', this._onInputSelect);
      this.dropdown.removeEventListener('click', this._onDropdownClick);
      document.removeEventListener('mousedown', this._onDocMousedown);
      window.removeEventListener('resize', this._onResize);
      if (this._typeaheadTimer) clearTimeout(this._typeaheadTimer);
      this.root.innerHTML = '';
      this.root.classList.remove('select-component');
      // 摘掉宿主上的反向引用，否则宿主被重复构造时守卫拿到的是已销毁实例的引用
      if (this.root.__tizumarkSelect === this) this.root.__tizumarkSelect = null;
    }

    // -------- 内部 --------
    _labelFor(value) {
      const hit = this._options.find((o) => o.value === value);
      return hit ? hit.label : (value || '');
    }

    _renderInput() {
      this.input.value = this._labelFor(this._value) || '';
    }

    _renderList() {
      if (!this.dropdown) return;
      this.dropdown.innerHTML = '';
      this._options.forEach((o, i) => {
        const el = document.createElement('div');
        const selected = o.value === this._value;
        el.className = 'select-component-item' + (selected ? ' select-component-item-selected' : '');
        el.setAttribute('role', 'option');
        el.id = this._dropdownId + '-opt-' + i;
        el.setAttribute('aria-selected', selected ? 'true' : 'false');
        el.setAttribute('data-value', String(o.value));
        el.textContent = o.label;
        this.dropdown.appendChild(el);
      });
    }

    _items() {
      return this.dropdown.querySelectorAll('.select-component-item');
    }

    _setActive(i) {
      if (!this._options.length) return;
      this._activeIndex = Math.max(0, Math.min(this._options.length - 1, i));
      this._highlight();
    }

    _moveActive(delta) {
      if (!this._options.length) return;
      let i = this._activeIndex + delta;
      if (i < 0) i = 0;
      if (i >= this._options.length) i = this._options.length - 1;
      this._activeIndex = i;
      this._highlight();
    }

    _highlight() {
      const items = this._items();
      items.forEach((el, i) => {
        const on = i === this._activeIndex;
        el.classList.toggle('active', on);
        if (on) this.input.setAttribute('aria-activedescendant', el.id);
      });
    }

    _selectActive() {
      const items = this._items();
      if (this._activeIndex >= 0 && items[this._activeIndex]) {
        this._select(items[this._activeIndex].getAttribute('data-value'));
      }
    }

    _select(value) {
      this._value = String(value);
      this.close();
      this._renderInput();
      this.onChange(this._value);
    }

    // 首字母跳转：在 600ms 内连续输入拼接前缀，定位首个匹配项（循环）
    _typeaheadChar(ch) {
      const q = (this._typeahead + ch).toLowerCase();
      this._typeahead = q;
      if (this._typeaheadTimer) clearTimeout(this._typeaheadTimer);
      this._typeaheadTimer = setTimeout(() => { this._typeahead = ''; }, 600);
      const opts = this._options;
      if (!opts.length) return;
      const start = this._activeIndex < 0 ? 0 : this._activeIndex + 1;
      for (let k = 0; k < opts.length; k++) {
        const idx = (start + k) % opts.length;
        const o = opts[idx];
        // 同时匹配 label 与 value：本地化标签为「跟随系统」时，用户仍可键入英文值「system」跳转
        if (o.label.toLowerCase().startsWith(q) || String(o.value).toLowerCase().startsWith(q)) {
          this._setActive(idx);
          return;
        }
      }
    }

    // 视口边界翻转：靠近窗口底部时向上展开，避免下拉被窗口底边裁剪；
    // 同时按可用空间动态限制高度，任一方向都尽量不被裁（溢出滚动兜底）。
    _positionDropdown() {
      const dd = this.dropdown;
      const margin = 8;
      const viewportH = window.innerHeight ||
        (document.documentElement && document.documentElement.clientHeight) || 0;
      const rect = this.input.getBoundingClientRect();
      const spaceBelow = viewportH - rect.bottom;
      const spaceAbove = rect.top;
      // 先以默认（向下）状态测量实际高度
      dd.classList.remove('select-component-dropdown-up');
      const naturalH = dd.offsetHeight || 0;
      const flipUp = spaceBelow < naturalH + margin && spaceAbove > spaceBelow;
      dd.classList.toggle('select-component-dropdown-up', flipUp);
      const avail = (flipUp ? spaceAbove : spaceBelow) - margin;
      dd.style.maxHeight = Math.max(120, Math.min(280, avail)) + 'px';
    }
  }

  if (typeof window !== 'undefined' && typeof module === 'undefined') {
    window.Select = Select;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Select;
  }
})();
