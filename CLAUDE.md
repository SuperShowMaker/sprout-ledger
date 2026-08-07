# Sprout（青禾记账）

## 速览

```bash
npm run tauri dev              # 桌面端
npm run tauri android dev      # 手机端
npm test                       # 167 个测试用例
```

个人轻量收支记账，Windows + Android，本地 SQLite，无需联网。
完整功能清单与决策台账见 `PRD.md`，分类体系见 `分类.md`。

## 技术栈

| 层 | 技术 | 版本 |
|----|------|------|
| 桌面框架 | Tauri | 2.x |
| 界面 | React + TypeScript | 19 + 5.8 |
| UI 库 | Ant Design（CSS-in-JS） | 6.5 |
| 图表 | Recharts | 3.x |
| 数据库 | SQLite（tauri-plugin-sql） | 2.x |
| 样式 | 单文件 `App.css`，`[data-theme="dark"]` 控制深色模式 |
| 测试 | Vitest + Testing Library | 4.x |

TDD：红→绿→重构。纯逻辑 100% 覆盖，组件逻辑先抽纯函数再测，数据库操作不纳入。

## 架构

```
src/
├── App.tsx             # 入口：初始化 DB → 底部导航（4标签 + 中央记账FAB）
├── App.css             # 全局样式 + 深色模式变量
├── db.ts               # SQLite 操作（并发锁 initPromise）
├── calculator.ts       # 计算器纯逻辑：表达式求值（收口两位小数）+ 小数点校验
├── holdRepeat.ts       # 长按连删定时器（纯逻辑，可独立测试）
├── csv.ts              # CSV 导出/导入纯逻辑（7列收支格式 + 6列兼容 + 类型归一化）
├── format.ts           # 金额展示纯逻辑（±前缀/日合计拆分/结余）
├── components/
│   ├── RecordFlow      # 记账全屏向导（FAB 触发，支出/收入切换）
│   ├── ExpenseList     # 日历 + 清单 + 编辑弹窗
│   ├── MonthlyStats    # 周/月/年 + 饼图 + 柱状趋势 + 折叠列表
│   ├── BudgetPage      # 预算（总预算为主 + 分类从总分配 + 预算执行）
│   ├── Profile         # 语言/深色/导出/导入/分类管理
│   ├── CategoryManager # 预设锁定 + 自定义增删
│   └── CalculatorInput # 自定义计算器键盘（加减法 + 表达式求值）
├── i18n/
│   ├── I18nContext     # useI18n()：多语言 + 深色模式
│   ├── translations    # UI 文案中英对照
│   └── categoryTranslations # 分类名称翻译
├── data/
│   └── categories      # 默认分类 + 锁定名单
└── test/               # 纯函数测试
src-tauri/
├── tauri.conf.json     # 窗口 430×800，宽度锁定
├── capabilities/       # 权限：sql, dialog, fs
└── src/lib.rs          # 插件注册
```

## 关键约束

### SQL
- 参数占位符用 `$1, $2`，**不是** `?`
- DDL 显式：日期用 `strftime` 指定秒，不用 `datetime()`
- 索引：`date`、`category1`、`created_at`

### 样式 / 组件
- `flex:1` 的元素自己负责 `overflow-y: auto`（height:100% 链会在 antd 内部断裂）
- 金额输入用 `<input readOnly>` 触发自定义 `CalculatorInput` 键盘（支持加减法表达式求值），不弹系统键盘
- 所有可交互元素消除 `-webkit-tap-highlight-color`，统一用 `:active` 灰底叠加做点击反馈
- 弹窗用 `App.useApp().modal`，不用静态 `Modal.confirm`（后者不吃主题）
- 不依赖 antd 内部类名（v6 CSS-in-JS，类名动态哈希），自绘组件
- 按钮禁用 → **隐藏**，不是置灰（预设分类直接不渲染编辑/删除按钮）

### 数据
- `initDatabase()` 已做并发锁，直接 `await initDatabase()` 即可
- 交易方向靠 `expenses.type`（`'expense'`/`'income'`），金额恒为正，聚合查询默认过滤 `type='expense'`
- 收入分类是**前端常量** `incomeCategories`（7 预设，不入 `categories1` 表，不可在分类管理里增删）；CSV 导入校验需额外并入 `incomeCat1Names`
- 预设分类判断：`defaultCat1Names.includes()` / `defaultCat2Names.includes()`
- 空小类：明细显示大类名兜底，统计折叠显示"未分类"
- 导入架构：`useReducer` 状态机（idle → importing → done），零 ref、零 setTimeout
- 导入去重：仅按 `created_at`（毫秒级），不做数据内容比对
- 数据库位置：Windows `%APPDATA%/com.qinghe.ledger/` · Android App 内部存储
- 分类变更改 `categories.ts` 后需删旧数据库（开发阶段无历史负担）

## 开发与沟通

- **热更新**：前端改动自动刷新。只有 Rust / Cargo.toml / tauri.conf.json / capabilities 改了才需重启
- 技术方案列出选项，用户拍板；一次只抛一个决策点
