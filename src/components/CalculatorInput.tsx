// 青禾记账 - 自定义计算器键盘（支持加减法）
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { DatePicker, Input, message } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useI18n } from '../i18n/I18nContext';
import { evaluate, canAppendDot, isOperator } from '../calculator';
import { createHoldRepeater, type HoldRepeater } from '../holdRepeat';
import { synthesizeTick, vibrate, getAudioCtx, type KeySoundType } from '../keyFeedback';

interface Props {
  visible: boolean;
  initialValue: string;
  onConfirm: (result: number) => void;
  onCancel: () => void;
  // 内嵌模式：键盘直接放入父级布局流（不弹全屏遮罩），用于记一笔向导
  embedded?: boolean;
  // 内嵌模式顶栏左侧：所选类别标签（记一笔向导传入"大类 / 子类"）
  label?: string;
  // 全屏遮罩模式顶部标题（预算页设置预算用）
  title?: string;
  // 全屏遮罩模式标题下的小字说明（预算页显示剩余可分配额度）
  subtitle?: string;
  // 全屏遮罩模式：输入金额上限，超过的输入直接拒绝（预算页分类预算用）
  max?: number;
  // 全屏遮罩模式：确认键下方提供清除操作（预算页清除预算用）
  onClear?: () => void;
  // 记账模式：键盘内嵌日期+备注行（其余调用方不传，保持原样）
  note?: string;
  date?: Dayjs;
  onNoteChange?: (s: string) => void;
  onDateChange?: (d: Dayjs) => void;
}

