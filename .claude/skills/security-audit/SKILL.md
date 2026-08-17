---
name: security-audit
description: 代码安全审计。扫描 src/、src-tauri/、配置文件，输出带 file:line 与风险等级的发现和修复建议（青禾记账专用清单）。
whenToUse: 请求涉及"安全审计/安全检查/漏洞排查/security audit/injection/XSS/权限/密钥"时使用。
---

# 安全审计（青禾记账）

对本仓库（Tauri 2 + React 19 + TS + tauri-plugin-sql + antd 6，本地 SQLite、无联网）做代码安全审计。

## 范围

默认全量：`src/**`、`src-tauri/**`、`tauri.conf.json`、`Cargo.toml`、`.gitignore`。用户指定范围时以其为准。

注意：仓库的 `npm run audit` 是 `doc-sync.mjs --check`（文档漂移检查），**与安全无关**。真依赖漏洞用 `npm audit`（需联网、可选、跑前先问用户）。

## 流程

1. 读关键文件：`src/db.ts`、`src/csv.ts`、`src/App.tsx`、`src/components/Profile.tsx`、`src-tauri/capabilities/default.json`、`src-tauri/tauri.conf.json`、`src-tauri/src/lib.rs`、`Cargo.toml`。
2. 按下方清单逐项核查（grep + 读上下文，逐条验证，不臆断）。
3. 汇总输出报告。

## 清单

### 1. SQL 注入（tauri-plugin-sql）
- 全部查询必须用 `$1/$2` 参数占位，禁止把用户输入字符串拼接进 SQL。
- `db.ts` 已知安全形态：`updateExpense` 动态拼 SET 子句但值全走参数；`batchAddExpenses` 多值 INSERT 值走参数——列名固定、数据参数化，属安全。
- 检查项：`select(`/`execute(` 的模板串里是否存在 `${...}` 或 `+` 拼接了用户可控字段（note / category / date / name 等）。

### 2. XSS / 前端注入
- grep 危险 sink：`dangerouslySetInnerHTML`、`eval(`、`new Function`、`innerHTML\s*=`、`document.write`。React 默认转义文本，一旦出现上述 sink，需评估数据是否用户可控（如 note 文案）。
- 检查 note / 类别等用户输入最终是否以文本节点渲染（预期安全）。

### 3. CSV 公式注入（导出的 CSV 被 Excel/Sheets 打开时执行公式）
- 重点查 `csv.ts` 的 `buildExportRow`：字段以 `= + - @`（或 `\t`/回车）开头时若未加 `'` 前缀或引号包裹，Excel 会当成公式执行。当前实现只做逗号替换、**未转义** → note/类别含公式前缀即命中，**本仓库真实风险**。
- 修复建议：对以 `=+-@\t\r` 开头的字段前缀 `'` 或整体引号包裹；导出带头 BOM 防乱码。
- 导入侧 `parseImportCsv`：纯文本解析 + 日期/金额/类别存在性校验，无执行面 → 已核查·安全（唯一注意：不对文件大小设上限，超大文件内存风险低危）。

### 4. Tauri 权限与能力（capabilities/default.json + tauri.conf.json）
- `fs:allow-read/write-text-file`：本仓库路径全部来自 `dialog.save/open`（Profile.tsx），原生对话框选路径，非任意路径注入 → 已核查·安全。
- `opener:default`：`src/` 未使用 opener API → 无用权限，建议收窄（Low/Info）。
- `csp: null`：未设 Content-Security-Policy。本应用不加载远程内容，风险低；但 Tauri 官方建议设 CSP 纵深防御（dev 走 localhost）。标 Low + 建议 `default-src 'self'`。
- 核查无 `dangerousRemoteDomainIpcAccess`、无多余 `ask`/`warning` 高权限项。

### 5. 敏感数据与密钥
- grep `api[_-]?key`、`token`、`password`、`secret`、`BEGIN (RSA|EC|OPENSSH)? PRIVATE`、`AKIA` → 命中即高危并停下来讨论；预期无。
- `.env` / 证书 / 密钥文件不得进 git（查 `.gitignore` 与 `git ls-files`）。
- SQLite 存财务数据：查 `console.log` 与 `src/debug.ts` 路径是否打出整行记录或敏感字段（预期只有开关位，Low/Info）。

### 6. 依赖漏洞（可选）
- `npm audit` 与 `cargo audit` 需联网，跑前先问用户。仅供排查已知 CVE。

### 7. Rust 侧
- `src-tauri/src/*.rs`：查 `std::process::Command`、`net/http`、`unsafe`、前端透传路径进文件系统 → 预期只有插件注册 + 残留的无副作用 `greet`。禁止把前端输入用于命令拼接。

### 8. 数据完整性
- 幂等迁移 + `PRAGMA integrity_check` 自检（db.ts）→ 已核查·安全。
- 破坏性操作（`clearAllExpenses` 全删）：属 UI 确认流程层面，非安全漏洞，Info 列出即可。

## 输出格式

按 `file:line` 逐条列：**风险等级**（High/Medium/Low/Info）、**描述**、**证据**（引用原文）、**攻击场景**、**修复建议**。末尾列"已核查·安全"项与优先级汇总。无发现就明说"未发现问题"。