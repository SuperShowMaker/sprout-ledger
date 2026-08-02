import { describe, it, expect } from 'vitest';

interface Expense { amount: number; category1: string; category2: string; date: string; note: string; created_at?: string; }

function dedupByCreatedAt(newRecords: Expense[], existingTimestamps: Set<string>): { unique: Expense[]; skipped: number } {
  const unique: Expense[] = [];
  let skipped = 0;
  for (const r of newRecords) {
    if (r.created_at && existingTimestamps.has(r.created_at)) {
      skipped++;
    } else {
      unique.push(r);
      if (r.created_at) existingTimestamps.add(r.created_at);
    }
  }
  return { unique, skipped };
}

function extractTimestamps(records: Expense[]): Set<string> {
  return new Set(records.filter(r => r.created_at).map(r => r.created_at!));
}

describe('导入去重', () => {
  const baseTs = () => new Set<string>(['2026-07-01T12:00:00', '2026-07-01T18:30:00']);

  it('全新记录全部通过', () => {
    const news: Expense[] = [
      { date: '2026-07-02', category1: 'a', category2: 'b', amount: 10, note: '', created_at: '2026-07-02T08:00:00' },
    ];
    const result = dedupByCreatedAt(news, baseTs());
    expect(result.unique.length).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it('完全重复的记录被跳过', () => {
    const news: Expense[] = [
      { date: '2026-07-01', category1: 'a', category2: 'b', amount: 10, note: '', created_at: '2026-07-01T12:00:00' },
    ];
    const result = dedupByCreatedAt(news, baseTs());
    expect(result.unique.length).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('混合：部分重复', () => {
    const news: Expense[] = [
      { date: '2026-07-01', category1: 'a', category2: 'b', amount: 10, note: '', created_at: '2026-07-01T12:00:00' },
      { date: '2026-07-02', category1: 'c', category2: 'd', amount: 20, note: '', created_at: '2026-07-02T08:00:00' },
      { date: '2026-07-01', category1: 'a', category2: 'b', amount: 10, note: '', created_at: '2026-07-01T18:30:00' },
      { date: '2026-07-03', category1: 'e', category2: 'f', amount: 30, note: '', created_at: '2026-07-03T10:00:00' },
    ];
    const result = dedupByCreatedAt(news, baseTs());
    expect(result.unique.length).toBe(2);
    expect(result.skipped).toBe(2);
  });

  it('同一批次内的重复只保留第一个', () => {
    const news: Expense[] = [
      { date: '2026-07-05', category1: 'a', category2: 'b', amount: 10, note: '', created_at: '2026-07-05T08:00:00' },
      { date: '2026-07-05', category1: 'a', category2: 'b', amount: 10, note: '', created_at: '2026-07-05T08:00:00' },
    ];
    const result = dedupByCreatedAt(news, baseTs());
    expect(result.unique.length).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('无created_at的记录不做去重', () => {
    const news: Expense[] = [
      { date: '2026-07-01', category1: 'a', category2: 'b', amount: 10, note: '', created_at: undefined },
      { date: '2026-07-01', category1: 'a', category2: 'b', amount: 10, note: '', created_at: undefined },
    ];
    const result = dedupByCreatedAt(news, baseTs());
    expect(result.unique.length).toBe(2); // 没时间戳就不去重
    expect(result.skipped).toBe(0);
  });

  it('extractTimestamps 提取所有时间戳', () => {
    const records: Expense[] = [
      { date: '2026-07-01', category1: 'a', category2: 'b', amount: 10, note: '', created_at: '2026-07-01T08:00:00' },
      { date: '2026-07-01', category1: 'c', category2: 'd', amount: 20, note: '', created_at: '2026-07-01T12:00:00' },
      { date: '2026-07-01', category1: 'e', category2: 'f', amount: 30, note: '', created_at: undefined },
    ];
    const ts = extractTimestamps(records);
    expect(ts.size).toBe(2);
  });
});
