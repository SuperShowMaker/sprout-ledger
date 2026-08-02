// 备份提醒判断逻辑（纯函数，组件和测试共用）

export interface ReminderParams {
  lastExportDate: string | null;
  firstRecordDate: string | null;
  lastRemindedDate: string | null;
  today: string;
}

export function shouldShowReminder(params: ReminderParams): boolean {
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

/** 计算距上次备份的天数 */
export function daysSince(date: string, today: string): number {
  return Math.floor((new Date(today).getTime() - new Date(date).getTime()) / 86400000);
}
