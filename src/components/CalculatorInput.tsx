// 青禾记账 - 自定义计算器键盘（支持加减法）
import { useState, useCallback, useEffect, useMemo } from 'react';

interface Props {
  visible: boolean;
  initialValue: string;
  onConfirm: (result: number) => void;
  onCancel: () => void;
}

// 安全求值："15+8-3" → 20。只用 + -，左到右。
function evaluate(expr: string): number | null {
  if (!expr) return null;
  // 去掉末尾的运算符
  const cleaned = expr.replace(/[+\-]+$/, '');
  if (!cleaned) return null;
  // tokenize：数字段 | 运算符
  const tokens = cleaned.match(/(\d+\.?\d*)|[+\-]/g);
  if (!tokens) return null;
  let result = parseFloat(tokens[0]);
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const num = parseFloat(tokens[i + 1]);
    if (isNaN(num)) break;
    if (op === '+') result += num;
    else if (op === '-') result -= num;
  }
  return result;
}

function canAppendDot(expr: string): boolean {
  // 最后一个数字段是否已经包含小数点
  const lastNum = expr.split(/[+\-]/).pop() || '';
  return !lastNum.includes('.');
}

function isOperator(char: string): boolean {
  return char === '+' || char === '-';
}

export default function CalculatorInput({ visible, initialValue, onConfirm, onCancel }: Props) {
  const [expr, setExpr] = useState('');

  useEffect(() => {
    if (visible) {
      setExpr(initialValue || '');
    }
  }, [visible, initialValue]);

  const preview = useMemo(() => evaluate(expr), [expr]);

  const append = useCallback((char: string) => {
    setExpr((prev) => {
      if (char === '.') {
        if (!canAppendDot(prev)) return prev;
        // 表达式为空或末尾是运算符时，补 0
        if (!prev || isOperator(prev.slice(-1))) return prev + '0.';
        return prev + '.';
      }
      // 运算符
      if (isOperator(char)) {
        if (!prev) return prev;
        if (isOperator(prev.slice(-1))) return prev.slice(0, -1) + char;
        return prev + char;
      }
      // 数字
      return prev + char;
    });
  }, []);

  const backspace = useCallback(() => {
    setExpr((prev) => prev.slice(0, -1));
  }, []);

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

  if (!visible) return null;

  const keys: { label: string; action: () => void; className: string }[] = [
    { label: '7', action: () => append('7'), className: 'key-num' },
    { label: '8', action: () => append('8'), className: 'key-num' },
    { label: '9', action: () => append('9'), className: 'key-num' },
    { label: 'C', action: clear, className: 'key-fn' },
    { label: '4', action: () => append('4'), className: 'key-num' },
    { label: '5', action: () => append('5'), className: 'key-num' },
    { label: '6', action: () => append('6'), className: 'key-num' },
    { label: '+', action: () => append('+'), className: 'key-op key-add' },
    { label: '1', action: () => append('1'), className: 'key-num' },
    { label: '2', action: () => append('2'), className: 'key-num' },
    { label: '3', action: () => append('3'), className: 'key-num' },
    { label: '−', action: () => append('-'), className: 'key-op key-sub' },
    { label: '.', action: () => append('.'), className: 'key-num' },
    { label: '0', action: () => append('0'), className: 'key-num' },
    { label: '⌫', action: backspace, className: 'key-fn' },
    { label: '✓', action: handleConfirm, className: 'key-confirm' },
  ];

  return (
    <div className="calc-overlay" onClick={handleCancel} onKeyDown={handleKeyDown}>
      <div className="calc-panel" onClick={(e) => e.stopPropagation()}>
        {/* 表达式展示区 */}
        <div className="calc-display">
          <div className="calc-expr">{expr || ' '}</div>
          <div className="calc-preview">
            {preview !== null ? `= ${preview}` : ' '}
          </div>
        </div>
        {/* 键盘网格 */}
        <div className="calc-grid">
          {keys.map((k) => (
            <button
              key={k.label}
              className={`calc-key ${k.className}`}
              onClick={k.action}
              type="button"
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
