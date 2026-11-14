import type { Cue, Episode, Coverage } from "../../../shared/types";
import { hasHeardRange } from "../../../shared/heard";

export function currentCue(episode: Episode, position: number): Cue | null {
  return (
    episode.cues.find((c) => position >= c.start && position < c.end) ?? null
  );
}

/** 整段对白的播放区间都被实际覆盖，才算「已听」。 */
export function isCueHeard(
  coverage: Coverage,
  episode: Episode,
  cue: Cue,
) {
  return hasHeardRange(coverage, episode.id, cue.start, cue.end);
}

export function searchCues(
  episode: Episode,
  query: string,
  coverage: Coverage,
) {
  const q = query.trim().toLocaleLowerCase();
  return episode.cues.filter(
    (c) =>
      !q ||
      (isCueHeard(coverage, episode, c) &&
        `${c.speaker}${c.text}`.toLocaleLowerCase().includes(q)),
  );
}
