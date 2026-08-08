// 青禾记账 - 数据库操作
import Database from '@tauri-apps/plugin-sql';
import { defaultCategories, incomeCategories } from './data/categories';

let db: Database | null = null;
let initPromise: Promise<Database> | null = null;

export type TxType = 'expense' | 'income';

export interface Expense {
  id?: number;
  // 交易类型（旧数据缺省为 expense）。编辑时不可变更，改类型需删除重建
  type?: TxType;
  amount: number;
  category1: string;
  category2: string;
  date: string;
  note: string;
  created_at?: string;
}

export interface Category {
  id?: number;
  name: string;
  icon: string;
  parent: string;
  children: string[];
  sort_order: number;
}

// 初始化数据库
export async function initDatabase(): Promise<Database> {
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    db = await Database.load('sqlite:qinghe-ledger.db');

  // 花销表（type 区分支出/收入，均为正数，方向靠 type）
  await db.execute(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'expense',
      amount REAL NOT NULL,
      category1 TEXT NOT NULL,
      category2 TEXT NOT NULL,
      date TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now', 'localtime'))
    )
  `);
  await db.execute('CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_expenses_cat1 ON expenses(category1)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_expenses_created ON expenses(created_at)');

  // 迁移：已有库补 type 列（新建库的 CREATE 已含，此步幂等）
  const expenseCols = await db.select<{ name: string }[]>(`PRAGMA table_info(expenses)`);
  if (!expenseCols.some((c) => c.name === 'type')) {
    await db.execute(`ALTER TABLE expenses ADD COLUMN type TEXT NOT NULL DEFAULT 'expense'`);
  }

  // 一级分类表（type 区分支出/收入；收入分类无子类）
  await db.execute(`
    CREATE TABLE IF NOT EXISTS categories1 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT DEFAULT '📦',
      sort_order INTEGER DEFAULT 0,
      type TEXT NOT NULL DEFAULT 'expense'
    )
  `);

  // 迁移：已有库补 type 列（新建库的 CREATE 已含，此步幂等）
  const cat1Cols = await db.select<{ name: string }[]>(`PRAGMA table_info(categories1)`);
  if (!cat1Cols.some((c) => c.name === 'type')) {
    await db.execute(`ALTER TABLE categories1 ADD COLUMN type TEXT NOT NULL DEFAULT 'expense'`);
  }

  // 收入预设分类入库（幂等；sort_order 从 100 起，避免扰动支出排序）
  for (let i = 0; i < incomeCategories.length; i++) {
    const c = incomeCategories[i];
    await db.execute(
      `INSERT OR IGNORE INTO categories1 (name, icon, sort_order, type) VALUES ($1, $2, $3, 'income')`,
      [c.name, c.icon, 100 + i]
    );
  }

  // 二级分类表
  await db.execute(`
    CREATE TABLE IF NOT EXISTS categories2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0
    )
  `);

  // 预算表（分类默认月度预算，单一规则值，滚动复用）
  await db.execute(`
    CREATE TABLE IF NOT EXISTS budgets (
      category1 TEXT PRIMARY KEY,
      amount REAL NOT NULL
    )
  `);

  // 全局设置表（总预算等键值）
  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // 数据库完整性自检
  try {
    const check = await db.select<[{ integrity_check: string }]>('PRAGMA integrity_check');
    if (check[0]?.integrity_check !== 'ok') {
      console.error('数据库完整性检查失败:', check[0]?.integrity_check);
      throw new Error('Database integrity check failed');
    }
  } catch (e) {
    db = null;
    throw new Error(`数据库损坏: ${String(e)}`);
  }

  // 首次使用时导入默认分类
  const count = await db.select<[{ cnt: number }]>(
    'SELECT COUNT(*) as cnt FROM categories1'
  );
  if (count[0]?.cnt === 0) {
    for (let i = 0; i < defaultCategories.length; i++) {
      const cat = defaultCategories[i];
      await db.execute(
        'INSERT INTO categories1 (name, icon, sort_order) VALUES ($1, $2, $3)',
        [cat.name, cat.icon, i]
      );
      for (let j = 0; j < cat.children.length; j++) {
        await db.execute(
          'INSERT INTO categories2 (name, parent, sort_order) VALUES ($1, $2, $3)',
          [cat.children[j], cat.name, j]
        );
      }
    }
  }

    return db;
  })();
  return initPromise;
}

// ============ 花销操作 ============

export async function addExpense(expense: Expense): Promise<number> {
  const database = await initDatabase();
  const result = await database.execute(
    'INSERT INTO expenses (type, amount, category1, category2, date, note) VALUES ($1, $2, $3, $4, $5, $6)',
    [expense.type || 'expense', expense.amount, expense.category1, expense.category2, expense.date, expense.note || '']
  );
  return result.lastInsertId as number;
}

// 批量导入（多值INSERT：一次SQL=一次原子写入，无需事务）
export async function batchAddExpenses(
  expenses: Expense[],
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  if (expenses.length === 0) return 0;
  const database = await initDatabase();
  const total = expenses.length;
  const BATCH = 50; // 50行×7列=350参数，SQLite安全上限999

  for (let start = 0; start < total; start += BATCH) {
    const chunk = expenses.slice(start, start + BATCH);
    const values: string[] = [];
    const params: (string | number)[] = [];
    chunk.forEach((e, i) => {
      const off = i * 7;
      values.push(`($${off + 1}, $${off + 2}, $${off + 3}, $${off + 4}, $${off + 5}, $${off + 6}, $${off + 7})`);
      params.push(e.type || 'expense', e.amount, e.category1, e.category2 || '', e.date, e.note || '', e.created_at || '');
    });
    await database.execute(
      `INSERT INTO expenses (type, amount, category1, category2, date, note, created_at) VALUES ${values.join(', ')}`,
      params
    );
    if (onProgress) onProgress(Math.min(start + BATCH, total), total);
  }
  if (onProgress) onProgress(total, total);
  return total;
}

export async function getExpenses(month?: string): Promise<Expense[]> {
  const database = await initDatabase();
  let query = 'SELECT * FROM expenses';
  const params: string[] = [];

  if (month) {
    query += ' WHERE strftime(\'%Y-%m\', date) = $1';
    params.push(month);
  }

  query += ' ORDER BY date DESC, created_at DESC';

  return await database.select<Expense[]>(query, params);
}

// 按单日查询明细
export async function getExpensesByDate(date: string): Promise<Expense[]> {
  const database = await initDatabase();
  return database.select<Expense[]>(
    'SELECT * FROM expenses WHERE date = $1 ORDER BY created_at DESC',
    [date]
  );
}

// 按日期范围获取花销
export async function getExpensesByRange(start: string, end: string): Promise<Expense[]> {
  const database = await initDatabase();
  return await database.select<Expense[]>(
    'SELECT * FROM expenses WHERE date >= $1 AND date <= $2 ORDER BY date DESC, created_at DESC',
    [start, end]
  );
}

export async function updateExpense(id: number, exp: Partial<Expense>): Promise<void> {
  const database = await initDatabase();
  const sets: string[] = [];
  const vals: (string | number)[] = [];
  let i = 1;
  if (exp.amount !== undefined) { sets.push(`amount=$${i++}`); vals.push(exp.amount); }
  if (exp.category1 !== undefined) { sets.push(`category1=$${i++}`); vals.push(exp.category1); }
  if (exp.category2 !== undefined) { sets.push(`category2=$${i++}`); vals.push(exp.category2); }
  if (exp.date !== undefined) { sets.push(`date=$${i++}`); vals.push(exp.date); }
  if (exp.note !== undefined) { sets.push(`note=$${i++}`); vals.push(exp.note); }
  if (sets.length === 0) return;
  vals.push(id);
  await database.execute(`UPDATE expenses SET ${sets.join(',')} WHERE id=$${i}`, vals);
}

export async function deleteExpense(id: number): Promise<void> {
  const database = await initDatabase();
  await database.execute('DELETE FROM expenses WHERE id = $1', [id]);
}

export async function clearAllExpenses(): Promise<void> {
  const database = await initDatabase();
  await database.execute('DELETE FROM expenses');
}

// CSV 导出
export async function getAllExpensesForExport(): Promise<Expense[]> {
  const database = await initDatabase();
  return await database.select<Expense[]>(
    'SELECT * FROM expenses ORDER BY date DESC, created_at DESC'
  );
}

// 统计某分类下的花销记录数
export async function countExpensesByCategory(cat1: string, cat2?: string): Promise<number> {
  const database = await initDatabase();
  if (cat2) {
    const result = await database.select<[{ cnt: number }]>(
      'SELECT COUNT(*) as cnt FROM expenses WHERE category1 = $1 AND category2 = $2',
      [cat1, cat2]
    );
    return result[0]?.cnt || 0;
  }
  const result = await database.select<[{ cnt: number }]>(
    'SELECT COUNT(*) as cnt FROM expenses WHERE category1 = $1',
    [cat1]
  );
  return result[0]?.cnt || 0;
}

export async function getMonthlyStats(month: string, type: TxType = 'expense'): Promise<{
  total: number;
  byCategory: { category: string; amount: number; count: number }[];
}> {
  const database = await initDatabase();
  const totalResult = await database.select<[{ total: number }]>(
    'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE strftime(\'%Y-%m\', date) = $1 AND type = $2',
    [month, type]
  );
  const total = totalResult[0]?.total || 0;

  const byCategory = await database.select<{ category: string; amount: number; count: number }[]>(
    'SELECT category1 as category, SUM(amount) as amount, COUNT(*) as count FROM expenses WHERE strftime(\'%Y-%m\', date) = $1 AND type = $2 GROUP BY category1 ORDER BY amount DESC',
    [month, type]
  );

  return { total, byCategory };
}

// ============ 分类操作 ============

export interface Category1Row {
  id: number;
  name: string;
  icon: string;
  sort_order: number;
  type?: TxType;
}

export interface Category2Row {
  id: number;
  name: string;
  parent: string;
  sort_order: number;
}

// 获取分类（组装成树形结构；type=expense 支出两级树，type=income 收入单级列表）
export async function getCategories(type: TxType = 'expense'): Promise<{ name: string; icon: string; children: string[] }[]> {
  const database = await initDatabase();
  const cat1List = await database.select<Category1Row[]>(
    'SELECT * FROM categories1 WHERE type = $1 ORDER BY sort_order',
    [type]
  );
  if (type === 'income') {
    return cat1List.map((c1) => ({ name: c1.name, icon: c1.icon, children: [] }));
  }
  const cat2List = await database.select<Category2Row[]>(
    'SELECT * FROM categories2 ORDER BY sort_order'
  );

  return cat1List.map((c1) => ({
    name: c1.name,
    icon: c1.icon,
    children: cat2List
      .filter((c2) => c2.parent === c1.name)
      .map((c2) => c2.name),
  }));
}

// 添加一级分类（type 缺省支出；收入传 'income'）
export async function addCategory1(name: string, icon: string, type: TxType = 'expense'): Promise<void> {
  const database = await initDatabase();
  const max = await database.select<[{ m: number }]>(
    'SELECT COALESCE(MAX(sort_order), -1) as m FROM categories1 WHERE type = $1',
    [type]
  );
  await database.execute(
    'INSERT INTO categories1 (name, icon, sort_order, type) VALUES ($1, $2, $3, $4)',
    [name, icon, (max[0]?.m || 0) + 1, type]
  );
}

// 添加二级分类
export async function addCategory2(name: string, parent: string): Promise<void> {
  const database = await initDatabase();
  const max = await database.select<[{ m: number }]>(
    'SELECT COALESCE(MAX(sort_order), -1) as m FROM categories2 WHERE parent = $1',
    [parent]
  );
  await database.execute(
    'INSERT INTO categories2 (name, parent, sort_order) VALUES ($1, $2, $3)',
    [name, parent, (max[0]?.m || 0) + 1]
  );
}

// 更新一级分类排序（拖拽重排用，expense/income 共用）
export async function updateCategory1Sort(name: string, sort: number): Promise<void> {
  const database = await initDatabase();
  await database.execute('UPDATE categories1 SET sort_order = $1 WHERE name = $2', [sort, name]);
}

// 更新二级分类排序（子分类拖拽重排用，仅在父类内重排）
export async function updateCategory2Sort(name: string, parent: string, sort: number): Promise<void> {
  const database = await initDatabase();
  await database.execute('UPDATE categories2 SET sort_order = $1 WHERE name = $2 AND parent = $3', [sort, name, parent]);
}

// 删除一级分类（同时删除其二级分类）
export async function deleteCategory1(name: string): Promise<void> {
  const database = await initDatabase();
  await database.execute('DELETE FROM categories2 WHERE parent = $1', [name]);
  await database.execute('DELETE FROM categories1 WHERE name = $1', [name]);
}

// 删除二级分类
export async function deleteCategory2(name: string, parent: string): Promise<void> {
  const database = await initDatabase();
  await database.execute('DELETE FROM categories2 WHERE name = $1 AND parent = $2', [name, parent]);
}

// 重命名一级分类（同时更新花销记录和二级分类的外键）
export async function renameCategory1(oldName: string, newName: string): Promise<void> {
  const database = await initDatabase();
  await database.execute('UPDATE categories1 SET name = $1 WHERE name = $2', [newName, oldName]);
  await database.execute('UPDATE categories2 SET parent = $1 WHERE parent = $2', [newName, oldName]);
  await database.execute('UPDATE expenses SET category1 = $1 WHERE category1 = $2', [newName, oldName]);
}

// 重命名二级分类
export async function renameCategory2(oldName: string, newName: string, parent: string): Promise<void> {
  const database = await initDatabase();
  await database.execute(
    'UPDATE categories2 SET name = $1 WHERE name = $2 AND parent = $3',
    [newName, oldName, parent]
  );
  await database.execute(
    'UPDATE expenses SET category2 = $1 WHERE category2 = $2 AND category1 = $3',
    [newName, oldName, parent]
  );
}

// 预算：获取所有分类的月度预算（无预算的分类不在结果里）
export async function getBudgets(): Promise<Record<string, number>> {
  const database = await initDatabase();
  const rows = await database.select<{ category1: string; amount: number }[]>(
    'SELECT category1, amount FROM budgets'
  );
  const map: Record<string, number> = {};
  rows.forEach((r) => { map[r.category1] = r.amount; });
  return map;
}

// 预算：设置/更新分类预算（amount > 0 才调用）
export async function setBudget(category1: string, amount: number): Promise<void> {
  const database = await initDatabase();
  await database.execute(
    'INSERT OR REPLACE INTO budgets (category1, amount) VALUES ($1, $2)',
    [category1, amount]
  );
}

// 预算：清除分类预算
export async function deleteBudget(category1: string): Promise<void> {
  const database = await initDatabase();
  await database.execute('DELETE FROM budgets WHERE category1 = $1', [category1]);
}

// 全局设置：读（不存在返回 null）
export async function getSetting(key: string): Promise<string | null> {
  const database = await initDatabase();
  const rows = await database.select<{ value: string }[]>(
    'SELECT value FROM settings WHERE key = $1',
    [key]
  );
  return rows[0]?.value ?? null;
}

// 全局设置：写
export async function setSetting(key: string, value: string): Promise<void> {
  const database = await initDatabase();
  await database.execute(
    'INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)',
    [key, value]
  );
}

// 全局设置：删
export async function deleteSetting(key: string): Promise<void> {
  const database = await initDatabase();
  await database.execute('DELETE FROM settings WHERE key = $1', [key]);
}

// ============ 统计聚合（数据库侧计算，避免全量加载到 JS）============

export interface StatsSummary { total: number; count: number; maxSingle: number }

export async function getStatsSummary(month: string, type: TxType = 'expense'): Promise<StatsSummary> {
  const database = await initDatabase();
  const rows = await database.select<[{ total: number; count: number; max_amount: number }]>(
    "SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count, COALESCE(MAX(amount), 0) as max_amount FROM expenses WHERE strftime('%Y-%m', date) = $1 AND type = $2",
    [month, type]
  );
  return { total: rows[0].total, count: rows[0].count, maxSingle: rows[0].max_amount };
}

export interface CatStat { category: string; amount: number; count: number }

export async function getStatsByCategory(month: string, type: TxType = 'expense'): Promise<CatStat[]> {
  const database = await initDatabase();
  return database.select<CatStat[]>(
    "SELECT category1 as category, SUM(amount) as amount, COUNT(*) as count FROM expenses WHERE strftime('%Y-%m', date) = $1 AND type = $2 GROUP BY category1 ORDER BY amount DESC",
    [month, type]
  );
}

export interface TrendPoint { date: string; amount: number }

export async function getStatsTrend(month: string, mode: 'day' | 'month', type: TxType = 'expense'): Promise<TrendPoint[]> {
  const database = await initDatabase();
  if (mode === 'day') {
    return database.select<TrendPoint[]>(
      "SELECT date, SUM(amount) as amount FROM expenses WHERE strftime('%Y-%m', date) = $1 AND type = $2 GROUP BY date ORDER BY date",
      [month, type]
    );
  } else {
    const year = month.slice(0, 4);
    return database.select<TrendPoint[]>(
      "SELECT strftime('%Y-%m', date) as date, SUM(amount) as amount FROM expenses WHERE strftime('%Y', date) = $1 AND type = $2 GROUP BY strftime('%Y-%m', date) ORDER BY date",
      [year, type]
    );
  }
}

export async function getStatsSummaryByRange(start: string, end: string, type: TxType = 'expense'): Promise<StatsSummary> {
  const database = await initDatabase();
  const rows = await database.select<[{ total: number; count: number; max_amount: number }]>(
    'SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count, COALESCE(MAX(amount),0) as max_amount FROM expenses WHERE date >= $1 AND date <= $2 AND type = $3',
    [start, end, type]
  );
  return { total: rows[0].total, count: rows[0].count, maxSingle: rows[0].max_amount };
}

export async function getStatsByCategoryRange(start: string, end: string, type: TxType = 'expense'): Promise<CatStat[]> {
  const database = await initDatabase();
  return database.select<CatStat[]>(
    'SELECT category1 as category, SUM(amount) as amount, COUNT(*) as count FROM expenses WHERE date >= $1 AND date <= $2 AND type = $3 GROUP BY category1 ORDER BY amount DESC',
    [start, end, type]
  );
}

// 日历标记：按类型返回有数据的日期（支出绿点 / 收入蓝点）
export async function getDatesWithExpenses(month: string, type: TxType = 'expense'): Promise<string[]> {
  const database = await initDatabase();
  const rows = await database.select<{ date: string }[]>(
    "SELECT DISTINCT date FROM expenses WHERE strftime('%Y-%m', date) = $1 AND type = $2", [month, type]
  );
  return rows.map(r => r.date);
}

export async function getStatsSubCategories(month: string, cat1: string, type: TxType = 'expense'): Promise<CatStat[]> {
  const database = await initDatabase();
  return database.select<CatStat[]>(
    "SELECT category2 as category, SUM(amount) as amount, COUNT(*) as count FROM expenses WHERE strftime('%Y-%m', date) = $1 AND category1 = $2 AND type = $3 GROUP BY category2 ORDER BY amount DESC",
    [month, cat1, type]
  );
}

export async function getStatsSubCategoriesRange(start: string, end: string, cat1: string, type: TxType = 'expense'): Promise<CatStat[]> {
  const database = await initDatabase();
  return database.select<CatStat[]>(
    'SELECT category2 as category, SUM(amount) as amount, COUNT(*) as count FROM expenses WHERE date >= $1 AND date <= $2 AND category1 = $3 AND type = $4 GROUP BY category2 ORDER BY amount DESC',
    [start, end, cat1, type]
  );
}

export async function getStatsTrendRange(start: string, end: string, mode: 'day' | 'month', type: TxType = 'expense'): Promise<TrendPoint[]> {
  const database = await initDatabase();
  if (mode === 'month') {
    return database.select<TrendPoint[]>(
      "SELECT strftime('%Y-%m', date) as date, SUM(amount) as amount FROM expenses WHERE date >= $1 AND date <= $2 AND type = $3 GROUP BY strftime('%Y-%m', date) ORDER BY date",
      [start, end, type]
    );
  }
  return database.select<TrendPoint[]>(
    'SELECT date, SUM(amount) as amount FROM expenses WHERE date >= $1 AND date <= $2 AND type = $3 GROUP BY date ORDER BY date',
    [start, end, type]
  );
}
