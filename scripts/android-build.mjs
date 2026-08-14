// 一键出包：清理残留 WS server-addr → tauri android build → 校验产物
// 背景：tauri CLI 的 android-studio-script 通过 %TEMP%/{identifier}-server-addr 找主进程 WS server；
// 上次构建异常中断会残留该文件（端口已死），下次构建 ConnectionRefused 10061 → gradle 报 npm.bat 假错。
// 本脚本每次构建前按需清理，正常状态零开销。
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const identifier = loadIdentifier();

function loadIdentifier() {
  try {
    const conf = JSON.parse(readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf-8'));
    return conf.identifier || 'com.qinghe.ledger';
  } catch {
    return 'com.qinghe.ledger';
  }
}

function cleanStaleServerAddr() {
  const target = path.join(os.tmpdir(), `${identifier}-server-addr`);
  if (existsSync(target)) {
    try {
      rmSync(target, { force: true });
      console.log(`[android:build] 已清理残留 WS server-addr: ${target}`);
    } catch (e) {
      console.warn(`[android:build] 清理 server-addr 失败（继续构建）: ${e.message}`);
    }
  } else {
    console.log('[android:build] 无残留 server-addr，跳过清理');
  }
}

function verifyApk() {
  const outDir = path.join(
    root, 'src-tauri', 'gen', 'android', 'app', 'build', 'outputs', 'apk', 'universal', 'release'
  );
  if (!existsSync(outDir)) return;
  const apks = readdirSync(outDir).filter((f) => f.endsWith('.apk') && !f.includes('unsigned'));
  if (apks.length > 0) {
    console.log(`[android:build] 产物: ${apks.join(', ')}`);
  } else {
    console.warn('[android:build] 未找到 APK 产物，请检查输出目录');
  }
}

cleanStaleServerAddr();

// --clean-only：仅清理残留不构建（排查/验证用）
if (process.argv.includes('--clean-only')) {
  console.log('[android:build] --clean-only 模式，跳过构建');
  process.exit(0);
}

console.log('[android:build] 开始构建 APK（tauri android build -- --apk）...');
const r = spawnSync('npm', ['run', 'tauri', 'android', 'build', '--', '--apk'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (r.status !== 0) {
  console.error(`[android:build] 构建失败 (exit ${r.status})`);
  process.exit(r.status ?? 1);
}

verifyApk();
console.log('[android:build] 完成');
