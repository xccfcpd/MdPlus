// 文件树过滤（2026-08-30）：showAllFiles 设置 + _filterTreeEntries 行为
//   - 默认（showAllFiles=false）：过滤掉 classifyFile === 'unsupported' 的文件，
//     文件夹始终保留（保证可继续下钻）
//   - 开启（showAllFiles=true）：原样返回，目录内全部文件显示
//   - 展开态（expandedFolders 集合）跨过滤切换不丢（renderFolderLevel 按集合递归）
const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, delay } = require('./helpers/app-env.cjs');

async function makeEditor() {
  const { w } = await buildEnv({ captureInitErr: true });
  await delay(300);
  return { w, ed: w.editor };
}

function mockDir(w, ed, entries) {
  w.TauriApi.listDir = async () => ({
    entries,
    truncated: false,
  });
}

test('tree-filter: _filterTreeEntries 默认只保留受支持格式的文件，文件夹始终保留', async () => {
  const { w, ed } = await makeEditor();
  try {
    const entries = [
      { name: 'README.md', path: '/r/README.md', is_dir: false },
      { name: 'notes.markdown', path: '/r/notes.markdown', is_dir: false },
      { name: 'cover.png', path: '/r/cover.png', is_dir: false },
      { name: 'data.csv', path: '/r/data.csv', is_dir: false },
      { name: 'app.exe', path: '/r/app.exe', is_dir: false },
      { name: 'archive.zip', path: '/r/archive.zip', is_dir: false },
      { name: 'docs', path: '/r/docs', is_dir: true },
    ];
    const filtered = ed._filterTreeEntries(entries, false);
    const names = filtered.map((e) => e.name);
    // 受支持格式保留
    assert.ok(names.includes('README.md'), 'md 保留');
    assert.ok(names.includes('notes.markdown'), 'markdown 保留');
    assert.ok(names.includes('cover.png'), 'png 保留');
    assert.ok(names.includes('data.csv'), 'csv 保留');
    // 不受支持格式过滤
    assert.ok(!names.includes('app.exe'), 'exe 过滤');
    assert.ok(!names.includes('archive.zip'), 'zip 过滤');
    // 文件夹始终保留
    assert.ok(names.includes('docs'), '文件夹保留');
  } finally { cleanup(w); }
});

test('tree-filter: _filterTreeEntries showAllFiles=true 时原样返回', async () => {
  const { w, ed } = await makeEditor();
  try {
    const entries = [
      { name: 'README.md', path: '/r/README.md', is_dir: false },
      { name: 'app.exe', path: '/r/app.exe', is_dir: false },
      { name: 'archive.zip', path: '/r/archive.zip', is_dir: false },
    ];
    const filtered = ed._filterTreeEntries(entries, true);
    assert.strictEqual(filtered.length, 3, '全部保留');
    assert.ok(filtered.find((e) => e.name === 'app.exe'), 'exe 保留');
  } finally { cleanup(w); }
});

test('tree-filter: defaultSettings 默认 showAllFiles=false', async () => {
  const { w, ed } = await makeEditor();
  try {
    const defaults = ed.defaultSettings();
    assert.strictEqual(defaults.showAllFiles, false, '默认只显示受支持格式');
  } finally { cleanup(w); }
});

test('tree-filter: renderFolderTree 默认只列受支持文件，切换 showAllFiles 后重渲染全部', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.workspaceFolder = '/r';
    ed.settings.showAllFiles = false;
    mockDir(w, ed, [
      { name: 'a.md', path: '/r/a.md', is_dir: false, size: 10, mtime: 0, created: 0 },
      { name: 'b.exe', path: '/r/b.exe', is_dir: false, size: 10, mtime: 0, created: 0 },
      { name: 'c.png', path: '/r/c.png', is_dir: false, size: 10, mtime: 0, created: 0 },
      { name: 'd.zip', path: '/r/d.zip', is_dir: false, size: 10, mtime: 0, created: 0 },
    ]);
    ed.expandedFolders = new Set();
    await ed.renderFolderTree();
    let labels = [...w.document.querySelectorAll('#folder-tree .tree-label')].map((el) => el.textContent);
    assert.deepStrictEqual(labels.sort(), ['a.md', 'c.png'], '默认只显示 md 和 png');

    // 切换后重渲染：受支持 + 不受支持全部出现
    ed.settings.showAllFiles = true;
    await ed.renderFolderTree();
    labels = [...w.document.querySelectorAll('#folder-tree .tree-label')].map((el) => el.textContent);
    assert.deepStrictEqual(labels.sort(), ['a.md', 'b.exe', 'c.png', 'd.zip'], '显示全部文件');
  } finally { cleanup(w); }
});

test('tree-filter: 切换开关后展开态（expandedFolders）不丢', async () => {
  const { w, ed } = await makeEditor();
  try {
    ed.workspaceFolder = '/r';
    ed.settings.showAllFiles = false;
    mockDir(w, ed, [
      { name: 'docs', path: '/r/docs', is_dir: true },
    ]);
    // docs 内部再 mock 一层
    const origListDir = w.TauriApi.listDir;
    w.TauriApi.listDir = async ({ path }) => {
      if (path === '/r') return { entries: [{ name: 'docs', path: '/r/docs', is_dir: true }], truncated: false };
      if (path === '/r/docs') return {
        entries: [
          { name: 'inner.md', path: '/r/docs/inner.md', is_dir: false, size: 10, mtime: 0, created: 0 },
          { name: 'inner.exe', path: '/r/docs/inner.exe', is_dir: false, size: 10, mtime: 0, created: 0 },
        ],
        truncated: false,
      };
      return { entries: [], truncated: false };
    };
    ed.expandedFolders = new Set();
    await ed.renderFolderTree();
    // 展开 docs
    ed.expandedFolders.add('/r/docs');
    await ed.renderFolderTree();
    let labels = [...w.document.querySelectorAll('#folder-tree .tree-label')].map((el) => el.textContent);
    assert.ok(labels.includes('inner.md'), '默认过滤下 inner.md 可见');
    assert.ok(!labels.includes('inner.exe'), '默认过滤下 inner.exe 隐藏');

    // 切换 showAllFiles 后重渲染
    ed.settings.showAllFiles = true;
    await ed.renderFolderTree();
    labels = [...w.document.querySelectorAll('#folder-tree .tree-label')].map((el) => el.textContent);
    assert.ok(labels.includes('inner.md'), '展开后 inner.md 仍可见');
    assert.ok(labels.includes('inner.exe'), '展开后 inner.exe 出现');
    // 展开态保留：docs 节点带 .expanded 类
    const docsNode = w.document.querySelector('.tree-folder[data-path="/r/docs"]');
    assert.ok(docsNode && docsNode.classList.contains('expanded'), 'docs 仍为展开态');
  } finally { cleanup(w); }
});
