---
description: 本地运行：桌面（npm run tauri dev）或安卓（npm run tauri android dev）
argument-hint: [desktop|android]
---
- `desktop` 或空参数：后台运行 `npm run tauri dev`（桌面端 430×800）
- `android`：后台运行 `npm run tauri android dev`（手机端）
- 前端改动自动热更新；仅 Rust / Cargo.toml / tauri.conf.json / capabilities 变更才需重启
- 用 Bash 的 run_in_background 启动，避免阻塞会话
