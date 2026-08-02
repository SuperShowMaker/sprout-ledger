import { describe, it, expect } from 'vitest';
import { translateCategory } from '../i18n/categoryTranslations';

describe('分类翻译', () => {
  it('中文模式返回原名', () => {
    expect(translateCategory('zh', '餐饮饮食')).toBe('餐饮饮食');
    expect(translateCategory('zh', '早餐')).toBe('早餐');
  });

  it('英文模式返回翻译', () => {
    expect(translateCategory('en', '餐饮饮食')).toBe('Food & Dining');
    expect(translateCategory('en', '早餐')).toBe('Breakfast');
    expect(translateCategory('en', '交通出行')).toBe('Transportation');
    expect(translateCategory('en', '休闲娱乐')).toBe('Entertainment');
  });

  it('自定义分类返回原名', () => {
    expect(translateCategory('zh', '我的自定义')).toBe('我的自定义');
    expect(translateCategory('en', '我的自定义')).toBe('我的自定义');
  });

  it('空字符串返回空', () => {
    expect(translateCategory('zh', '')).toBe('');
    expect(translateCategory('en', '')).toBe('');
  });

  it('自定义分类返回原名', () => {
    expect(translateCategory('en', '宠物食品')).toBe('宠物食品');
    expect(translateCategory('zh', '我的支出')).toBe('我的支出');
  });

  it('10个一级大类全部有英文翻译', () => {
    const cats = ['餐饮饮食','交通出行','购物消费','居家生活','通讯数码','医疗健康','学习成长','休闲娱乐','人情社交','其他支出'];
    cats.forEach(c => {
      const en = translateCategory('en', c);
      expect(en).not.toBe(c);
      expect(typeof en).toBe('string');
      expect(en.length).toBeGreaterThan(0);
    });
  });

  it('54个二级小类全部有英文翻译', () => {
    const subs = [
      '早餐','午餐','晚餐','零食饮料','水果','外卖','聚餐请客',
      '公交地铁','打车','加油停车','共享单车','火车飞机','车辆养护',
      '服装鞋帽','护肤美妆','数码电器','日用品','家居软装','箱包配饰',
      '房租房贷','水电气','物业','家电维修','保洁家政',
      '手机话费','宽带上网','流量充值','数码设备','软件会员','云盘存储',
      '门诊就医','买药','体检','健身','保险',
      '书籍','课程培训','文具','考试报名',
      '影音','游戏','旅行','宠物','运动户外',
      '红包礼金','孝敬父母','聚会社交','慈善捐赠',
      '其他杂项','手续费','临时支出',
    ];
    subs.forEach(s => {
      const en = translateCategory('en', s);
      expect(en).not.toBe(s);
    });
  });
});
