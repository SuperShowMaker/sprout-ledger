import { describe, it, expect } from 'vitest';
import { incomeCategories, incomeCat1Names, defaultCategories } from '../data/categories';
import { translateCategory } from '../i18n/categoryTranslations';

describe('收入预设分类完整性', () => {
  it('恰好 7 个预设', () => {
    expect(incomeCategories.length).toBe(7);
  });

  it('全部无子分类（收入来源简单，点选即进键盘）', () => {
    incomeCategories.forEach((c) => expect(c.children).toEqual([]));
  });

  it('名称与支出预设不冲突', () => {
    const expenseNames = new Set(defaultCategories.map((c) => c.name));
    incomeCategories.forEach((c) => {
      expect(expenseNames.has(c.name)).toBe(false);
    });
  });

  it('图标非空且唯一', () => {
    const icons = new Set<string>();
    incomeCategories.forEach((c) => {
      expect(c.icon).toBeTruthy();
      expect(icons.has(c.icon)).toBe(false);
      icons.add(c.icon);
    });
  });

  it('incomeCat1Names 与预设一致', () => {
    expect(incomeCat1Names).toEqual(incomeCategories.map((c) => c.name));
  });

  it('每个分类都有中英翻译（en 不回落为原名）', () => {
    incomeCategories.forEach((c) => {
      expect(translateCategory('zh', c.name)).toBe(c.name);
      expect(translateCategory('en', c.name)).not.toBe(c.name);
      expect(translateCategory('en', c.name)).not.toBe('');
    });
  });
});
