---
description: 刷新相关文档后提交到本地并推送到远端（当前分支）
---
# /commit — 文档刷新 → 验证 → 确认 → 本地提交 → 推送

0. **可选消息**：`/commit <msg>` 提供的 `$ARGUMENTS` 直接作为提交信息；未提供则自动生成。

1. **分析改动**：`git status --short` + `git diff HEAD`（含暂存/未暂存/未跟踪）。工作区干净 → 报告"无改动"并停止。

2. **判断类型**：feat / fix / chore / refactor / test / docs，参照仓库最近提交风格（conventional + 中文）。

3. **刷新相关文档**（AI 判断并动手编辑；只改受影响处，不动的别碰）：
   - 新功能/新测试：翻 PRD 对应 ⏸→✅（行说明里的测试锚点文件真实存在才翻），补写受影响正文
   - 架构/组件/新命令/脚本：更新 README 架构树、CLAUDE.md 相应说明
   - 行为/约束变化：更新 CLAUDE.md 关键约束

4. **暂存**：`git add -A`

5. **同步派生事实**：`node scripts/doc-sync.mjs`（src/test/ 已暂存 → 重算测试数并写缓存；版本/进度条/⏸→✅ 一并同步，doc-sync 自行 git add）

6. **验证基线**（按改动范围分流）：
   - 本次提交含 `src/` 变更：
     a. 并行跑 `npx tsc --noEmit` 与 `npx vitest run`，从 vitest 输出解析 `Tests N passed` 得 N
     b. `node scripts/doc-sync.mjs --test-count N`（写测试数缓存，跳过内部 spawn vitest）
     c. `npm run audit`（check 模式读缓存，不再重复跑 vitest）
   - 仅文档/脚本/命令（无 `src/`）→ `node scripts/doc-sync.mjs` + `npm run audit`（audit 读缓存，约 1s）
   - 任一失败 → 停下报告错误原文，不提交。

7. **确认**：把 `git diff --stat` 摘要、文档改动点、生成的提交信息一并展示，等用户明确确认后再提交与推送。

8. **提交**：`git commit -m <msg>`（测试数变化时提交信息加 `测试 N→M` 后缀；pre-commit 钩子自动再同步，幂等零 diff）

9. **推送**：`git fetch` → 落后远端则 `git pull --rebase`（冲突则停下报告）→ `git push` 到当前分支远端。

10. **报告**：提交哈希 + 推送结果；push 失败报告退出码与错误原文，不静默。
