// 青禾记账 - 长按连删定时器（纯逻辑，可独立测试）

export interface HoldRepeater {
  /** 按下：立即执行一次 onTick，经 delay 后以 interval 间隔连删 */
  start: () => void;
  /** 松开/移出/取消/卸载：停止所有定时器 */
  stop: () => void;
}

export function createHoldRepeater(opts: {
  delay: number;
  interval: number;
  onTick: () => void;
}): HoldRepeater {
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let repeatTimer: ReturnType<typeof setInterval> | null = null;

  const stop = () => {
    if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null; }
    if (repeatTimer !== null) { clearInterval(repeatTimer); repeatTimer = null; }
  };

  return {
    start() {
      opts.onTick();
      stop(); // 防重复启动叠加定时器
      holdTimer = setTimeout(() => {
        holdTimer = null;
        repeatTimer = setInterval(opts.onTick, opts.interval);
      }, opts.delay);
    },
    stop,
  };
}
