// 回归测试：KaTeX 后处理阶段保护不成对 $ / $$，用 katex-ignore span 包裹，
// 避免跨段配对吞内容，且原样显示 $（不出现 \$ 反斜杠）。
const test = require('node:test');
const assert = require('node:assert');
const { protectUnpairedDollar } = require('../src/modules/preview-post.js');

test('不成对 $$ 在正文被包 ignore span（用户复现，无反斜杠）', async () => {
  const s = '正文里有金额 $$12/5h 和 $$0.00038/次 也会被吞。';
  const r = protectUnpairedDollar(s);
  assert.ok(r.includes('<span class="katex-ignore">$$</span>'), '不成对 $$ 应包 ignore span');
  assert.ok(!r.includes('\\$'), '不应出现反斜杠转义');
  assert.ok(r.includes('和') && r.includes('也会被吞'), '中间与后续文字保留');
});

test('成对 $...$ 保留不包裹（交给 KaTeX 渲染）', async () => {
  const s = '行内 $a+b$ 公式';
  const r = protectUnpairedDollar(s);
  assert.strictEqual(r, s);
});

test('成对 $...$ 内含 | / > / ｜ 保留不包裹', async () => {
  assert.strictEqual(protectUnpairedDollar('$P(A|B)$'), '$P(A|B)$', '条件概率保留');
  assert.strictEqual(protectUnpairedDollar('$x>0$'), '$x>0$', '比较符号保留');
  assert.strictEqual(protectUnpairedDollar('$x｜y$'), '$x｜y$', '全角竖线保留');
});

test('成对 $$...$$ 保留不包裹', async () => {
  const s = '$$c^2$$';
  const r = protectUnpairedDollar(s);
  assert.strictEqual(r, s);
});

test('带空格的 $$ 234322 $$ 保留为合法块级公式', async () => {
  const s = '$$ 234322 $$';
  const r = protectUnpairedDollar(s);
  assert.strictEqual(r, s);
});

test('表格单元格内的孤立 $ 被包 ignore span', async () => {
  const s = '配额 | $12/5h 窗口';
  const r = protectUnpairedDollar(s);
  assert.ok(r.includes('<span class="katex-ignore">$</span>12/5h 窗口'), '孤立 $ 应包 ignore span');
  assert.ok(r.includes('配额 | '), '表格分隔保留');
});

test('$ 后接空格不当公式，包 span', async () => {
  const s = '金额 $ 100 起';
  const r = protectUnpairedDollar(s);
  assert.ok(r.includes('<span class="katex-ignore">$</span> 100'), '$ 空格后 应包 span');
});

test('孤立 $ 在句中被包 span，后续保留', async () => {
  const s = '价格 $100 起，详见下文';
  const r = protectUnpairedDollar(s);
  assert.ok(r.includes('<span class="katex-ignore">$</span>100'), '孤立 $ 应包 span');
  assert.ok(r.includes('详见下文'), '后续内容应保留');
});

test('跨单元格的 $ 各自包 span，不配对', async () => {
  const s = '| $x | y$ |';
  const r = protectUnpairedDollar(s);
  // 两个 $ 都应被单独包裹，不应出现配对的 $x | y$ 数学
  const spans = (r.match(/katex-ignore/g) || []).length;
  assert.strictEqual(spans, 2, '两个孤立 $ 各包一个 ignore span');
});

// ===== 行内 $...$ 前后带空格（用户复现：规范条文公式）=====

test('带空格且含数学标记的 $...$ 保留不包裹（交给 KaTeX 渲染）', async () => {
  assert.strictEqual(protectUnpairedDollar('$ f_{a} $'), '$ f_{a} $', '下标公式保留');
  assert.strictEqual(protectUnpairedDollar('$ \\varphi_{k}(°) $'), '$ \\varphi_{k}(°) $', '反斜杠公式保留');
  assert.strictEqual(protectUnpairedDollar('$ M_{b} $'), '$ M_{b} $', 'Mb 公式保留');
});

test('带空格但内容不像数学的 $...$ 仍被包 ignore span', async () => {
  const r = protectUnpairedDollar('$ 100 $');
  assert.ok(r.includes('<span class="katex-ignore">$</span>'), '货币文本不应被当公式');
  assert.ok(!r.includes('$ 100 $'), '不应保留完整配对');
});

test('带空格的单字母变量 $...$ 保留不包裹（交给 KaTeX 渲染）', async () => {
  assert.strictEqual(protectUnpairedDollar('$ c $'), '$ c $', '单字母 c 保留');
  assert.strictEqual(protectUnpairedDollar('$ \u03BD $'), '$ \u03BD $', '单希腊字母 ν 保留');
});

test('带空格且含比较运算符的 $...$ 保留不包裹（交给 KaTeX 渲染）', async () => {
  assert.strictEqual(protectUnpairedDollar('$ (e > b/6) $'), '$ (e > b/6) $', '比较运算符公式保留');
  assert.strictEqual(protectUnpairedDollar('$ e = b/6 $'), '$ e = b/6 $', '等号公式保留');
});

test('带空格且含 ASCII 单引号（素数/导数标记）的 $...$ 保留不包裹', async () => {
  // 浏览器解码 HTML 实体 &#x27; 后，DOM 文本节点里看到的是 "$ R' $"
  assert.strictEqual(protectUnpairedDollar("$ R' $"), "$ R' $", "R' 公式保留");
  assert.strictEqual(protectUnpairedDollar("$ f' $"), "$ f' $", "f' 导数公式保留");
});

test('带空格但为短英文词的 $...$ 仍被包 ignore span', async () => {
  // "or" 这类短英文词不是数学变量，不应放行
  const r = protectUnpairedDollar('$ or $');
  assert.ok(r.includes('<span class="katex-ignore">$</span>'), '短英文词不应被当公式');
  assert.ok(!r.includes('$ or $'), '不应保留完整配对');
});
