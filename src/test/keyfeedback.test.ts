// keyFeedback 纯逻辑测试：合成音参数 + 震动封装
import { describe, it, expect, vi, afterEach } from 'vitest';
import { synthesizeTick, vibrate, synthesizeCoin } from '../keyFeedback';

// 伪 AudioContext：记录每次 createOscillator 返回的节点及其调用
function createFakeAudioContext() {
  const oscCalls: any[] = [];
  const mkGain = () => ({
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(() => ({})),
  });
  const ctx: any = {
    currentTime: 0,
    destination: {},
    createOscillator: vi.fn(() => {
      const osc: any = {
        type: '',
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(() => mkGain()),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscCalls.push(osc);
      return osc;
    }),
    createGain: vi.fn(() => mkGain()),
  };
  return { ctx, oscCalls };
}

afterEach(() => {
  delete (navigator as any).vibrate;
});

describe('synthesizeTick', () => {
  it('num：单振荡器，正弦下滑音（1200→900Hz，30ms），低增益', () => {
    const { ctx, oscCalls } = createFakeAudioContext();
    synthesizeTick(ctx, 'num');
    expect(oscCalls).toHaveLength(1);
    const osc = oscCalls[0];
    expect(osc.type).toBe('sine');
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(1200, 0);
    expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(900, 0.03);
    expect(osc.start).toHaveBeenCalledWith(0);
    expect(osc.stop).toHaveBeenCalledWith(0.03);
  });

  it('fn：单振荡器，方波低沉音（600Hz，50ms）', () => {
    const { ctx, oscCalls } = createFakeAudioContext();
    synthesizeTick(ctx, 'fn');
    expect(oscCalls).toHaveLength(1);
    const osc = oscCalls[0];
    expect(osc.type).toBe('square');
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(600, 0);
    expect(osc.stop).toHaveBeenCalledWith(0.05);
  });

  it('error：单振荡器，方波低沉拒绝音（200Hz，80ms）', () => {
    const { ctx, oscCalls } = createFakeAudioContext();
    synthesizeTick(ctx, 'error');
    expect(oscCalls).toHaveLength(1);
    expect(oscCalls[0].type).toBe('square');
    expect(oscCalls[0].frequency.setValueAtTime).toHaveBeenCalledWith(200, 0);
    expect(oscCalls[0].stop).toHaveBeenCalledWith(0.08);
  });

  it('音量包络：瞬时起、指数衰减到近零，避免爆音', () => {
    const { ctx } = createFakeAudioContext();
    synthesizeTick(ctx, 'num');
    // 第一个 gain 节点：起音 0.05，衰减到 0.0001
    const gain = ctx.createGain.mock.results[0].value;
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0.05, 0);
    expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 0.03);
  });
});

describe('synthesizeCoin', () => {
  it('三泛音并行：880/1760/2640Hz 同起点，各 0.18s 正弦衰减', () => {
    const { ctx, oscCalls } = createFakeAudioContext();
    synthesizeCoin(ctx);
    expect(oscCalls).toHaveLength(3);
    expect(oscCalls.map((o) => o.frequency.setValueAtTime.mock.calls[0][0])).toEqual([880, 1760, 2640]);
    oscCalls.forEach((o) => {
      expect(o.type).toBe('sine');
      expect(o.start).toHaveBeenCalledWith(0);
      expect(o.stop).toHaveBeenCalledWith(0.18);
    });
  });

  it('泛音音量逐级递减（0.06/0.04/0.025），指数衰减防爆音', () => {
    const { ctx } = createFakeAudioContext();
    synthesizeCoin(ctx);
    const gains = ctx.createGain.mock.results.map((r: any) => r.value);
    expect(gains).toHaveLength(3);
    expect(gains.map((g: any) => g.gain.setValueAtTime.mock.calls[0][0])).toEqual([0.06, 0.04, 0.025]);
    gains.forEach((g: any) => {
      expect(g.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 0.18);
    });
  });
});

describe('vibrate', () => {
  it('navigator 支持时调用 vibrate(ms)', () => {
    const vib = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vib });
    vibrate(10);
    expect(vib).toHaveBeenCalledWith(10);
  });

  it('navigator 不支持时静默跳过', () => {
    expect(() => vibrate(10)).not.toThrow();
  });
});

// getAudioCtx 是模块级共享单例，用 resetModules + 动态 import 隔离各用例
describe('getAudioCtx', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('无 AudioContext 环境（jsdom）返回 null 且不抛错', async () => {
    const mod = await import('../keyFeedback');
    expect(mod.getAudioCtx()).toBeNull();
  });

  it('suspended 时 resume 解锁，重复调用复用同一实例', async () => {
    const resume = vi.fn().mockResolvedValue(undefined);
    // 用 class 构造器：vi.fn 作构造器 new 时返回 mock 实例（state 为 undefined），测不到 resume 分支
    class FakeCtx { state = 'suspended'; resume = resume; }
    vi.stubGlobal('AudioContext', FakeCtx as unknown as typeof AudioContext);
    const mod = await import('../keyFeedback');
    const a = mod.getAudioCtx();
    const b = mod.getAudioCtx();
    expect(a).toBe(b);
    expect(resume).toHaveBeenCalled();
  });

  it('running 状态不重复 resume', async () => {
    const resume = vi.fn();
    class FakeCtx { state = 'running'; resume = resume; }
    vi.stubGlobal('AudioContext', FakeCtx as unknown as typeof AudioContext);
    const mod = await import('../keyFeedback');
    mod.getAudioCtx();
    mod.getAudioCtx();
    expect(resume).not.toHaveBeenCalled();
  });
});
