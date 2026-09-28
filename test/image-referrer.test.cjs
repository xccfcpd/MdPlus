// 外部/本地图片在预览渲染时注入 referrerpolicy="no-referrer"，
// 使 webview 加载图片时不带应用源 Referer，避免微信等 CDN 按 Referer 放/拦返回占位图。
const test = require('node:test');
const assert = require('node:assert');
const { renderMarkdown } = require('../src/unified-renderer.js');

function render(md) {
  return renderMarkdown(md, { softBreaks: false });
}

test('外部 https 图片注入 referrerpolicy="no-referrer"，且保留 src', () => {
  const html = render('![图](https://mmbiz.qpic.cn/sz_mmbiz_png/x/640?wx_fmt=png&tp=webp#imgIndex=0)');
  assert.ok(/<img[^>]*referrerpolicy="no-referrer"/.test(html), '应注入 no-referrer: ' + html);
  assert.ok(html.includes('src="https://mmbiz.qpic.cn/sz_mmbiz_png/x/640?wx_fmt=png&#x26;tp=webp#imgIndex=0"'), 'src 应保留: ' + html);
});

test('本地相对图片也带 referrerpolicy（无害，后续由 image-processor 处理）', () => {
  const html = render('![图](screenshots/a.png)');
  assert.ok(/<img[^>]*referrerpolicy="no-referrer"/.test(html), '本地图也应带: ' + html);
  assert.ok(html.includes('src="screenshots/a.png"'), 'src 应保留: ' + html);
});

test('多张图片每张都注入', () => {
  const html = render('![a](https://e.com/1.png)\n\n![b](https://e.com/2.png)');
  const count = (html.match(/referrerpolicy="no-referrer"/g) || []).length;
  assert.ok(count >= 2, '两张图都应注入，实际: ' + count + ' | ' + html);
});