export default function CalculatorInput({ visible, initialValue, onConfirm, onCancel, embedded, label, title, subtitle, max, onClear, note, date, onNoteChange, onDateChange }: Props) {
  const { t, keySound, keyVibrate } = useI18n();
  const [expr, setExpr] = useState('');
  // 超限提示节流：避免连按超限数字时每次按键都重置 toast 计时器导致长时间停留
  const lastMaxToast = useRef(0);

  // 统一反馈入口：type 为 null 时只震动不发声（确认键静音——成功反馈由保存落库后的金币叮承担）
  const feedback = useCallback((type: KeySoundType | null) => {
    if (type !== null && keySound) {
      const ctx = getAudioCtx();
      if (ctx) synthesizeTick(ctx, type);
    }
    if (keyVibrate) vibrate(10);
  }, [keySound, keyVibrate]);

  // 供长生命周期闭包（holdRepeater）取最新反馈函数，避免开关切换后仍用旧引用
  const feedbackRef = useRef(feedback);
  feedbackRef.current = feedback;
  const keyVibrateRef = useRef(keyVibrate);
  keyVibrateRef.current = keyVibrate;

  useEffect(() => {
    if (visible) {
      setExpr(initialValue || '');
    }
  }, [visible, initialValue]);

  const preview = useMemo(() => evaluate(expr), [expr]);

  const append = useCallback((char: string) => {
    let candidate: string | null = null;
    if (char === '.') {
      if (canAppendDot(expr)) {
        // 表达式为空或末尾是运算符时，补 0
        candidate = (!expr || isOperator(expr.slice(-1))) ? expr + '0.' : expr + '.';
      }
    } else if (isOperator(char)) {
      if (expr) {
        candidate = isOperator(expr.slice(-1)) ? expr.slice(0, -1) + char : expr + char;
      }
    } else {
      candidate = expr + char;
    }
    if (candidate === null) return;
    // 上限约束：超过 max 的输入被拒绝并提示
    if (max !== undefined) {
      const val = evaluate(candidate);
      if (val !== null && val > max) {
        feedback('error');
        const now = Date.now();
        if (now - lastMaxToast.current > 2000) {
          lastMaxToast.current = now;
          message.warning({ content: t('budget.maxExceeded', { amount: String(max) }), key: 'budget-max-exceeded', duration: 1.5 });
        }
        return;
      }
    }
    setExpr(candidate);
  }, [expr, max, feedback]);

  const backspace = useCallback(() => {
    setExpr((prev) => prev.slice(0, -1));
  }, []);

  // 长按退格连删：按下立即删一个，300ms 后以 50ms 间隔连删，松开/移出/取消或卸载时停止
  const holdRepeatRef = useRef<HoldRepeater | null>(null);
  // 连删 tick 计数：首 tick（单击）有完整反馈，后续连删仅震动（静音避免连续噪音）
  const backspaceTickRef = useRef(0);
  if (holdRepeatRef.current === null) {
    holdRepeatRef.current = createHoldRepeater({
      delay: 300,
      interval: 50,
      onTick: () => {
        backspace();
        if (backspaceTickRef.current === 0) {
          feedbackRef.current('fn');
        } else if (keyVibrateRef.current) {
          vibrate(10);
        }
        backspaceTickRef.current += 1;
      },
    });
  }

  const stopHoldRepeat = useCallback(() => {
    holdRepeatRef.current?.stop();
    backspaceTickRef.current = 0;
  }, []);

  // 组件卸载时兜底清理
  useEffect(() => () => holdRepeatRef.current?.stop(), []);

  // preventDefault 抑制长按触发的系统文本选择/上下文菜单
  const handleBackspacePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    holdRepeatRef.current?.start();
  }, []);

  const handleKeyClick = useCallback((kind: KeySoundType | null, action: () => void) => () => {
    feedback(kind);
    action();
  }, [feedback]);

  const clear = useCallback(() => {
    setExpr('');
  }, []);

  const handleConfirm = useCallback(() => {
    const result = evaluate(expr);
    if (result !== null) {
      onConfirm(result);
    }
    setExpr('');
  }, [expr, onConfirm]);

  const handleCancel = useCallback(() => {
    setExpr('');
    onCancel();
  }, [onCancel]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') handleCancel();
  }, [handleCancel]);

  const isRecordMode = note !== undefined && onNoteChange !== undefined && onDateChange !== undefined;

  interface KeySpec {
    label: string;
    className: string;
    /** 按键音效类型；缺省则只震动不发声 */
    kind?: KeySoundType;
    action?: () => void;
    onPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
    onPointerUp?: () => void;
    onPointerLeave?: () => void;
    onPointerCancel?: () => void;
    onContextMenu?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  }

  const keys: KeySpec[] = [
    { label: '7', action: () => append('7'), className: 'key-num', kind: 'num' },
    { label: '8', action: () => append('8'), className: 'key-num', kind: 'num' },
    { label: '9', action: () => append('9'), className: 'key-num', kind: 'num' },
    { label: 'C', action: clear, className: 'key-fn', kind: 'fn' },
    { label: '4', action: () => append('4'), className: 'key-num', kind: 'num' },
    { label: '5', action: () => append('5'), className: 'key-num', kind: 'num' },
    { label: '6', action: () => append('6'), className: 'key-num', kind: 'num' },
    { label: '+', action: () => append('+'), className: 'key-op key-add', kind: 'num' },
    { label: '1', action: () => append('1'), className: 'key-num', kind: 'num' },
    { label: '2', action: () => append('2'), className: 'key-num', kind: 'num' },
    { label: '3', action: () => append('3'), className: 'key-num', kind: 'num' },
    { label: '−', action: () => append('-'), className: 'key-op key-sub', kind: 'num' },
    { label: '.', action: () => append('.'), className: 'key-num', kind: 'num' },
    { label: '0', action: () => append('0'), className: 'key-num', kind: 'num' },
    {
      label: '⌫',
      className: 'key-fn',
      kind: 'fn',
      onPointerDown: handleBackspacePointerDown,
      onPointerUp: stopHoldRepeat,
      onPointerLeave: stopHoldRepeat,
      onPointerCancel: stopHoldRepeat,
      onContextMenu: (e) => e.preventDefault(),
    },
    { label: '✓', action: handleConfirm, className: 'key-confirm' },
  ];

  const displayArea = (
    <div className="calc-display">
      <div className="calc-expr">{expr || ' '}</div>
      {!isRecordMode && (
        <div className="calc-preview">
          {preview !== null ? `= ${preview}` : ' '}
        </div>
      )}
    </div>
  );

  const metaArea = isRecordMode && (
    <div className="calc-meta">
      <DatePicker
        value={date}
        onChange={(d) => onDateChange(d || dayjs())}
        allowClear={false}
        inputReadOnly
        disabledDate={(d) => d.isAfter(dayjs(), 'day')}
        popupStyle={{ zIndex: 1300 }}
        size="small"
      />
      <Input
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        placeholder={t('form.note')}
        maxLength={50}
        size="small"
      />
    </div>
  );

  const gridArea = (
    <div className="calc-grid">
      {keys.map((k) => (
        <button
          key={k.label}
          className={`calc-key ${k.className}`}
          onClick={k.action ? handleKeyClick(k.kind ?? null, k.action) : undefined}
          onPointerDown={k.onPointerDown}
          onPointerUp={k.onPointerUp}
          onPointerLeave={k.onPointerLeave}
          onPointerCancel={k.onPointerCancel}
          onContextMenu={k.onContextMenu}
          type="button"
        >
          {k.label}
        </button>
      ))}
    </div>
  );

  if (embedded) {
    return (
      <div className={`calc-embedded-wrap${visible ? ' open' : ''}`}>
        <div className="calc-panel calc-panel-embedded">
          {/* 顶栏：返回分类的关闭钮 + 左上角类别标签 + 右上角金额 */}
          <div className="calc-embedded-top">
            <button className="calc-embedded-close" onClick={handleCancel} type="button" aria-label={t('cat.cancel')}>✕</button>
            {label && <div className="calc-embedded-cat">{label}</div>}
            <div className="calc-display calc-display-inline">
              <div className="calc-expr">{expr || ' '}</div>
            </div>
          </div>
          {metaArea}
          {gridArea}
        </div>
      </div>
    );
  }

  if (!visible) return null;

  return (
    <div className="calc-overlay" onClick={handleCancel} onKeyDown={handleKeyDown}>
      <div className="calc-panel" onClick={(e) => e.stopPropagation()}>
        {(title || subtitle) && (
          <div className="calc-title-wrap">
            {title && <div className="calc-title">{title}</div>}
            {subtitle && <div className="calc-subtitle">{subtitle}</div>}
          </div>
        )}
        {displayArea}
        {metaArea}
        {gridArea}
        {onClear && (
          <button className="calc-clear-btn" type="button" onClick={onClear}>{t('budget.clear')}</button>
        )}
      </div>
    </div>
  );
}
