import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PlaybackTracker,
  JUMP_THRESHOLD,
} from "../src/features/listening/lib/playbackTracker";
import { markHeardRange, hasHeardRange } from "../src/shared/heard";
import type { Coverage } from "../src/shared/types";

function collect(duration = 30) {
  const ranges: Array<[number, number]> = [];
  const coverage: Coverage = {};
  const tracker = new PlaybackTracker((s, e) => {
    ranges.push([s, e]);
    // markHeardRange 是不可变更新，这里把结果写回同一对象供断言读取。
    const next = markHeardRange(coverage, "ep", s, e);
    for (const key of Object.keys(coverage)) delete coverage[key];
    Object.assign(coverage, next);
  }, duration);
  return { ranges, coverage, tracker };
}

test("continuous playback emits contiguous audio-time ranges", () => {
  const { tracker, ranges, coverage } = collect();
  tracker.reset(0);
  tracker.onPlay(0);
  // 模拟 1x 播放的 timeupdate（约每 0.25s 一次，取整避免浮点缝隙）
  for (let i = 1; i <= 20; i++)
    tracker.onTime(Math.round(i * 0.25 * 1000) / 1000, false, false);
  assert.ok(ranges.length > 0);
  assert.deepEqual(ranges[0], [0, 0.25]);
  assert.equal(hasHeardRange(coverage, "ep", 0, 5), true);
});

test("seeking cuts the range and the skipped part stays unheard", () => {
  const { tracker, coverage } = collect();
  tracker.reset(0);
  tracker.onPlay(0);
  for (let i = 1; i <= 16; i++)
    tracker.onTime(Math.round(i * 0.25 * 1000) / 1000, false, false);
  // 用户拖到 10s：seeking 事件 + 新位置
  tracker.onSeeking(10);
  tracker.onTime(10, false, true); // seeking 中不产生区间
  tracker.onPlay(10);
  for (let i = 1; i <= 8; i++) tracker.onTime(10 + i * 0.25, false, false);
  // 4-10 是空洞
  assert.equal(hasHeardRange(coverage, "ep", 0, 4), true);
  assert.equal(hasHeardRange(coverage, "ep", 3, 11), false);
  assert.equal(hasHeardRange(coverage, "ep", 10, 12), true);
});

test("pause stops coverage and resume continues from the same position", () => {
  const { tracker, ranges, coverage } = collect();
  tracker.reset(0);
  tracker.onPlay(0);
  // 用贴近真实 timeupdate 的小步进到 1s（单步不能超过跳变阈值）
  for (let i = 1; i <= 4; i++) tracker.onTime(i * 0.25, false, false);
  tracker.onPause();
  tracker.onTime(1, true, false); // 已暂停：位置不变、无新区间
  tracker.onPlay(1); // 恢复播放，currentTime 仍停在暂停处
  for (let i = 1; i <= 5; i++) tracker.onTime(1 + i * 0.24, false, false);
  // 暂停期间不应产生新区间
  assert.ok(!ranges.some(([s, e]) => s === 1 && e === 1));
  // 从同一位置续播，区间衔接后覆盖完整（到 2.2）
  assert.equal(hasHeardRange(coverage, "ep", 0, 2.2), true);
});

test("double speed still accumulates by audio timeline", () => {
  const { tracker, coverage } = collect();
  tracker.reset(0);
  tracker.onPlay(0);
  // 2x：墙钟 0.25s 对应音频推进 0.5s，timeupdate 给的是 currentTime
  for (let i = 1; i <= 20; i++) tracker.onTime(i * 0.5, false, false);
  assert.equal(hasHeardRange(coverage, "ep", 0, 10), true);
});

test("large forward jump inside timeupdate is treated as a new segment", () => {
  const { tracker, coverage } = collect();
  tracker.reset(0);
  tracker.onPlay(0);
  tracker.onTime(1, false, false);
  // 未经过 seeking 事件但位置跳变超过阈值（某些浏览器时序）
  tracker.onTime(1 + JUMP_THRESHOLD + 0.5, false, false);
  assert.equal(
    hasHeardRange(coverage, "ep", 0, 1 + JUMP_THRESHOLD + 0.5),
    false,
  );
});

test("backward scrub restarts the segment instead of extending backwards", () => {
  const { tracker, ranges } = collect();
  tracker.reset(0);
  tracker.onPlay(0);
  tracker.onTime(5, false, false);
  // 回退超过 backtrack 阈值
  tracker.onTime(2, false, false);
  const negative = ranges.filter(([s, e]) => e < s);
  assert.equal(negative.length, 0);
  tracker.onTime(2.5, false, false);
  assert.ok(ranges.some(([s, e]) => s === 2 && e === 2.5));
});
