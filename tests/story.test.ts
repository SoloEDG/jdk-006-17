import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveEpisode,
  CASE_CONTENT,
  createInvestigation,
  applyChoice,
  evaluateSceneChoices,
  evaluateChoice,
} from "../src/features/story";
import { markHeardRange, hasHeardRange } from "../src/shared/heard";
import type { Coverage } from "../src/shared/types";

test("known bell changes interview recording without advancing scene", () => {
  assert.equal(
    resolveEpisode(CASE_CONTENT, "interview", []).id,
    "interview-normal",
  );
  assert.equal(
    resolveEpisode(CASE_CONTENT, "interview", ["bell"]).id,
    "interview-aware",
  );
});

test("locked final choice cannot be forced by id or partial listening", () => {
  const s = createInvestigation();
  s.sceneId = "tower";
  // 无线索、无听取记录：直接拒绝。
  assert.throws(() => applyChoice(CASE_CONTENT, s, "solve", [], {}));
  // 线索齐全但没听结尾独白：仍然拒绝。
  assert.throws(() =>
    applyChoice(CASE_CONTENT, s, "solve", ["bell", "horn", "key"], {}),
  );
});

test("arrival choices start locked and open only after the exact window is covered", () => {
  const s = createInvestigation();
  const initial = evaluateSceneChoices(
    CASE_CONTENT,
    s.sceneId,
    [],
    {},
  );
  // 刚进场景：两个前进方向都未开放。
  assert.equal(initial.every((status) => !status.unlocked), true);
  const harbor = initial.find((status) => status.choice.id === "visit-harbor")!;
  assert.equal(harbor.missingGates[0].episodeId, "arrival-normal");
  assert.equal(harbor.missingGates[0].cueId, "line-3");

  // 只听到对白起点附近、没覆盖整段：仍锁定。
  let coverage: Coverage = markHeardRange({}, "arrival-normal", 14.39, 16);
  assert.equal(
    evaluateChoice(
      CASE_CONTENT,
      harbor.choice,
      [],
      coverage,
    ).unlocked,
    false,
  );

  // 完整听到陌生人对白（line-3 结束于 19.459）：追查码头开放。
  coverage = markHeardRange(coverage, "arrival-normal", 16, 19.46);
  const harborOpen = evaluateChoice(
    CASE_CONTENT,
    harbor.choice,
    [],
    coverage,
  );
  assert.equal(harborOpen.unlocked, true);

  // 拜访守塔人要求的是钟声声音窗口（15.19-17.19），对白虽全听但钟声窗口有空洞则仍锁。
  const keeper = initial.find((status) => status.choice.id === "visit-keeper")!;
  assert.equal(evaluateChoice(CASE_CONTENT, keeper.choice, [], coverage).unlocked, true);
});

test("dragging over a window leaves a gap that keeps the choice locked", () => {
  const s = createInvestigation();
  const statuses = evaluateSceneChoices(CASE_CONTENT, s.sceneId, [], {});
  const keeper = statuses.find((status) => status.choice.id === "visit-keeper")!;
  // 播放 14.39-15.5 后直接拖到 17.0 继续：钟声窗口 15.19-17.19 中间有空洞。
  const coverage: Coverage = {
    "arrival-normal": [
      { start: 14.39, end: 15.5 },
      { start: 17.0, end: 19.0 },
    ],
  };
  assert.equal(
    evaluateChoice(CASE_CONTENT, keeper.choice, [], coverage).unlocked,
    false,
  );
  // 补足空洞后开放（多段覆盖拼成完整窗口）。
  const filled = markHeardRange(coverage, "arrival-normal", 15.4, 17.05);
  assert.equal(
    evaluateChoice(CASE_CONTENT, keeper.choice, [], filled).unlocked,
    true,
  );
});

