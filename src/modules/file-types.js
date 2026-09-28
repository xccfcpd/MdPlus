/**
 * file-types.js —— 文件类型分类（需求：文件夹树/拖放/Ctrl+O 支持图片、Markdown、明文类）
 *
 * 分类结果：'markdown' | 'image' | 'text' | 'unsupported'
 *  - markdown：按 Markdown 渲染
 *  - image：应用内预览面板显示图片
 *  - text：明文（含代码/数据）按原始文本显示，不做 Markdown 渲染
 *  - unsupported：弹「格式不支持」提示，不打开
 *
 * 设计：白名单集中在此，前端（app.js / 树渲染 / 打开分支）与单测共用，避免 Rust/JS 两份名单漂移。
 * UMD：浏览器挂 window.FileTypes，node 走 module.exports（供 test 引用）。
 */
(function () {
  'use strict';

  // Markdown 类（按 Markdown 渲染）
  const MARKDOWN_EXT = new Set([
    'md', 'markdown', 'mdown', 'mkd', 'mkdn', 'mdwn', 'markdn',
  ]);

  // 图片类（应用内预览）
  const IMAGE_EXT = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'tif', 'tiff',
    'ico', 'avif', 'heic', 'heif', 'jfif', 'pnm', 'ppm', 'pgm', 'pbm', 'dib', 'tga',
  ]);

  // 明文类（原始文本显示，含代码/数据/标记语言源文件）
  const TEXT_EXT = new Set([
    // 纯文本 / 数据
    'txt', 'text', 'csv', 'tsv', 'log', 'json', 'jsonl', 'ndjson', 'json5',
    'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'config', 'properties', 'prop',
    'env', 'editorconfig', 'gitignore', 'gitattributes', 'dockerignore', 'npmrc', 'npmignore',
    'lock', 'csv',
    // Web / 标记语言源
    'html', 'htm', 'xhtml', 'xml', 'xsl', 'xslt', 'css', 'scss', 'sass', 'less',
    'vue', 'svelte', 'ejs', 'hbs', 'mustache', 'jinja', 'j2', 'tmpl', 'tpl',
    'haml', 'slim', 'pug', 'jade', 'rss', 'atom',
    // 代码
    'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'c', 'h', 'hpp', 'cc', 'cpp', 'cxx', 'hxx',
    'py', 'pyw', 'rb', 'php', 'go', 'java', 'kt', 'kts', 'scala', 'rs', 'swift',
    'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd', 'lua', 'pl', 'pm', 'sql',
    'graphql', 'gql', 'proto', 'dtd', 'wsdl', 'r', 'rkt', 'clj', 'cljs',
    'ex', 'exs', 'elm', 'erl', 'hrl', 'hs', 'ml', 'mli', 'fs', 'fsi', 'fsx',
    'd', 'pas', 'pp', 'lisp', 'scm', 'asm', 's', 'vb', 'vbs', 'nim', 'cr', 'coffee', 'ahk',
    // 文档 / 排版源
    'rst', 'adoc', 'asciidoc', 'tex', 'bib', 'context', 'org', 'wiki',
    'dokuwiki', 'creole', 'mediawiki', 'diff', 'patch', 'changes',
    'makefile', 'mk', 'cmake', 'dockerfile', 'gradle', 'pom', 'csproj', 'sln',
    'tf', 'tfvars', 'hcl', 'ipynb',
  ]);

  function extOf(name) {
    if (!name) return '';
    const base = name.split(/[/\\]/).pop();
    const i = base.lastIndexOf('.');
    if (i <= 0) return '';
    return base.slice(i + 1).toLowerCase();
  }

  function classifyFile(name) {
    const e = extOf(name);
    if (!e) return 'unsupported';
    if (MARKDOWN_EXT.has(e)) return 'markdown';
    if (IMAGE_EXT.has(e)) return 'image';
    if (TEXT_EXT.has(e)) return 'text';
    return 'unsupported';
  }

  const api = { MARKDOWN_EXT, IMAGE_EXT, TEXT_EXT, extOf, classifyFile };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.FileTypes = api;
})();
