import type { Cue, Episode, Coverage } from "../../../shared/types";
import { hasHeardRange } from "../../../shared/heard";

/**
 * 只有当前录音版本中、声音窗口的完整区间都被实际播放覆盖，才能收集。
 * 拖动跳过窗口、或听到的是其他录音版本，都不满足条件。
 */
export function canCollectSound(
  coverage: Coverage,
  episode: Episode,
  cue: Cue,
): boolean {
  return (
    !!cue.sound &&
    episode.cues.some((item) => item.id === cue.id) &&
    hasHeardRange(
      coverage,
      episode.id,
      cue.sound.start,
      cue.sound.end,
    )
  );
}
