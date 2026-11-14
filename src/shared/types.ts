export type SceneId = "arrival" | "harbor" | "interview" | "tower" | "finale";
export interface Cue {
  id: string;
  start: number;
  end: number;
  speaker: string;
  text: string;
  sound?: { clueId: string; start: number; end: number; description: string };
}
export interface Episode {
  id: string;
  sceneId: SceneId;
  title: string;
  version: string;
  description: string;
  audio: string;
  duration: number;
  cues: Cue[];
  wave: number[];
}
export interface ClueDefinition {
  id: string;
  title: string;
  kind: string;
  description: string;
}
/** 听取条件的目标：整段对白，或对白中的声音窗口。 */
export type ListenTarget = "cue" | "sound";
/**
 * 调查方向的听取前置条件。
 * sceneId/cueId 会按「当前路线的确切录音版本」解析为具体音源与播放区间，
 * 因此旧版本录音的听取记录无法满足新版本条件。
 */
export interface ListenRequirement {
  sceneId: SceneId;
  cueId: string;
  target: ListenTarget;
  label: string;
}
export interface Choice {
  id: string;
  label: string;
  target: SceneId;
  requires: string[];
  /** 没有听取要求的选项保持留空，始终可用。 */
  listen: ListenRequirement[];
  description: string;
}
export interface Scene {
  id: SceneId;
  title: string;
  location: string;
  chapter: string;
  description: string;
  choices: Choice[];
}
export interface CaseContent {
  id: string;
  title: string;
  scenes: Scene[];
  episodes: Episode[];
  clues: ClueDefinition[];
}
export interface Investigation {
  sceneId: SceneId;
  visited: SceneId[];
  decisions: { sceneId: SceneId; choiceId: string }[];
  ending: string | null;
}
/**
 * 每个确切音源（录音版本）实际播放覆盖到的区间集合。
 * 键为 Episode.id；区间按音频时间记录，拖动跳过的部分不在其中。
 */
export type Coverage = Record<string, AudioInterval[]>;
export interface AudioInterval {
  start: number;
  end: number;
}
export interface AudioBookmark {
  sceneId: SceneId;
  start: number;
  end: number;
}
export interface EvidenceNote {
  id: string;
  clueId: string | null;
  title: string;
  text: string;
  anchor: AudioBookmark;
  createdAt: number;
  pinned: boolean;
}
export interface EvidenceState {
  notes: EvidenceNote[];
  clues: string[];
  selectedId: string | null;
}
export interface ResumePoint {
  sceneId: SceneId;
  position: number;
  rate: number;
}
export interface CaseSnapshot {
  version: 2;
  caseId: string;
  story: Investigation;
  evidence: EvidenceState;
  coverage: Coverage;
  resume: ResumePoint;
}
export interface SaveSlot {
  id: string;
  name: string;
  updatedAt: number;
  snapshot: CaseSnapshot;
}
export interface TransportState {
  requestedId: string;
  loadedId: string | null;
  position: number;
  duration: number;
  playing: boolean;
  loading: boolean;
  rate: number;
  volume: number;
  error: string | null;
}
export interface CapturePort {
  captureRange: (sceneId: SceneId, width?: number) => AudioBookmark | null;
}
