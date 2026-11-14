import type {
  CaseContent,
  Choice,
  Cue,
  Episode,
  Coverage,
  ListenRequirement,
  SceneId,
} from "../../../shared/types";
import { resolveEpisode } from "./resolveEpisode";
import { hasHeardRange } from "../../../shared/heard";

/** 解析后、绑定到当前路线确切录音版本的听取条件。 */
export interface ResolvedGate {
  requirement: ListenRequirement;
  episodeId: string;
  episodeTitle: string;
  sceneId: SceneId;
  cueId: string;
  start: number;
  end: number;
  speaker: string;
  label: string;
  satisfied: boolean;
}

function resolveGate(
  content: CaseContent,
  requirement: ListenRequirement,
  clues: string[],
  coverage: Coverage,
): ResolvedGate {
  // 按当前路线（已掌握线索决定的版本）解析确切音源，
  // 因此旧录音版本的听取区间无法满足新版本的条件。
  const episode = resolveEpisode(content, requirement.sceneId, clues);
  const cue = episode.cues.find((item) => item.id === requirement.cueId);
  if (!cue) throw new Error("听取条件指向的对白不存在");
  if (requirement.target === "sound" && !cue.sound)
    throw new Error("听取条件要求的声音窗口不存在");
  const window: Pick<Cue, "start" | "end"> =
    requirement.target === "sound"
      ? { start: cue.sound!.start, end: cue.sound!.end }
      : { start: cue.start, end: cue.end };
  const satisfied = hasHeardRange(
    coverage,
    episode.id,
    window.start,
    window.end,
  );
  return {
    requirement,
    episodeId: episode.id,
    episodeTitle: episode.title,
    sceneId: requirement.sceneId,
    cueId: requirement.cueId,
    start: window.start,
    end: window.end,
    speaker: cue.speaker,
    label: requirement.label,
    satisfied,
  };
}

export interface ChoiceGateStatus {
  choice: Choice;
  missingClues: string[];
  gates: ResolvedGate[];
  missingGates: ResolvedGate[];
  /** 线索证据与听取条件都满足时才开放。 */
  unlocked: boolean;
}

export function evaluateChoice(
  content: CaseContent,
  choice: Choice,
  clues: string[],
  coverage: Coverage,
): ChoiceGateStatus {
  const missingClues = choice.requires.filter((id) => !clues.includes(id));
  const gates = choice.listen.map((requirement) =>
    resolveGate(content, requirement, clues, coverage),
  );
  const missingGates = gates.filter((gate) => !gate.satisfied);
  return {
    choice,
    missingClues,
    gates,
    missingGates,
    unlocked: missingClues.length === 0 && missingGates.length === 0,
  };
}

export function evaluateSceneChoices(
  content: CaseContent,
  sceneId: SceneId,
  clues: string[],
  coverage: Coverage,
): ChoiceGateStatus[] {
  const scene = content.scenes.find((item) => item.id === sceneId);
  if (!scene) throw new Error("调查地点不存在");
  return scene.choices.map((choice) =>
    evaluateChoice(content, choice, clues, coverage),
  );
}

/**
 * 应用调查方向前的强制校验：即使绕过界面直接调用，
 * 未完整听到指定区间也无法进入。
 */
export function assertChoiceAvailable(
  content: CaseContent,
  choice: Choice,
  clues: string[],
  coverage: Coverage,
): void {
  const status = evaluateChoice(content, choice, clues, coverage);
  if (status.missingClues.length > 0)
    throw new Error("声音证据不足，请先补充调查");
  if (status.missingGates.length > 0)
    throw new Error("还有指定对白或声音没有听完，请先补听");
}

export function episodeForScene(
  content: CaseContent,
  sceneId: SceneId,
  clues: string[],
): Episode {
  return resolveEpisode(content, sceneId, clues);
}
