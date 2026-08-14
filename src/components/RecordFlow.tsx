// 青禾记账 - 记一笔全屏向导（选分类 → 键盘输入金额/日期/备注）
import { useState } from 'react';
import { Tag, message } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { addExpense, type TxType } from '../db';
import { useData } from '../DataContext';
import { useI18n } from '../i18n/I18nContext';
import { translateCategory } from '../i18n/categoryTranslations';
import CalculatorInput from './CalculatorInput';
import { getAudioCtx, synthesizeCoin } from '../keyFeedback';
import { useBackBlock } from '../useBackBlock';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function RecordFlow({ open, onClose, onSaved }: Props) {
  const { t, lang, keySound } = useI18n();
  const { categories, incomeCats, refresh, setViewMonth } = useData();
  const [type, setType] = useState<TxType>('expense');
  const [selectedCat1, setSelectedCat1] = useState('');
  const [selectedCat2, setSelectedCat2] = useState('');
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [note, setNote] = useState('');
  const [showCalc, setShowCalc] = useState(false);

  // Android 返回键：退出向导
  useBackBlock(open, () => { reset(); onClose(); });

  if (!open) return null;

  const gridCats = type === 'income' ? incomeCats : categories;
  const currentCategory = gridCats.find((c) => c.name === selectedCat1);

  // 键盘标题：显示当前所选分类，确认录入对象
  const catLabel = selectedCat2
    ? `${translateCategory(lang, selectedCat1)} / ${translateCategory(lang, selectedCat2)}`
    : selectedCat1
      ? translateCategory(lang, selectedCat1)
      : '';

  const reset = () => {
    setType('expense');
    setSelectedCat1(''); setSelectedCat2('');
    setDate(dayjs()); setNote(''); setShowCalc(false);
  };

  const handleCat1Click = (catName: string) => {
    const cat = gridCats.find((c) => c.name === catName);
    setSelectedCat1(catName);
    setSelectedCat2('');
    // 无子分类的直接进键盘（收入分类均无子类，点选即进键盘）
    if (cat && cat.children.length === 0) setShowCalc(true);
  };

  const handleSave = async (result: number) => {
    if (result <= 0) { message.warning(t('form.invalidAmount')); return; }
    if (!selectedCat1) { message.warning(t('form.selectCategoryRequired')); return; }
    try {
      await addExpense({
        type,
        amount: result,
        category1: selectedCat1,
        category2: selectedCat2,
        date: date.format('YYYY-MM-DD'),
        note: note.trim(),
      });
      message.success(t('form.saveSuccess'));
      // 入账成功音（金币叮）：落库成功才响，✓ 键本身静音只震动
      if (keySound) {
        const ctx = getAudioCtx();
        if (ctx) synthesizeCoin(ctx);
      }
      setViewMonth(date.startOf('month'));
      refresh();
      reset();
      onSaved();
    } catch (err) {
      console.error('保存失败:', err);
      message.error(`${t('form.saveFailed')}: ${String(err)}`, 5);
    }
  };

  return (
    <div className="record-flow">
      <div className="record-flow-header">
        <div className="record-flow-types">
          {(['expense', 'income'] as TxType[]).map((v) => (
            <button
              key={v}
              type="button"
              className={`record-flow-type-item${type === v ? ' active' : ''}`}
              onClick={() => {
                if (v !== type) { setType(v); setSelectedCat1(''); setSelectedCat2(''); }
              }}
            >
              {t(v === 'income' ? 'form.income' : 'form.expense')}
            </button>
          ))}
        </div>
        <button className="record-flow-close" onClick={() => { reset(); onClose(); }} type="button" aria-label={lang === 'zh' ? '关闭' : 'Close'}>
          <CloseOutlined />
        </button>
      </div>

      <div className="record-flow-body">
        <div className="category-section">
          <div className="category-grid">
            {gridCats.map((cat) => (
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

          {currentCategory && currentCategory.children.length > 0 && (
            <div className="sub-category-tags">
              {currentCategory.children.map((sub) => (
                <Tag
                  key={sub}
                  color={selectedCat2 === sub ? 'green' : 'default'}
                  onClick={() => { setSelectedCat2(sub); setShowCalc(true); }}
                >
                  {translateCategory(lang, sub)}
                </Tag>
              ))}
            </div>
          )}
        </div>
      </div>

      <CalculatorInput
        visible={showCalc}
        embedded
        label={catLabel}
        initialValue=""
        note={note}
        date={date}
        onNoteChange={setNote}
        onDateChange={setDate}
        onConfirm={handleSave}
        onCancel={() => setShowCalc(false)}
      />
    </div>
  );
}
