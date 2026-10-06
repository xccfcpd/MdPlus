// 退出时托盘图标残留（僵尸图标掠过才消失）修复的静态断言。
//
// 根因：app.exit 的 cleanup_before_exit 只清 manager/resources 里的克隆，清不到
// app.manage(TrayState) 持有的 TrayIcon 引用，进程退出跳过 Drop → 图标残留
// （Windows 上表现为僵尸图标，鼠标掠过才消失），反复开关退出会累积多个。
//
// 修复方式：新增统一退出入口 exit_app（先清 TrayState 引用触发 Drop 真正移除图标，再退出），
// quit_app / 托盘菜单退出 / CloseRequested 非托盘分支三处路径统一接入。
// 本文件静态断言上述契约不被破坏（防止有人绕过 exit_app 直接 app.exit）。

const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const RS = fs.readFileSync(path.join(__dirname, '..', 'src-tauri', 'src', 'lib.rs'), 'utf8');

// 取出某个 fn 的源码块（到下一个同级 `fn` / `#[` 为止），用于局部断言。
function extractFn(rs, name) {
  const start = rs.indexOf('fn ' + name + '(');
  if (start < 0) return null;
  // 从函数头后开始，找到下一个顶层 `fn ` 或 `#[` 作为结束（粗略但足够静态断言用）
  let i = rs.indexOf('{', start);
  if (i < 0) return null;
  let depth = 0;
  const end = rs.length;
  let close = -1;
  for (; i < end; i++) {
    const ch = rs[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { close = i + 1; break; } }
  }
  if (close < 0) return null;
  // 截到下一个 fn / #[ 之前，避免把后续函数算进来
  let block = rs.slice(start, close);
  const nextFn = block.search(/\nfn\s/);
  const nextAttr = block.search(/\n#\[/);
  const cut = Math.min(
    nextFn >= 0 ? nextFn : Infinity,
    nextAttr >= 0 ? nextAttr : Infinity,
  );
  if (cut !== Infinity) block = block.slice(0, cut);
  return block;
}

test('exit_app 必须先清 TrayState 引用再 app.exit（触发 Drop 移除托盘图标）', () => {
  const body = extractFn(RS, 'exit_app');
  assert.ok(body, '必须存在 exit_app 统一退出入口');
  const clearIdx = body.indexOf('TrayState');
  const exitIdx = body.indexOf('app.exit(0)');
  assert.ok(clearIdx >= 0, 'exit_app 必须先引用 TrayState 以清空其持有引用');
  assert.ok(body.includes('*tray_guard = None'), 'exit_app 必须把 TrayState 置 None 以触发 Drop 移除图标');
  assert.ok(exitIdx >= 0, 'exit_app 必须调用 app.exit(0)');
  assert.ok(clearIdx < exitIdx, '清 TrayState 必须发生在 app.exit 之前，否则跳过 Drop 仍残留');
});

test('所有退出路径必须走 exit_app，禁止直接 app.exit 绕过（否则图标残留）', () => {
  // 全文件只允许出现一处 app.exit，即位于 exit_app 内部。
  const directExits = [...RS.matchAll(/app\.exit\s*\(/g)].length;
  assert.equal(directExits, 1, '除 exit_app 内部外，不得有任何路径直接调用 app.exit');

  const quitCmd = extractFn(RS, 'quit_app');
  assert.ok(quitCmd && quitCmd.includes('exit_app('), 'quit_app 必须调用 exit_app');

  // 托盘菜单 "quit" 分支（build_tray 内 on_menu_event 的 match 臂）
  const menuQuit = /"quit"\s*=>\s*\{\s*exit_app\(/.test(RS);
  assert.ok(menuQuit, '托盘菜单退出分支必须调用 exit_app');

  // CloseRequested 无托盘分支
  const closeReq = /if !show_tray\s*\{\s*exit_app\(/.test(RS);
  assert.ok(closeReq, 'CloseRequested 无托盘分支必须调用 exit_app');
});
