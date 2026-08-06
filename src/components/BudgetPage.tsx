// 青禾记账 - 预算（总预算为主，只看本月；分类预算从总预算分配，和 ≤ 总预算）
import { useState, useEffect, useRef } from 'react';
import { Modal, message } from 'antd';
import dayjs from 'dayjs';
import { getBudgets, setBudget, deleteBudget, getStatsByCategory, getSetting, setSetting, deleteSetting } from '../db';
import { useData } from '../DataContext';
import { useI18n } from '../i18n/I18nContext';
import { translateCategory } from '../i18n/categoryTranslations';
import CalculatorInput from './CalculatorInput';

const pctColor = (pct: number) => (pct >= 100 ? '#ff4d4f' : pct >= 80 ? '#faad14' : '#52c41a');

export default function BudgetPage() {
  const { t, lang } = useI18n();
  const { categories } = useData();
  const [totalBudget, setTotalBudget] = useState(0); // 0 = 未设置总预算
  const [budgets, setBudgets] = useState<Record<string, number>>({});
  const [spend, setSpend] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editTotal, setEditTotal] = useState(false);
  const [editCat, setEditCat] = useState<string | null>(null);

  const month = dayjs().format('YYYY-MM');
  const daysInMonth = dayjs().daysInMonth();
  const daysElapsed = dayjs().date();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [tb, b, s] = await Promise.all([
        getSetting('total_budget').then((v) => (v ? parseFloat(v) || 0 : 0)),
        getBudgets(),
        getStatsByCategory(month),
      ]);
      if (cancelled) return;
      setTotalBudget(tb);
      setBudgets(b);
      const m: Record<string, number> = {};
      s.forEach((c) => { m[c.category] = c.amount; });
      setSpend(m);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [month]);

  // 总预算乐观更新
  const saveTotal = (amount: number) => {
    const had = totalBudget;
    setTotalBudget(amount);
    setSetting('total_budget', String(amount))
      .then(() => message.success({ content: t('budget.saved'), key: 'budget-saved' }))
      .catch((err) => { console.error('保存总预算失败:', err); message.error({ content: t('budget.saveFailed'), key: 'budget-save-failed' }); setTotalBudget(had); });
  };
  const clearTotal = () => {
    const had = totalBudget;
    setTotalBudget(0);
    deleteSetting('total_budget')
      .then(() => message.success({ content: t('budget.removed'), key: 'budget-removed' }))
      .catch((err) => { console.error('清除总预算失败:', err); message.error({ content: t('budget.saveFailed'), key: 'budget-save-failed' }); setTotalBudget(had); });
  };

  // 分类预算乐观更新
  const saveCatBudget = (cat: string, amount: number) => {
    const had = budgets[cat];
    setBudgets((prev) => ({ ...prev, [cat]: amount }));
    setBudget(cat, amount)
      .then(() => message.success({ content: t('budget.saved'), key: 'budget-saved' }))
      .catch((err) => {
        console.error('设置分类预算失败:', err);
        message.error({ content: t('budget.saveFailed'), key: 'budget-save-failed' });
        setBudgets((prev) => {
          const next = { ...prev };
          if (had === undefined) delete next[cat];
          else next[cat] = had;
          return next;
        });
      });
  };
  const clearCatBudget = (cat: string) => {
    const had = budgets[cat];
    setBudgets((prev) => { const next = { ...prev }; delete next[cat]; return next; });
    deleteBudget(cat)
      .then(() => message.success({ content: t('budget.removed'), key: 'budget-removed' }))
      .catch((err) => { console.error('清除分类预算失败:', err); message.error({ content: t('budget.saveFailed'), key: 'budget-save-failed' }); if (had !== undefined) setBudgets((prev) => ({ ...prev, [cat]: had })); });
  };

  // 派生
  const totalSpend = Object.values(spend).reduce((s, v) => s + v, 0);
  const setRows = categories
    .filter((c) => budgets[c.name] !== undefined)
    .map((c) => ({ cat: c, budget: budgets[c.name], spent: spend[c.name] || 0 }))
    .sort((a, b) => b.spent - a.spent);
  const allocatedSum = setRows.reduce((s, r) => s + r.budget, 0);
  // 当前编辑分类的金额上限 = 总预算 - 其他已设分类之和
  const editCatMax = editCat !== null ? totalBudget - (allocatedSum - (budgets[editCat] || 0)) : 0;

  const totalPct = totalBudget > 0 ? (totalSpend / totalBudget) * 100 : 0;
  const totalRemaining = totalBudget - totalSpend;
  const totalDaily = totalBudget > 0 ? totalBudget / daysInMonth : 0;
  const spentDaily = daysElapsed > 0 ? totalSpend / daysElapsed : 0;
  const projection = spentDaily * daysInMonth;
  const projectedDiff = totalBudget - projection;

  const totalColor = pctColor(totalPct);
  const R = 26;
  const C = 2 * Math.PI * R;
  const clamped = Math.min(totalPct, 100);

  // ＋ 设置分类预算（仅在已设总预算时展示此入口）
  const handleOpenPicker = () => setPickerOpen(true);

  // 无额度提示节流：连点分类时不重复触发 toast 重置计时器
  const lastNoAllocToast = useRef(0);
  const warnNoAllocation = () => {
    const now = Date.now();
    if (now - lastNoAllocToast.current > 2000) {
      lastNoAllocToast.current = now;
      message.warning({ content: t('budget.noAllocationLeft'), key: 'budget-no-alloc' });
    }
  };

  // 打开分类预算键盘：无可分配额度时提示，不弹键盘
  const openCatEditor = (cat: string) => {
    const max = totalBudget - (allocatedSum - (budgets[cat] || 0));
    if (max <= 0) {
      warnNoAllocation();
      return;
    }
    setEditCat(cat);
  };

  // 分类预算确认：钳制到剩余可分配
  const handleCatConfirm = (result: number) => {
    if (editCat === null) return;
    const cat = editCat;
    const val = Math.round(result);
    if (val > 0) {
      const otherAllocated = allocatedSum - (budgets[cat] || 0);
      const remaining = totalBudget - otherAllocated;
      if (remaining <= 0) {
        warnNoAllocation();
      } else if (val > remaining) {
        saveCatBudget(cat, remaining);
        message.warning({ content: t('budget.clamped', { amount: String(remaining) }), key: 'budget-clamped' });
      } else {
        saveCatBudget(cat, val);
      }
    }
    setEditCat(null);
  };

  return (
    <div className="budget-page">
      <div className="budget-page-title">{dayjs().format(lang === 'zh' ? 'YYYY年M月' : 'MMMM YYYY')}</div>

      {loading ? (
        <div className="budget-skeleton">
          {[0, 1, 2, 3].map((i) => <div key={i} className="budget-skeleton-row" />)}
        </div>
      ) : (
        <>
          {/* 总预算 hero 卡：点按设置/修改 */}
          <div className={`budget-total-card${totalBudget > 0 ? '' : ' setup'}`} onClick={() => setEditTotal(true)}>
            {totalBudget > 0 ? (
              <>
                <svg width="76" height="76" viewBox="0 0 76 76" className="budget-ring">
                  <circle cx="38" cy="38" r={R} fill="none" stroke="#f0f0f0" strokeWidth="8" />
                  <circle cx="38" cy="38" r={R} fill="none" stroke={totalColor} strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${(clamped / 100) * C} ${C}`} transform="rotate(-90 38 38)" />
                  <text x="38" y="41" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 16, fontWeight: 700, fill: totalColor }}>
                    {totalPct >= 1000 ? `${Math.round(totalPct / 100)}×` : `${totalPct.toFixed(0)}%`}
                  </text>
                </svg>
                <div className="budget-total-info">
                  <div className="budget-total-spent">
                    <span>{t('budget.spent')}</span>
                    <b>¥{totalSpend.toFixed(0)} / ¥{totalBudget.toFixed(0)}</b>
                  </div>
                  <div className="budget-total-meta">
                    <span className="budget-total-meta-remaining" style={{ color: totalRemaining < 0 ? '#ff4d4f' : '#52c41a' }}>
                      {totalRemaining < 0
                        ? t('budget.over', { amount: Math.abs(totalRemaining).toFixed(0) })
                        : `${t('budget.remaining')} ¥${totalRemaining.toFixed(0)}`}
                    </span>
                    <span className="budget-total-meta-daily">
                      {' · '}{t('budget.dailyAvg')} ¥{spentDaily.toFixed(0)}/天 vs ¥{totalDaily.toFixed(0)}/天
                    </span>
                  </div>
                  <div className="budget-total-projection" style={{ color: projectedDiff >= 0 ? '#52c41a' : '#ff4d4f' }}>
                    {t('budget.projection', { amount: projection.toFixed(0) })}
                    {projectedDiff >= 0
                      ? t('budget.projectedSave', { amount: projectedDiff.toFixed(0) })
                      : t('budget.projectedOver', { amount: Math.abs(projectedDiff).toFixed(0) })}
                  </div>
                </div>
              </>
            ) : (
              <div className="budget-total-setup">
                <div className="budget-total-setup-icon">💰</div>
                <div className="budget-total-setup-title">{t('budget.total')}</div>
              </div>
            )}
          </div>

          {/* 分类预算：渐进披露——空分类时只留轻量入口，设了才出区块 */}
          {totalBudget > 0 && (setRows.length === 0 ? (
            <button className="budget-add-first" type="button" onClick={handleOpenPicker}>＋ {t('budget.sectionTitle')}</button>
          ) : (
            <>
              <div className="budget-section">
                <span className="budget-section-title">
                  {t('budget.sectionTitle')}
                  <span className="budget-section-alloc">
                    {' '}· {t('budget.allocatedOf', { a: String(allocatedSum), b: String(totalBudget) })}
                  </span>
                </span>
                <button className="budget-section-add" type="button" onClick={handleOpenPicker} aria-label={t('budget.allocate')}>＋</button>
              </div>
              <div className="budget-row-list">
                  {setRows.map((r) => {
                    const pct = (r.spent / r.budget) * 100;
                    const color = pctColor(pct);
                    const over = r.budget - r.spent;
                    return (
                      <div key={r.cat.name} className="budget-row" onClick={() => openCatEditor(r.cat.name)}>
                        <span className="budget-row-icon">{r.cat.icon}</span>
                        <span className="budget-row-name">{translateCategory(lang, r.cat.name)}</span>
                        <div className="budget-bar budget-row-bar">
                          <div className="budget-bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
                        </div>
                        <span className="budget-row-pct" style={{ color }}>{pct.toFixed(0)}%</span>
                        {over < 0
                          ? <span className="budget-row-over">{t('budget.overShort', { amount: Math.abs(over).toFixed(0) })}</span>
                          : <span className="budget-row-value">¥{r.spent.toFixed(0)}/¥{r.budget.toFixed(0)}</span>}
                      </div>
                    );
                  })}
              </div>
            </>
          ))}
        </>
      )}

      {/* 分类选择弹窗 */}
      <Modal open={pickerOpen} onCancel={() => setPickerOpen(false)} footer={null}
        title={t('budget.pickCategory')} centered width="min(360px, calc(100vw - 32px))">
        <div className="budget-picker-grid">
          {categories.map((cat) => {
            const hasBudget = budgets[cat.name] !== undefined;
            return (
              <div key={cat.name} className="budget-picker-item"
                onClick={() => { setPickerOpen(false); openCatEditor(cat.name); }}>
                <span className={`budget-picker-icon${hasBudget ? '' : ' unset'}`}>{cat.icon}</span>
                <span className="budget-picker-name">{translateCategory(lang, cat.name)}</span>
                {hasBudget && <span className="budget-picker-value">¥{budgets[cat.name]}</span>}
              </div>
            );
          })}
        </div>
      </Modal>

      {/* 总预算键盘 */}
      {editTotal && (
        <CalculatorInput
          visible
          title={t('budget.total')}
          initialValue={totalBudget > 0 ? String(totalBudget) : ''}
          onConfirm={(result) => {
            const val = Math.round(result);
            if (val > 0) saveTotal(val);
            setEditTotal(false);
          }}
          onCancel={() => setEditTotal(false)}
          onClear={totalBudget > 0 ? () => { clearTotal(); setEditTotal(false); } : undefined}
        />
      )}

      {/* 分类预算键盘：显示剩余可分配 */}
      {editCat !== null && (
        <CalculatorInput
          visible
          title={`${categories.find((c) => c.name === editCat)?.icon ?? ''} ${translateCategory(lang, editCat)}`}
          subtitle={totalBudget > 0
            ? `${t('budget.total')} ¥${totalBudget.toFixed(0)} · ${t('budget.maxForCategory', { amount: String(editCatMax) })}`
            : undefined}
          max={editCatMax}
          initialValue={budgets[editCat] !== undefined ? String(budgets[editCat]) : ''}
          onConfirm={handleCatConfirm}
          onCancel={() => setEditCat(null)}
          onClear={budgets[editCat] !== undefined ? () => { clearCatBudget(editCat); setEditCat(null); } : undefined}
        />
      )}
    </div>
  );
}
