import { ArrowUpRight, Lock, Compass, Headphones, MapPin } from "lucide-react";
import type {
  CaseContent,
  Coverage,
  Investigation,
} from "../../../shared/types";
import { evaluateSceneChoices } from "../lib/listenGates";
import type { ResolvedGate } from "../lib/listenGates";
import { formatTime } from "../../../shared/time";

export function Directions({
  content,
  story,
  clues,
  coverage,
  onChoose,
  onLocate,
}: {
  content: CaseContent;
  story: Investigation;
  clues: string[];
  coverage: Coverage;
  onChoose: (id: string) => void;
  onLocate: (gate: ResolvedGate) => void;
}) {
  const statuses = evaluateSceneChoices(
    content,
    story.sceneId,
    clues,
    coverage,
  );
  return (
    <section className="directions">
      <div className="section-title">
        <span>
          <Compass size={15} /> 下一步调查
        </span>
        <small>部分方向需要先听完指定对白或声音。</small>
      </div>
      <div className="direction-grid">
        {statuses.map((status) => {
          const { choice, unlocked, missingClues, missingGates } = status;
          return (
            <div
              key={choice.id}
              className={`direction-card ${unlocked ? "" : "locked"}`}
            >
              <button
                className="direction-main"
                disabled={!unlocked}
                onClick={() => onChoose(choice.id)}
              >
                <span className="direction-icon">
                  {unlocked ? (
                    <ArrowUpRight size={17} />
                  ) : (
                    <Lock size={16} />
                  )}
                </span>
                <span>
                  <strong>{choice.label}</strong>
                  <small>
                    {unlocked
                      ? choice.description
                      : [
                          missingClues.length > 0
                            ? "缺少证据：" +
                              missingClues
                                .map(
                                  (id) =>
                                    content.clues.find((c) => c.id === id)
                                      ?.title,
                                )
                                .join("、")
                            : null,
                          missingGates.length > 0
                            ? "尚未听到：" +
                              missingGates.map((gate) => gate.label).join("、")
                            : null,
                        ]
                          .filter(Boolean)
                          .join("　")}
                  </small>
                </span>
              </button>
              {!unlocked && missingGates.length > 0 && (
                <div className="gate-hints">
                  {missingGates.map((gate) => (
                    <button
                      key={`${choice.id}-${gate.episodeId}-${gate.cueId}-${gate.requirement.target}`}
                      className="gate-hint"
                      onClick={() => onLocate(gate)}
                      title={`定位到「${gate.episodeTitle}」${formatTime(gate.start)} 补听`}
                    >
                      <MapPin size={11} />
                      <span>
                        补听 · {gate.label}
                        <em>
                          <Headphones size={10} />
                          {gate.episodeTitle} · {formatTime(gate.start)}
                        </em>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
