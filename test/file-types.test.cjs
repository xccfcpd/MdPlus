const { test } = require('node:test');
const assert = require('assert');
const { classifyFile, MARKDOWN_EXT, IMAGE_EXT, TEXT_EXT, extOf } = require('../src/modules/file-types.js');

test('markdown 类（含大小写）', () => {
  assert.strictEqual(classifyFile('a.md'), 'markdown');
  assert.strictEqual(classifyFile('note.markdown'), 'markdown');
  assert.strictEqual(classifyFile('x.MD'), 'markdown');
  assert.strictEqual(classifyFile('dir/sub/a.mdown'), 'markdown');
  assert.ok(MARKDOWN_EXT.has('md'));
});

test('image 类（含大小写）', () => {
  for (const e of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'tif', 'tiff', 'ico', 'avif', 'heic', 'heif']) {
    assert.strictEqual(classifyFile('pic.' + e), 'image', e);
    assert.strictEqual(classifyFile('PIC.' + e.toUpperCase()), 'image', e);
  }
  assert.ok(IMAGE_EXT.has('png'));
});

test('明文类（含代码/数据/标记源）', () => {
  for (const e of ['txt', 'text', 'csv', 'json', 'jsonl', 'xml', 'sql', 'html', 'py', 'js', 'ts', 'yaml', 'yml', 'toml', 'log', 'md?']) {
    if (e === 'md?') continue;
    assert.strictEqual(classifyFile('f.' + e), 'text', e);
  }
  assert.ok(TEXT_EXT.has('xml'));
  assert.ok(TEXT_EXT.has('sql'));
  assert.ok(TEXT_EXT.has('md') === false, 'md 不应在明文集合里');
});

test('unsupported（二进制/无扩展名/点文件）', () => {
  assert.strictEqual(classifyFile('a.exe'), 'unsupported');
  assert.strictEqual(classifyFile('a.zip'), 'unsupported');
  assert.strictEqual(classifyFile('a'), 'unsupported');
  assert.strictEqual(classifyFile('.gitignore'), 'unsupported');
  assert.strictEqual(classifyFile('Makefile'), 'unsupported');
  assert.strictEqual(classifyFile('noext'), 'unsupported');
});

test('extOf 边界', () => {
  assert.strictEqual(extOf('a.b.c.md'), 'md');
  assert.strictEqual(extOf('.md'), '');
  assert.strictEqual(extOf('noext'), '');
  assert.strictEqual(extOf('dir/sub/file.txt'), 'txt');
});
