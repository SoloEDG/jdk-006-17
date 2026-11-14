import test from "node:test";
import assert from "node:assert/strict";
import {
  createEvidence,
  addNote,
  collectClue,
  canCollectSound,
  editNote,
  deleteNote,
  togglePinned,
} from "../src/features/evidence/index";
import {
  createSnapshot,
  validateSnapshot,
  createSlot,
  writeSlot,
  readSlots,
  deleteSlot,
  exportSlot,
  parseImported,
} from "../src/features/profiles/index";
import type { CaseContent, Coverage, Investigation } from "../src/shared/types";
const content: CaseContent = {
  id: "test",
  title: "test",
  scenes: [
    {
      id: "arrival",
      title: "A",
      location: "x",
      chapter: "1",
      description: "",
      choices: [],
    },
  ],
  episodes: [
    {
      id: "arrival-main",
      sceneId: "arrival",
      title: "A",
      version: "main",
      description: "",
      audio: "a",
      duration: 20,
      wave: [],
      cues: [
        {
          id: "cue",
          start: 0,
          end: 12,
          speaker: "S",
          text: "hello",
          sound: { clueId: "bell", start: 5, end: 7, description: "bell" },
        },
      ],
    },
  ],
  clues: [{ id: "bell", title: "Bell", kind: "sound", description: "" }],
};
const story: Investigation = {
  sceneId: "arrival",
  visited: ["arrival"],
  decisions: [],
  ending: null,
};
const anchor = { sceneId: "arrival" as const, start: 5, end: 7 };
function snapshot(coverage: Coverage = { "arrival-main": [{ start: 0, end: 7 }] }) {
  return createSnapshot(
    content,
    story,
    addNote(createEvidence(), anchor, "memo"),
    coverage,
    { sceneId: "arrival", position: 6, rate: 1 },
  );
}
test("notes normalize anchors, edit, pin and delete without mutation", () => {
  const initial = createEvidence();
  const state = addNote(initial, { ...anchor, extra: "drop" } as any, " memo ");
  assert.equal(initial.notes.length, 0);
  assert.deepEqual(state.notes[0].anchor, anchor);
  const id = state.notes[0].id;
  assert.equal(editNote(state, id, "updated").notes[0].text, "updated");
  assert.equal(togglePinned(state, id).notes[0].pinned, true);
  assert.equal(deleteNote(state, id).selectedId, null);
  assert.throws(() => addNote(initial, { ...anchor, end: NaN }, "bad"));
});
test("clues unlock only when the full sound window was actually covered", () => {
  const episode = content.episodes[0],
    cue = episode.cues[0];
  // 播放头到过 7s，但中间 5-7s 是拖动跳过的空洞：不能收集。
  assert.equal(
    canCollectSound({ "arrival-main": [{ start: 0, end: 4.9 }] }, episode, cue),
    false,
  );
  assert.equal(
    canCollectSound(
      { "arrival-main": [
        { start: 0, end: 5.2 },
        { start: 6.8, end: 9 },
      ] },
      episode,
      cue,
    ),
    false,
  );
  // 完整覆盖声音窗口（可由多段相邻区间拼成）。
  const covered: Coverage = {
    "arrival-main": [
      { start: 0, end: 5.4 },
      { start: 5.3, end: 7.2 },
    ],
  };
  assert.equal(canCollectSound(covered, episode, cue), true);
  assert.equal(
    collectClue(createEvidence(), episode, cue, { "arrival-main": [{ start: 0, end: 6.9 }] }, anchor),
    null,
  );
  const found = collectClue(createEvidence(), episode, cue, covered, anchor)!;
  assert.deepEqual(found.clues, ["bell"]);
  assert.equal(collectClue(found, episode, cue, covered, anchor), null);
});
test("other recording versions cannot satisfy a window on this episode id", () => {
  const episode = content.episodes[0],
    cue = episode.cues[0];
  // 听的是另一个音源版本，即使时间轴覆盖也不算。
  assert.equal(
    canCollectSound({ "arrival-other": [{ start: 0, end: 20 }] }, episode, cue),
    false,
  );
});
test("snapshot rebuild strips unknown fields and rejects invalid ranges and sources", () => {
  const s = snapshot();
  const raw = JSON.parse(JSON.stringify(s));
  raw.extra = "drop";
  raw.evidence.notes[0].anchor.sourceId = "drop";
  const checked = validateSnapshot(raw, content);
  assert.equal("extra" in checked, false);
  assert.deepEqual(checked.evidence.notes[0].anchor, anchor);
  raw.coverage.unknown = [{ start: 0, end: 1 }];
  assert.throws(() => validateSnapshot(raw, content), /音源/);
  delete raw.coverage.unknown;
  raw.coverage["arrival-main"][0].end = Infinity;
  assert.throws(() => validateSnapshot(raw, content));
});
test("legacy v1 saves migrate to empty coverage: proven notes kept, listening must be redone", () => {
  const v1 = {
    version: 1,
    caseId: "test",
    story,
    evidence: addNote(createEvidence(), anchor, "memo"),
    heard: { "arrival-main": 18 },
    resume: { sceneId: "arrival" as const, position: 6, rate: 1 },
  };
  const migrated = validateSnapshot(v1, content);
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.coverage, {});
  // 已证实的笔记与线索保留，只是听取区间需要补听。
  assert.equal(migrated.evidence.notes.length, 1);
  // 旧档无法证明跳过情况：即使曾到过 18s，声音窗口仍判未听。
  const episode = content.episodes[0];
  assert.equal(
    canCollectSound(migrated.coverage, episode, episode.cues[0]),
    false,
  );
  assert.throws(() =>
    validateSnapshot({ ...v1, heard: { ghost: 1 } }, content),
  );
});
test("coverage intervals are merged and bounded on save", () => {
  const s = snapshot({
    "arrival-main": [
      { start: 8, end: 10 },
      { start: 2, end: 4 },
      { start: 3.9, end: 6 },
    ],
  });
  assert.deepEqual(s.coverage["arrival-main"], [
    { start: 2, end: 6 },
    { start: 8, end: 10 },
  ]);
  assert.throws(() =>
    snapshot({ "arrival-main": [{ start: 5, end: 21 }] }),
  );
});
test("slots keep deep independent copies and imported files get new identity", () => {
  const s = snapshot();
  const a = createSlot("  Case A  ", s),
    b = createSlot("B", s);
  s.evidence.notes[0].text = "changed";
  assert.equal(a.name, "Case A");
  assert.equal(a.snapshot.evidence.notes[0].text, "memo");
  a.snapshot.evidence.notes[0].text = "a";
  assert.equal(b.snapshot.evidence.notes[0].text, "memo");
  const imported = parseImported(exportSlot(a), content);
  assert.notEqual(imported.id, a.id);
  assert.match(imported.name, /副本/);
});
test("storage recovers corruption with warning, enforces limit and surfaces quota errors", () => {
  const memory = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, val: string) => memory.set(key, val),
    },
  });
  const first = createSlot("first", snapshot());
  let slots = writeSlot([], first);
  assert.equal(readSlots(content).slots.length, 1);
  assert.equal(deleteSlot(slots, first.id).length, 0);
  for (let i = 0; i < 8; i++)
    slots = writeSlot(
      i === 0 ? [] : slots,
      createSlot("slot " + i, snapshot()),
    );
  assert.throws(() => writeSlot(slots, createSlot("ninth", snapshot())), /8/);
  for (const key of memory.keys()) memory.set(key, "corrupt");
  assert.ok(readSlots(content).warning);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      setItem: () => {
        throw new Error("quota");
      },
      getItem: () => null,
    },
  });
  assert.throws(() => writeSlot([], first), /quota/);
});
