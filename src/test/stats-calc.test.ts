import { describe, it, expect } from 'vitest';

// 统计计算逻辑（纯函数，从MonthlyStats抽取）
interface Expense { amount: number; category1: string; category2: string; date: string; }

function calcCategoryTotals(data: Expense[]) {
  const m: Record<string, number> = {};
  data.forEach(e => { m[e.category1] = (m[e.category1]||0) + e.amount; });
  return Object.entries(m).sort((a,b) => b[1]-a[1]).map(([k,v]) => ({ category:k, amount:v }));
}

function calcDailyAvg(total: number, dayCount: number) {
  return dayCount > 0 ? total / dayCount : 0;
}

function calcTrendDaily(data: Expense[]) {
  const m: Record<string, number> = {};
  data.forEach(e => { m[e.date] = (m[e.date]||0) + e.amount; });
  return Object.entries(m).sort((a,b) => a[0].localeCompare(b[0])).map(([d,a]) => ({ date:d, amount:Math.round(a*100)/100 }));
}

function calcTrendMonthly(data: Expense[]) {
  const m: Record<string, number> = {};
  data.forEach(e => { const k = e.date.slice(0,7); m[k] = (m[k]||0) + e.amount; });
  return Object.entries(m).sort((a,b) => a[0].localeCompare(b[0])).map(([d,a]) => ({ date:d, amount:Math.round(a*100)/100 }));
}

describe('统计计算', () => {
  const sample: Expense[] = [
    { amount: 15, category1: '餐饮饮食', category2: '早餐', date: '2026-07-01' },
    { amount: 30, category1: '餐饮饮食', category2: '午餐', date: '2026-07-01' },
    { amount: 20, category1: '交通出行', category2: '打车', date: '2026-07-02' },
    { amount: 100, category1: '购物消费', category2: '数码电器', date: '2026-07-03' },
    { amount: 50, category1: '餐饮饮食', category2: '外卖', date: '2026-07-03' },
  ];

  it('分类汇总正确', () => {
    const cats = calcCategoryTotals(sample);
    expect(cats[0].category).toBe('购物消费');
    expect(cats[0].amount).toBe(100);
    expect(cats[1].category).toBe('餐饮饮食');
    expect(cats[1].amount).toBe(95); // 15+30+50
    expect(cats.length).toBe(3);
  });

  it('日均支出', () => {
    expect(calcDailyAvg(215, 31)).toBeCloseTo(6.94, 1);
    expect(calcDailyAvg(0, 31)).toBe(0);
    expect(calcDailyAvg(100, 7)).toBeCloseTo(14.29, 1);
  });

  it('天趋势汇总', () => {
    const trend = calcTrendDaily(sample);
    expect(trend.length).toBe(3); // 3个不同日期
    expect(trend[0].date).toBe('2026-07-01');
    expect(trend[0].amount).toBe(45); // 15+30
    expect(trend[2].amount).toBe(150); // 100+50
  });

  it('月趋势汇总', () => {
    const trend = calcTrendMonthly(sample);
    expect(trend.length).toBe(1);
    expect(trend[0].date).toBe('2026-07');
    expect(trend[0].amount).toBe(215);
  });

  it('空数据', () => {
    expect(calcCategoryTotals([]).length).toBe(0);
    expect(calcTrendDaily([]).length).toBe(0);
    expect(calcDailyAvg(0, 30)).toBe(0);
  });

  it('单笔数据', () => {
    const one: Expense[] = [{ amount: 100, category1: '餐饮饮食', category2: '早餐', date: '2026-07-01' }];
    expect(calcCategoryTotals(one).length).toBe(1);
    expect(calcTrendDaily(one).length).toBe(1);
  });
});
