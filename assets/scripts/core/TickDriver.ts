/**
 * 固定步长 Tick 驱动器（M1 第 3 项）。
 * - 逻辑以固定 tickMs（默认 50ms）推进，不使用浮点 dt 累加。
 * - 倍速 speed = 每帧多跑 N 个 tick。
 * - 表现层每帧 update(dt) 调用 advance(dt) 即可。
 */
export class TickDriver {
  private acc = 0;

  constructor(
    private tickMs: number,
    private onTick: () => void,
    private maxTicksPerFrame = 20,
  ) {}

  /** 每帧调用：dt 为帧间隔秒数 */
  advance(dt: number): void {
    this.acc += dt * 1000;
    let steps = 0;
    const stepMs = this.tickMs;
    while (this.acc >= stepMs && steps < this.maxTicksPerFrame) {
      this.onTick();
      this.acc -= stepMs;
      steps++;
    }
    if (steps >= this.maxTicksPerFrame) this.acc = 0; // 防止积压爆掉
  }

  reset(): void {
    this.acc = 0;
  }

  /** Read-only presentation fraction between fixed simulation ticks. */
  get interpolation(): number { return Math.max(0, Math.min(1, this.acc / this.tickMs)); }
}
