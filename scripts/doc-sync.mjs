#!/usr/bin/env node
// doc-sync: 提交时自动同步文档派生事实 + 校验文档与代码一致性
// 用法:
//   node scripts/doc-sync.mjs --check  严格校验（不改写），漂移即退出码 1；接 npm run audit
//   node scripts/doc-sync.mjs          同步模式（pre-commit 钩子）：事件驱动派生 + 改写 + git add
//   node scripts/doc-sync.mjs --test-count N  已知测试数，跳过 spawn vitest（/commit 传）；命中缓存同样跳过
// 幂等：同一状态跑两遍 = 零 diff。只改写 <!-- @audit:... --> 标记区，不碰自由正文。
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

// 已知测试数（/commit 传入，避免重复 spawn vitest）
const KNOWN_COUNT = parseTestCountArg();
function parseTestCountArg() {
  const i = process.argv.indexOf('--test-count');
  if (i === -1 || !process.argv[i + 1]) return null;
  const n = Number(process.argv[i + 1]);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

// repo 相对路径 → 绝对
const abs = (p) => join(ROOT, p);
const read = (p) => readFileSync(abs(p), 'utf8');
const write = (p, s) => writeFileSync(abs(p), s, 'utf8');

const MD_FILES = ['PRD.md', 'CLAUDE.md', 'README.md'];

const errors = [];
const warnings = [];
const changed = []; // 被改写的文件（repo 相对）

const err = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

/* ---------- git 辅助 ---------- */

function gitStaged() {
  try {
    return execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter(Boolean);
  } catch { return []; }
}

function gitAdd(paths) {
  if (!paths.length) return;
  try { execFileSync('git', ['add', '--', ...paths], { cwd: ROOT, stdio: 'ignore' }); } catch { /* 忽略 */ }
}

// 暂存区新增（A 状态）的文件路径列表
function gitAdded() {
  try {
    return execFileSync('git', ['diff', '--cached', '--name-status'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter((l) => l && /^A\s/.test(l))
      .map((l) => l.replace(/^A\s+/, ''));
  } catch { return []; }
}

/* ---------- 派生事实 ---------- */

// ① 测试数：优先取 --test-count（/commit 传）→ 缓存命中（src/test/ 哈希未变）→ 否则跑 vitest.mjs（绕开 Windows 的 npx .cmd shim）解析 "Tests  N passed"。失败返回 null（跳过，不阻塞）。
const CACHE_FILE = '.doc-sync-cache.json';
function srcTestHash() {
  try {
    const files = readdirSync(join(ROOT, 'src', 'test')).sort();
    const h = createHash('sha1');
    for (const f of files) h.update(f).update(readFileSync(join(ROOT, 'src', 'test', f)));
    return h.digest('hex');
  } catch { return null; }
}
function readCache() {
  try { return JSON.parse(readFileSync(abs(CACHE_FILE), 'utf8')); } catch { return null; }
}
function writeCache(c) {
  try { writeFileSync(abs(CACHE_FILE), JSON.stringify(c), 'utf8'); } catch { /* 忽略 */ }
}
function testCount() {
  const hash = srcTestHash();
  if (KNOWN_COUNT != null) {
    if (hash) writeCache({ count: KNOWN_COUNT, hash });
    return KNOWN_COUNT;
  }
  const cached = readCache();
  if (cached && hash && cached.hash === hash) return cached.count;
  try {
    const out = execFileSync(
      process.execPath,
      [join('node_modules', 'vitest', 'vitest.mjs'), 'run', '--silent'],
      { cwd: ROOT, encoding: 'utf8' }
    );
    const m = out.match(/Tests\s+(\d+)\s+passed/);
    const n = m ? Number(m[1]) : null;
    if (n != null && hash) writeCache({ count: n, hash });
    return n;
  } catch {
    return null;
  }
}

// ② 版本：单一事实源 = src-tauri/tauri.conf.json。
function appVersion() {
  try { return JSON.parse(read('src-tauri/tauri.conf.json')).version; } catch { return null; }
}

/* 标记正则：数字紧跟 <!-- @audit:xxx --> */
const MARK_TEST = /(\d+)\s*<!-- @audit:test-count -->/;
const MARK_VER = /v(\d+\.\d+\.\d+)\s*<!-- @audit:version -->/;

/* ---------- 校验 ---------- */

// ⑤ backtick 代码路径存在性：跳过代码块（架构树/命令）与 @audit:ignore 区间（历史分析），
// 只查长得像文件路径的 token；裸文件名（App.tsx）按 src/、src-tauri/ 兜底解析；`..` 省略号/父路径排除。
const FILE_TOKEN = /`((?:src|src-tauri|scripts)\/[\w./-]+|[\w./-]+\.(?:ts|tsx|rs|mjs|json|css))(?::\d+(?:-\d+)?|#L\d+(?:-\d+)?)?`/g;
const stripAnchor = (p) => p.replace(/#L\d+(-\d+)?$/, '').replace(/:\d+(-\d+)?$/, '');
const codeFence = /```[\s\S]*?```/g;
const IGNORE_BLOCK = /<!--\s*@audit:ignore\s*-->[\s\S]*?<!--\s*\/@audit:ignore\s*-->/g;

function resolveToken(tok) {
  const p = stripAnchor(tok);
  const candidates = [p, `src/${p}`, `src-tauri/${p}`];
  return candidates.some((c) => existsSync(abs(c)));
}

function checkPaths() {
  for (const f of MD_FILES) {
    const prose = read(f).replace(codeFence, '').replace(IGNORE_BLOCK, '');
    for (const m of prose.matchAll(FILE_TOKEN)) {
      if (m[1].includes('..')) continue;
      if (!resolveToken(m[1])) err(`${f}: 引用了不存在的路径 \`${m[1]}\``);
    }
  }
}

/* ---------- 派生改写 ---------- */

// 测试数标记改写（README）。返回改写次数。
function syncTestCount(staged) {
  const f = 'README.md';
  const text = read(f);
  if (!MARK_TEST.test(text)) return 0;
  const srcChanged = staged.some((p) => p.startsWith('src/test/'));
  if (CHECK || srcChanged) {
    const n = testCount();
    if (n == null) { warn('vitest 未通过，跳过测试数校验/同步'); return 0; }
    const next = text.replace(MARK_TEST, (m, old) => `${n}<!-- @audit:test-count -->`);
    if (next !== text) { write(f, next); changed.push(f); }
  }
  return 0;
}

// 版本标记改写（README）。
function syncVersion(staged) {
  const f = 'README.md';
  const text = read(f);
  if (!MARK_VER.test(text)) return 0;
  const v = appVersion();
  if (v == null) { warn('无法读取 tauri.conf.json 版本'); return 0; }
  const next = text.replace(MARK_VER, `v${v}<!-- @audit:version -->`);
  if (next !== text) { write(f, next); changed.push(f); }
  return 0;
}

// guardrail：本次提交新增 src/ 代码但未同时暂存 PRD/README → 提醒刷新文档（只警告不阻塞，防"忘了刷文档"）
function guardrailDoc(staged) {
  const adds = gitAdded().filter((p) => p.startsWith('src/'));
  if (!adds.length) return;
  if (staged.some((p) => p === 'PRD.md' || p === 'README.md')) return;
  warn(`[guardrail] 新增 ${adds.length} 个 src/ 文件但未同时暂存 PRD.md/README.md，疑似漏刷新文档 —— 可用 /commit 让 AI 判断并补正文`);
}

/* ---------- PRD 进度条 + 锚点 + ✅ 翻转 ---------- */

function phaseSections(prd) {
  const sections = [];
  const re = /^### Phase (\d+)[^\n]*\n([\s\S]*?)(?=^### |\n## |\n---|\n### 进度|$)/gm;
  for (const m of prd.matchAll(re)) sections.push({ num: m[1], body: m[2] });
  return sections;
}

// 表行: | 序号 | 任务 | 状态 | 说明...  (第三格为 ✅/⏸/🔄)
const STATUS_ROW = /^\|\s*[\d.]+(?:[ab]\d*)?\s*\|\s*\*?[^*]+\*?\s*\|\s*(✅|⏸|🔄)\s*\|([^\n]*)/gm;

function phasePct(body) {
  const cells = [...body.matchAll(STATUS_ROW)].map((m) => m[1]);
  if (!cells.length) return null;
  const done = cells.filter((c) => c === '✅').length;
  return Math.round((done / cells.length) * 100);
}

// ③ 进度条：Phase N  ██..░  P%  名称
function syncProgress(prd) {
  const barRe = /^(Phase \d+)  ([█░]+)  (\d+)%  (.+)$/gm;
  const map = new Map(phaseSections(prd).map((s) => [s.num, phasePct(s.body)]));
  let dirty = false;
  const next = prd.replace(barRe, (line, phase, _bar, _pct, name) => {
    const pct = map.get(phase);
    if (pct == null) return line; // 无状态列的 Phase 保持原样（不瞎猜）
    const fill = Math.round((pct / 100) * 10);
    const bar = '█'.repeat(fill) + '░'.repeat(10 - fill);
    const rebuilt = `${phase}  ${bar}  ${pct}%  ${name}`;
    if (rebuilt !== line) dirty = true;
    return rebuilt;
  });
  if (dirty) { write('PRD.md', next); changed.push('PRD.md'); }
  return next;
}

// ⑥ ✅ 锚点纪律 + ④ ⏸→✅ 自动翻转（flip=false 时只做锚点校验，绝不改写）
function anchorAndFlip(prd, staged, flip) {
  const sections = phaseSections(prd);
  let dirty = false;
  let next = prd;
  for (const s of sections) {
    next = next.replace(STATUS_ROW, (row, status, desc) => {
      if (status === '✅') {
        if (!resolveTokenSafe(desc)) {
          err(`PRD Phase ${s.num}: ✅ 行「${row.match(/\*\*([^*]+)\*\*/)?.[1] ?? '?'}」缺证明锚点（说明里需引用 src/... 或 *.test.* 文件）`);
        }
        return row;
      }
      if (status === '⏸' && flip) {
        // 说明里声明的测试锚点本次提交出现 → 自动翻转
        const anchors = [...desc.matchAll(/`((?:src\/test\/[\w./-]+\.test\.[\w]+))`/g)].map((m) => m[1]);
        if (anchors.some((a) => staged.includes(a))) {
          dirty = true;
          return row.replace('| ⏸ ', '| ✅ ');
        }
      }
      return row;
    });
  }
  if (dirty) { write('PRD.md', next); if (!changed.includes('PRD.md')) changed.push('PRD.md'); }
  return next;
}

function resolveTokenSafe(desc) {
  for (const m of desc.matchAll(FILE_TOKEN)) {
    if (resolveToken(m[1])) return true;
  }
  return false;
}

/* ---------- 主流程 ---------- */

function main() {
  const staged = gitStaged();
  let prd = read('PRD.md');

  if (CHECK) {
    // 严格校验：跑 vitest 对比标记、对比版本、对比进度条、查路径与锚点
    const n = testCount();
    if (n != null) {
      for (const m of read('README.md').matchAll(new RegExp(MARK_TEST, 'g'))) {
        if (Number(m[1]) !== n) err(`README: 测试数标记 ${m[1]} ≠ 实际 ${n}`);
      }
    } else {
      warn('vitest 未通过，跳过测试数校验');
    }
    const v = appVersion();
    if (v != null) {
      for (const m of read('README.md').matchAll(new RegExp(MARK_VER, 'g'))) {
        if (m[1] !== v) err(`README: 版本标记 ${m[1]} ≠ tauri.conf.json ${v}`);
      }
    }
    const pctMap = new Map(phaseSections(prd).map((s) => [s.num, phasePct(s.body)]));
    for (const m of prd.matchAll(/^(Phase \d+)  ([█░]+)  (\d+)%  (.+)$/gm)) {
      const pct = pctMap.get(m[1]);
      if (pct != null && pct !== Number(m[3])) {
        err(`PRD: ${m[1]} 进度条 ${m[3]}% 与状态表算出的 ${pct}% 不符`);
      }
    }
    checkPaths();
    anchorAndFlip(prd, staged, false); // check 模式只做锚点校验，不翻转不改写
    for (const f of MD_FILES) {
      // 幂等自检：标记改写后应无残留旧值
      const text = read(f);
      const nm = text.match(MARK_TEST);
      if (nm && Number(nm[1]) !== n && n != null) err(`${f}: 测试数标记未同步`);
    }
  } else {
    // 同步模式：事件驱动派生 + 改写 + 锚点警告
    syncTestCount(staged);
    syncVersion(staged);
    guardrailDoc(staged);
    prd = syncProgress(prd);
    anchorAndFlip(prd, staged, true);
    checkPaths();
    gitAdd([...new Set(changed)]);
  }

  for (const w of warnings) console.warn(`⚠ ${w}`);
  for (const e of errors) console.error(`✖ ${e}`);
  if (changed.length) console.log(`doc-sync: 已同步 ${changed.join(', ')}`);
  else console.log('doc-sync: 无变化');

  if (errors.length) {
    console.error(`doc-sync: ${errors.length} 处漂移${CHECK ? '（运行 npm run audit 修复文档或改代码）' : '（提交继续，可手动 npm run audit）'}`);
    process.exit(CHECK ? 1 : 0);
  }
}

try {
  main();
} catch (e) {
  console.error(`doc-sync 出错: ${e.message}`);
  process.exit(1);
}
