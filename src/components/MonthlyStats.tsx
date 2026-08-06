// 青禾记账 - 统计页（饼图展示 + 折叠列表）
import { useEffect, useState } from 'react';
import { Button, Spin } from 'antd';
import { LeftOutlined, RightOutlined, DownOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { PieChart, Pie, Cell, Sector, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { PieSectorDataItem } from 'recharts/types/polar/Pie';
import { getStatsSummary, getStatsByCategory, getStatsTrend, getStatsSummaryByRange, getStatsByCategoryRange, getStatsTrendRange, getStatsSubCategories, getStatsSubCategoriesRange, getSetting as getDbSetting, CatStat } from '../db';
import { useI18n } from '../i18n/I18nContext';
import { translateCategory } from '../i18n/categoryTranslations';

type StatsMode = 'year' | 'month' | 'week';

const COLORS = ['#7CB342', '#5C9BD5', '#F4A460', '#E57373', '#9575CD', '#4DB6AC', '#F06292', '#FFB74D', '#64B5F6', '#AED581'];

// 活跃扇区：描边高亮，完全不动尺寸（零空隙）
const PieActiveShape = (props: PieSectorDataItem) => {
  const { cx = 0, cy = 0, innerRadius = 0, outerRadius = 0, startAngle = 0, endAngle = 0, fill } = props;
  return (
    <Sector
      cx={cx} cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
      stroke="#fff"
      strokeWidth={2}
    />
  );
};

const getSetting = (key: string, def: boolean): boolean => {
  try { const v = localStorage.getItem(`sprout_${key}`); return v !== null ? v === '1' : def; } catch { return def; }
};

const fmtPct = (ratio: number) => {
  const pct = ratio * 100;
  if (pct <= 0) return '0%';
  if (pct < 1) return '<1%';
  return `${pct.toFixed(0)}%`;
};

export default function MonthlyStats() {
  const { t, lang, darkMode } = useI18n();

  const [mode, setMode] = useState<StatsMode>('month');
  const [date, setDate] = useState<Dayjs>(() => {
    try {
      const saved = sessionStorage.getItem('sprout_stats_date');
      return saved ? dayjs(saved) : dayjs();
    } catch { return dayjs(); }
  });
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [count, setCount] = useState(0);
  const [maxSingle, setMaxSingle] = useState(0);
  const [cat1Totals, setCat1Totals] = useState<{ category: string; amount: number }[]>([]);
  const [trendData, setTrendData] = useState<{ date: string; amount: number }[]>([]);
  const [totalBudget, setTotalBudget] = useState(0); // 单一规则值，月模式展示预算执行

  const [showPie, setShowPie] = useState(() => getSetting('stats_showPie', false));
  const [showTrend, setShowTrend] = useState(() => getSetting('stats_showTrend', false));
  const [showDailyAvg, setShowDailyAvg] = useState(() => getSetting('stats_showDailyAvg', false));
  const [activeCat, setActiveCat] = useState<string | null>(null);

  useEffect(() => {
    const onStorage = () => {
      setShowPie(getSetting('stats_showPie', false));
      setShowTrend(getSetting('stats_showTrend', false));
      setShowDailyAvg(getSetting('stats_showDailyAvg', false));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // 折叠状态（记住上次展开）
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('sprout_expanded') || '{}'); } catch { return {}; }
  });

  const load = async () => {
    setLoading(true);
    try {
      let summary; let cats: CatStat[]; let trend: { date: string; amount: number }[];
      switch (mode) {
        case 'month': {
          const m = date.format('YYYY-MM');
          [summary, cats, trend] = await Promise.all([
            getStatsSummary(m), getStatsByCategory(m),
            getStatsTrend(m, 'day'),
          ]);
          break;
        }
        case 'year': {
          const s = date.startOf('year').format('YYYY-MM-DD');
          const e = date.endOf('year').format('YYYY-MM-DD');
          [summary, cats, trend] = await Promise.all([
            getStatsSummaryByRange(s, e), getStatsByCategoryRange(s, e),
            getStatsTrendRange(s, e, 'month'),
          ]);
          break;
        }
        case 'week': {
          const s = date.startOf('week').format('YYYY-MM-DD');
          const e = date.endOf('week').format('YYYY-MM-DD');
          [summary, cats, trend] = await Promise.all([
            getStatsSummaryByRange(s, e), getStatsByCategoryRange(s, e),
            getStatsTrendRange(s, e, 'day'),
          ]);
          break;
        }
      }
      setTotal(summary.total);
      setCount(summary.count);
      setMaxSingle(summary.maxSingle);
      setCat1Totals(cats.map(c => ({ category: c.category, amount: c.amount })));
      setTrendData(trend);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); setExpanded({}); }, [mode, date]);
  useEffect(() => {
    getDbSetting('total_budget').then((v) => setTotalBudget(v ? parseFloat(v) || 0 : 0)).catch(() => {});
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem('sprout_stats_date', date.format('YYYY-MM-DD')); } catch {}
  }, [date]);

  // 环形图数据：<3% 合并为「其他」
  const donutData = (() => {
    const threshold = total * 0.03;
    const main = cat1Totals.filter(c => c.amount >= threshold);
    const other = cat1Totals.filter(c => c.amount < threshold);
    const otherTotal = other.reduce((s, c) => s + c.amount, 0);
    if (other.length > 0 && otherTotal > 0) {
      main.push({ category: lang === 'zh' ? '其他' : 'Others', amount: otherTotal });
    }
    return main;
  })();

  const maxAmount = cat1Totals[0]?.amount || 1;
  const year = date.year();
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const dayCount = mode === 'week' ? 7 : mode === 'year' ? (isLeap ? 366 : 365) : date.daysInMonth();
  const dailyAvg = count > 0 ? total / dayCount : 0;

  // 概览卡：预算执行派生（月模式 + 已设总预算时有效）
  const overviewPct = mode === 'month' && totalBudget > 0 ? (total / totalBudget) * 100 : 0;
  const overviewRemaining = totalBudget - total;
  const overviewColor = overviewPct >= 100 ? '#ff4d4f' : overviewPct >= 80 ? '#faad14' : '#52c41a';

  // 懒加载子分类
  const [cat2Cache, setCat2Cache] = useState<Record<string, CatStat[]>>({});
  const loadCat2 = async (cat1: string) => {
    if (cat2Cache[cat1]) return;
    let subs: CatStat[];
    const m = date.format('YYYY-MM');
    if (mode === 'month') {
      subs = await getStatsSubCategories(m, cat1);
    } else {
      const s = mode === 'year' ? date.startOf('year').format('YYYY-MM-DD') : date.startOf('week').format('YYYY-MM-DD');
      const e = mode === 'year' ? date.endOf('year').format('YYYY-MM-DD') : date.endOf('week').format('YYYY-MM-DD');
      subs = await getStatsSubCategoriesRange(s, e, cat1);
    }
    setCat2Cache(prev => ({ ...prev, [cat1]: subs }));
  };
  const getCat2 = (cat1: string) => cat2Cache[cat1] || [];

  useEffect(() => { setCat2Cache({}); }, [mode, date]);

  const toggleExpand = (cat: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [cat]: !prev[cat] };
      localStorage.setItem('sprout_expanded', JSON.stringify(next));
      return next;
    });
    loadCat2(cat);
  };

  return (
    <div>
      {/* 模式药丸 */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
        <div className="mode-pills">
          {(['week', 'month', 'year'] as StatsMode[]).map((m) => (
            <span key={m} className={`mode-pill ${mode === m ? 'active' : ''}`} onClick={() => { setMode(m); setDate(dayjs()); }}>
              {m === 'week' ? (lang === 'zh' ? '周' : 'W') : m === 'month' ? (lang === 'zh' ? '月' : 'M') : (lang === 'zh' ? '年' : 'Y')}
            </span>
          ))}
        </div>
      </div>
      {/* 日期导航 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
        <Button type="text" size="small" icon={<LeftOutlined />} onClick={() => setDate(date.subtract(1, mode === 'year' ? 'year' : mode === 'month' ? 'month' : 'week'))} />
        <span style={{ fontSize: 15, fontWeight: 600, minWidth: 120, textAlign: 'center' }}>
          {mode === 'year' ? date.format(lang === 'zh' ? 'YYYY年' : 'YYYY') :
           mode === 'month' ? date.format(lang === 'zh' ? 'YYYY年M月' : 'MMMM YYYY') :
           (() => { const s = date.startOf('week'); const e = date.endOf('week'); return lang === 'zh' ? `${s.format('M月D日')} - ${e.format('M月D日')}` : `${s.format('MMM D')} - ${e.format('MMM D')}`; })()}
        </span>
        <Button type="text" size="small" icon={<RightOutlined />} onClick={() => setDate(date.add(1, mode === 'year' ? 'year' : mode === 'month' ? 'month' : 'week'))} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
      ) : total === 0 ? (
        <div className="empty-stats"><div className="empty-icon">📊</div><p>{t('stats.noData', { period: '' })}</p></div>
      ) : (
        <>
          {/* 本月概览大卡：总支出 + 笔数/日均/最大 + 预算执行 */}
          <div className="stats-overview">
            <div className="stats-overview-top">
              <div>
                <div className="stats-overview-label">{t('stats.total')}</div>
                <div className="stats-overview-amount">¥{total.toFixed(2)}</div>
              </div>
              {mode === 'month' && totalBudget > 0 && (
                <svg width="76" height="76" viewBox="0 0 76 76" className="stats-overview-ring">
                  <circle cx="38" cy="38" r={26} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="8" />
                  <circle cx="38" cy="38" r={26} fill="none" stroke={overviewColor} strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${(Math.min(overviewPct, 100) / 100) * (2 * Math.PI * 26)} ${2 * Math.PI * 26}`} transform="rotate(-90 38 38)" />
                  <text x="38" y="41" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 15, fontWeight: 700, fill: overviewColor }}>
                    {overviewPct >= 1000 ? `${Math.round(overviewPct / 100)}×` : `${overviewPct.toFixed(0)}%`}
                  </text>
                </svg>
              )}
            </div>
            <div className="stats-overview-meta">
              <span>{t('stats.count')} {count}</span>
              {showDailyAvg && (
                <>
                  <span>· {lang === 'zh' ? '日均' : 'Daily'} ¥{dailyAvg.toFixed(0)}</span>
                  <span>· {lang === 'zh' ? '最大' : 'Max'} ¥{maxSingle.toFixed(0)}</span>
                </>
              )}
            </div>
            {mode === 'month' && totalBudget > 0 && (
              <div className="stats-overview-budget">
                <div className="budget-bar">
                  <div className="budget-bar-fill" style={{ width: `${Math.min(overviewPct, 100)}%`, background: overviewColor }} />
                </div>
                <div className="stats-overview-budget-foot" style={{ color: overviewRemaining < 0 ? '#ff4d4f' : undefined }}>
                  {t('budget.total')} ¥{totalBudget.toFixed(0)} · {overviewRemaining < 0
                    ? t('budget.overShort', { amount: Math.abs(overviewRemaining).toFixed(0) })
                    : `${t('budget.remaining')} ¥${overviewRemaining.toFixed(0)}`}
                </div>
              </div>
            )}
          </div>

          {/* 环形图：小类合并为「其他」，点扇区联动下方列表 */}
          {showPie && (
            <ResponsiveContainer width="100%" height={220} style={{ marginTop: 16 }}>
              <PieChart>
                <Pie
                  data={donutData.map(c => ({ ...c, category: translateCategory(lang, c.category) }))}
                  dataKey="amount" nameKey="category" cx="50%" cy="50%"
                  innerRadius={55} outerRadius={85}
                  activeShape={PieActiveShape}
                  onClick={(_, i) => {
                    const cat = donutData[i]?.category;
                    if (activeCat === cat) {
                      setActiveCat(null);
                      setExpanded({});
                    } else {
                      setActiveCat(cat);
                      if (cat && cat !== (lang === 'zh' ? '其他' : 'Others')) {
                        setExpanded({ [cat]: true });
                        loadCat2(cat);
                        // 最低限度滚动：仅暴露被遮挡的子类
                        setTimeout(() => {
                          const row = document.querySelector('.cat-list-row.highlighted');
                          const group = row?.closest('.cat-list-group') as HTMLElement | null;
                          if (!group) return;
                          const container = group.closest('.app-content') as HTMLElement;
                          if (!container) return;
                          const gBottom = group.getBoundingClientRect().bottom;
                          const cBottom = container.getBoundingClientRect().bottom;
                          const hidden = gBottom - cBottom;
                          if (hidden > 0) {
                            container.scrollBy({ top: hidden + 8, behavior: 'smooth' });
                          }
                        }, 150);
                      }
                    }
                  }}
                  label={false}
                  style={{ cursor: 'pointer' }}>
                  {donutData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                {/* 圆心总额 */}
                <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle"
                  style={{ fontSize: 13, fill: darkMode ? '#888' : '#999' }}>
                  {t('stats.total')}
                </text>
                <text x="50%" y="53%" textAnchor="middle" dominantBaseline="middle"
                  style={{ fontSize: 18, fontWeight: 700, fill: darkMode ? '#e8e8e8' : '#333' }}>
                  ¥{total.toFixed(0)}
                </text>
              </PieChart>
            </ResponsiveContainer>
          )}

          {/* 折叠列表 */}
          {cat1Totals.map((cat, ci) => {
            const isOpen = expanded[cat.category];
            const subs = getCat2(cat.category);
            const barColor = COLORS[ci % COLORS.length];
            return (
              <div key={cat.category} className="cat-list-group">
                <div className={`cat-list-row${activeCat === cat.category ? ' highlighted' : ''}`} onClick={() => { toggleExpand(cat.category); setActiveCat(activeCat === cat.category ? null : cat.category); }}>
                  <span className="cat-list-icon" style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.25s', display: 'inline-block' }}><DownOutlined /></span>
                  <span className="cat-list-name">{translateCategory(lang, cat.category)}</span>
                  <span className="cat-list-bar-wrap">
                    <div className="cat-list-bar" style={{ width: `${(cat.amount / maxAmount) * 100}%`, background: barColor }} />
                  </span>
                  <span className="cat-list-amount">
                    ¥{cat.amount.toFixed(0)}
                    <span style={{ fontSize: 11, color: '#999', marginLeft: 4 }}>{fmtPct(cat.amount / total)}</span>
                  </span>
                </div>
                <div className={`cat-list-subs ${isOpen ? 'open' : ''}`}>
                  {subs.map((sub) => (
                    <div key={sub.category} className="cat-list-sub-row">
                      <span className="cat-list-sub-name">{translateCategory(lang, sub.category) || (lang === 'zh' ? '未分类' : 'Uncategorized')}</span>
                      <span className="cat-list-sub-amount">
                        ¥{sub.amount.toFixed(0)}
                        <span style={{ fontSize: 11, color: '#bbb', marginLeft: 4 }}>{fmtPct(sub.amount / cat.amount)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* 趋势图 */}
          {showTrend && trendData.length > 1 && (() => {
            const dense = trendData.length > 15;
            const tickInterval = dense ? Math.ceil(trendData.length / 6) : 0;
            const barGap = dense ? '10%' : '20%';
            const barSize = dense ? 12 : 40;
            return (
            <ResponsiveContainer width="100%" height={200} style={{ marginTop: 20 }}>
              <BarChart data={trendData} barCategoryGap={barGap}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={tickInterval}
                  tickFormatter={(v: string) => mode === 'year' ? (lang === 'zh' ? v.slice(5) + '月' : dayjs(v).format('MMM')) : v.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} width={40} />
                <Tooltip cursor={{ fill: darkMode ? '#333' : '#f5f5f5' }}
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
                <Bar dataKey="amount" fill="#b7eb8f" maxBarSize={barSize} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
            );
          })()}
          {showTrend && trendData.length <= 1 && (
            <div style={{ textAlign: 'center', padding: 16, color: '#ccc', fontSize: 13 }}>
              {mode === 'year'
                ? (lang === 'zh' ? '需要至少2个月数据才能生成趋势图' : 'Need at least 2 months of data for trend chart')
                : t('stats.trendNeedMore')}
            </div>
          )}
        </>
      )}
    </div>
  );
}
