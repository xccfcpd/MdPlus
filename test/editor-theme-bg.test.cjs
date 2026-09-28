// 编辑器（CodeMirror）背景随主题切换的静态契约测试。
// 问题：明亮主题下 CodeMirror default 主题自带白底 #fff，导致编辑区与预览区（用 --bg-primary）颜色不一致。
// 要求：明亮主题下 #editor-wrapper .CodeMirror 用 --bg-primary 覆盖白底，与预览区背景一致；
//       gutters 同步跟随；暗色主题保持原有 --bg-primary 覆盖。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles.css'), 'utf8');

test('明亮主题：编辑器背景覆盖 CodeMirror default 白底，使用 --bg-primary', () => {
  assert.ok(
    /\[data-theme="light"\] #editor-wrapper \.CodeMirror \{[^}]*background-color: var\(--bg-primary\)/.test(css),
    '亮色主题下 #editor-wrapper .CodeMirror 应设 background-color: var(--bg-primary)',
  );
});

test('明亮主题：编辑器 gutters 同步跟随 --bg-primary', () => {
  assert.ok(
    /\[data-theme="light"\] #editor-wrapper \.CodeMirror \.CodeMirror-gutters \{[^}]*background-color: var\(--bg-primary\)/.test(css),
    '亮色主题下 gutters 应同步 background-color: var(--bg-primary)',
  );
});

test('暗色主题：编辑器仍用 --bg-primary 覆盖（保持现状）', () => {
  assert.ok(
    /\[data-theme="dark"\] \.cm-s-material-darker\.CodeMirror \{[^}]*background-color: var\(--bg-primary\)/.test(css),
    '暗色主题下 .cm-s-material-darker.CodeMirror 应设 background-color: var(--bg-primary)',
  );
  assert.ok(
    /\[data-theme="dark"\] \.cm-s-material-darker \.CodeMirror-gutters \{[^}]*background: var\(--bg-primary\)/.test(css),
    '暗色主题下 gutters 应保持 background: var(--bg-primary)',
  );
});
