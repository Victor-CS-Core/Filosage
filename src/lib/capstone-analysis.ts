import type { CapstoneAssessment, CapstoneRevision } from "@/lib/learning-types";

export type CriterionChange = "added" | "improved" | "regressed" | "unchanged";

export interface CapstoneCriterionObservation {
  attempt: number;
  assessedAt: string;
  met: boolean;
  feedback: string;
  change: CriterionChange;
}

export interface CapstoneCriterionTrajectory {
  criterion: string;
  latestMet: boolean;
  firstSeenAttempt: number;
  lastSeenAttempt: number;
  removedAfterAttempt?: number;
  observations: CapstoneCriterionObservation[];
}

export interface AdvancedCapstoneAnalysis {
  version: 1;
  attempts: CapstoneRevision[];
  criteria: CapstoneCriterionTrajectory[];
  improvedSincePriorAttempt: string[];
  regressedSincePriorAttempt: string[];
  unresolved: string[];
  addedSincePriorAttempt: string[];
  removedSincePriorAttempt: string[];
  nextRevisionPriorities: string[];
}

function normalizedCriterion(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function validRevision(value: unknown): CapstoneRevision | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const revision = value as Partial<CapstoneRevision>;
  if ((revision.status !== "passed" && revision.status !== "needs_revision")
    || typeof revision.summary !== "string"
    || typeof revision.assessedAt !== "string"
    || !Number.isInteger(revision.attempt)
    || Number(revision.attempt) < 1
    || !Array.isArray(revision.criteria)) return null;
  const criteria = revision.criteria.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const criterion = item as { criterion?: unknown; met?: unknown; feedback?: unknown };
    return typeof criterion.criterion === "string"
      && criterion.criterion.trim()
      && typeof criterion.met === "boolean"
      && typeof criterion.feedback === "string"
      ? [{ criterion: criterion.criterion.trim(), met: criterion.met, feedback: criterion.feedback.trim() }]
      : [];
  });
  return { ...revision as CapstoneRevision, criteria };
}

function normalizedHistory(assessment: CapstoneAssessment): CapstoneRevision[] {
  const history = (Array.isArray(assessment.history) ? assessment.history : [])
    .flatMap((revision) => validRevision(revision) ? [validRevision(revision)!] : [])
    .slice(-20);
  const latest = validRevision({
    status: assessment.status,
    summary: assessment.summary,
    criteria: assessment.criteria,
    assessedAt: assessment.assessedAt,
    attempt: Math.max(1, Number(assessment.attempts) || 1),
  });
  if (latest && !history.some((revision) => (
    revision.attempt === latest.attempt && revision.assessedAt === latest.assessedAt
  ))) history.push(latest);
  return history
    .sort((left, right) => left.attempt - right.attempt || left.assessedAt.localeCompare(right.assessedAt))
    .slice(-20);
}

export function buildAdvancedCapstoneAnalysis(
  assessment: CapstoneAssessment,
  declaredCriteria: string[] = [],
): AdvancedCapstoneAnalysis {
  const attempts = normalizedHistory(assessment);
  const criterionLabels = new Map<string, string>();
  for (const criterion of declaredCriteria) {
    if (typeof criterion === "string" && criterion.trim()) criterionLabels.set(normalizedCriterion(criterion), criterion.trim());
  }
  for (const revision of attempts) {
    for (const item of revision.criteria) {
      const key = normalizedCriterion(item.criterion);
      if (!criterionLabels.has(key)) criterionLabels.set(key, item.criterion);
    }
  }

  const criteria = Array.from(criterionLabels.entries()).flatMap(([key, criterion]) => {
    const observations: CapstoneCriterionObservation[] = [];
    for (const revision of attempts) {
      const item = revision.criteria.find((candidate) => normalizedCriterion(candidate.criterion) === key);
      if (!item) continue;
      const prior = observations.at(-1);
      const change: CriterionChange = !prior
        ? "added"
        : !prior.met && item.met
          ? "improved"
          : prior.met && !item.met
            ? "regressed"
            : "unchanged";
      observations.push({
        attempt: revision.attempt,
        assessedAt: revision.assessedAt,
        met: item.met,
        feedback: item.feedback,
        change,
      });
    }
    if (!observations.length) return [];
    const latest = observations.at(-1)!;
    const latestAttempt = attempts.at(-1)?.attempt ?? latest.attempt;
    return [{
      criterion,
      latestMet: latest.met,
      firstSeenAttempt: observations[0].attempt,
      lastSeenAttempt: latest.attempt,
      ...(latest.attempt < latestAttempt ? { removedAfterAttempt: latest.attempt } : {}),
      observations,
    }];
  });

  const priorAttempt = attempts.at(-2);
  const latestAttempt = attempts.at(-1);
  const priorKeys = new Set(priorAttempt?.criteria.map((item) => normalizedCriterion(item.criterion)) ?? []);
  const latestKeys = new Set(latestAttempt?.criteria.map((item) => normalizedCriterion(item.criterion)) ?? []);
  const latestObservation = (trajectory: CapstoneCriterionTrajectory) => trajectory.observations.at(-1);
  const improvedSincePriorAttempt = criteria.filter((trajectory) => {
    const latest = latestObservation(trajectory);
    return Boolean(latest && latest.attempt === latestAttempt?.attempt && latest.change === "improved");
  }).map((trajectory) => trajectory.criterion);
  const regressedSincePriorAttempt = criteria.filter((trajectory) => {
    const latest = latestObservation(trajectory);
    return Boolean(latest && latest.attempt === latestAttempt?.attempt && latest.change === "regressed");
  }).map((trajectory) => trajectory.criterion);
  const unresolved = criteria.filter((trajectory) => (
    trajectory.lastSeenAttempt === latestAttempt?.attempt && !trajectory.latestMet
  )).map((trajectory) => trajectory.criterion);
  const addedSincePriorAttempt = latestAttempt
    ? latestAttempt.criteria.filter((item) => !priorKeys.has(normalizedCriterion(item.criterion))).map((item) => item.criterion)
    : [];
  const removedSincePriorAttempt = priorAttempt
    ? priorAttempt.criteria.filter((item) => !latestKeys.has(normalizedCriterion(item.criterion))).map((item) => item.criterion)
    : [];

  return {
    version: 1,
    attempts,
    criteria,
    improvedSincePriorAttempt,
    regressedSincePriorAttempt,
    unresolved,
    addedSincePriorAttempt,
    removedSincePriorAttempt,
    nextRevisionPriorities: unresolved.slice(0, 3),
  };
}
