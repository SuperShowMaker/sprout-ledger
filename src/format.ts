// 青禾记账 - 金额展示纯逻辑（收支前缀/颜色标记/日合计拆分/结余）
import type { Expense, TxType } from './db';

// 金额前缀：支出 -¥、收入 +¥（颜色由 CSS class 控制）
export function formatAmount(type: TxType | undefined, amount: number): string {
  return `${type === 'income' ? '+' : '-'}¥${amount.toFixed(2)}`;
}

export function isIncome(exp: Pick<Expense, 'type'>): boolean {
  return exp.type === 'income';
}

// 日合计拆分：支出 / 收入（方向靠 type，金额恒为正）
export function splitDayTotals(expenses: Expense[]): { expense: number; income: number } {
  let expense = 0;
  let income = 0;
  for (const e of expenses) {
    if (e.type === 'income') income += e.amount;
    else expense += e.amount;
  }
  return { expense, income };
}

// 结余 = 收入 - 支出（正为盈余，负为超支）
export function balanceOf(expense: number, income: number): number {
  return income - expense;
}
