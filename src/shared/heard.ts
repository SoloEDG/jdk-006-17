import type { Coverage } from "./types";

/** 判定容忍的时间误差（秒），抵消 timeupdate 的采样间隔。 */
export const HEARD_EPSILON = 0.08;

/**
 * 实际播放覆盖到的时间区间（闭区间，按音频时间轴计）。
 * 只有连续播放经过的区间才会被记录；拖动跳过的部分不会产生区间。
 */
export interface Interval {
  start: number;
  end: number;
}

export function normalizeIntervals(intervals: Interval[]): Interval[] {
  return intervals
    .filter(
      (item) =>
        item &&
        Number.isFinite(item.start) &&
        Number.isFinite(item.end) &&
        item.end >= item.start &&
        item.start >= 0,
    )
    .map((item) => ({ start: item.start, end: item.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

/** 合并相邻/重叠区间，返回新的规整区间数组（不修改入参）。 */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = normalizeIntervals(intervals);
  const merged: Interval[] = [];
  for (const item of sorted) {
    const last = merged[merged.length - 1];
    if (last && item.start <= last.end + HEARD_EPSILON)
      last.end = Math.max(last.end, item.end);
    else merged.push({ ...item });
  }
  return merged;
}

/** 记录某音源实际播放到的一小段区间。 */
export function markHeardRange(
  coverage: Coverage,
  sourceId: string,
  start: number,
  end: number,
): Coverage {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start
  )
    return coverage;
  const before = coverage[sourceId] || [];
  return {
    ...coverage,
    [sourceId]: mergeIntervals([...before, { start, end }]),
  };
}

/**
 * [start, end] 是否被实际播放区间完整覆盖。
 * 倍速播放按音频时间累计，因此只看音频时间轴上的覆盖情况；
 * 拖动跳过的空洞没有对应区间，判定为未听。
 */
export function hasHeardRange(
  coverage: Coverage,
  sourceId: string,
  start: number,
  end: number,
): boolean {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
    return false;
  const intervals = coverage[sourceId];
  if (!intervals || intervals.length === 0) return false;
  const targetStart = start - HEARD_EPSILON;
  let cursor = start;
  for (const item of intervals) {
    if (item.end < targetStart) continue;
    if (item.start > cursor + HEARD_EPSILON) return false;
    cursor = Math.max(cursor, item.end);
    if (cursor >= end - HEARD_EPSILON) return true;
  }
  return cursor >= end - HEARD_EPSILON;
}

/** 是否已完整听到某个时间点（沿用旧调用语义）。 */
export function hasHeardThrough(
  coverage: Coverage,
  sourceId: string,
  end: number,
): boolean {
  return hasHeardRange(coverage, sourceId, 0, end);
}
