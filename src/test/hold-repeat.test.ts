import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHoldRepeater } from '../holdRepeat';

afterEach(() => vi.useRealTimers());

describe('createHoldRepeater 长按连删定时器', () => {
  it('按下立即执行一次 onTick', () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    const r = createHoldRepeater({ delay: 300, interval: 50, onTick });
    r.start();
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it('超过延迟后进入连删', () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    const r = createHoldRepeater({ delay: 300, interval: 50, onTick });
    r.start(); // 1
    vi.advanceTimersByTime(300); // 到达延迟点，尚未额外执行
    vi.advanceTimersByTime(50);  // 2
    vi.advanceTimersByTime(100); // 3,4
    expect(onTick).toHaveBeenCalledTimes(4);
  });

  it('延迟内 stop 不进入连删', () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    const r = createHoldRepeater({ delay: 300, interval: 50, onTick });
    r.start();
    r.stop(); // 立即松手
    vi.advanceTimersByTime(500);
    expect(onTick).toHaveBeenCalledTimes(1); // 只有按下那一次
  });

  it('连删中 stop 停止后续触发', () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    const r = createHoldRepeater({ delay: 300, interval: 50, onTick });
    r.start();
    vi.advanceTimersByTime(300);
    vi.advanceTimersByTime(50);
    r.stop();
    const count = onTick.mock.calls.length;
    vi.advanceTimersByTime(500);
    expect(onTick.mock.calls.length).toBe(count);
  });

  it('重复 start 不叠加定时器', () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    const r = createHoldRepeater({ delay: 300, interval: 50, onTick });
    r.start();
    r.start(); // 第二次：再次立即执行 + 重置延迟
    vi.advanceTimersByTime(300);
    vi.advanceTimersByTime(100);
    expect(onTick).toHaveBeenCalledTimes(4); // 2次start + 连删2
  });
});
