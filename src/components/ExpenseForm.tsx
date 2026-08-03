// 青禾记账 - 记一笔花销表单
import { useState } from 'react';
import { Button, DatePicker, Input, Tag, message } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { addExpense } from '../db';
import { useData } from '../DataContext';
import { useI18n } from '../i18n/I18nContext';
import { translateCategory } from '../i18n/categoryTranslations';
import CalculatorInput from './CalculatorInput';

interface Props {
  onDone: () => void;
}

export default function ExpenseForm({ onDone }: Props) {
  const { t, lang } = useI18n();
  const { refresh, setViewMonth } = useData();
  const [amount, setAmount] = useState('');
  const [selectedCat1, setSelectedCat1] = useState('');
  const [selectedCat2, setSelectedCat2] = useState('');
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const { categories } = useData();

  const currentCategory = categories.find((c) => c.name === selectedCat1);

  const handleCat1Click = (catName: string) => {
    if (selectedCat1 === catName) {
      setSelectedCat1('');
      setSelectedCat2('');
    } else {
      setSelectedCat1(catName);
      setSelectedCat2('');
    }
  };

  const isAmountValid = amount.trim() !== '' && parseFloat(amount) > 0;

  const handleSubmit = async () => {
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      message.warning(t('form.invalidAmount'));
      return;
    }
    if (!selectedCat1) {
      message.warning(t('form.selectCategoryRequired'));
      return;
    }

    setSaving(true);
    try {
      await addExpense({
        amount: amountNum,
        category1: selectedCat1,
        category2: selectedCat2,
        date: date.format('YYYY-MM-DD'),
        note: note.trim(),
      });
      message.success(t('form.saveSuccess'));
      setAmount(''); setSelectedCat1(''); setSelectedCat2('');
      setDate(dayjs()); setNote('');
      setViewMonth(date.startOf('month'));
      refresh();
      onDone();
    } catch (err) {
      console.error('保存失败:', err);
      message.error(`${t('form.saveFailed')}: ${String(err)}`, 5);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="record-form">
      {/* 金额卡片 */}
      <div className={`amount-card${focused ? ' focused' : ''}`}>
        <div className="amount-row">
          <span className="amount-prefix">¥</span>
          <input
            className="amount-display"
            type="text"
            inputMode="none"
            placeholder="0.00"
            value={amount}
            readOnly
            onClick={() => setShowCalc(true)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
        </div>
      </div>

      {/* 一级分类 */}
      <div className="category-section">
        <div className="category-grid">
          {categories.map((cat) => (
            <div
              key={cat.name}
              className={`category-btn ${selectedCat1 === cat.name ? 'selected' : ''}`}
              onClick={() => handleCat1Click(cat.name)}
            >
              <span className="cat-icon">{cat.icon}</span>
              <span className="cat-name">{translateCategory(lang, cat.name)}</span>
            </div>
          ))}
        </div>

        {/* 二级分类 */}
        {currentCategory && (
          <div className="sub-category-tags">
            {currentCategory.children.map((sub) => (
              <Tag
                key={sub}
                color={selectedCat2 === sub ? 'green' : 'default'}
                onClick={() => setSelectedCat2(sub)}
              >
                {translateCategory(lang, sub)}
              </Tag>
            ))}
          </div>
        )}
      </div>

      {/* 日期和备注 */}
      <div className="extra-section">
        <DatePicker
          value={date}
          onChange={(d) => setDate(d || dayjs())}
          allowClear={false}
          inputReadOnly
          disabledDate={(d) => d.isAfter(dayjs(), 'day')}
          style={{ flex: 1 }}
        />
        <Input
          placeholder={t('form.note')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={50}
          style={{ flex: 2 }}
        />
      </div>

      {/* 提交按钮 */}
      <div className="submit-section">
        <Button
          type="primary"
          icon={<CheckOutlined />}
          onClick={handleSubmit}
          loading={saving}
          disabled={!isAmountValid || !selectedCat1}
          size="large"
        >
          {t('form.submit')}
        </Button>
      </div>

      <CalculatorInput
        visible={showCalc}
        initialValue={amount}
        onConfirm={(result) => {
          const val = parseFloat(result.toFixed(2));
          if (val > 0) setAmount(val.toString());
          setShowCalc(false);
        }}
        onCancel={() => setShowCalc(false)}
      />
    </div>
  );
}
