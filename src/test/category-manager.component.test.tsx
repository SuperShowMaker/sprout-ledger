// 分类管理（网格两段式）：角标锁/红✕ / ＋格 / 点选子类区 / 长按拖拽排序回归测试
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, cleanup, within, waitFor } from '@testing-library/react';
import { message } from 'antd';
import CategoryManager from '../components/CategoryManager';
import {
  getCategories,
  addCategory1,
  addCategory2,
  deleteCategory1,
  deleteCategory2,
  updateCategory1Sort,
  updateCategory2Sort,
  countExpensesByCategory,
} from '../db';

vi.mock('../db', () => ({
  getCategories: vi.fn(),
  addCategory1: vi.fn(),
  addCategory2: vi.fn(),
  deleteCategory1: vi.fn(),
  deleteCategory2: vi.fn(),
  renameCategory1: vi.fn(),
  renameCategory2: vi.fn(),
  updateCategory1Sort: vi.fn(),
  updateCategory2Sort: vi.fn(),
  countExpensesByCategory: vi.fn(),
}));

vi.mock('../useBackBlock', () => ({ useBackBlock: () => {} }));

vi.mock('../i18n/I18nContext', () => ({
  useI18n: () => ({
    lang: 'zh',
    t: (k: string, p?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        'cat.title': '类别管理',
        'form.expense': '支出',
        'form.income': '收入',
        'cat.deleteTitle': '删除类别',
        'cat.deleteContent': `该类别下有 ${p?.count} 条记录，删除后记录仍保留原类别名。`,
        'cat.deleteSubContent': `该子类别下有 ${p?.count} 条记录，删除后记录仍保留原类别名。`,
        'cat.deleteSimpleContent': '删除后不可恢复',
        'cat.keepDelete': '确认删除',
        'cat.deleted': '已删除',
        'cat.deletedWithRecords': '已删除',
        'cat.addCat1': '添加类别',
        'cat.addCat2': '添加子类别',
        'cat.addIncome': '添加收入类别',
        'cat.addExpenseCat': '添加支出类别',
        'cat.done': '完成',
        'cat.cat1Placeholder': '类别名称',
        'cat.cat2Placeholder': '子类别名称',
        'cat.nameExists': '名称已存在',
        'cat.subExists': '名称已存在',
        'cat.cancel': '取消',
        'cat.ok': '确定',
        'list.cancel': '取消',
        'cat.lockedAria': '已锁定',
        'cat.deleteAria': '删除',
        'cat.backAria': '返回',
      };
      return map[k] ?? k;
    },
  }),
}));

// antd message 静态方法在 jsdom 中静默即可
vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  return { ...actual, message: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } };
});

const EXPENSE_CATS = [
  { name: '餐饮饮食', icon: '🍜', children: ['早餐', '自定义小吃'] },
  { name: '我的分类', icon: '📦', children: [] },
];
const INCOME_CATS = [
  { name: '工资收入', icon: '💰', children: [] },
  { name: '副业收入', icon: '💻', children: [] },
];

