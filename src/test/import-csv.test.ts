import { describe, it, expect } from 'vitest';

// CSV导入解析逻辑（纯函数）
interface Expense { amount: number; category1: string; category2: string; date: string; note: string; }

interface CategoryMap {
  cat1Set: Set<string>;
  cat2Map: Record<string, Set<string>>;
}

function parseImportCsv(
  content: string,
  categories?: CategoryMap
): { parsed: Expense[]; errors: string[] } {
  const lines = content.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return { parsed: [], errors: ['文件内容为空'] };

  const header = lines[0].replace(/^﻿/, '');
  const headerCols = header.split(',').map(h => h.trim());
  const validHeaders = [
    ['日期','一级分类','二级分类','金额','备注'],
    ['Date','Category1','Category2','Amount','Note'],
    ['日期','一级分类','二级分类','金额','备注','记录时间'],
    ['Date','Category1','Category2','Amount','Note','CreatedAt'],
  ];
  const match = validHeaders.some(eh =>
    eh.every(col => headerCols.some(h => h.toLowerCase() === col.toLowerCase()))
  );
  if (!match) return { parsed: [], errors: ['表头格式不正确'] };

  const parsed: Expense[] = [];
  const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',').map(x => x.trim());
    if (c.length < 4) { errors.push(`第${i+1}行:列数不足`); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c[0])) { errors.push(`第${i+1}行:日期格式错误`); continue; }
    const amt = parseFloat(c[3]);
    if (isNaN(amt) || amt <= 0) { errors.push(`第${i+1}行:金额无效`); continue; }
    if (!c[1]) { errors.push(`第${i+1}行:分类为空`); continue; }
    if (categories) {
      if (!categories.cat1Set.has(c[1])) {
        errors.push(`第${i+1}行:分类"${c[1]}"不存在`);
        continue;
      }
      if (c[2] && categories.cat2Map[c[1]] && !categories.cat2Map[c[1]].has(c[2])) {
        errors.push(`第${i+1}行:子分类"${c[2]}"不属于"${c[1]}"`);
        continue;
      }
    }
    parsed.push({ date: c[0], category1: c[1], category2: c[2]||'', amount: amt, note: c[4]||'' });
  }
  return { parsed, errors };
}

// 批量写入分片逻辑
function chunkExpenses<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// 真实分类数据（与categories.ts一致）
const realCats: CategoryMap = {
  cat1Set: new Set([
    '餐饮饮食','交通出行','购物消费','居家生活',
    '通讯数码','医疗健康','学习成长','休闲娱乐',
    '人情社交','其他支出',
  ]),
  cat2Map: {
    '餐饮饮食': new Set(['早餐','午餐','晚餐','零食饮料','水果','外卖','聚餐请客']),
    '交通出行': new Set(['公交地铁','打车','加油停车','共享单车','火车飞机','车辆养护']),
    '购物消费': new Set(['日用品','服装鞋帽','护肤美妆','数码电器','家居软装','箱包配饰']),
    '居家生活': new Set(['房租房贷','水电气','物业','家电维修','保洁家政']),
    '通讯数码': new Set(['手机话费','宽带上网','流量充值','数码设备','软件会员','云盘存储']),
    '医疗健康': new Set(['买药','门诊就医','体检','健身','保险']),
    '学习成长': new Set(['文具','书籍','课程培训','考试报名']),
    '休闲娱乐': new Set(['影音','游戏','旅行','宠物','运动户外']),
    '人情社交': new Set(['红包礼金','孝敬父母','聚会社交','慈善捐赠']),
    '其他支出': new Set(['其他杂项','手续费','临时支出']),
  },
};

