import { describe, it, expect } from 'vitest';

// 导入状态机 reducer（与 Profile.tsx 一致）
type ImportPhase = 'idle' | 'importing' | 'done';
interface ImportData { total: number; success: number; skipped: number; errors: Record<string, number>; }
interface ImportState { phase: ImportPhase; progress: { done: number; total: number }; result: ImportData | null; error: string | null; }
type ImportAction =
  | { type: 'START' } | { type: 'PROGRESS'; done: number; total: number }
  | { type: 'DONE'; result: ImportData } | { type: 'ERROR'; error: string } | { type: 'DISMISS' };

function importReducer(state: ImportState, action: ImportAction): ImportState {
  switch (action.type) {
    case 'START': return { phase: 'importing', progress: { done: 0, total: 0 }, result: null, error: null };
    case 'PROGRESS': return { ...state, progress: { done: action.done, total: action.total } };
    case 'DONE': return { phase: 'done', progress: state.progress, result: action.result, error: null };
    case 'ERROR': return { phase: 'done', progress: state.progress, result: null, error: action.error };
    case 'DISMISS': return { phase: 'idle', progress: { done: 0, total: 0 }, result: null, error: null };
    default: return state;
  }
}

const idle: ImportState = { phase: 'idle', progress: { done: 0, total: 0 }, result: null, error: null };

describe('导入状态机', () => {
  it('idle → START → importing', () => {
    const next = importReducer(idle, { type: 'START' });
    expect(next.phase).toBe('importing');
    expect(next.progress).toEqual({ done: 0, total: 0 });
    expect(next.result).toBeNull();
    expect(next.error).toBeNull();
  });

  it('START 只在 idle 态有效', () => {
    const importing = importReducer(idle, { type: 'START' });
    // 在 importing 态再发 START，仍是 importing
    const next = importReducer(importing, { type: 'START' });
    expect(next.phase).toBe('importing');
  });

  it('importing → PROGRESS 更新进度', () => {
    const importing = importReducer(idle, { type: 'START' });
    const next = importReducer(importing, { type: 'PROGRESS', done: 150, total: 500 });
    expect(next.phase).toBe('importing');
    expect(next.progress).toEqual({ done: 150, total: 500 });
  });

  it('PROGRESS 多次更新', () => {
    let state = importReducer(idle, { type: 'START' });
    state = importReducer(state, { type: 'PROGRESS', done: 50, total: 500 });
    state = importReducer(state, { type: 'PROGRESS', done: 200, total: 500 });
    state = importReducer(state, { type: 'PROGRESS', done: 500, total: 500 });
    expect(state.progress).toEqual({ done: 500, total: 500 });
  });

  it('importing → DONE → done', () => {
    const importing = importReducer(idle, { type: 'START' });
    const result: ImportData = { total: 100, success: 95, skipped: 5, errors: { '格式不符': 0 } };
    const next = importReducer(importing, { type: 'DONE', result });
    expect(next.phase).toBe('done');
    expect(next.result).toEqual(result);
    expect(next.error).toBeNull();
  });

  it('importing → ERROR → done 带错误信息', () => {
    const importing = importReducer(idle, { type: 'START' });
    const next = importReducer(importing, { type: 'ERROR', error: '文件过大' });
    expect(next.phase).toBe('done');
    expect(next.result).toBeNull();
    expect(next.error).toBe('文件过大');
  });

  it('done → DISMISS → idle', () => {
    const done = importReducer(
      importReducer(idle, { type: 'START' }),
      { type: 'DONE', result: { total: 10, success: 10, skipped: 0, errors: {} } }
    );
    const next = importReducer(done, { type: 'DISMISS' });
    expect(next.phase).toBe('idle');
    expect(next.result).toBeNull();
    expect(next.progress).toEqual({ done: 0, total: 0 });
  });

  it('importing → DISMISS → idle（用户中途取消）', () => {
    const importing = importReducer(idle, { type: 'START' });
    const next = importReducer(importing, { type: 'DISMISS' });
    expect(next.phase).toBe('idle');
    expect(next.progress).toEqual({ done: 0, total: 0 });
  });

  it('DISMISS 两连 → idle', () => {
    const next = importReducer(idle, { type: 'DISMISS' });
    expect(next.phase).toBe('idle');
  });

  it('结果包含错误详情', () => {
    const importing = importReducer(idle, { type: 'START' });
    const result: ImportData = { total: 200, success: 180, skipped: 10, errors: { '格式不符': 10 } };
    const next = importReducer(importing, { type: 'DONE', result });
    expect(next.result?.errors['格式不符']).toBe(10);
  });

  it('进度在 ERROR 时保留', () => {
    let state = importReducer(idle, { type: 'START' });
    state = importReducer(state, { type: 'PROGRESS', done: 300, total: 500 });
    state = importReducer(state, { type: 'ERROR', error: '写入失败' });
    expect(state.progress).toEqual({ done: 300, total: 500 });
  });
});
