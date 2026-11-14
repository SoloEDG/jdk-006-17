import type {
  AudioBookmark,
  CaseContent,
  CaseSnapshot,
  Coverage,
  EvidenceNote,
  SceneId,
} from "../../../shared/types";
import { mergeIntervals } from "../../../shared/heard";

type Obj = Record<string, unknown>;
function object(value: unknown, label: string): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label}格式无效`);
  return value as Obj;
}
function string(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label}必须是文字`);
  return value;
}
function number(value: unknown, label: string, min = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min)
    throw new Error(`${label}数值无效`);
  return value;
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label}必须是列表`);
  return value;
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label}必须是布尔值`);
  return value;
}

export function validateSnapshot(
  input: unknown,
  content: CaseContent,
): CaseSnapshot {
  const root = object(input, "存档");
  if (root.version !== 1 && root.version !== 2)
    throw new Error("不支持的存档版本");
  if (root.caseId !== content.id) throw new Error("存档不属于当前案件");
  const scene = (value: unknown): SceneId => {
    const id = string(value, "场景");
    if (!content.scenes.some((item) => item.id === id))
      throw new Error("存档包含未知场景");
    return id as SceneId;
  };
  const clue = (value: unknown): string => {
    const id = string(value, "线索");
    if (!content.clues.some((item) => item.id === id))
      throw new Error("存档包含未知线索");
    return id;
  };
  const duration = (id: SceneId) =>
    Math.max(
      0,
      ...content.episodes
        .filter((episode) => episode.sceneId === id)
        .map((episode) => episode.duration),
    );
  const anchor = (value: unknown): AudioBookmark => {
    const a = object(value, "笔记锚点");
    const sceneId = scene(a.sceneId),
      start = number(a.start, "范围起点"),
      end = number(a.end, "范围终点");
    if (end < start || end > duration(sceneId))
      throw new Error("笔记范围超出音频");
    return { sceneId, start, end };
  };
  const rawStory = object(root.story, "调查进度");
  const decisions = array(rawStory.decisions, "决策").map((value) => {
    const d = object(value, "决策");
    const sceneId = scene(d.sceneId),
      choiceId = string(d.choiceId, "选项");
    if (
      !content.scenes
        .find((item) => item.id === sceneId)
        ?.choices.some((item) => item.id === choiceId)
    )
      throw new Error("存档包含未知选项");
    return { sceneId, choiceId };
  });
  const story = {
    sceneId: scene(rawStory.sceneId),
    visited: array(rawStory.visited, "到访场景").map(scene),
    decisions,
    ending: rawStory.ending === null ? null : string(rawStory.ending, "结局"),
  };
  const rawEvidence = object(root.evidence, "手记");
  const notes: EvidenceNote[] = array(rawEvidence.notes, "笔记").map(
    (value) => {
      const n = object(value, "笔记");
      const id = string(n.id, "笔记编号");
      if (!id) throw new Error("笔记编号为空");
      return {
        id,
        clueId: n.clueId === null ? null : clue(n.clueId),
        title: string(n.title, "笔记标题"),
        text: string(n.text, "笔记内容"),
        anchor: anchor(n.anchor),
        createdAt: number(n.createdAt, "笔记日期"),
        pinned: boolean(n.pinned, "置顶"),
      };
    },
  );
  if (new Set(notes.map((note) => note.id)).size !== notes.length)
    throw new Error("笔记编号重复");
  const clues = array(rawEvidence.clues, "线索").map(clue);
  if (new Set(clues).size !== clues.length) throw new Error("线索重复");
  const selectedId =
    rawEvidence.selectedId === null
      ? null
      : string(rawEvidence.selectedId, "选中笔记");
  if (selectedId && !notes.some((note) => note.id === selectedId))
    throw new Error("选中的笔记不存在");

  const coverage = parseCoverage(root, content);

  const rawResume = object(root.resume, "播放进度");
  const sceneId = scene(rawResume.sceneId),
    position = number(rawResume.position, "播放位置"),
    rate = number(rawResume.rate, "播放速度");
  if (position > duration(sceneId) || rate < 0.25 || rate > 4)
    throw new Error("播放进度无效");
  return {
    version: 2,
    caseId: content.id,
    story,
    evidence: { notes, clues, selectedId },
    coverage,
    resume: { sceneId, position, rate },
  };
}

function parseCoverage(root: Obj, content: CaseContent): Coverage {
  if (root.version === 1) {
    // 旧档案只记录「播放头到过的最大位置」，无法证明拖动跳过的部分听过，
    // 因此保守处理：已证实的线索/笔记保留，听取区间一律视为需补听。
    const legacy = object(root.heard, "收听记录");
    for (const [id, value] of Object.entries(legacy)) {
      const episode = content.episodes.find((item) => item.id === id);
      if (!episode) throw new Error("收听记录包含未知音源");
      number(value, "收听位置");
    }
    return {};
  }
  const coverage: Coverage = {};
  const raw = object(root.coverage, "收听区间");
  for (const [id, value] of Object.entries(raw)) {
    const episode = content.episodes.find((item) => item.id === id);
    if (!episode) throw new Error("收听区间包含未知音源");
    const intervals = array(value, "音源收听区间").map((item) => {
      const range = object(item, "收听区间");
      const start = number(range.start, "区间起点"),
        end = number(range.end, "区间终点");
      if (end < start || end > episode.duration)
        throw new Error("收听区间超出音频");
      return { start, end };
    });
    const merged = mergeIntervals(intervals);
    if (merged.length) coverage[id] = merged;
  }
  return coverage;
}
