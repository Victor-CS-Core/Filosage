import type { Course } from "@/lib/course-types";
import type { ReviewKind } from "@/lib/learning-types";
import type { BaselineLevel, MasteryEvidence } from "@/lib/mastery";

/**
 * Confidence in the evidence itself, not the learner's self-reported confidence.
 * Raw receipts and learner responses deliberately do not belong in this model.
 */
export type EvidenceConfidence =
  | "self-reported"
  | "activity-observed"
  | "receipt-verified"
  | "criterion-assessed";

export type ObjectiveReadinessState =
  | "unseen"
  | "self-reported"
  | "exposed"
  | "practicing"
  | "retained"
  | "transferable"
  | "needs-review";

export type ReadinessBand = "foundation" | "guided" | "independent";

type ReadinessEvidenceRecord = Pick<
  MasteryEvidence,
  "id" | "objectiveId" | "type" | "result" | "observedAt" | "score"
>;

export interface SelfReportedReadinessSignal {
  id: string;
  objectiveId: string;
  kind: "self-report";
  level: BaselineLevel;
  observedAt: string;
  evidenceConfidence: "self-reported";
}

export interface ObservedReadinessSignal {
  evidence: ReadinessEvidenceRecord;
  evidenceConfidence: "activity-observed";
  reviewKind?: ReviewKind;
}

/**
 * A server-side receipt verifier should construct this after checking a receipt.
 * Only the verification time crosses this boundary, never the signed receipt.
 */
export interface ReceiptVerifiedReadinessSignal {
  evidence: ReadinessEvidenceRecord;
  evidenceConfidence: "receipt-verified";
  receiptVerifiedAt: string;
  reviewKind?: ReviewKind;
}

export interface CriterionAssessedReadinessSignal {
  evidence: ReadinessEvidenceRecord;
  evidenceConfidence: "criterion-assessed";
  assessmentVersion: string;
  reviewKind?: ReviewKind;
}

export type ReadinessSignal =
  | SelfReportedReadinessSignal
  | ObservedReadinessSignal
  | ReceiptVerifiedReadinessSignal
  | CriterionAssessedReadinessSignal;

export interface ObjectiveRelationshipIndex {
  objectiveIds: string[];
  prerequisitesByObjectiveId: Record<string, string[]>;
  unresolvedPrerequisitesByObjectiveId: Record<string, string[]>;
}

export interface ObjectiveReadinessProjection {
  objectiveId: string;
  state: ObjectiveReadinessState;
  band: ReadinessBand;
  evidenceConfidence: EvidenceConfidence | "none";
  evidenceIds: string[];
  latestEvidenceAt?: string;
  satisfiesPrerequisite: boolean;
  prerequisitesSatisfied: boolean;
  reasonCodes: string[];
}

const CONFIDENCE_RANK: Record<EvidenceConfidence, number> = {
  "self-reported": 0,
  "activity-observed": 1,
  "receipt-verified": 2,
  "criterion-assessed": 3,
};

