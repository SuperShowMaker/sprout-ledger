---
description: 安卓一键打包 APK（scripts/android-build.mjs：清理残留→构建→校验产物）
---
运行 `npm run android:build`（封装了 tauri android build -- --apk）。
成功后在 `src-tauri/gen/android/app/build/outputs/apk/universal/release` 校验并报告 APK 产物路径；
失败则报告退出码与错误原文，不静默通过。
