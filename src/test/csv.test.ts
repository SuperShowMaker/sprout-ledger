import { describe, it, expect } from 'vitest';
import { buildExportRow, parseImportCsv, normalizeType, typeLabel } from '../csv';
import type { Expense } from '../db';

const cats = {
  cat1Set: new Set(['餐饮饮食', '工资收入']),
  cat2Map: { '餐饮饮食': new Set(['早餐']) },
};

describe('normalizeType 类型归一化', () => {
  it('收入/income（含大小写空格）→ income', () => {
    expect(normalizeType('收入')).toBe('income');
    expect(normalizeType('income')).toBe('income');
    expect(normalizeType(' Income ')).toBe('income');
    expect(normalizeType('INCOME')).toBe('income');
  });
  it('支出/expense/空/未知 → expense', () => {
    expect(normalizeType('支出')).toBe('expense');
    expect(normalizeType('expense')).toBe('expense');
    expect(normalizeType('')).toBe('expense');
    expect(normalizeType(undefined)).toBe('expense');
    expect(normalizeType('xyz')).toBe('expense');
    expect(normalizeType('转账')).toBe('expense'); // 未来类型兜底
  });
});

describe('typeLabel 本地化', () => {
  it('收支中英', () => {
    expect(typeLabel('income', 'zh')).toBe('收入');
    expect(typeLabel('income', 'en')).toBe('Income');
    expect(typeLabel('expense', 'zh')).toBe('支出');
    expect(typeLabel('expense', 'en')).toBe('Expense');
  });
});

describe('buildExportRow 7列导出', () => {
  it('支出行（含 \t 前缀防 Excel 截断）', () => {
    const exp: Expense = { amount: 15.5, category1: '餐饮饮食', category2: '早餐', date: '2026-08-01', note: '', created_at: '2026-08-01 10:00:00.123', type: 'expense' };
    expect(buildExportRow(exp, 'zh')).toBe('2026-08-01,餐饮饮食,早餐,15.50,,\t2026-08-01 10:00:00.123,支出');
  });
  it('收入行', () => {
    const exp: Expense = { amount: 8000, category1: '工资收入', category2: '', date: '2026-08-01', note: '', created_at: '2026-08-01 09:00:00.000', type: 'income' };
    expect(buildExportRow(exp, 'zh')).toBe('2026-08-01,工资收入,,8000.00,,\t2026-08-01 09:00:00.000,收入');
  });
  it('备注逗号替换为全角，列数保持 7', () => {
    const exp: Expense = { amount: 1, category1: '餐饮饮食', category2: '', date: '2026-08-01', note: 'a,b', created_at: 't', type: 'expense' };
    const row = buildExportRow(exp, 'zh');
    expect(row.split(',').length).toBe(7);
    expect(row).toContain('a，b');
  });
  it('缺省 type 按支出导出', () => {
    const exp: Expense = { amount: 1, category1: '餐饮饮食', category2: '', date: '2026-08-01', note: '', created_at: 't' };
    expect(buildExportRow(exp, 'zh')).toContain(',支出');
  });
  it('公式前缀（=+-@）加 \' 前缀，防 Excel 当公式执行', () => {
    const exp: Expense = { amount: 1, category1: '@营销', category2: '', date: '2026-08-01', note: '=cmd|计算', created_at: 't', type: 'expense' };
    const cells = buildExportRow(exp, 'zh').split(',');
    expect(cells[1]).toBe("'@营销");
    expect(cells[4]).toBe("'=cmd|计算");
  });
  it('含引号字段双引号包裹、内部引号双写', () => {
    const exp: Expense = { amount: 1, category1: '餐饮饮食', category2: '', date: '2026-08-01', note: 'say "hi"', created_at: 't', type: 'expense' };
    expect(buildExportRow(exp, 'zh')).toContain('"say ""hi"""');
  });
});

