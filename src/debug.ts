// 调试模式：开启后错误弹 alert + console，关闭后仅 toast
const KEY = 'sprout_debug';

export function isDebugMode(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setDebugMode(on: boolean): void {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch {}
}

// 统一错误报告：调试模式弹 alert，正式模式仅 toast
export function reportError(log: string, err: unknown): void {
  const msg = `${log}: ${String(err)}`;
  console.error(msg, err);
  if (isDebugMode()) {
    alert(msg);
  }
}
