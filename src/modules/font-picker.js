// FontPicker —— 可搜索字体选择器（系统字体全量 + 自定义字体分组）。
// 替代原生 <select>：原生 select 不支持搜索，系统字体几百个时无法使用。
//
// 设计：
//   - 依赖通过 opts 注入：t（i18n 函数）、groups（[{label, items:[{value,label}]}]）、
//     onChange(value)、placeholder（空值提示文案）。不隐式读取全局 this。
//   - 交互：点击展开 → 可输入过滤（子串、忽略大小写，命中 label 与 value）→
//     ArrowDown/Up 移动高亮、Enter 确认、Esc 关闭、点击外部关闭。
//   - 值语义：空字符串 = 跟随默认字体（placeholder 提示）；系统字体 value=族名原文；
//     自定义字体 value=自定义字体 id。setValue 不校验值是否在列表中
//     （系统族名即使列表未加载完也合法，渲染层会自动回退）。
// 双导出：浏览器挂 window.FontPicker；node 走 module.exports（与 PreviewPost 同款）。

(function () {
  'use strict';

  class FontPicker {
    /**
     * @param {HTMLElement} rootEl 容器元素（调用方传带 id 的空 div，如 #set-editor-font）
     * @param {Object} opts
     * @param {string} [opts.value] 初始值（空=默认）
     * @param {Array} [opts.groups] [{ label, items: [{ value, label }] }]
     * @param {Function} [opts.t] i18n 取词函数 (key) => string
     * @param {string} [opts.placeholder] 空值提示文案（如「默认」）
     * @param {Function} [opts.onChange] (value) => void，选中时触发
     */
    constructor(rootEl, opts = {}) {
      if (!rootEl) throw new Error('FontPicker: rootEl 不能为空');
      // 幂等保护：同一宿主被重复构造时，先销毁旧实例再重建（同 Select 的理由：
      // 构造会向 document / window 挂监听，旧实例未 destroy() 会随构造次数累积）。
      if (rootEl.__tizumarkFontPicker && typeof rootEl.__tizumarkFontPicker.destroy === 'function') {
        rootEl.__tizumarkFontPicker.destroy();
      }
      rootEl.__tizumarkFontPicker = this;
      this.root = rootEl;
      this.root.classList.add('font-picker');
      this.t = typeof opts.t === 'function' ? opts.t : ((k) => k);
      this.placeholder = opts.placeholder || '';
      this.onChange = typeof opts.onChange === 'function' ? opts.onChange : (() => {});
      this.groups = Array.isArray(opts.groups) ? opts.groups : [];
      this._value = typeof opts.value === 'string' ? opts.value : '';
      this._filter = '';
      this._activeIndex = -1;
      this._build();
      this._bind();
      this._renderInput();
    }

    // -------- 内部结构 --------
    _build() {
      this.root.innerHTML = '';
      this.input = document.createElement('input');
      this.input.className = 'font-picker-input';
      this.input.type = 'text';
      this.input.autocomplete = 'off';
      this.input.spellcheck = false;
      this.input.readOnly = true; // 未展开时只读；展开后可输入过滤
      this.dropdown = document.createElement('div');
      this.dropdown.className = 'font-picker-dropdown hidden';
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
        this.toggle();
      };
      this._onInput = () => {
        this._filter = this.input.value;
        this._renderList();
      };
      this._onKeydown = (e) => {
        if (this.dropdown.classList.contains('hidden')) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          this._moveActive(e.key === 'ArrowDown' ? 1 : -1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const items = this._visibleItems();
          if (this._activeIndex >= 0 && items[this._activeIndex]) {
            this._select(items[this._activeIndex].value);
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.close();
        }
      };
      this._onDocMousedown = (e) => {
        if (!this.root.contains(e.target)) this.close();
      };
      this._onResize = () => {
        if (!this.dropdown.classList.contains('hidden')) this._positionDropdown();
      };
      this._onDropdownClick = (e) => {
        const item = e.target.closest('.font-picker-item');
        if (item && !item.classList.contains('hidden')) this._select(item.getAttribute('data-value'));
      };
      this.input.addEventListener('click', this._onInputClick);
      this.input.addEventListener('input', this._onInput);
      this.input.addEventListener('keydown', this._onKeydown);
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
      if (!silent) this.onChange(next);
    }

    setGroups(groups) {
      this.groups = Array.isArray(groups) ? groups : [];
      this._renderList();
      this._renderInput();
    }

    open() {
      this._filter = '';
      this._activeIndex = -1;
      this.input.readOnly = false;
      // 打开时显示当前选中值（不再清空），并保持字体预览；全选方便用户直接输入替换
      this._renderInput();
      this.dropdown.classList.remove('hidden');
      this._renderList();
      this._positionDropdown();
      this.input.focus();
      // 字体下拉框支持输入检索，展开后全选当前值，方便用户直接键入替换。
      this.input.select();
    }

    close() {
      this.dropdown.classList.add('hidden');
      this.input.readOnly = true;
      this._renderInput();
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
      dd.classList.remove('font-picker-dropdown-up');
      const naturalH = dd.offsetHeight || 0;
      const flipUp = spaceBelow < naturalH + margin && spaceAbove > spaceBelow;
      dd.classList.toggle('font-picker-dropdown-up', flipUp);
      const avail = (flipUp ? spaceAbove : spaceBelow) - margin;
      dd.style.maxHeight = Math.max(120, Math.min(280, avail)) + 'px';
    }

    toggle() {
      if (this.dropdown.classList.contains('hidden')) this.open();
      else this.close();
    }

    applyI18n(t) {
      if (typeof t === 'function') this.t = t;
      // 占位符与「默认」项文案同源（defaultFont 键），语言切换时重算
      this.placeholder = this.t('defaultFont') || this.placeholder;
      this._renderList();
      this._renderInput();
    }

    destroy() {
      this.input.removeEventListener('click', this._onInputClick);
      this.input.removeEventListener('input', this._onInput);
      this.input.removeEventListener('keydown', this._onKeydown);
      this.dropdown.removeEventListener('click', this._onDropdownClick);
      document.removeEventListener('mousedown', this._onDocMousedown);
      window.removeEventListener('resize', this._onResize);
      this.root.innerHTML = '';
      this.root.classList.remove('font-picker');
      // 摘掉宿主上的反向引用，否则宿主被重复构造时守卫拿到的是已销毁实例的引用
      if (this.root.__tizumarkFontPicker === this) this.root.__tizumarkFontPicker = null;
    }

    // -------- 内部 --------
    _labelFor(value) {
      if (!value) return '';
      for (const g of this.groups) {
        const hit = (g.items || []).find((it) => it.value === value);
        if (hit) return hit.label;
      }
      return value; // 未在列表中（如列表未加载完的系统族名）：直接显示原文
    }

    _renderInput() {
      const label = this._labelFor(this._value);
      this.input.value = label || this.placeholder || '';
      // 输入框文字本身以所选字体呈现（让用户在收起状态下也能预览字体效果）
      let ff = '';
      if (this._value) {
        for (const g of this.groups) {
          const hit = (g.items || []).find(it => it.value === this._value);
          if (hit && hit.fontFamily) { ff = hit.fontFamily; break; }
        }
      }
      this.input.style.fontFamily = ff;
    }

    _allItems() {
      const items = [];
      // 「默认」空值项：过滤输入为空时才显示
      items.push({ value: '', label: this.t('defaultFont') || this.placeholder, isDefault: true });
      for (const g of this.groups) {
        for (const it of (g.items || [])) {
          items.push({ value: it.value, label: it.label, group: g.label, fontFamily: it.fontFamily });
        }
      }
      return items;
    }

    _visibleItems() {
      const q = this._filter.trim().toLowerCase();
      const items = this._allItems();
      return items.filter((it) => {
        if (it.isDefault) return q === '';
        if (!q) return true;
        const hay = (it.label + ' ' + it.value).toLowerCase();
        return hay.includes(q);
      });
    }

    _renderList() {
      if (!this.dropdown) return;
      this.dropdown.innerHTML = '';
      const visible = this._visibleItems();
      // 默认项
      const def = visible.find((it) => it.isDefault);
      if (def) {
        const el = this._makeItem(def.value, def.label, true, undefined, def.value === this._value);
        this.dropdown.appendChild(el);
      }
      // 分组
      for (const g of this.groups) {
        const gItems = visible.filter((it) => !it.isDefault && it.group === g.label);
        if (!gItems.length) continue;
        const label = document.createElement('div');
        label.className = 'font-picker-group-label';
        label.textContent = g.label;
        this.dropdown.appendChild(label);
        for (const it of gItems) {
          this.dropdown.appendChild(this._makeItem(it.value, it.label, false, it.fontFamily, it.value === this._value));
        }
      }
      // 空态
      if (!visible.length) {
        const empty = document.createElement('div');
        empty.className = 'font-picker-empty';
        empty.textContent = this.t('noMatchingFonts') || 'No matching fonts';
        this.dropdown.appendChild(empty);
      }
      this._activeIndex = -1;
      this._highlight();
    }

    _makeItem(value, label, isDefault, fontFamily, isSelected) {
      const el = document.createElement('div');
      el.className = 'font-picker-item' + (isDefault ? ' font-picker-item-default' : '') + (isSelected ? ' font-picker-item-selected' : '');
      el.setAttribute('data-value', value === null || value === undefined ? '' : String(value));
      el.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      el.textContent = label;
      // 以该字体本身渲染候选项文字，直观预览字体效果
      if (fontFamily) el.style.fontFamily = fontFamily;
      return el;
    }

    _moveActive(delta) {
      const items = this.dropdown.querySelectorAll('.font-picker-item');
      if (!items.length) return;
      this._activeIndex = (this._activeIndex + delta + items.length) % items.length;
      this._highlight();
    }

    _highlight() {
      const items = this.dropdown.querySelectorAll('.font-picker-item');
      items.forEach((el, i) => {
        el.classList.toggle('active', i === this._activeIndex);
      });
      if (this._activeIndex >= 0 && items[this._activeIndex]) {
        if (typeof items[this._activeIndex].scrollIntoView === 'function') {
          items[this._activeIndex].scrollIntoView({ block: 'nearest' });
        }
      }
    }

    _select(value) {
      this._value = value === null || value === undefined ? '' : String(value);
      this.close();
      this.onChange(this._value);
    }
  }

  if (typeof window !== 'undefined' && typeof module === 'undefined') {
    window.FontPicker = FontPicker;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FontPicker;
  }
})();