// ==================== 原有测试 ====================
describe('CSV导入解析 - 基础功能', () => {
  it('正常CSV全部解析成功', () => {
    const csv = '日期,一级分类,二级分类,金额,备注\n2026-07-01,餐饮饮食,早餐,15.5,\n2026-07-02,交通出行,打车,32,下班打车';
    const result = parseImportCsv(csv);
    expect(result.parsed.length).toBe(2);
    expect(result.errors.length).toBe(0);
    expect(result.parsed[0].amount).toBe(15.5);
  });

  it('表头格式不对', () => {
    const csv = '日期,金额\n2026-07-01,15.5';
    const result = parseImportCsv(csv);
    expect(result.parsed.length).toBe(0);
    expect(result.errors).toContain('表头格式不正确');
  });

  it('空文件', () => {
    expect(parseImportCsv('').errors).toContain('文件内容为空');
    expect(parseImportCsv('日期,一级分类,二级分类,金额,备注').errors).toContain('文件内容为空');
  });

  it('日期格式错误', () => {
    const csv = '日期,一级分类,二级分类,金额,备注\n2026/07/01,餐饮饮食,早餐,15';
    const result = parseImportCsv(csv);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('日期');
  });

  it('金额无效', () => {
    const csv = '日期,一级分类,二级分类,金额,备注\n2026-07-01,餐饮饮食,早餐,abc';
    const result = parseImportCsv(csv);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('金额');
  });

  it('金额为0或负数', () => {
    const csv = '日期,一级分类,二级分类,金额,备注\n2026-07-01,餐饮饮食,早餐,0\n2026-07-02,餐饮饮食,早餐,-5';
    const result = parseImportCsv(csv);
    expect(result.errors.length).toBe(2);
  });

  it('部分行错误不影响正确行', () => {
    const csv = '日期,一级分类,二级分类,金额,备注\n2026-07-01,餐饮饮食,早餐,15\n2026-07-02,,,abc\n2026-07-03,交通出行,打车,32';
    const result = parseImportCsv(csv);
    expect(result.parsed.length).toBe(2);
    expect(result.errors.length).toBe(1);
  });

  it('BOM头兼容', () => {
    const csv = '﻿日期,一级分类,二级分类,金额,备注\n2026-07-01,餐饮饮食,早餐,15';
    const result = parseImportCsv(csv);
    expect(result.parsed.length).toBe(1);
    expect(result.errors.length).toBe(0);
  });

  it('小类可为空', () => {
    const csv = '日期,一级分类,二级分类,金额,备注\n2026-07-01,餐饮饮食,,15';
    const result = parseImportCsv(csv);
    expect(result.parsed.length).toBe(1);
    expect(result.parsed[0].category2).toBe('');
  });
});

// ==================== 分类校验测试 ====================
describe('CSV导入解析 - 分类校验', () => {
  it('真实分类数据全部通过', () => {
    const rows = realCats.cat1Set.values();
    let csv = '日期,一级分类,二级分类,金额,备注\n';
    let i = 0;
    for (const cat1 of rows) {
      const subs = realCats.cat2Map[cat1];
      const sub = subs ? [...subs][0] : '';
      csv += `2026-07-${String(++i).padStart(2,'0')},${cat1},${sub},100,\n`;
    }
    const result = parseImportCsv(csv, realCats);
    expect(result.parsed.length).toBe(10); // 10个大类全通过
    expect(result.errors.length).toBe(0);
  });

  it('虚假一级分类被拒绝', () => {
    const csv = '日期,一级分类,二级分类,金额,备注\n2026-07-01,虚假分类,早餐,15';
    const result = parseImportCsv(csv, realCats);
    expect(result.parsed.length).toBe(0);
    expect(result.errors[0]).toContain('"虚假分类"不存在');
  });

  it('真实大类下虚假子分类被拒绝', () => {
    const csv = '日期,一级分类,二级分类,金额,备注\n2026-07-01,餐饮饮食,水电,15';
    const result = parseImportCsv(csv, realCats);
    expect(result.parsed.length).toBe(0);
    expect(result.errors[0]).toContain('"水电"不属于"餐饮饮食"');
  });

  it('正确子分类通过但错误分类拒绝：混合场景', () => {
    const csv = [
      '日期,一级分类,二级分类,金额,备注',
      '2026-07-01,餐饮饮食,早餐,15',       // 正确
      '2026-07-02,交通出行,打车,32',        // 正确
      '2026-07-03,不存在的类,早餐,10',      // 大类不存在
      '2026-07-04,居家生活,水电气,200',     // 正确
      '2026-07-05,餐饮饮食,不存在子类,50',   // 子类不在餐饮饮食下
      '2026-07-06,购物消费,日用品,80',      // 正确
    ].join('\n');
    const result = parseImportCsv(csv, realCats);
    expect(result.parsed.length).toBe(4);  // 4条正确
    expect(result.errors.length).toBe(2);  // 2条错误
    expect(result.errors[0]).toContain('不存在的类');
    expect(result.errors[1]).toContain('不存在子类');
  });

  it('不传分类则不做校验（向后兼容）', () => {
    const csv = '日期,一级分类,二级分类,金额,备注\n2026-07-01,任何分类,任意子类,15';
    const result = parseImportCsv(csv); // 不传categories
    expect(result.parsed.length).toBe(1);
    expect(result.errors.length).toBe(0);
  });
});

