import type { AdaptiveReviewCandidate } from "@/lib/adaptive-learning";
import type {
  ObjectiveReadinessProjection,
  ObjectiveRelationshipIndex,
} from "@/lib/learner-readiness";

export interface RetrievalVariant {
  id: string;
  objectiveId: string;
  contextKey: string;
}

export interface RetrievalVariantExposure {
  variantId: string;
  seenAt: string;
}

function stableVariantToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "lesson";
}

export function retrievalVariantIdForQuiz(
  quiz: { id?: string },
  index: number,
  objectiveId: string,
  lessonId: string,
) {
  const declared = quiz.id?.trim();
  if (declared && /^[a-z0-9][a-z0-9-]{0,119}$/.test(declared)) return declared;
  return `quiz-${stableVariantToken(objectiveId.replace(/^objective-/, "") || lessonId)}-${index + 1}`;
}

export function retrievalVariantsForQuizBank(
  quizzes: ReadonlyArray<{ id?: string; difficulty?: string }>,
  objectiveId: string,
  lessonId: string,
): RetrievalVariant[] {
  return quizzes.map((quiz, index) => ({
    id: retrievalVariantIdForQuiz(quiz, index, objectiveId, lessonId),
    objectiveId,
    contextKey: quiz.difficulty?.trim() || `variant-${index + 1}`,
  }));
}

export interface InterleavableReviewCandidate extends AdaptiveReviewCandidate {
  objectiveId: string;
  prerequisiteObjectiveIds?: readonly string[];
  unresolvedPrerequisiteTitles?: readonly string[];
  variants: readonly RetrievalVariant[];
  variantExposures: readonly RetrievalVariantExposure[];
}

export type ReviewUrgency = "fragile" | "overdue" | "due";

export interface InterleavedReviewItem<TCandidate extends InterleavableReviewCandidate = InterleavableReviewCandidate> {
  candidate: TCandidate;
  variant: RetrievalVariant;
  urgency: ReviewUrgency;
}

interface VariantHistory {
  count: number;
  latestSeenAt: number;
}

/**
 * Returns a variant without mutating the published item bank or learner history.
 * Unseen variants win first; once all have been seen, the least-recently-seen
 * variant wins, then the least-exposed variant, with stable author order as the
 * final tie-breaker.
 */
export function selectRetrievalVariant<TVariant extends RetrievalVariant>(
  variants: readonly TVariant[],
  exposures: readonly RetrievalVariantExposure[],
): TVariant | undefined {
  const history = new Map<string, VariantHistory>();
  for (const exposure of exposures) {
    const seenAt = Date.parse(exposure.seenAt);
    const current = history.get(exposure.variantId) ?? { count: 0, latestSeenAt: Number.NEGATIVE_INFINITY };
    history.set(exposure.variantId, {
      count: current.count + 1,
      latestSeenAt: Math.max(current.latestSeenAt, Number.isFinite(seenAt) ? seenAt : Number.NEGATIVE_INFINITY),
    });
  }

  return variants
    .map((variant, index) => ({ variant, index, history: history.get(variant.id) }))
    .sort((left, right) => {
      const leftSeen = left.history ? 1 : 0;
      const rightSeen = right.history ? 1 : 0;
      return leftSeen - rightSeen
        || (left.history?.latestSeenAt ?? 0) - (right.history?.latestSeenAt ?? 0)
        || (left.history?.count ?? 0) - (right.history?.count ?? 0)
        || left.index - right.index;
    })[0]?.variant;
}

function urgencyFor(candidate: AdaptiveReviewCandidate, now: Date): ReviewUrgency {
  if (candidate.performanceBand === "fragile") return "fragile";
  return Date.parse(candidate.dueAt) < now.getTime() ? "overdue" : "due";
}

const URGENCY_RANK: Record<ReviewUrgency, number> = {
  fragile: 0,
  overdue: 1,
  due: 2,
};

function reviewOrder(left: InterleavableReviewCandidate, right: InterleavableReviewCandidate, now: Date) {
  return URGENCY_RANK[urgencyFor(left, now)] - URGENCY_RANK[urgencyFor(right, now)]
    || right.priority - left.priority
    || left.dueAt.localeCompare(right.dueAt)
    || left.lessonTitle.localeCompare(right.lessonTitle);
}

function relationshipPrerequisites(
  candidate: InterleavableReviewCandidate,
  relationships?: ObjectiveRelationshipIndex,
) {
  return candidate.prerequisiteObjectiveIds
    ?? relationships?.prerequisitesByObjectiveId[candidate.objectiveId]
    ?? [];
}

function relationshipUnresolved(
  candidate: InterleavableReviewCandidate,
  relationships?: ObjectiveRelationshipIndex,
) {
  return candidate.unresolvedPrerequisiteTitles
    ?? relationships?.unresolvedPrerequisitesByObjectiveId[candidate.objectiveId]
    ?? [];
}

