# 🌱 Sprout（青禾记账）

个人轻量记账工具，Windows 桌面 + Android 手机。本地 SQLite 存储，无需联网。

## 功能

- ➕ **记账** — 底部中央「＋」按钮唤起全屏向导：支出/收入切换 → 选分类 → 自定义数字键盘（支持加减法）输入金额
- 📅 **明细** — 日历视图（支出绿点/收入蓝点）+ 按日清单（-¥ 支出 / +¥ 收入）+ 编辑/删除
- 💰 **预算** — 总预算为主，分类预算从总预算分配（和 ≤ 总预算）；预算执行进度、月底预测
- 📊 **统计** — 周/月/年 + 本月概览卡（支出/收入/结余 + 预算执行）+ 饼图 + 趋势柱状图 + 折叠分类列表
- 👤 **我的** — 语言切换 / 深色模式 / 统计显示设置 / 导出导入 / 分类管理

## 技术栈

Tauri 2 + React 19 + TypeScript + Ant Design 6 + Recharts + SQLite

## 开发

```bash
npm install
npm run tauri dev            # Windows 桌面端
npm run tauri android dev    # Android 手机端
```

## 构建 Android 发布包

```bash
npm run tauri android build -- --apk   # 单文件通用 APK
```

## 测试

```bash
npm test
```

## 版本

v1.2.0
