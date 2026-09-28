// 反斜杠转义与数学定界符测试。
// 关键语义（与 VSCode / GitHub Flavored Markdown 一致）：
//   - \( ... \) 与 \[ ... \] 是 CommonMark 转义序列，输出字面 ( ... ) 与 [ ... ]，不作为数学。
//   - 数学公式统一用 $ ... $（行内）与 $$ ... $$（块级），或 ```math 围栏。
//   - 修复：文献引用 \[J/OL\] 此前被误当块级公式，现已还原为字面 [J/OL]。
const test = require('node:test');
const assert = require('node:assert');
const { renderMarkdown } = require('../src/unified-renderer.js');

function render(md) {
  return renderMarkdown(md, { softBreaks: false });
}

test('行内 \\(...\\) 还原为字面圆括号（不作数学）', () => {
  const html = render('这是公式 \\(S=\\pi r^2\\)');
  assert.ok(html.includes('(S=') && html.includes(')'), '应渲染为字面 (S=...): ' + html);
  assert.ok(!html.includes('\\('), '不应残留 \\(: ' + html);
  assert.ok(!html.includes('$'), '不应生成数学占位: ' + html);
  assert.ok(!/katex|math/.test(html), '不应包含数学渲染: ' + html);
});

test('块级 \\[...\\] 还原为字面方括号（文献引用场景）', () => {
  const html = render('\\[J/OL\\]');
  assert.ok(html.includes('[J/OL]'), '应渲染为字面 [J/OL]: ' + html);
  assert.ok(!html.includes('\\['), '不应残留 \\[: ' + html);
  assert.ok(!/katex|math-display|math-inline/.test(html), '不应生成数学块: ' + html);
});

test('完整文献引用行：\\( ... \\) 与 \\[ ... \\] 均作字面量', () => {
  const md = '王良, 管玉, 张晓东, 等. 数据集\\[J/OL\\]. 中国科学数据, 2026. DOI: 10.x/abc';
  const html = render(md);
  assert.ok(html.includes('[J/OL]'), '应出现字面 [J/OL]: ' + html);
  assert.ok(!/math/.test(html), '不应生成数学: ' + html);
});

test('围栏代码块内的 \\(...\\) 保持字面量', () => {
  const md = '```\n\\(x\\)\n```';
  const html = render(md);
  assert.ok(html.includes('\\(x\\)'), '代码块内应保持 \\(x\\): ' + html);
});

test('行内代码（`...`）内的 \\(...\\) 保持字面量', () => {
  const html = render('`\\(x\\)`');
  assert.ok(html.includes('\\(x\\)'), '行内代码内应保持 \\(x\\): ' + html);
});

test('不成对的 \\( 还原为字面 (', () => {
  const html = render('文字 \\( 没有闭合');
  assert.ok(!html.includes('\\('), '不成对 \\( 应被转义: ' + html);
  assert.ok(html.includes('('), '应渲染为字面 (: ' + html);
});

test('不成对的 \\[ 还原为字面 [', () => {
  const html = render('\\[ 没有闭合');
  assert.ok(!html.includes('\\['), '不成对 \\[ 应被转义: ' + html);
  assert.ok(html.includes('['), '应渲染为字面 [: ' + html);
});

test('回归：行内 $...$ 仍正常渲染', () => {
  const html = render('行内 $E=mc^2$ 公式');
  assert.ok(html.includes('$E=mc^2$'), '原有 $ 行内数学应保留: ' + html);
});

test('回归：块级 $$...$$ 仍正常渲染', () => {
  const html = render('$$\nS=\\pi r^2\n$$');
  assert.ok(html.includes('math-display'), '块级 $$ 应渲染为 math-display: ' + html);
});

test('混合：\\(...\\)/ \\[...\\] 字面 与 $...$ 数学共存', () => {
  const md = '行内 \\(a^2+b^2=c^2\\) 与 $E=mc^2$ 以及 \\(x\\)';
  const html = render(md);
  assert.ok(html.includes('(a^2+b^2=c^2)'), 'LaTeX 行内应还原为字面: ' + html);
  assert.ok(html.includes('$E=mc^2$'), '原有 $ 应保留: ' + html);
  assert.ok(html.includes('(x)'), '\\(x\\) 应还原为字面 (x): ' + html);
  assert.ok(!/math-display/.test(html), '不应生成块级数学: ' + html);
});
