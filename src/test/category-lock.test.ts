import { describe, it, expect } from 'vitest';
import { defaultCat1Names, defaultCat2Names } from '../data/categories';

function isDefaultCat1(name: string) { return defaultCat1Names.includes(name); }
function isDefaultCat2(name: string) { return defaultCat2Names.includes(name); }

describe('分类锁定逻辑', () => {
  it('10个预设大类全部锁定', () => {
    ['餐饮饮食','交通出行','购物消费','居家生活','通讯数码','医疗健康','学习成长','休闲娱乐','人情社交','其他支出']
      .forEach(c => expect(isDefaultCat1(c)).toBe(true));
  });

  it('自定义大类不锁定', () => {
    expect(isDefaultCat1('宠物')).toBe(false);
    expect(isDefaultCat1('投资理财')).toBe(false);
  });

  it('51个预设子分类全部锁定', () => {
    expect(defaultCat2Names.length).toBe(51);
  });

  it('自定义子分类不锁定', () => {
    expect(isDefaultCat2('桌游')).toBe(false);
    expect(isDefaultCat2('演唱会')).toBe(false);
  });

  it('空字符串不锁定', () => {
    expect(isDefaultCat2('')).toBe(false);
  });
});
