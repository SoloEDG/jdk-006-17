import type {
  CaseContent,
  CaseSnapshot,
  EvidenceState,
  Coverage,
  Investigation,
  ResumePoint,
} from "../../../shared/types";
import { validateSnapshot } from "../lib/codec";
export function createSnapshot(
  content: CaseContent,
  story: Investigation,
  evidence: EvidenceState,
  coverage: Coverage,
  resume: ResumePoint,
): CaseSnapshot {
  return validateSnapshot(
    { version: 2, caseId: content.id, story, evidence, coverage, resume },
    content,
  );
}
