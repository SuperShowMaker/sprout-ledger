---
description: 提升版本号（默认 patch），并同步 README 版本标记
argument-hint: [major|minor|patch]
---
1. 读取 `src-tauri/tauri.conf.json` 的 version，按 `$ARGUMENTS`（默认 patch）做 semver 提升
2. 改完后运行 `node scripts/doc-sync.mjs`（同步模式）把 README 的 `@audit:version` 标记刷成新版本
3. 跑 `npm run audit` 验证版本标记一致；失败则报告错误原文，不静默通过
