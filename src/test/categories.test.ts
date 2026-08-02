import { describe, it, expect } from 'vitest';
import { defaultCategories, defaultCat1Names, defaultCat2Names } from '../data/categories';

describe('默认分类数据', () => {
  it('有10个一级大类', () => {
    expect(defaultCategories.length).toBe(10);
  });

  it('每个大类有图标和子分类', () => {
    defaultCategories.forEach(cat => {
      expect(cat.name).toBeTruthy();
      expect(cat.icon).toBeTruthy();
      expect(cat.children.length).toBeGreaterThanOrEqual(3);
      expect(cat.children.length).toBeLessThanOrEqual(10);
    });
  });

  it('一级分类名与小类名不重复', () => {
    const cat1Names = new Set(defaultCategories.map(c => c.name));
    defaultCategories.forEach(cat => {
      cat.children.forEach(sub => {
        expect(cat1Names.has(sub)).toBe(false);
      });
    });
  });

  it('锁定名单覆盖所有预设大类', () => {
    defaultCategories.forEach(cat => {
      expect(defaultCat1Names).toContain(cat.name);
    });
  });

  it('锁定名单覆盖所有预设小类', () => {
    const allSubs = defaultCategories.flatMap(c => c.children);
    allSubs.forEach(sub => {
      expect(defaultCat2Names).toContain(sub);
    });
  });

  it('大类名无重复', () => {
    const names = defaultCategories.map(c => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