// pointer 自定义拖拽序列：mock elementFromPoint 与 setPointerCapture
function pointerDrag(src: HTMLElement, dst: HTMLElement) {
  (document.elementFromPoint as unknown as ReturnType<typeof vi.fn>) = vi.fn(() => dst);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  fireEvent.pointerDown(src, { pointerId: 1, button: 0, clientX: 50, clientY: 50 });
  fireEvent.pointerMove(src, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerUp(src, { pointerId: 1, clientX: 100, clientY: 100 });
}

// 抽离自 CategoryManager 的插入顺序计算（pointer 拖拽核心逻辑）
function computeInsertOrder<T extends string>(list: T[], fromName: T, toName: T, position: 'before' | 'after'): T[] | null {
  const from = list.indexOf(fromName);
  const to = list.indexOf(toName);
  if (from < 0 || to < 0 || from === to) return null;
  const next = [...list];
  next.splice(from, 1);
  const newTo = to > from ? to - 1 : to;
  const insertPos = position === 'before' ? newTo : newTo + 1;
  next.splice(insertPos, 0, fromName);
  return next;
}

describe('CategoryManager 网格与角标', () => {
  beforeEach(() => {
    vi.mocked(getCategories).mockImplementation(async (type?: string) =>
      type === 'income' ? INCOME_CATS : EXPENSE_CATS
    );
    vi.mocked(countExpensesByCategory).mockResolvedValue(0);
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('一级网格：预设格有锁角标无删除，自定义格有红✕删除角标，末尾有＋格', async () => {
    render(<CategoryManager open onClose={() => {}} onChanged={() => {}} />);
    const presetCell = (await screen.findByText('餐饮饮食')).closest('.catmgr-cell')! as HTMLElement;
    expect(within(presetCell).getByLabelText('已锁定')).toBeTruthy();
    expect(within(presetCell).queryByLabelText('删除')).toBeNull();

    const customCell = screen.getByText('我的分类').closest('.catmgr-cell')! as HTMLElement;
    expect(within(customCell).getByLabelText('删除')).toBeTruthy();
    expect(within(customCell).queryByLabelText('已锁定')).toBeNull();

    expect(screen.getByRole('button', { name: /添加类别$/ })).toBeTruthy();
  });

  it('红✕删除一级分类 → 两步确认 → deleteCategory1', async () => {
    render(<CategoryManager open onClose={() => {}} onChanged={() => {}} />);
    const cell = (await screen.findByText('我的分类')).closest('.catmgr-cell')! as HTMLElement;
    fireEvent.click(within(cell).getByLabelText('删除'));
    await screen.findByText('删除后不可恢复');
    fireEvent.click(screen.getByText('确认删除'));
    await waitFor(() => expect(deleteCategory1).toHaveBeenCalledWith('我的分类'));
  });

  it('点选一级后子类区浮现；预设子类有锁无删除、自定义子类有红✕；删除走 deleteCategory2', async () => {
    render(<CategoryManager open onClose={() => {}} onChanged={() => {}} />);
    fireEvent.click(await screen.findByText('餐饮饮食'));

    const presetSub = (await screen.findByText('早餐')).closest('.catmgr-sub-cell')! as HTMLElement;
    expect(within(presetSub).getByLabelText('已锁定')).toBeTruthy();
    expect(within(presetSub).queryByLabelText('删除')).toBeNull();

    const customSub = screen.getByText('自定义小吃').closest('.catmgr-sub-cell')! as HTMLElement;
    fireEvent.click(within(customSub).getByLabelText('删除'));
    await screen.findByText('删除后不可恢复');
    fireEvent.click(screen.getByText('确认删除'));
    await waitFor(() => expect(deleteCategory2).toHaveBeenCalledWith('自定义小吃', '餐饮饮食'));
  });

  it('子类别添加：点「＋ 添加子类别」在原页面内联输入，不跳转全屏面板', async () => {
    render(<CategoryManager open onClose={() => {}} onChanged={() => {}} />);
    fireEvent.click(await screen.findByText('餐饮饮食'));
    fireEvent.click(await screen.findByText('添加子类别'));
    expect(screen.getByPlaceholderText('子类别名称')).toBeTruthy();
    expect(document.querySelector('.addcat-page')).toBeNull();
  });

  it('子类别内联添加：重名内联报错，改新名提交调用 addCategory2', async () => {
    render(<CategoryManager open onClose={() => {}} onChanged={() => {}} />);
    fireEvent.click(await screen.findByText('餐饮饮食'));
    fireEvent.click(await screen.findByText('添加子类别'));
    const input = screen.getByPlaceholderText('子类别名称');
    // 重名（早餐为预设子类别）
    fireEvent.change(input, { target: { value: '早餐' } });
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    expect(await screen.findByText('名称已存在')).toBeTruthy();
    expect(addCategory2).not.toHaveBeenCalled();
    // 改为新名提交
    fireEvent.change(input, { target: { value: '夜宵' } });
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    await waitFor(() => expect(addCategory2).toHaveBeenCalledWith('夜宵', '餐饮饮食'));
  });

  it('B8 内联添加：IME 组合 Enter 不提交，普通 Enter 提交 addCategory2', async () => {
    render(<CategoryManager open onClose={() => {}} onChanged={() => {}} />);
    fireEvent.click(await screen.findByText('餐饮饮食'));
    fireEvent.click(await screen.findByText('添加子类别'));
    const input = screen.getByPlaceholderText('子类别名称');
    fireEvent.change(input, { target: { value: '夜宵' } });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    fireEvent.keyUp(input, { key: 'Enter', keyCode: 229 });
    expect(addCategory2).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    fireEvent.keyUp(input, { key: 'Enter', keyCode: 13 });
    await waitFor(() => expect(addCategory2).toHaveBeenCalledWith('夜宵', '餐饮饮食'));
  });

  it('跨父类重名的子分类不被锁定（自定义父类下「早餐」有红✕无锁）', async () => {
    vi.mocked(getCategories).mockImplementation(async (type?: string) =>
      type === 'income' ? INCOME_CATS : [{ name: '我的分类', icon: '📦', children: ['早餐'] }]
    );
    render(<CategoryManager open onClose={() => {}} onChanged={() => {}} />);
    fireEvent.click(await screen.findByText('我的分类'));
    const sub = (await screen.findByText('早餐')).closest('.catmgr-sub-cell')! as HTMLElement;
    expect(within(sub).getByLabelText('删除')).toBeTruthy();
    expect(within(sub).queryByLabelText('已锁定')).toBeNull();
  });

  it('badge 按下不进拖拽：pointerdown/move 落在 ✕ 上不触发 cell dragging 态（保证删除点击不被 setPointerCapture 吞掉）', async () => {
    render(<CategoryManager open onClose={() => {}} onChanged={() => {}} />);
    const cell = (await screen.findByText('我的分类')).closest('.catmgr-cell')! as HTMLElement;
    const badge = within(cell).getByLabelText('删除');
    fireEvent.pointerDown(badge, { pointerId: 1, button: 0, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(badge, { pointerId: 1, clientX: 100, clientY: 100 });
    expect(cell.classList.contains('dragging')).toBe(false);
    fireEvent.pointerUp(badge, { pointerId: 1 });
  });
});

describe('CategoryManager 添加面板', () => {
  beforeEach(() => {
    vi.mocked(getCategories).mockImplementation(async (type?: string) =>
      type === 'income' ? INCOME_CATS : EXPENSE_CATS
    );
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('重名添加：面板内联报错而非 toast，且面板保持打开', async () => {
    render(<CategoryManager open onClose={() => {}} onChanged={() => {}} />);
    fireEvent.click(await screen.findByText('添加类别'));
    const input = screen.getByPlaceholderText('类别名称');
    fireEvent.change(input, { target: { value: '餐饮饮食' } });
    fireEvent.click(screen.getByRole('button', { name: '完成' }));
    expect(await screen.findByText('名称已存在')).toBeTruthy();
    expect(screen.getByPlaceholderText('类别名称')).toBeTruthy();
    expect(message.warning).not.toHaveBeenCalled();
  });

  it('B6 跨 type 查重：支出 tab 添加与收入预设同名「工资收入」→ 内联报错，不调用 addCategory1', async () => {
    render(<CategoryManager open onClose={() => {}} onChanged={() => {}} />);
    fireEvent.click(await screen.findByText('添加类别'));
    const input = screen.getByPlaceholderText('类别名称');
    fireEvent.change(input, { target: { value: '工资收入' } });
    fireEvent.click(screen.getByRole('button', { name: '完成' }));
    expect(await screen.findByText('名称已存在')).toBeTruthy();
    expect(addCategory1).not.toHaveBeenCalled();
  });

  it('B8 添加面板：IME 组合 Enter（keyCode 229）不提交，普通 Enter 提交 addCategory1', async () => {
    render(<CategoryManager open onClose={() => {}} onChanged={() => {}} />);
    fireEvent.click(await screen.findByText('添加类别'));
    const input = screen.getByPlaceholderText('类别名称');
    fireEvent.change(input, { target: { value: '宠物' } });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    fireEvent.keyUp(input, { key: 'Enter', keyCode: 229 });
    expect(addCategory1).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    fireEvent.keyUp(input, { key: 'Enter', keyCode: 13 });
    await waitFor(() => expect(addCategory1).toHaveBeenCalledWith('宠物', '📦', 'expense'));
  });

  it('添加面板标题按收支区分：支出 →「添加支出类别」', async () => {
    render(<CategoryManager open onClose={() => {}} onChanged={() => {}} />);
    fireEvent.click(await screen.findByText('添加类别'));
    expect(screen.getByText('添加支出类别')).toBeTruthy();
  });

  it('收入 tab 添加面板标题为「添加收入类别」', async () => {
    render(<CategoryManager open onClose={() => {}} onChanged={() => {}} />);
    fireEvent.click(await screen.findByText('收入'));
    fireEvent.click(await screen.findByText('添加收入类别'));
    expect(document.querySelector('.addcat-page')).toBeTruthy();
    expect(screen.getAllByText('添加收入类别').length).toBeGreaterThanOrEqual(2);
  });

  it('空输入时「完成」按钮禁用', async () => {
    render(<CategoryManager open onClose={() => {}} onChanged={() => {}} />);
    fireEvent.click(await screen.findByText('添加类别'));
    const doneBtn = screen.getByRole('button', { name: '完成' }) as HTMLButtonElement;
    expect(doneBtn.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('类别名称'), { target: { value: '宠物' } });
    expect((screen.getByRole('button', { name: '完成' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('大图标预览随分组 emoji 选择同步更新', async () => {
    render(<CategoryManager open onClose={() => {}} onChanged={() => {}} />);
    fireEvent.click(await screen.findByText('添加类别'));
    const page = document.querySelector('.addcat-page')!;
    const preview = document.querySelector('.addcat-preview')!;
    expect(preview.textContent).toBe('📦');
    fireEvent.click(within(page as HTMLElement).getByText('🍜'));
    expect(preview.textContent).toBe('🍜');
  });
});

describe('CategoryManager 拖拽排序（pointer 自定义，按住移动即拖）', () => {
  beforeEach(() => {
    vi.mocked(getCategories).mockImplementation(async (type?: string) =>
      type === 'income' ? INCOME_CATS : EXPENSE_CATS
    );
    vi.mocked(countExpensesByCategory).mockResolvedValue(0);
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('格子恒可选中（点击触发），拖拽与点击通过移动阈值区分', async () => {
    render(<CategoryManager open onClose={() => {}} onChanged={() => {}} />);
    const src = (await screen.findByText('餐饮饮食')).closest('.catmgr-cell')! as HTMLElement;
    fireEvent.click(src);
    expect(src.classList.contains('selected')).toBe(true);
    expect(updateCategory1Sort).not.toHaveBeenCalled();
  });

  it('拖拽一级「餐饮饮食」到「我的分类」→ 批量写 updateCategory1Sort', async () => {
    render(<CategoryManager open onClose={() => {}} onChanged={() => {}} />);
    const src = (await screen.findByText('餐饮饮食')).closest('.catmgr-cell')! as HTMLElement;
    const dst = screen.getByText('我的分类').closest('.catmgr-cell')! as HTMLElement;
    pointerDrag(src, dst);
    await waitFor(() => {
      expect(updateCategory1Sort).toHaveBeenCalledTimes(2);
      expect(updateCategory1Sort).toHaveBeenNthCalledWith(1, '我的分类', 0);
      expect(updateCategory1Sort).toHaveBeenNthCalledWith(2, '餐饮饮食', 1);
    });
  });

  it('拖拽子类「早餐」到「自定义小吃」→ 批量写 updateCategory2Sort（父类内）', async () => {
    render(<CategoryManager open onClose={() => {}} onChanged={() => {}} />);
    fireEvent.click(await screen.findByText('餐饮饮食'));
    const src = (await screen.findByText('早餐')).closest('.catmgr-sub-cell')! as HTMLElement;
    const dst = screen.getByText('自定义小吃').closest('.catmgr-sub-cell')! as HTMLElement;
    pointerDrag(src, dst);
    await waitFor(() => {
      expect(updateCategory2Sort).toHaveBeenCalledTimes(2);
      expect(updateCategory2Sort).toHaveBeenNthCalledWith(1, '自定义小吃', '餐饮饮食', 0);
      expect(updateCategory2Sort).toHaveBeenNthCalledWith(2, '早餐', '餐饮饮食', 1);
    });
  });

  it('pointer 拖拽时若未命中目标（elementFromPoint=null）不写库', async () => {
    (document.elementFromPoint as unknown as ReturnType<typeof vi.fn>) = vi.fn(() => null);
    HTMLElement.prototype.setPointerCapture = vi.fn();
    render(<CategoryManager open onClose={() => {}} onChanged={() => {}} />);
    const src = (await screen.findByText('餐饮饮食')).closest('.catmgr-cell')! as HTMLElement;
    fireEvent.pointerDown(src, { pointerId: 1, button: 0, clientX: 50, clientY: 50 });
    fireEvent.pointerMove(src, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(src, { pointerId: 1, clientX: 100, clientY: 100 });
    expect(updateCategory1Sort).not.toHaveBeenCalled();
  });
});

describe('computeInsertOrder 插入顺序计算（纯函数）', () => {
  it('before：拖到目标前', () => {
    expect(computeInsertOrder(['A','B','C'], 'C', 'A', 'before')).toEqual(['C','A','B']);
  });
  it('after：拖到目标后', () => {
    expect(computeInsertOrder(['A','B','C'], 'A', 'C', 'after')).toEqual(['B','C','A']);
  });
  it('from === to 返回 null', () => {
    expect(computeInsertOrder(['A','B','C'], 'B', 'B', 'before')).toBeNull();
  });
  it('from 不在 list 返回 null', () => {
    expect(computeInsertOrder(['A','B','C'], 'X', 'B', 'before')).toBeNull();
  });
});