// ==================== 英文报头测试 ====================
describe('CSV导入解析 - 英文报头', () => {
  it('英文报头可正常解析', () => {
    const csv = 'Date,Category1,Category2,Amount,Note\n2026-07-01,餐饮饮食,早餐,15\n2026-07-02,交通出行,打车,32';
    const result = parseImportCsv(csv);
    expect(result.parsed.length).toBe(2);
    expect(result.errors.length).toBe(0);
  });

  it('英文6列报头兼容', () => {
    const csv = 'Date,Category1,Category2,Amount,Note,CreatedAt\n2026-07-01,餐饮饮食,早餐,15,,2026-07-01T08:00:00';
    const result = parseImportCsv(csv);
    expect(result.parsed.length).toBe(1);
  });

  it('混合大小写报头兼容', () => {
    const csv = 'DATE,category1,CATEGORY2,amount,NOTE\n2026-07-01,餐饮饮食,早餐,15,test';
    const result = parseImportCsv(csv);
    expect(result.parsed.length).toBe(1);
  });
});

// ==================== 分片批量插入测试 ====================
describe('批量插入 - 分片逻辑', () => {
  it('空数组返回空分片', () => {
    expect(chunkExpenses([], 150)).toEqual([]);
  });

  it('小于分片大小不分片', () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const chunks = chunkExpenses(items, 150);
    expect(chunks.length).toBe(1);
    expect(chunks[0].length).toBe(100);
  });

  it('刚好等于分片大小', () => {
    const items = Array.from({ length: 150 }, (_, i) => i);
    const chunks = chunkExpenses(items, 150);
    expect(chunks.length).toBe(1);
    expect(chunks[0].length).toBe(150);
  });

  it('超过分片大小拆成多片', () => {
    const items = Array.from({ length: 500 }, (_, i) => i);
    const chunks = chunkExpenses(items, 150);
    expect(chunks.length).toBe(4); // 150+150+150+50
    expect(chunks[0].length).toBe(150);
    expect(chunks[1].length).toBe(150);
    expect(chunks[2].length).toBe(150);
    expect(chunks[3].length).toBe(50);
  });

  it('模拟10万条数据分片', () => {
    const items = Array.from({ length: 100000 }, (_, i) => ({ id: i, name: `item${i}` }));
    const chunks = chunkExpenses(items, 150);
    expect(chunks.length).toBe(667); // 100000/150 = 666.67 → 667
    expect(chunks[666].length).toBe(100); // 最后一组 100000%150 = 100
  });

  it('所有元素不丢失不重复', () => {
    const items = Array.from({ length: 1000 }, (_, i) => `item-${i}`);
    const chunks = chunkExpenses(items, 150);
    const flat = chunks.flat();
    expect(flat.length).toBe(1000);
    expect(flat).toEqual(items);
  });
});
