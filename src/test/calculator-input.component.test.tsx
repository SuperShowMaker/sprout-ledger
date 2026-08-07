import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, act, screen } from '@testing-library/react';
import CalculatorInput from '../components/CalculatorInput';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderCalc(overrides: Partial<Parameters<typeof CalculatorInput>[0]> = {}) {
  const props = {
    visible: true,
    initialValue: '',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  const { container } = render(<CalculatorInput {...props} />);
  const exprText = () => container.querySelector('.calc-expr')?.textContent ?? '';
  return { exprText, ...props, container };
}

function type(keys: string[]) {
  keys.forEach((k) => fireEvent.click(screen.getByRole('button', { name: k })));
}

describe('CalculatorInput 键盘交互', () => {
  it('点击数字键追加显示', () => {
    const { exprText } = renderCalc();
    type(['1', '5']);
    expect(exprText()).toBe('15');
  });

  it('点击退格单删一个字符', () => {
    const { exprText } = renderCalc();
    type(['1', '2', '3', '4']);
    const bs = screen.getByRole('button', { name: '⌫' });
    fireEvent.pointerDown(bs);
    fireEvent.pointerUp(bs); // 300ms 内松手 = 单击，只删一个
    expect(exprText()).toBe('123');
  });

  it('长按超过延迟后连删', () => {
    vi.useFakeTimers();
    const { exprText } = renderCalc();
    type(['1', '2', '3', '4', '5']);
    const bs = screen.getByRole('button', { name: '⌫' });
    fireEvent.pointerDown(bs); // 立即删一个 → "1234"
    act(() => { vi.advanceTimersByTime(300); }); // 进入连删
    act(() => { vi.advanceTimersByTime(150); }); // 3 次 → "1"
    fireEvent.pointerUp(bs);
    expect(exprText()).toBe('1');
  });

  it('确认键返回求值结果', () => {
    const { onConfirm } = renderCalc();
    type(['1', '+', '2', '✓']);
    expect(onConfirm).toHaveBeenCalledWith(3);
  });

  it('计算器键盘仍在全屏遮罩模式渲染', () => {
    const { container } = renderCalc();
    expect(container.querySelector('.calc-overlay')).toBeTruthy();
    expect(container.querySelectorAll('button.calc-key').length).toBe(16);
  });
});
