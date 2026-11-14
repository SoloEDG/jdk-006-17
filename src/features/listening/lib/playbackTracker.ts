/**
 * 播放覆盖区间追踪器（与 DOM/React 解耦，便于纯逻辑测试）。
 *
 * 规则：
 * - 只有真实播放（非暂停、非跳转中）推进的音频时间才会产生区间；
 * - 任何 seek / seeking / 暂停都会切断当前连续区间，跳过的部分成为未听空洞；
 * - 累计的始终是音频时间轴位置，倍速只影响墙钟流逝，不影响区间本身。
 */
export const JUMP_THRESHOLD = 0.6;
export const HEARD_BACKTRACK = 0.25;

export type RangeSink = (start: number, end: number) => void;

export class PlaybackTracker {
  private running = false;
  private last = 0;

  constructor(
    private readonly emit: RangeSink,
    private readonly duration: number,
  ) {}

  private bound(position: number): number {
    if (!Number.isFinite(position)) return this.last;
    return Math.min(this.duration, Math.max(0, position));
  }

  /** 载入新音源或重置播放位置。 */
  reset(position: number): void {
    this.running = false;
    this.last = this.bound(position);
  }

  /** 主动跳转：不产生听取记录，并切断连续区间。 */
  onSeek(position: number): void {
    this.running = false;
    this.last = this.bound(position);
  }

  /** 浏览器 seeking 事件（含拖动波形、快捷键跳转）。 */
  onSeeking(position: number): void {
    this.running = false;
    this.last = this.bound(position);
  }

  onPlay(position: number): void {
    this.running = true;
    this.last = this.bound(position);
  }

  onPause(): void {
    this.running = false;
  }

  /**
   * 对应 audio 的 timeupdate。
   * 返回本次是否产出了覆盖区间，方便调用方判断。
   */
  onTime(position: number, paused: boolean, seeking: boolean): boolean {
    const p = this.bound(position);
    if (paused || seeking) {
      this.running = false;
      return false;
    }
    if (
      !this.running ||
      p < this.last - HEARD_BACKTRACK ||
      p > this.last + JUMP_THRESHOLD
    ) {
      // 新的播放段（含跳转后重新起播、显著回摆）：从此处重新计区间。
      this.running = true;
      this.last = p;
      return false;
    }
    if (p > this.last) {
      this.emit(this.last, p);
      this.last = p;
      return true;
    }
    return false;
  }
}
