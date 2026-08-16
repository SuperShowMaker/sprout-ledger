#!/usr/bin/env node
// PostToolUse 钩子：git commit 提交成功后，若新增 src/ 文件却未带 PRD/README → 输出提醒（回喂会话，AI 可主动接活）
// 输入：hook JSON（stdin）；输出：stdout 文本（回喂 Claude/用户）。任何异常静默退出，不打断流程。
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

if (input.tool_name !== 'Bash') process.exit(0);
const cmd = input.tool_input?.command ?? '';
if (!/git\s+commit/.test(cmd)) process.exit(0);
if (/--amend/.test(cmd)) process.exit(0); // --amend 时 HEAD 已是旧提交，diff-tree 会误报
if ((input.tool_response?.exit_code ?? -1) !== 0) process.exit(0);

function git(...args) {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return ''; }
}

try {
  const files = git('diff-tree', '--no-commit-id', '--name-status', '-r', 'HEAD')
    .split('\n').map((l) => l.trim()).filter(Boolean);
  const addsSrc = files.filter((l) => /^A\s+src\//.test(l));
  if (!addsSrc.length) process.exit(0);
  const hasDoc = files.some((l) => /(?:^|\s)M\s+PRD\.md$/.test(l) || /(?:^|\s)M\s+README\.md$/.test(l));
  if (hasDoc) process.exit(0);
  console.log(`[hook] 本次提交新增 ${addsSrc.length} 个 src/ 文件但未带 PRD.md/README.md 改动，疑似漏刷新文档——需要我帮你刷新吗？（跑 /commit 或直接说）`);
} catch { process.exit(0); }
