import { describe, it, expect } from 'vitest';
import { shouldShowReminder } from '../checkBackupReminder';

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