function prerequisitesAreReady(
  candidate: InterleavableReviewCandidate,
  readiness: Readonly<Record<string, ObjectiveReadinessProjection>>,
  relationships?: ObjectiveRelationshipIndex,
) {
  const unresolved = relationshipUnresolved(candidate, relationships);
  if (unresolved.length) return false;
  return relationshipPrerequisites(candidate, relationships).every((objectiveId) =>
    readiness[objectiveId]?.satisfiesPrerequisite === true
    && readiness[objectiveId]?.prerequisitesSatisfied === true,
  );
}

function alternateIndex<TCandidate extends InterleavableReviewCandidate>(
  pool: readonly TCandidate[],
  previous: TCandidate | undefined,
) {
  if (!previous || pool.length < 2) return 0;
  const differentObjectiveAndCourse = pool.findIndex((candidate) =>
    candidate.objectiveId !== previous.objectiveId && candidate.courseId !== previous.courseId,
  );
  if (differentObjectiveAndCourse >= 0) return differentObjectiveAndCourse;
  const differentObjective = pool.findIndex((candidate) => candidate.objectiveId !== previous.objectiveId);
  return differentObjective >= 0 ? differentObjective : 0;
}

/**
 * Reorders already-due work without changing which work is due. Urgency and
 * priority remain authoritative; alternation happens only within one urgency
 * tier so fragile or overdue work is never displaced by easier variety.
 */
export function interleaveAdaptiveReviewCandidates<
  TCandidate extends AdaptiveReviewCandidate,
>(
  candidates: readonly TCandidate[],
  now = new Date(),
): TCandidate[] {
  const sorted = [...candidates].sort((left, right) => reviewOrder(
    { ...left, objectiveId: left.objectiveId, variants: [], variantExposures: [] },
    { ...right, objectiveId: right.objectiveId, variants: [], variantExposures: [] },
    now,
  ));
  const result: TCandidate[] = [];
  for (const urgency of ["fragile", "overdue", "due"] as const) {
    const pool = sorted.filter((candidate) => urgencyFor(candidate, now) === urgency);
    let previous: TCandidate | undefined;
    while (pool.length) {
      const highestPriority = pool[0]?.priority;
      const priorityBucket = pool.filter((candidate) => candidate.priority === highestPriority);
      const prior = previous;
      const differentCourseAndObjective = prior ? priorityBucket.findIndex((candidate) =>
        candidate.courseId !== prior.courseId && candidate.objectiveId !== prior.objectiveId) : -1;
      const differentObjective = prior ? priorityBucket.findIndex((candidate) => candidate.objectiveId !== prior.objectiveId) : -1;
      const index = differentCourseAndObjective >= 0 ? differentCourseAndObjective : differentObjective >= 0 ? differentObjective : 0;
      const selected = priorityBucket[index];
      pool.splice(pool.indexOf(selected), 1);
      result.push(selected);
      previous = selected;
    }
  }
  return result;
}

/**
 * Builds an interleaved session from immutable published candidates. Fragile
 * work is always selected before non-fragile work, overdue work before merely
 * due work, and interleaving only reorders candidates inside the same urgency
 * tier. A dependent objective is omitted until every named prerequisite has
 * receipt-backed or assessed readiness.
 */
export function composeInterleavedReviewSession<
  TCandidate extends InterleavableReviewCandidate,
>({
  candidates,
  readiness,
  relationships,
  now = new Date(),
  limit = 10,
}: {
  candidates: readonly TCandidate[];
  readiness: Readonly<Record<string, ObjectiveReadinessProjection>>;
  relationships?: ObjectiveRelationshipIndex;
  now?: Date;
  limit?: number;
}): Array<InterleavedReviewItem<TCandidate>> {
  const eligible = candidates
    .filter((candidate) => prerequisitesAreReady(candidate, readiness, relationships))
    .flatMap((candidate) => {
      const variant = selectRetrievalVariant(
        candidate.variants.filter((item) => item.objectiveId === candidate.objectiveId),
        candidate.variantExposures,
      );
      return variant ? [{ candidate, variant }] : [];
    })
    .sort((left, right) => reviewOrder(left.candidate, right.candidate, now));
  const result: Array<InterleavedReviewItem<TCandidate>> = [];
  const boundedLimit = Math.max(0, Math.min(100, Math.floor(limit)));

  for (const urgency of ["fragile", "overdue", "due"] as const) {
    const pool = eligible.filter((item) => urgencyFor(item.candidate, now) === urgency);
    while (pool.length && result.length < boundedLimit) {
      const previous = result.at(-1)?.candidate;
      const highestPriority = pool[0]?.candidate.priority;
      const priorityBucket = pool.filter((item) => item.candidate.priority === highestPriority);
      const index = alternateIndex(priorityBucket.map((item) => item.candidate), previous);
      const selected = priorityBucket[index];
      pool.splice(pool.indexOf(selected), 1);
      result.push({ ...selected, urgency });
    }
    if (result.length >= boundedLimit) break;
  }

  return result;
}
