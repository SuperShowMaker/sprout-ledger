import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import RecordFlow from '../components/RecordFlow';
import { addExpense } from '../db';

vi.mock('../db', () => ({ addExpense: vi.fn() }));

vi.mock('../DataContext', () => ({
  useData: () => ({
    categories: [
      { name: '餐饮饮食', icon: '🍜', children: ['早餐', '午餐'] },
      { name: '交通出行', icon: '🚗', children: [] },
    ],
    refresh: vi.fn(),
    setViewMonth: vi.fn(),
  }),
}));

vi.mock('../i18n/I18nContext', () => ({
  useI18n: () => ({
    lang: 'zh',
    t: (k: string) => ({
      'nav.add': '记账',
      'nav.addIncome': '记收入',
      'form.expense': '支出',
      'form.income': '收入',
      'form.saveSuccess': '记录成功！',
      'form.saveFailed': '保存失败',
      'form.invalidAmount': '请输入有效的金额',
      'form.selectCategoryRequired': '请选择分类',
      'form.note': '添加备注',
      'cat.cancel': '取消',
    }[k] || k),
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RecordFlow 收支切换', () => {
  it('默认支出：显示支出分类、标题为记账，不显示收入分类', () => {
    render(<RecordFlow open onClose={() => {}} onSaved={() => {}} />);
    expect(screen.getByText('记账')).toBeTruthy();
    expect(screen.getByText('餐饮饮食')).toBeTruthy();
    expect(screen.queryByText('工资收入')).toBeNull();
  });

  it('切到收入：显示收入分类、标题为记收入，不显示支出分类', () => {
    render(<RecordFlow open onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByText('收入'));
    expect(screen.getByText('记收入')).toBeTruthy();
    expect(screen.getByText('工资收入')).toBeTruthy();
    expect(screen.queryByText('餐饮饮食')).toBeNull();
  });

  it('收入分类无子类：点选即进键盘，保存携带 type=income', () => {
    render(<RecordFlow open onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByText('收入'));
    fireEvent.click(screen.getByText('工资收入'));
    // 输入金额并确认
    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('✓'));
    expect(addExpense).toHaveBeenCalledWith(expect.objectContaining({
      type: 'income',
      category1: '工资收入',
      amount: 1,
    }));
  });

  it('支出无子类分类点选即进键盘，保存携带 type=expense', () => {
    render(<RecordFlow open onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByText('交通出行'));
    fireEvent.click(screen.getByText('2'));
    fireEvent.click(screen.getByText('✓'));
    expect(addExpense).toHaveBeenCalledWith(expect.objectContaining({
      type: 'expense',
      category1: '交通出行',
      amount: 2,
    }));
  });

  it('切换类型后仍可正常保存（已选分类被清空不影响保存）', () => {
    render(<RecordFlow open onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByText('交通出行'));
    fireEvent.click(screen.getByText('收入')); // 切走清空选中
    fireEvent.click(screen.getByText('工资收入'));
    fireEvent.click(screen.getByText('3'));
    fireEvent.click(screen.getByText('✓'));
    expect(addExpense).toHaveBeenCalledWith(expect.objectContaining({
      type: 'income',
      category1: '工资收入',
      amount: 3,
    }));
  });
});
