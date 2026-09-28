// 快捷键设置框「保存」按钮行为一致性（2026-08-09）：
// 与设置框「保存」一致 = 按钮 loading（文字「正在保存」+ spinner）→ 完成后弹「保存成功」toast 并关闭；
// 遮罩层点击不再关闭弹框（只能 × 关闭）。
const test = require('node:test');
const assert = require('node:assert');
const { buildEnv, cleanup, delay, waitForEditor } = require('./helpers/app-env.cjs');

test('shortcuts: 点「保存」显示 loading + 完成后弹「保存成功」toast 并关闭', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  try {
    const ed = await waitForEditor(w);
    ed.showShortcutsDialog();
    const saveBtn = w.document.getElementById('shortcuts-save-btn');
    assert.strictEqual(saveBtn.textContent, ed.t('save'), '按钮文案应为「保存」');

    // mock 重活，避免真实 CM 依赖；default 分支只调 applyShortcutScheme
    let applied = 0;
    ed.applyShortcutScheme = () => { applied++; };
    const schemeSel = ed._schemeSelect;
    if (schemeSel) schemeSel.setValue('default', true);

    // spy toast
    const toasts = [];
    ed.showToast = (msg, type) => { toasts.push({ msg, type }); };

    saveBtn.dispatchEvent(new w.Event('click'));
    await delay(60); // _ensurePainted 回退 setTimeout(16ms) + 重活绘制
    assert.ok(saveBtn.classList.contains('is-loading'), '点击后立即进入 loading');
    assert.ok(saveBtn.querySelector('.btn-spinner'), 'loading 含 spinner');
    assert.strictEqual(saveBtn.textContent, ed.t('saving'), 'loading 文字为「正在保存」');

    await delay(400); // 等 _minDelay(300) + 收尾
    assert.strictEqual(applied, 1, 'default 分支调用了 applyShortcutScheme');
    assert.strictEqual(toasts.length, 1, '完成后弹一个 toast');
    assert.strictEqual(toasts[0].type, 'success');
    assert.ok(toasts[0].msg.includes('保存成功'), 'toast 文案含「保存成功」');
    assert.ok(w.document.getElementById('shortcuts-dialog').classList.contains('hidden'), '保存后关闭弹框');
    assert.ok(!saveBtn.classList.contains('is-loading'), 'loading 结束');
  } finally { cleanup(w); }
});

test('shortcuts: 点击遮罩层不关闭快捷键框（只能 × 关闭）', async () => {
  const { w } = await buildEnv({ captureInitErr: true });
  try {
    const ed = await waitForEditor(w);
    ed.showShortcutsDialog();
    const overlay = w.document.getElementById('shortcuts-dialog');
    overlay.dispatchEvent(new w.Event('click'));
    assert.ok(!overlay.classList.contains('hidden'), '点击遮罩不应关闭快捷键框');
  } finally { cleanup(w); }
});
