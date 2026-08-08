// 青禾记账 - CSV 导出/导入纯逻辑（无 Tauri/DOM 依赖，可独立测试）
// 7 列格式：日期,一级类别,二级类别,金额,备注,记录时间,类型。类型放末列 → 旧 6 列文件的字段位序完全不变，导入兼容
import type { Expense, TxType } from './db';
import type { Lang } from './i18n/translations';
import { translateCategory } from './i18n/categoryTranslations';

export const HEADER6: Record<Lang, string[]> = {
  zh: ['日期', '一级类别', '二级类别', '金额', '备注', '记录时间'],
  en: ['Date', 'Category1', 'Category2', 'Amount', 'Note', 'CreatedAt'],
};

export const HEADER7: Record<Lang, string[]> = {
  zh: ['日期', '一级类别', '二级类别', '金额', '备注', '记录时间', '类型'],
  en: ['Date', 'Category1', 'Category2', 'Amount', 'Note', 'CreatedAt', 'Type'],
};

// 旧版中文表头（「一级分类/二级分类」）别名映射，导入时归一化为新表头，保持旧导出文件可导入
const ZH_HEADER_ALIAS: Record<string, string> = {
  '一级分类': '一级类别',
  '二级分类': '二级类别',
  '子分类': '子类别',
};

// 类型列写出的本地化值（与表头/分类一致的中英混排 CSV）
export function typeLabel(type: TxType, lang: Lang): string {
  return type === 'income' ? (lang === 'zh' ? '收入' : 'Income') : (lang === 'zh' ? '支出' : 'Expense');
}

// 读入归一化：收入/income → income；其余（支出/expense/空/未知）一律视为支出
export function normalizeType(v?: string): TxType {
  const s = (v || '').trim().toLowerCase();
  return s === '收入' || s === 'income' ? 'income' : 'expense';
}

// 单行导出（7 列，类型在末列）
export function buildExportRow(exp: Expense, lang: Lang): string {
  const type = typeLabel(exp.type || 'expense', lang);
  return `${exp.date},${translateCategory(lang, exp.category1)},${translateCategory(lang, exp.category2)},${exp.amount.toFixed(2)},${(exp.note || '').replace(/,/g, '，')},\t${exp.created_at || ''},${type}`;
}

export interface CsvCategoryMap {
  cat1Set: Set<string>;
  cat2Map: Record<string, Set<string>>;
}

export interface ParsedCsvResult {
  headerInvalid: boolean;
  parsed: Expense[];
  errors: string[];
}

// 解析 CSV：7 列优先识别，6 列兜底（无类型列默认支出）
export function parseImportCsv(content: string, categories?: CsvCategoryMap): ParsedCsvResult {
  const lines = content.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { headerInvalid: false, parsed: [], errors: [] };

  const headerCols = lines[0].replace(/^﻿/, '').split(',').map((h) => h.trim().toLowerCase()).map((h) => ZH_HEADER_ALIAS[h] ?? h);
  const is7 = HEADER7.zh.every((col) => headerCols.includes(col.toLowerCase())) || HEADER7.en.every((col) => headerCols.includes(col.toLowerCase()));
  const is6 = HEADER6.zh.every((col) => headerCols.includes(col.toLowerCase())) || HEADER6.en.every((col) => headerCols.includes(col.toLowerCase()));
  if (!is7 && !is6) return { headerInvalid: true, parsed: [], errors: [] };

  const parsed: Expense[] = [];
  const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',').map((x) => x.trim());
    if (c.length < (is7 ? 7 : 6)) { errors.push(`第${i + 1}行:列数不足`); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c[0])) { errors.push(`第${i + 1}行:日期格式错误`); continue; }
    const amount = parseFloat(c[3]);
    if (isNaN(amount) || amount <= 0) { errors.push(`第${i + 1}行:金额无效`); continue; }
    if (!c[1]) { errors.push(`第${i + 1}行:类别为空`); continue; }
    if (!(c[5] || '').trim()) { errors.push(`第${i + 1}行:记录时间为空`); continue; }
    if (categories) {
      if (!categories.cat1Set.has(c[1])) {
        errors.push(`第${i + 1}行:类别"${c[1]}"不存在`);
        continue;
      }
      if (c[2] && categories.cat2Map[c[1]] && !categories.cat2Map[c[1]].has(c[2])) {
        errors.push(`第${i + 1}行:子类别"${c[2]}"不属于"${c[1]}"`);
        continue;
      }
    }
    parsed.push({
      type: is7 ? normalizeType(c[6]) : 'expense',
      amount,
      category1: c[1],
      category2: c[2] || '',
      date: c[0],
      note: c[4] || '',
      created_at: c[5]?.trim() || undefined,
    });
  }
  return { headerInvalid: false, parsed, errors };
}
