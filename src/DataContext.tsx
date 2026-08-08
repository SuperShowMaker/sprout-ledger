// 青禾记账 - 共享数据层
// 所有组件从这里拿数据，不再各自查 DB
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { getCategories, getStatsSummary, type Expense } from './db';

export type CategoryTree = { name: string; icon: string; children: string[] };

interface DataState {
  expenses: Expense[];
  categories: CategoryTree[];
  incomeCats: CategoryTree[];
  catIcons: Record<string, string>;
  monthTotal: number;
  monthCount: number;
  monthIncome: number;
  viewMonth: Dayjs;
  loading: boolean;
  tick: number;
  setViewMonth: (m: Dayjs) => void;
  refresh: () => void;
}

const DataContext = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<CategoryTree[]>([]);
  const [incomeCats, setIncomeCats] = useState<CategoryTree[]>([]);
  const [catIcons, setCatIcons] = useState<Record<string, string>>({});
  const [viewMonth, setViewMonth] = useState<Dayjs>(dayjs());
  const [monthTotal, setMonthTotal] = useState(0);
  const [monthCount, setMonthCount] = useState(0);
  const [monthIncome, setMonthIncome] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const monthStr = viewMonth.format('YYYY-MM');
        const [summary, income, cats, incomes] = await Promise.all([
          getStatsSummary(monthStr),
          getStatsSummary(monthStr, 'income'),
          getCategories('expense'),
          getCategories('income'),
        ]);
        if (cancelled) return;
        setMonthTotal(summary.total);
        setMonthCount(summary.count);
        setMonthIncome(income.total);
        setCategories(cats);
        setIncomeCats(incomes);
        const m: Record<string, string> = {};
        cats.forEach((c) => { m[c.name] = c.icon; });
        incomes.forEach((c) => { m[c.name] = c.icon; });
        setCatIcons(m);
      } catch (err) {
        console.error('DataContext 加载失败:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [viewMonth, tick]);

  return (
    <DataContext.Provider value={{ expenses: [], categories, incomeCats, catIcons, monthTotal, monthCount, monthIncome, viewMonth, loading, setViewMonth, refresh, tick }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be inside DataProvider');
  return ctx;
}
