// 青禾记账 - 统计页（绿色头部 + 趋势 + 排行榜）
import { useEffect, useMemo, useState } from 'react';
import { Spin } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { LineChart, Line, ReferenceLine, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getStatsSummary, getStatsByCategory, getStatsTrend, getStatsSummaryByRange, getStatsByCategoryRange, getStatsTrendRange, getStatsSubCategories, getStatsSubCategoriesRange, CatStat, TxType } from '../db';
import { useI18n } from '../i18n/I18nContext';
import { useData } from '../DataContext';
import { translateCategory } from '../i18n/categoryTranslations';

type StatsMode = 'year' | 'month' | 'week';

const COLORS = ['#7CB342', '#5C9BD5', '#F4A460', '#E57373', '#9575CD', '#4DB6AC', '#F06292', '#FFB74D', '#64B5F6', '#AED581'];

const fmtPct = (ratio: number) => {
  const pct = ratio * 100;
  if (pct <= 0) return '0%';
  if (pct < 0.1) return '<0.1%';
  return `${pct.toFixed(1)}%`;
};

// 金额：整数不带小数，非整数保留两位
const fmtAmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export default function MonthlyStats() {
  const { t, lang, darkMode } = useI18n();
  const { catIcons } = useData();

  const [mode, setMode] = useState<StatsMode>('month');
  const [date] = useState<Dayjs>(() => dayjs());
  const [loading, setLoading] = useState(true);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [statsType, setStatsType] = useState<TxType>('expense');
  const [typeOpen, setTypeOpen] = useState(false);
  const [cat1Totals, setCat1Totals] = useState<{ category: string; amount: number }[]>([]);
  const [trendData, setTrendData] = useState<{ date: string; amount: number }[]>([]);

  const [activeCat, setActiveCat] = useState<string | null>(null);

  // 折叠状态（记住上次展开）
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('sprout_expanded') || '{}'); } catch { return {}; }
  });

  const load = async () => {
    setLoading(true);
    try {
      let summary; let refSummary; let cats: CatStat[]; let trend: { date: string; amount: number }[];
      const primary = statsType;
      const ref = statsType === 'expense' ? 'income' : 'expense';
      switch (mode) {
        case 'month': {
          const m = date.format('YYYY-MM');
          [summary, refSummary, cats, trend] = await Promise.all([
            getStatsSummary(m, primary), getStatsSummary(m, ref), getStatsByCategory(m, primary),
            getStatsTrend(m, 'day', primary),
          ]);
          break;
        }
        case 'year': {
          const s = date.startOf('year').format('YYYY-MM-DD');
          const e = date.endOf('year').format('YYYY-MM-DD');
          [summary, refSummary, cats, trend] = await Promise.all([
            getStatsSummaryByRange(s, e, primary), getStatsSummaryByRange(s, e, ref), getStatsByCategoryRange(s, e, primary),
            getStatsTrendRange(s, e, 'month', primary),
          ]);
          break;
        }
        case 'week': {
          const s = date.startOf('week').format('YYYY-MM-DD');
          const e = date.endOf('week').format('YYYY-MM-DD');
          [summary, refSummary, cats, trend] = await Promise.all([
            getStatsSummaryByRange(s, e, primary), getStatsSummaryByRange(s, e, ref), getStatsByCategoryRange(s, e, primary),
            getStatsTrendRange(s, e, 'day', primary),
          ]);
          break;
        }
      }
      if (statsType === 'expense') { setExpenseTotal(summary.total); setIncomeTotal(refSummary.total); }
      else { setExpenseTotal(refSummary.total); setIncomeTotal(summary.total); }
      setCat1Totals(cats.map(c => ({ category: c.category, amount: c.amount })));
      setTrendData(trend);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); setExpanded({}); }, [mode, date, statsType]);

  const primaryTotal = statsType === 'expense' ? expenseTotal : incomeTotal;

  // 周期计数：周=7天 / 月=当月天数 / 年=12月；平均=总额/周期数
  const periodCount = mode === 'week' ? 7 : mode === 'year' ? 12 : date.daysInMonth();
  const avg = periodCount > 0 ? primaryTotal / periodCount : 0;
  const maxAmt = trendData.length > 0 ? Math.max(...trendData.map((p) => p.amount)) : 0;

  // 补全整个周期的趋势点：有记录日实心、无记录日空心
  const paddedTrend = useMemo(() => {
    const byDate = new Map(trendData.map((p) => [p.date, p.amount]));
    const points: { date: string; amount: number }[] = [];
    if (mode === 'week') {
      for (let i = 0; i < 7; i++) {
        const d = date.startOf('week').add(i, 'day');
        points.push({ date: d.format('YYYY-MM-DD'), amount: byDate.get(d.format('YYYY-MM-DD')) ?? 0 });
      }
    } else if (mode === 'month') {
      for (let i = 1; i <= date.daysInMonth(); i++) {
        const d = date.date(i);
        points.push({ date: d.format('YYYY-MM-DD'), amount: byDate.get(d.format('YYYY-MM-DD')) ?? 0 });
      }
    } else {
      for (let i = 0; i < 12; i++) {
        const m = date.startOf('year').add(i, 'month');
        points.push({ date: m.format('YYYY-MM'), amount: byDate.get(m.format('YYYY-MM')) ?? 0 });
      }
    }
    return points;
  }, [trendData, mode, date]);

  const maxAmount = cat1Totals[0]?.amount || 1;

  // 分类图标：DB 分类树 + 收入预设常量
  const iconOf = (cat: string) =>
    catIcons[cat] ?? (statsType === 'income' ? '💰' : '💸');

  // 懒加载子分类
  const [cat2Cache, setCat2Cache] = useState<Record<string, CatStat[]>>({});
  const loadCat2 = async (cat1: string) => {
    if (cat2Cache[cat1]) return;
    let subs: CatStat[];
    const m = date.format('YYYY-MM');
    if (mode === 'month') {
      subs = await getStatsSubCategories(m, cat1, statsType);
    } else {
      const s = mode === 'year' ? date.startOf('year').format('YYYY-MM-DD') : date.startOf('week').format('YYYY-MM-DD');
      const e = mode === 'year' ? date.endOf('year').format('YYYY-MM-DD') : date.endOf('week').format('YYYY-MM-DD');
      subs = await getStatsSubCategoriesRange(s, e, cat1, statsType);
    }
    setCat2Cache(prev => ({ ...prev, [cat1]: subs }));
  };
  const getCat2 = (cat1: string) => cat2Cache[cat1] || [];

  useEffect(() => { setCat2Cache({}); }, [mode, date, statsType]);

  const toggleExpand = (cat: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [cat]: !prev[cat] };
      localStorage.setItem('sprout_expanded', JSON.stringify(next));
      return next;
    });
    loadCat2(cat);
  };

  const periodLabel = mode === 'week' ? t('stats.periodWeek') : mode === 'year' ? t('stats.periodYear') : t('stats.periodMonth');

  return (
    <div>
      {/* 收支切换 + 周/月/年分段 */}
      <div className="stats-type-dd">
        <button type="button" className="stats-type-btn" onClick={() => setTypeOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={typeOpen}>
          <span>{t(statsType === 'income' ? 'form.income' : 'form.expense')}</span>
          <span className={`stats-type-caret${typeOpen ? ' open' : ''}`}><DownOutlined /></span>
        </button>
        {typeOpen && (
          <>
            <div className="stats-type-mask" onClick={() => setTypeOpen(false)} />
            <div className="stats-type-menu" role="listbox">
              {(['expense', 'income'] as TxType[]).map((v) => (
                <div
                  key={v}
                  role="option"
                  aria-selected={statsType === v}
                  className={`stats-type-item${statsType === v ? ' active' : ''}`}
                  onClick={() => { setStatsType(v); setTypeOpen(false); }}
                >
                  {t(v === 'income' ? 'form.income' : 'form.expense')}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="stats-seg">
        {(['week', 'month', 'year'] as StatsMode[]).map((m) => (
          <span key={m} className={`stats-seg-item${mode === m ? ' active' : ''}`} onClick={() => setMode(m)}>
            {m === 'week' ? (lang === 'zh' ? '周' : 'Week') : m === 'month' ? (lang === 'zh' ? '月' : 'Month') : (lang === 'zh' ? '年' : 'Year')}
          </span>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
      ) : expenseTotal === 0 && incomeTotal === 0 ? (
        <div className="empty-stats"><div className="empty-icon">📊</div><p>{t('stats.noData', { period: '' })}</p></div>
      ) : statsType === 'income' && incomeTotal === 0 ? (
        <div className="empty-stats"><div className="empty-icon">💰</div><p>{lang === 'zh' ? '本期暂无收入' : 'No income this period'}</p></div>
      ) : (
        <>
          {/* 汇总 + 趋势卡 */}
          <div className="stats-section-card">
            <div className="stats-summary-head">
              <span className="stats-summary-period">{periodLabel}</span>
            </div>
            <div className="stats-summary-lines">
              <div>{statsType === 'expense' ? t('stats.total') : t('stats.totalIncome')}：{primaryTotal.toFixed(2)}</div>
              <div>{t('stats.avg')}：{avg.toFixed(2)}</div>
            </div>
            {paddedTrend.length > 1 ? (
              (() => {
                const dense = paddedTrend.length > 15;
                const tickInterval = dense ? Math.ceil(paddedTrend.length / 6) : 0;
                const lineColor = statsType === 'income' ? '#5C9BD5' : '#52c41a';
                return (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={paddedTrend} margin={{ top: 18, right: 8, bottom: 0, left: 8 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={tickInterval} axisLine={false} tickLine={false}
                      tickFormatter={(v: string) => mode === 'year' ? (lang === 'zh' ? v.slice(5) + '月' : dayjs(v).format('MMM')) : v.slice(5)} />
                    <Tooltip
                      content={({ payload }) => {
                        if (!payload?.length) return null;
                        const d = payload[0].payload;
                        const label = mode === 'year'
                          ? (lang === 'zh' ? d.date.slice(0,7).replace('-','年')+'月' : dayjs(d.date).format('MMMM YYYY'))
                          : d.date;
                        return (
                          <div style={{
                            background: darkMode ? '#2d2d2d' : '#fff',
                            border: 'none', borderRadius: 8,
                            padding: '6px 10px',
                            boxShadow: '0 3px 12px rgba(0,0,0,0.1)',
                            textAlign: 'center',
                          }}>
                            <div style={{ fontSize: 11, color: darkMode ? '#888' : '#999', marginBottom: 2 }}>
                              {label}
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: darkMode ? '#e8e8e8' : '#333' }}>
                              ¥{d.amount.toFixed(2)}
                            </div>
                          </div>
                        );
                      }} />
                    <ReferenceLine y={avg} stroke={lineColor} strokeOpacity={0.55} strokeDasharray="4 4" />
                    <ReferenceLine y={maxAmt} stroke={darkMode ? '#555' : '#ddd'} strokeDasharray="4 4"
                      label={{ value: maxAmt.toFixed(2), position: 'insideTopRight', fontSize: 11, fill: darkMode ? '#888' : '#999' }} />
                    <Line type="monotone" dataKey="amount" stroke={lineColor} strokeWidth={2}
                      dot={(p: any) => (
                        <circle cx={p.cx} cy={p.cy} r={dense ? 2.5 : 4}
                          fill={(p.payload && p.payload.amount > 0) ? lineColor : (darkMode ? '#252525' : '#fff')}
                          stroke={lineColor} strokeWidth={1.5} />
                      )}
                      activeDot={{ r: 5, fill: lineColor, stroke: '#fff', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
                );
              })()
            ) : (
              <div style={{ textAlign: 'center', padding: 16, color: '#ccc', fontSize: 13 }}>
                {mode === 'year'
                  ? (lang === 'zh' ? '需要至少2个月数据才能生成趋势图' : 'Need at least 2 months of data for trend chart')
                  : t('stats.trendNeedMore')}
              </div>
            )}
          </div>

          {/* 排行榜卡：图标 + 名称/百分比 + 金额 + 进度条，点击展开子分类 */}
          {cat1Totals.length > 0 && (
            <div className="stats-section-card">
              <div className="stats-section-title">
                {statsType === 'expense' ? t('stats.rankExpense') : t('stats.rankIncome')}
              </div>
          {cat1Totals.map((cat, ci) => {
            // 收入分类无子类，禁用展开下钻
            const expandable = statsType === 'expense';
            const isOpen = expandable && expanded[cat.category];
            const subs = expandable ? getCat2(cat.category) : [];
            const barColor = COLORS[ci % COLORS.length];
            return (
              <div key={cat.category} className="rank-group">
                <div
                  className={`rank-row${expandable ? '' : ' static'}${expandable && activeCat === cat.category ? ' highlighted' : ''}`}
                  onClick={expandable ? () => { toggleExpand(cat.category); setActiveCat(activeCat === cat.category ? null : cat.category); } : undefined}
                >
                  <span className="rank-icon" style={{ background: `${barColor}1f` }}>{iconOf(cat.category)}</span>
                  <div className="rank-main">
                    <div className="rank-top">
                      <span className="rank-name">{translateCategory(lang, cat.category)}</span>
                      <span className="rank-pct">{fmtPct(cat.amount / primaryTotal)}</span>
                      <span className="rank-amount">{fmtAmt(cat.amount)}</span>
                      {expandable && (
                        <span className="rank-caret" style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}><DownOutlined /></span>
                      )}
                    </div>
                    <div className="rank-bar-wrap">
                      <div className="rank-bar" style={{ width: `${(cat.amount / maxAmount) * 100}%`, background: barColor }} />
                    </div>
                  </div>
                </div>
                {expandable && (
                  <div className={`cat-list-subs ${isOpen ? 'open' : ''}`}>
                    {subs.map((sub) => (
                      <div key={sub.category} className="cat-list-sub-row">
                        <span className="cat-list-sub-name">{translateCategory(lang, sub.category) || (lang === 'zh' ? '未归类' : 'Uncategorized')}</span>
                        <span className="cat-list-sub-amount">
                          ¥{sub.amount.toFixed(0)}
                          <span style={{ fontSize: 11, color: '#bbb', marginLeft: 4 }}>{fmtPct(sub.amount / cat.amount)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