function normalizedTitle(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function canonicalLessonObjectiveId(moduleIndex: number, lessonIndex: number) {
  return `objective-m${moduleIndex}-l${lessonIndex}`;
}

/**
 * Converts the immutable course plan into a learner-readiness relationship index.
 * Unknown or forward references stay unresolved so routing fails closed instead
 * of silently placing a learner ahead of an unproven prerequisite.
 */
export function buildCourseObjectiveRelationshipIndex(
  course: Pick<Course, "modules">,
): ObjectiveRelationshipIndex {
  const objectiveIds: string[] = [];
  const prerequisitesByObjectiveId: Record<string, string[]> = {};
  const unresolvedPrerequisitesByObjectiveId: Record<string, string[]> = {};
  const earlierObjectiveByTitle = new Map<string, string>();

  course.modules.forEach((courseModule, moduleIndex) => {
    courseModule.lessons.forEach((lesson, lessonIndex) => {
      const objectiveId = lesson.objectiveId ?? canonicalLessonObjectiveId(moduleIndex, lessonIndex);
      const prerequisites: string[] = [];
      const unresolved: string[] = [];

      for (const prerequisiteTitle of lesson.buildsOn ?? []) {
        const prerequisiteId = earlierObjectiveByTitle.get(normalizedTitle(prerequisiteTitle));
        if (prerequisiteId) prerequisites.push(prerequisiteId);
        else unresolved.push(prerequisiteTitle);
      }

      objectiveIds.push(objectiveId);
      prerequisitesByObjectiveId[objectiveId] = [...new Set(prerequisites)];
      unresolvedPrerequisitesByObjectiveId[objectiveId] = [...new Set(unresolved)];
      earlierObjectiveByTitle.set(normalizedTitle(lesson.title), objectiveId);
    });
  });

  return {
    objectiveIds,
    prerequisitesByObjectiveId,
    unresolvedPrerequisitesByObjectiveId,
  };
}

function signalObjectiveId(signal: ReadinessSignal) {
  return "evidence" in signal ? signal.evidence.objectiveId : signal.objectiveId;
}

function signalId(signal: ReadinessSignal) {
  return "evidence" in signal ? signal.evidence.id : signal.id;
}

function signalObservedAt(signal: ReadinessSignal) {
  return "evidence" in signal ? signal.evidence.observedAt : signal.observedAt;
}

function signalTimestamp(signal: ReadinessSignal) {
  const parsed = Date.parse(signalObservedAt(signal));
  return Number.isFinite(parsed) ? parsed : 0;
}

function evidencePassed(signal: Exclude<ReadinessSignal, SelfReportedReadinessSignal>) {
  if (signal.evidence.result !== "passed") return false;
  return signal.evidence.score === undefined || signal.evidence.score >= 0.7;
}

function strongestConfidence(signals: readonly ReadinessSignal[]): EvidenceConfidence | "none" {
  return signals.reduce<EvidenceConfidence | "none">((strongest, signal) => {
    if (strongest === "none") return signal.evidenceConfidence;
    return CONFIDENCE_RANK[signal.evidenceConfidence] > CONFIDENCE_RANK[strongest]
      ? signal.evidenceConfidence
      : strongest;
  }, "none");
}

function projectOneObjective(
  objectiveId: string,
  signals: readonly ReadinessSignal[],
): Omit<ObjectiveReadinessProjection, "prerequisitesSatisfied"> {
  const relevant = signals
    .filter((signal) => signalObjectiveId(signal) === objectiveId)
    .slice()
    .sort((left, right) => signalTimestamp(right) - signalTimestamp(left));
  const evidenceSignals = relevant.filter(
    (signal): signal is Exclude<ReadinessSignal, SelfReportedReadinessSignal> => "evidence" in signal,
  );
  const verifiedSignals = evidenceSignals.filter((signal) =>
    signal.evidenceConfidence === "receipt-verified" || signal.evidenceConfidence === "criterion-assessed",
  );
  const latestVerifiedFailure = verifiedSignals.find((signal) => signal.evidence.result === "needs_work");
  const latestVerifiedSuccess = verifiedSignals.find(evidencePassed);
  const assessedTransfer = verifiedSignals.find((signal) =>
    signal.evidenceConfidence === "criterion-assessed"
    && (signal.evidence.type === "transfer" || signal.evidence.type === "capstone")
    && evidencePassed(signal),
  );
  const delayedRetrieval = verifiedSignals.find((signal) =>
    signal.evidence.type === "retrieval"
    && (signal.reviewKind === "delayed-7" || signal.reviewKind === "delayed-28")
    && evidencePassed(signal),
  );
  const verifiedRetrieval = verifiedSignals.find((signal) =>
    signal.evidence.type === "retrieval" && evidencePassed(signal),
  );
  const observedActivity = evidenceSignals.find((signal) => signal.evidence.result !== "needs_work");
  const selfReport = relevant.find(
    (signal): signal is SelfReportedReadinessSignal => !("evidence" in signal),
  );
  const strongestSuccess = assessedTransfer ?? delayedRetrieval ?? verifiedRetrieval;
  const newerVerifiedFailure = Boolean(
    latestVerifiedFailure
    && (!latestVerifiedSuccess
      || signalTimestamp(latestVerifiedFailure) > signalTimestamp(latestVerifiedSuccess)),
  );

  let state: ObjectiveReadinessState = "unseen";
  let band: ReadinessBand = "foundation";
  let satisfiesPrerequisite = false;
  const reasonCodes: string[] = [];

  if (newerVerifiedFailure) {
    state = "needs-review";
    band = "guided";
    reasonCodes.push("newer-verified-gap");
  } else if (assessedTransfer) {
    state = "transferable";
    band = "independent";
    satisfiesPrerequisite = true;
    reasonCodes.push("criterion-assessed-transfer");
  } else if (delayedRetrieval) {
    state = "retained";
    band = "independent";
    satisfiesPrerequisite = true;
    reasonCodes.push("delayed-retrieval-verified");
  } else if (verifiedRetrieval) {
    state = "practicing";
    band = "guided";
    satisfiesPrerequisite = true;
    reasonCodes.push("retrieval-receipt-verified");
  } else if (observedActivity) {
    state = "exposed";
    band = "foundation";
    reasonCodes.push("activity-observed-only");
  } else if (selfReport) {
    state = "self-reported";
    band = selfReport.level === "guided" || selfReport.level === "independent"
      ? "guided"
      : "foundation";
    reasonCodes.push("self-report-needs-calibration");
  }

  return {
    objectiveId,
    state,
    band,
    evidenceConfidence: strongestSuccess?.evidenceConfidence
      ?? latestVerifiedFailure?.evidenceConfidence
      ?? observedActivity?.evidenceConfidence
      ?? selfReport?.evidenceConfidence
      ?? strongestConfidence(relevant),
    evidenceIds: relevant.map(signalId),
    latestEvidenceAt: relevant[0] ? signalObservedAt(relevant[0]) : undefined,
    satisfiesPrerequisite,
    reasonCodes,
  };
}

/**
 * Projects readiness from privacy-minimized evidence metadata. This function
 * never accepts lesson responses, notes, or raw activity receipts.
 */
export function projectLearnerReadiness({
  relationships,
  signals,
}: {
  relationships: ObjectiveRelationshipIndex;
  signals: readonly ReadinessSignal[];
}): Record<string, ObjectiveReadinessProjection> {
  const base = Object.fromEntries(relationships.objectiveIds.map((objectiveId) => [
    objectiveId,
    projectOneObjective(objectiveId, signals),
  ]));
  const projected: Record<string, ObjectiveReadinessProjection> = {};
  for (const objectiveId of relationships.objectiveIds) {
    const prerequisites = relationships.prerequisitesByObjectiveId[objectiveId] ?? [];
    const unresolved = relationships.unresolvedPrerequisitesByObjectiveId[objectiveId] ?? [];
    const prerequisitesSatisfied = unresolved.length === 0
      && prerequisites.every((prerequisiteId) =>
        projected[prerequisiteId]?.satisfiesPrerequisite === true
        && projected[prerequisiteId]?.prerequisitesSatisfied === true,
      );
    const current = base[objectiveId];
    projected[objectiveId] = {
      ...current,
      prerequisitesSatisfied,
      reasonCodes: unresolved.length
        ? [...current.reasonCodes, "unresolved-prerequisite"]
        : prerequisitesSatisfied
          ? current.reasonCodes
          : [...current.reasonCodes, "prerequisite-not-demonstrated"],
    };
  }
  return projected;
}