test("old interview version listening cannot satisfy the aware version gate", () => {
  const s = createInvestigation();
  s.sceneId = "interview";
  // 未掌握钟声：解析到 normal 版本，听全 line-4 即可上灯塔。
  const normalGate = evaluateSceneChoices(CASE_CONTENT, "interview", [], {
    "interview-normal": [{ start: 17.007, end: 24.235 }],
  }).find((status) => status.choice.id === "enter-tower")!;
  assert.equal(normalGate.unlocked, true);
  assert.equal(normalGate.gates[0].episodeId, "interview-normal");

  // 掌握钟声后路线切到 aware 版本：normal 的听取记录不能冒充。
  const awareGate = evaluateSceneChoices(
    CASE_CONTENT,
    "interview",
    ["bell"],
    { "interview-normal": [{ start: 0, end: 24.235 }] },
  ).find((status) => status.choice.id === "enter-tower")!;
  assert.equal(awareGate.gates[0].episodeId, "interview-aware");
  assert.equal(awareGate.unlocked, false);

  // 在 aware 版本实际听到新的 line-4 区间才开放。
  const coverage = markHeardRange(
    { "interview-normal": [{ start: 0, end: 24.235 }] },
    "interview-aware",
    20.865,
    28.161,
  );
  const reEvaluated = evaluateSceneChoices(
    CASE_CONTENT,
    "interview",
    ["bell"],
    coverage,
  ).find((status) => status.choice.id === "enter-tower")!;
  assert.equal(reEvaluated.unlocked, true);
});

test("choices without listening requirements stay available", () => {
  // 回溯/重听类方向没有 listen 条件，任何听取状态下都可用。
  const harbor = evaluateSceneChoices(CASE_CONTENT, "harbor", [], {});
  const back = harbor.find((status) => status.choice.id === "return-radio")!;
  assert.equal(back.unlocked, true);
  const finale = evaluateSceneChoices(CASE_CONTENT, "finale", [], {});
  assert.equal(finale[0].unlocked, true);
});

test("finale choice needs both sound clues and the closing monologue", () => {
  // 线索齐全但没听独白
  const onlyClues = evaluateSceneChoices(
    CASE_CONTENT,
    "tower",
    ["bell", "horn", "key"],
    {},
  ).find((status) => status.choice.id === "solve")!;
  assert.equal(onlyClues.unlocked, false);
  assert.equal(onlyClues.missingClues.length, 0);
  assert.equal(onlyClues.missingGates.length, 1);

  // 听了独白但线索不全：两类缺失同时存在
  const heard = markHeardRange({}, "tower-normal", 19.675, 27.155);
  const onlyHeard = evaluateSceneChoices(
    CASE_CONTENT,
    "tower",
    ["bell"],
    heard,
  ).find((status) => status.choice.id === "solve")!;
  assert.equal(onlyHeard.unlocked, false);
  assert.equal(onlyHeard.missingClues.length, 2);
  assert.equal(onlyHeard.missingGates.length, 0);

  // 两者齐全才开放
  const full = evaluateSceneChoices(
    CASE_CONTENT,
    "tower",
    ["bell", "horn", "key"],
    heard,
  ).find((status) => status.choice.id === "solve")!;
  assert.equal(full.unlocked, true);
});

test("temporary re-listening unlocks the gate but applyChoice still needs an explicit call", () => {
  const s = createInvestigation();
  const gate = evaluateSceneChoices(CASE_CONTENT, "arrival", [], {}).find(
    (status) => status.choice.id === "visit-harbor",
  )!;
  // 补听前不可应用。
  assert.throws(() => applyChoice(CASE_CONTENT, s, "visit-harbor", [], {}));
  const coverage = markHeardRange({}, "arrival-normal", 14.39, 19.46);
  // 补听后条件满足，但场景不会自动切换，必须显式选择。
  assert.equal(
    evaluateChoice(CASE_CONTENT, gate.choice, [], coverage).unlocked,
    true,
  );
  assert.equal(s.sceneId, "arrival");
  const moved = applyChoice(CASE_CONTENT, s, "visit-harbor", [], coverage);
  assert.equal(moved.sceneId, "harbor");
});

test("hasHeardRange merges adjacent playback at any speed using audio time", () => {
  let coverage: Coverage = {};
  // 模拟 2 倍速：timeupdate 报告的仍是音频时间，区间按音频时间累计。
  coverage = markHeardRange(coverage, "x", 0, 2.5);
  coverage = markHeardRange(coverage, "x", 2.45, 5);
  assert.equal(hasHeardRange(coverage, "x", 0, 5), true);
  assert.equal(hasHeardRange(coverage, "x", 0, 5.1), false);
  assert.equal(hasHeardRange({}, "x", 0, 1), false);
});
