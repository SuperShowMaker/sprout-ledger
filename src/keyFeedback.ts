// 青禾记账 - 键盘反馈：合成音 + 震动（纯逻辑，可独立测试）
// 用 Web Audio 实时合成短音，零资源文件、延迟 <5ms；Tauri WebView2 / Android WebView 均支持

export type KeySoundType = 'num' | 'fn' | 'error';

interface ToneSpec {
  freq: number;
  /** 频率结束值（滑音），无则恒定 */
  freqEnd?: number;
  duration: number;
  type: OscillatorType;
  /** 低增益：记账键盘高频操作，声音必须克制 */
  gain: number;
}

const TONES: Record<KeySoundType, ToneSpec | ToneSpec[]> = {
  // 数字键：轻脆短音，轻微下滑
  num: { freq: 1200, freqEnd: 900, duration: 0.03, type: 'sine', gain: 0.05 },
  // 功能键 C/⌫：略低沉
  fn: { freq: 600, duration: 0.05, type: 'square', gain: 0.03 },
  // 输入被拒（超限等）：低沉短音提示
  error: { freq: 200, duration: 0.08, type: 'square', gain: 0.04 },
};

/** 合成一段（或一段序列）提示音。调用方负责在用户手势中触发（AudioContext 自动播放策略） */
export function synthesizeTick(ctx: AudioContext, type: KeySoundType): void {
  const specs = Array.isArray(TONES[type]) ? TONES[type] : [TONES[type]];
  let t0 = ctx.currentTime;
  for (const s of specs) {
    renderTone(ctx, s, t0);
    t0 += s.duration;
  }
}

/** 渲染单个音：创建振荡器 + 增益包络，从 t0 起、持续 s.duration */
function renderTone(ctx: AudioContext, s: ToneSpec, t0: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = s.type;
  osc.frequency.setValueAtTime(s.freq, t0);
  if (s.freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(s.freqEnd, t0 + s.duration);
  }
  // 音量包络：瞬时起、指数衰减到近零，避免爆音
  gain.gain.setValueAtTime(s.gain, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + s.duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + s.duration);
}

// 记账成功「金币叮」：三金属泛音并行（基音 + 2×、3× 泛音），入账感
const COIN_TONES: ToneSpec[] = [
  { freq: 880, duration: 0.18, type: 'sine', gain: 0.06 },
  { freq: 1760, duration: 0.18, type: 'sine', gain: 0.04 },
  { freq: 2640, duration: 0.18, type: 'sine', gain: 0.025 },
];

/** 记账入账成功音：金币叮声。保存落库成功后播放（✓ 键本身静音，只震动） */
export function synthesizeCoin(ctx: AudioContext): void {
  const t0 = ctx.currentTime;
  for (const s of COIN_TONES) renderTone(ctx, s, t0);
}

// 共享 AudioContext 单例：首次在用户手势中创建解锁，键盘音效与记账成功音复用同一个
let sharedCtx: AudioContext | null = null;

/** 惰性获取共享 AudioContext；suspended 时尝试 resume 解锁自动播放策略 */
export function getAudioCtx(): AudioContext | null {
  if (!sharedCtx) {
    try { sharedCtx = new AudioContext(); } catch { return null; }
  }
  if (sharedCtx.state === 'suspended') {
    sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
}

/** 震动封装：桌面端不支持时自动跳过 */
export function vibrate(ms: number): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { navigator.vibrate(ms); } catch { /* 不支持的环境忽略 */ }
  }
}
