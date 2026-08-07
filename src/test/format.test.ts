import { describe, it, expect } from 'vitest';
import { formatAmount, splitDayTotals, balanceOf, isIncome } from '../format';
import type { Expense } from '../db';

describe('formatAmount 金额前缀', () => {
  it('支出 -¥ 两位小数', () => {
    expect(formatAmount('expense', 15)).toBe('-¥15.00');
  });
  it('收入 +¥', () => {
    expect(formatAmount('income', 8000.5)).toBe('+¥8000.50');
  });
  it('type 缺省按支出', () => {
    expect(formatAmount(undefined, 1)).toBe('-¥1.00');
  });
  it('金额四舍五入', () => {
    expect(formatAmount('income', 0.1 + 0.2)).toBe('+¥0.30');
  });
});

describe('isIncome 收支判定', () => {
  it('三种取值', () => {
    expect(isIncome({ type: 'income' })).toBe(true);
    expect(isIncome({ type: 'expense' })).toBe(false);
    expect(isIncome({})).toBe(false);
  });
});

describe('splitDayTotals 日合计拆分', () => {
  const mk = (amount: number, type?: Expense['type']): Expense => ({ amount, type, category1: '', category2: '', date: '2026-08-01', note: '' });

  it('纯支出', () => {
    expect(splitDayTotals([mk(15, 'expense'), mk(20, 'expense')])).toEqual({ expense: 35, income: 0 });
  });
  it('纯收入', () => {
    expect(splitDayTotals([mk(8000, 'income')])).toEqual({ expense: 0, income: 8000 });
  });
  it('同日收支混合', () => {
    expect(splitDayTotals([mk(100, 'expense'), mk(500, 'income'), mk(50, 'expense'), mk(200, 'income')]))
      .toEqual({ expense: 150, income: 700 });
  });
  it('空列表', () => {
    expect(splitDayTotals([])).toEqual({ expense: 0, income: 0 });
  });
  it('type 缺省视为支出（旧数据）', () => {
    expect(splitDayTotals([mk(30)])).toEqual({ expense: 30, income: 0 });
  });
});

describe('balanceOf 结余', () => {
  it('盈余', () => expect(balanceOf(100, 300)).toBe(200));
  it('超支', () => expect(balanceOf(300, 100)).toBe(-200));
  it('持平', () => expect(balanceOf(100, 100)).toBe(0));
  it('全零', () => expect(balanceOf(0, 0)).toBe(0));
});