describe('parseImportCsv 导入解析', () => {
  it('7列收入 round-trip：类型还原', () => {
    const csv = [
      '日期,一级分类,二级分类,金额,备注,记录时间,类型',
      '2026-08-01,工资收入,,8000,,\t2026-08-01 09:00:00.000,收入',
    ].join('\n');
    const r = parseImportCsv(csv, cats);
    expect(r.headerInvalid).toBe(false);
    expect(r.errors).toEqual([]);
    expect(r.parsed.length).toBe(1);
    expect(r.parsed[0]).toMatchObject({ type: 'income', amount: 8000, category1: '工资收入', category2: '', date: '2026-08-01' });
  });

  it('6列旧文件 → 全部视为支出（行为不变）', () => {
    const csv = [
      '日期,一级分类,二级分类,金额,备注,记录时间',
      '2026-08-01,餐饮饮食,早餐,15,,2026-08-01 10:00:00.123',
    ].join('\n');
    const r = parseImportCsv(csv, cats);
    expect(r.parsed.length).toBe(1);
    expect(r.parsed[0].type).toBe('expense');
  });

  it('英文 7 列表头 + Income 值', () => {
    const csv = [
      'Date,Category1,Category2,Amount,Note,CreatedAt,Type',
      '2026-08-01,工资收入,,5000,,2026-08-01 09:00:00.000,Income',
    ].join('\n');
    const r = parseImportCsv(csv, cats);
    expect(r.parsed[0].type).toBe('income');
  });

  it('BOM 头兼容', () => {
    const csv = '﻿日期,一级分类,二级分类,金额,备注,记录时间,类型\n2026-08-01,工资收入,,1,,t,收入';
    expect(parseImportCsv(csv, cats).parsed[0].type).toBe('income');
  });

  it('非法表头', () => {
    const r = parseImportCsv('日期,金额\n2026-08-01,15', cats);
    expect(r.headerInvalid).toBe(true);
    expect(r.parsed).toEqual([]);
  });

  it('7列类型列为空 → 默认支出', () => {
    const csv = '日期,一级分类,二级分类,金额,备注,记录时间,类型\n2026-08-01,餐饮饮食,早餐,15,,t,';
    expect(parseImportCsv(csv, cats).parsed[0].type).toBe('expense');
  });

  it('7列未知类型值 → 默认支出', () => {
    const csv = '日期,一级分类,二级分类,金额,备注,记录时间,类型\n2026-08-01,餐饮饮食,早餐,15,,t,xyz';
    expect(parseImportCsv(csv, cats).parsed[0].type).toBe('expense');
  });

  it('空文件', () => {
    const r = parseImportCsv('日期,一级分类,二级分类,金额,备注,记录时间,类型');
    expect(r.parsed).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it('行错误不影响正确行（边界逐类）', () => {
    const csv = [
      '日期,一级分类,二级分类,金额,备注,记录时间,类型',
      '2026-08-01,工资收入,,8000,,t,收入',          // 正确
      '2026/08/02,餐饮饮食,早餐,15,,t,支出',        // 日期格式错误
      '2026-08-03,餐饮饮食,早餐,-5,,t,支出',        // 负金额
      '2026-08-04,餐饮饮食,早餐,0,,t,支出',         // 零金额
      '2026-08-05,不存在分类,,10,,t,支出',           // 分类不存在
      '2026-08-06,餐饮饮食,早餐,15,,,支出',          // 记录时间为空
      '2026-08-07,餐饮饮食,水电,15,,t,支出',         // 子分类不属于大类
      '2026-08-08,餐饮饮食,早餐',                     // 列数不足
    ].join('\n');
    const r = parseImportCsv(csv, cats);
    expect(r.parsed.length).toBe(1);
    expect(r.parsed[0].type).toBe('income');
    expect(r.errors.length).toBe(7);
  });

  it('不传分类校验则宽松通过', () => {
    const csv = '日期,一级分类,二级分类,金额,备注,记录时间,类型\n2026-08-01,任意分类,,100,,t,收入';
    const r = parseImportCsv(csv);
    expect(r.parsed[0].type).toBe('income');
  });

  it('导出→解析 round-trip 全字段一致（新表头）', () => {
    const exp: Expense = { amount: 88.5, category1: '工资收入', category2: '', date: '2026-08-02', note: '八月工资', created_at: '2026-08-02 08:00:00.001', type: 'income' };
    const header = '日期,一级类别,二级类别,金额,备注,记录时间,类型';
    const r = parseImportCsv(`${header}\n${buildExportRow(exp, 'zh')}`, cats);
    expect(r.parsed[0]).toMatchObject({ type: 'income', amount: 88.5, category1: '工资收入', date: '2026-08-02', note: '八月工资', created_at: '2026-08-02 08:00:00.001' });
  });

  it('新表头「一级类别/二级类别」正常解析', () => {
    const csv = [
      '日期,一级类别,二级类别,金额,备注,记录时间,类型',
      '2026-08-01,餐饮饮食,早餐,15,,t,支出',
    ].join('\n');
    const r = parseImportCsv(csv, cats);
    expect(r.headerInvalid).toBe(false);
    expect(r.parsed[0]).toMatchObject({ type: 'expense', category1: '餐饮饮食', category2: '早餐', amount: 15 });
  });

  it('旧表头「一级分类/二级分类」仍可导入（别名兼容）', () => {
    const csv = [
      '日期,一级分类,二级分类,金额,备注,记录时间,类型',
      '2026-08-01,餐饮饮食,早餐,15,,t,支出',
    ].join('\n');
    const r = parseImportCsv(csv, cats);
    expect(r.headerInvalid).toBe(false);
    expect(r.parsed[0]).toMatchObject({ type: 'expense', category1: '餐饮饮食', category2: '早餐', amount: 15 });
  });

  it('导出→导入 round-trip：公式防护前缀不泄漏进数据', () => {
    const exp: Expense = { amount: 1, category1: '工资收入', category2: '', date: '2026-08-01', note: '=cmd', created_at: '2026-08-01 09:00:00.000', type: 'income' };
    const r = parseImportCsv(`日期,一级类别,二级类别,金额,备注,记录时间,类型\n${buildExportRow(exp, 'zh')}`, cats);
    expect(r.parsed[0]).toMatchObject({ type: 'income', category1: '工资收入', note: '=cmd' });
  });
});
