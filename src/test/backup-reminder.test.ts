import { describe, it, expect } from 'vitest';

function shouldShowReminder(params: {
  lastExportDate: string | null;
  firstRecordDate: string | null;
  lastRemindedDate: string | null;
  today: string;
}): boolean {
  const today = new Date(params.today);
  
  if (params.lastExportDate) {
    const lastExport = new Date(params.lastExportDate);
    const daysSinceExport = Math.floor((today.getTime() - lastExport.getTime()) / 86400000);
    
    if (daysSinceExport <= 30) return false; // 30天内导出过
    
    if (params.lastRemindedDate) {
      const lastReminded = new Date(params.lastRemindedDate);
      const daysSinceReminded = Math.floor((today.getTime() - lastReminded.getTime()) / 86400000);
      if (daysSinceReminded <= 7) return false; // 7天内提醒过
    }
    return true;
  }
  
  // 从未导出
  if (params.firstRecordDate) {
    const firstRecord = new Date(params.firstRecordDate);
    const daysSinceFirst = Math.floor((today.getTime() - firstRecord.getTime()) / 86400000);
    return daysSinceFirst > 30; // 第一条记录超过30天才提示
  }
  
  return false; // 没有任何记录
}

describe('备份提醒逻辑', () => {
  const today = '2026-08-25';

  it('从未导出 + 第一条记录 > 30天 → 提示', () => {
    expect(shouldShowReminder({ lastExportDate: null, firstRecordDate: '2026-07-01', lastRemindedDate: null, today })).toBe(true);
  });

  it('从未导出 + 第一条记录 < 30天 → 不提示', () => {
    expect(shouldShowReminder({ lastExportDate: null, firstRecordDate: '2026-08-10', lastRemindedDate: null, today })).toBe(false);
  });

  it('导出过 + 距上次 < 30天 → 不提示', () => {
    expect(shouldShowReminder({ lastExportDate: '2026-08-01', firstRecordDate: null, lastRemindedDate: null, today })).toBe(false);
  });

  it('导出过 + 距上次 > 30天 → 提示', () => {
    expect(shouldShowReminder({ lastExportDate: '2026-07-01', firstRecordDate: null, lastRemindedDate: null, today })).toBe(true);
  });

  it('导出过 + 距上次 > 30天 + 7天内提醒过 → 不提示', () => {
    expect(shouldShowReminder({ lastExportDate: '2026-07-01', firstRecordDate: null, lastRemindedDate: '2026-08-20', today })).toBe(false);
  });

  it('导出过 + 距上次 > 30天 + 上次提醒 > 7天 → 提示', () => {
    expect(shouldShowReminder({ lastExportDate: '2026-07-01', firstRecordDate: null, lastRemindedDate: '2026-08-01', today })).toBe(true);
  });

  it('无任何记录 → 不提示', () => {
    expect(shouldShowReminder({ lastExportDate: null, firstRecordDate: null, lastRemindedDate: null, today })).toBe(false);
  });
});
