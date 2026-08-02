import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';

// 日历格子计算（从ExpenseList抽取）
function buildCalendarGrid(viewMonth: dayjs.Dayjs, recordDates: Set<string>) {
  const startOfMonth = viewMonth.startOf('month');
  const startDay = startOfMonth.day();
  const offset = startDay === 0 ? 6 : startDay - 1;
  const gridStart = startOfMonth.subtract(offset, 'day');
  const today = dayjs().format('YYYY-MM-DD');
  const weeks: { date: string; day: number; isCurrentMonth: boolean; hasRecord: boolean; isToday: boolean }[][] = [];

  for (let w = 0; w < 6; w++) {
    const week: typeof weeks[0] = [];
    for (let d = 0; d < 7; d++) {
      const date = gridStart.add(w * 7 + d, 'day');
      const dateStr = date.format('YYYY-MM-DD');
      week.push({
        date: dateStr,
        day: date.date(),
        isCurrentMonth: date.month() === viewMonth.month(),
        hasRecord: recordDates.has(dateStr),
        isToday: dateStr === today,
      });
    }
    weeks.push(week);
  }
  return weeks;
}

describe('日历格子计算', () => {
  it('7月1日是周三，网格从周一6/29开始', () => {
    const month = dayjs('2026-07-01');
    const grid = buildCalendarGrid(month, new Set());
    expect(grid[0][0].date).toBe('2026-06-29'); // 周一
    expect(grid[0][2].date).toBe('2026-07-01'); // 周三
  });

  it('始终生成6行42格', () => {
    const grid = buildCalendarGrid(dayjs('2026-07-01'), new Set());
    expect(grid.length).toBe(6);
    grid.forEach(row => expect(row.length).toBe(7));
  });

  it('标记当月和非当月', () => {
    const grid = buildCalendarGrid(dayjs('2026-07-01'), new Set());
    expect(grid[0][0].isCurrentMonth).toBe(false); // 6/29
    expect(grid[0][2].isCurrentMonth).toBe(true);  // 7/1 (周三)
  });

  it('标记有记录的日期', () => {
    const records = new Set(['2026-07-15']);
    const grid = buildCalendarGrid(dayjs('2026-07-01'), records);
    const jul15 = grid.flat().find(c => c.date === '2026-07-15');
    expect(jul15?.hasRecord).toBe(true);
  });

  it('跨年月份：12月可能包含次年1月的日期', () => {
    const grid = buildCalendarGrid(dayjs('2025-12-01'), new Set());
    const hasNextYear = grid.flat().some(c => c.date.startsWith('2026'));
    expect(hasNextYear).toBe(true);
  });
});
