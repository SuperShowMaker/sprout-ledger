// 青禾记账 - 花销明细（日历+清单）
import { useState, useMemo, useEffect } from 'react';
import { Modal, Button, Input, DatePicker, Select, message } from 'antd';
import { DeleteOutlined, EditOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { deleteExpense, updateExpense, getDatesWithExpenses, getExpensesByDate, type Expense } from '../db';
import { useData } from '../DataContext';
import { useI18n } from '../i18n/I18nContext';
import { translateCategory } from '../i18n/categoryTranslations';
import { incomeCategories } from '../data/categories';
import { formatAmount, isIncome, splitDayTotals } from '../format';
import { useBackBlock } from '../useBackBlock';
import CalculatorInput from './CalculatorInput';

export default function ExpenseList() {
  const { t, lang } = useI18n();
  const { categories, catIcons, viewMonth, monthTotal, monthCount, monthIncome, tick, setViewMonth, refresh } = useData();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(dayjs().format('YYYY-MM-DD'));
  const [listLimit, setListLimit] = useState(50);
  const [recordDates, setRecordDates] = useState<Set<string>>(new Set());
  const [incomeDates, setIncomeDates] = useState<Set<string>>(new Set());
  useEffect(() => { setListLimit(50); }, [selectedDate]);
  useEffect(() => {
    const m = viewMonth.format('YYYY-MM');
    getDatesWithExpenses(m).then(dates => setRecordDates(new Set(dates))).catch(() => {});
    getDatesWithExpenses(m, 'income').then(dates => setIncomeDates(new Set(dates))).catch(() => {});
  }, [viewMonth, tick]);

  // 按选中日期加载明细
  useEffect(() => {
    setLoading(true);
    getExpensesByDate(selectedDate)
      .then(data => setExpenses(data))
      .catch(() => setExpenses([]))
      .finally(() => setLoading(false));
  }, [selectedDate, tick]);

  // 切月时，若当前选中日不在新月内，自动跳到该月合理日期
  useEffect(() => {
    const selMonth = dayjs(selectedDate).format('YYYY-MM');
    const viewMonthStr = viewMonth.format('YYYY-MM');
    if (selMonth !== viewMonthStr) {
      const today = dayjs().format('YYYY-MM-DD');
      const isCurrentMonth = viewMonthStr === dayjs().format('YYYY-MM');
      setSelectedDate(isCurrentMonth ? today : viewMonth.format('YYYY-MM-DD'));
    }
  }, [viewMonth]);

  const calendarData = useMemo(() => {
    const startOfMonth = viewMonth.startOf('month');
    const startDay = startOfMonth.day();
    const offset = startDay === 0 ? 6 : startDay - 1;
    const gridStart = startOfMonth.subtract(offset, 'day');
    const today = dayjs().format('YYYY-MM-DD');
    const weeks: { date: string; day: number; isCurrentMonth: boolean; hasRecord: boolean; hasIncome: boolean; isToday: boolean }[][] = [];

    for (let w = 0; w < 6; w++) {
      const week: typeof weeks[0] = [];
      for (let d = 0; d < 7; d++) {
        const date = gridStart.add(w * 7 + d, 'day');
        const dateStr = date.format('YYYY-MM-DD');
        week.push({
          date: dateStr,
          day: date.date(),
          isCurrentMonth: date.month() === viewMonth.month(),
          hasRecord: recordDates.has(dateStr),
          hasIncome: incomeDates.has(dateStr),
          isToday: dateStr === today,
        });
      }
      weeks.push(week);
    }
    return { weeks };
  }, [recordDates, incomeDates, viewMonth]);

  const selectedExpenses = useMemo(
    () => expenses.filter((e) => e.date === selectedDate),
    [expenses, selectedDate]
  );
  const selectedDayTotal = selectedExpenses.reduce((s, e) => s + e.amount, 0);
  const { expense: dayExpense, income: dayIncome } = splitDayTotals(selectedExpenses);
  const isCurrentMonth = viewMonth.isSame(dayjs(), 'month');

  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);

  const handleDelete = (item: Expense, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(item);
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.id) return;
    await deleteExpense(deleteTarget.id);
    refresh();
    setDeleteTarget(null);
  };

  // ==== 编辑 ====
  const [editItem, setEditItem] = useState<Expense | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editCat1, setEditCat1] = useState('');
  const [editCat2, setEditCat2] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editDate, setEditDate] = useState<Dayjs>(dayjs());
  const [showEditCalc, setShowEditCalc] = useState(false);

  const openEdit = (item: Expense, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditItem(item);
    setEditAmount(String(item.amount));
    setEditCat1(item.category1);
    setEditCat2(item.category2);
    setEditNote(item.note || '');
    setEditDate(dayjs(item.date));
  };

  useBackBlock(!!deleteTarget, () => setDeleteTarget(null));
  useBackBlock(!!editItem, () => setEditItem(null));

  const handleSaveEdit = async () => {
    if (!editItem?.id) return;
    const amt = parseFloat(editAmount);
    if (!amt || amt <= 0) { message.warning(t('form.invalidAmount')); return; }
    await updateExpense(editItem.id, {
      amount: amt,
      category1: editCat1 || undefined,
      category2: editCat2 || undefined,
      note: editNote.trim(),
      date: editDate.format('YYYY-MM-DD'),
    });
    message.success(lang === 'zh' ? '已修改' : 'Updated');
    setEditItem(null);
    refresh();
  };

  const getIcon = (cat1: string) =>
    catIcons[cat1] || incomeCategories.find((c) => c.name === cat1)?.icon || '📦';

  const formatDay = (dateStr: string) => {
    const d = new Date(dateStr);
    const wds = lang === 'zh' ? ['日', '一', '二', '三', '四', '五', '六'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const m = d.getMonth() + 1, day = d.getDate();
    const today = dayjs().format('YYYY-MM-DD');
    const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    if (dateStr === today) return `${t('list.today')} ${m}/${day}`;
    if (dateStr === yesterday) return `${t('list.yesterday')} ${m}/${day}`;
    return lang === 'zh' ? `${m}月${day}日 周${wds[d.getDay()]}` : `${m}/${day} ${wds[d.getDay()]}`;
  };

  const wd = lang === 'zh' ? ['一', '二', '三', '四', '五', '六', '日'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="calendar-list-layout">
      <div className="calendar-section">
        <div className="cal-nav">
          <Button type="text" size="small" icon={<LeftOutlined />} onClick={() => setViewMonth(viewMonth.subtract(1, 'month'))} />
          <span className="cal-month-label">{viewMonth.format(lang === 'zh' ? 'YYYY年M月' : 'MMMM YYYY')}</span>
          <Button type="text" size="small" icon={<RightOutlined />} onClick={() => setViewMonth(viewMonth.add(1, 'month'))} />
        </div>
        <div className="cal-weekdays">{wd.map((d) => <span key={d} className="cal-weekday">{d}</span>)}</div>
        <div className="cal-grid">
          {calendarData.weeks.map((week, wi) => (
            <div key={wi} className="cal-row">
              {week.map((cell) => (
                <div
                  key={cell.date}
                  className={`cal-cell ${!cell.isCurrentMonth ? 'muted' : ''} ${cell.date === selectedDate ? 'selected' : ''} ${cell.isToday ? 'today' : ''}`}
                  onClick={() => setSelectedDate(cell.date)}
                >
                  <span className="cal-day">{cell.day}</span>
                  {cell.hasRecord && <span className="cal-dot" />}
                  {cell.hasIncome && <span className="cal-dot income" />}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="cal-summary">
          {viewMonth.format(lang === 'zh' ? 'M月合计' : 'Monthly total')} ¥{monthTotal.toFixed(2)}
          {monthIncome > 0 && (
            <span style={{ color: '#52c41a', marginLeft: 8, fontSize: 12 }}>· {t('list.income')} ¥{monthIncome.toFixed(2)}</span>
          )}
          <span style={{ color: '#999', marginLeft: 8, fontSize: 12 }}>· {monthCount} {lang === 'zh' ? '笔' : ''}</span>
        </div>
      </div>

      <div className="list-section">
        <div className="list-date-header">
          <span className="list-date-label">{formatDay(selectedDate)}</span>
          {selectedDayTotal > 0 && (
            <span className="list-date-total">
              {t('list.dayTotal')} ¥{dayExpense.toFixed(2)}
              {dayIncome > 0 && <span style={{ color: '#52c41a', marginLeft: 6 }}>· {t('list.income')} ¥{dayIncome.toFixed(2)}</span>}
            </span>
          )}
        </div>

        {loading && <div className="empty-list"><p>{t('list.loading')}</p></div>}
        {!loading && selectedExpenses.length === 0 && (
          <div className="empty-list">
            <div className="empty-icon">📭</div>
            <p>{isCurrentMonth && selectedDate === dayjs().format('YYYY-MM-DD') ? t('list.empty') : (lang === 'zh' ? '当日无记录' : 'No records for this day')}</p>
          </div>
        )}
        {!loading && selectedExpenses.length > 0 && (
          <div className="list-items">
            {selectedExpenses.slice(0, listLimit).map((item) => (
              <div key={item.id} className="expense-item">
                <div className="left">
                  <div className="category-icon">{getIcon(item.category1)}</div>
                  <div className="info">
                    <div className="name">{translateCategory(lang, item.category2) || translateCategory(lang, item.category1)}</div>
                    <div className="note">{item.note ? `${item.note} · ` : ''}{item.created_at?.slice(11, 19) || ''}</div>
                  </div>
                </div>
                <span className={`amount${isIncome(item) ? ' income' : ''}`}>
                  {formatAmount(item.type, item.amount)}
                </span>
                <Button type="text" size="small" icon={<EditOutlined />} onClick={(e) => openEdit(item, e)} className="expense-edit-btn" />
                <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={(e) => handleDelete(item, e)} className="expense-delete-btn" />
              </div>
            ))}
          </div>
        )}
      </div>
      {/* 删除确认弹窗 */}
      <Modal
        title={null}
        open={!!deleteTarget}
        centered
        onOk={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        okText={t('list.delete')}
        okButtonProps={{ danger: true, style: { borderRadius: 20 } }}
        cancelText={t('list.cancel')}
        cancelButtonProps={{ style: { borderRadius: 20 } }}
      >
        <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', background: '#fff1f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px', fontSize: 22, color: '#ff4d4f',
          }}><DeleteOutlined /></div>
          <p style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px', color: '#333' }}>
            {t('list.confirmDelete')}
          </p>
          <p style={{ fontSize: 14, color: '#666', margin: 0 }}>
            {deleteTarget ? t('list.confirmDeleteContent', { amount: deleteTarget.amount.toFixed(2) }) : ''}
          </p>
        </div>
      </Modal>

      {/* 编辑弹窗 */}
      <Modal
        title={null}
        open={!!editItem}
        centered
        onOk={handleSaveEdit}
        onCancel={() => setEditItem(null)}
        okText={lang === 'zh' ? '保存' : 'Save'}
        cancelText={t('list.cancel')}
        width={320}
        okButtonProps={{ style: { borderRadius: 20, backgroundColor: '#52c41a' } }}
        cancelButtonProps={{ style: { borderRadius: 20 } }}
      >
        {editItem && (
          <div className="edit-modal">
            <div className="edit-amount-row">
              <span className="currency">¥</span>
              <input className="amount-display" style={{ width: 180, fontSize: 40 }}
                value={editAmount}
                type="text" inputMode="none" readOnly
                onClick={() => setShowEditCalc(true)}
                placeholder="0.00" />
            </div>
            <div className="edit-cats">
              <Select
                value={editCat1}
                onChange={(v) => { setEditCat1(v); setEditCat2(''); }}
                style={{ width: '100%' }}
                options={(editItem?.type === 'income' ? incomeCategories : categories).map((c) => ({ value: c.name, label: `${c.icon} ${translateCategory(lang, c.name)}` }))}
              />
              {editItem?.type !== 'income' && (
                <Select
                  value={editCat2 || undefined}
                  onChange={(v) => setEditCat2(v || '')}
                  allowClear
                  style={{ width: '100%' }}
                  placeholder={lang === 'zh' ? '未分类' : 'Uncategorized'}
                  options={(categories.find((c) => c.name === editCat1)?.children || []).map((sub) => ({
                    value: sub, label: translateCategory(lang, sub),
                  }))}
                />
              )}
            </div>
            <DatePicker value={editDate} onChange={(d) => setEditDate(d || dayjs())} allowClear={false} inputReadOnly disabledDate={(d) => d.isAfter(dayjs(), 'day')} style={{ width: '100%', marginBottom: 12 }} />
            <Input placeholder={t('form.note')} value={editNote} onChange={(e) => setEditNote(e.target.value)} maxLength={50} />
          </div>
        )}
      </Modal>

      <CalculatorInput
        visible={showEditCalc}
        initialValue={editAmount}
        onConfirm={(result) => {
          const val = parseFloat(result.toFixed(2));
          if (val > 0) setEditAmount(val.toString());
          setShowEditCalc(false);
        }}
        onCancel={() => setShowEditCalc(false)}
      />
    </div>
  );
}
