import { expect, test } from "@playwright/test";
import type { ObjectiveReadinessProjection } from "../src/lib/learner-readiness";
import type { CourseProgress } from "../src/lib/learning-types";
import { buildPrerequisiteSafeReviewQueue } from "../src/lib/review-readiness";
import {
  composeInterleavedReviewSession,
  interleaveAdaptiveReviewCandidates,
  retrievalVariantIdForQuiz,
  selectRetrievalVariant,
  type InterleavableReviewCandidate,
} from "../src/lib/retrieval-planning";

test("gives quiz variants stable IDs without trusting malformed model identifiers", () => {
  expect(retrievalVariantIdForQuiz({ id: "quiz-m0-l0-2" }, 1, "objective-m0-l0", "0-0")).toBe("quiz-m0-l0-2");
  expect(retrievalVariantIdForQuiz({ id: "../../unsafe" }, 1, "objective-m0-l0", "0-0")).toBe("quiz-m0-l0-2");
});

test("interleaves different objectives only inside the same urgency tier", () => {
  const now = new Date("2026-08-15T12:00:00.000Z");
  const candidate = (overrides: Partial<Parameters<typeof interleaveAdaptiveReviewCandidates>[0][number]> & { lessonId: string; objectiveId: string }) => ({
    courseId: "course-a",
    topic: "Topic",
    lessonTitle: overrides.lessonId,
    kind: "spaced" as const,
    dueAt: "2026-08-14T12:00:00.000Z",
    priority: 20,
    reason: "Due",
    estimatedMinutes: 4,
    confidence: "medium" as const,
    performanceBand: "developing" as const,
    calibration: "calibrated" as const,
    ...overrides,
  });
  const ordered = interleaveAdaptiveReviewCandidates([
    candidate({ lessonId: "a-1", objectiveId: "objective-m0-l0", priority: 30 }),
    candidate({ lessonId: "a-2", objectiveId: "objective-m0-l0", priority: 29 }),
    candidate({ lessonId: "b-1", objectiveId: "objective-m1-l0", courseId: "course-b", priority: 28 }),
    candidate({ lessonId: "fragile", objectiveId: "objective-m2-l0", performanceBand: "fragile", priority: 1 }),
  ], now);
  expect(ordered.map((item) => item.lessonId)).toEqual(["fragile", "a-1", "a-2", "b-1"]);
});

test("selects unseen variants before the least-recently-seen variant", () => {
  const variants = [
    { id: "variant-a", objectiveId: "objective-a", contextKey: "alpha" },
    { id: "variant-b", objectiveId: "objective-a", contextKey: "beta" },
    { id: "variant-c", objectiveId: "objective-a", contextKey: "gamma" },
  ] as const;
  const exposures = [
    { variantId: "variant-a", seenAt: "2026-08-10T10:00:00.000Z" },
    { variantId: "variant-b", seenAt: "2026-08-01T10:00:00.000Z" },
  ] as const;

  expect(selectRetrievalVariant(variants, exposures)?.id).toBe("variant-c");
  expect(selectRetrievalVariant(variants, [
    ...exposures,
    { variantId: "variant-c", seenAt: "2026-08-12T10:00:00.000Z" },
  ])?.id).toBe("variant-b");
});

test("the live review selector requires verified prerequisites and recovers legacy review metadata", () => {
  const now = new Date("2026-08-15T12:00:00.000Z");
  const progress: CourseProgress = {
    courseId: "course-ready",
    topic: "Ready",
    lastLessonId: "0-1",
    lastLessonTitle: "Apply",
    completedLessonIds: ["0-0", "0-1"],
    lastActivityAt: "2026-08-01T12:00:00.000Z",
    startedAt: "2026-08-01T12:00:00.000Z",
    lessons: {
      "0-0": {
        lessonId: "0-0",
        lessonTitle: "Foundation",
        objectiveId: "objective-m0-l0",
        status: "learned",
        evidenceAuthority: "activity-observed",
        attempts: 1,
        totalQuestions: 1,
        firstAttemptCorrect: 1,
        score: 1,
        confidence: "high",
        intervalStage: 0,
        nextReviewAt: "2026-08-20T12:00:00.000Z",
        lastStudiedAt: "2026-08-01T12:00:00.000Z",
        retrievalVariantBank: [{ id: "foundation-review", objectiveId: "objective-m0-l0", contextKey: "review" }],
      },
      "0-1": {
        lessonId: "0-1",
        lessonTitle: "Dependent",
        objectiveId: "objective-m0-l1",
        prerequisiteObjectiveIds: ["objective-m0-l0"],
        status: "learned",
        evidenceAuthority: "receipt-verified",
        attempts: 1,
        totalQuestions: 1,
        firstAttemptCorrect: 1,
        score: 1,
        confidence: "high",
        intervalStage: 0,
        nextReviewAt: "2026-08-10T12:00:00.000Z",
        lastStudiedAt: "2026-08-01T12:00:00.000Z",
        retrievalVariantBank: [{ id: "dependent-review", objectiveId: "objective-m0-l1", contextKey: "review" }],
      },
    },
  };
  expect(buildPrerequisiteSafeReviewQueue([progress], now)).toEqual([]);
  progress.lessons["0-0"].evidenceAuthority = "receipt-verified";
  expect(buildPrerequisiteSafeReviewQueue([progress], now).map((item) => item.lessonId)).toEqual(["0-1"]);
  progress.lessons["0-1"].retrievalVariantBank = [];
  expect(buildPrerequisiteSafeReviewQueue([progress], now).map((item) => item.lessonId)).toEqual(["0-1"]);
});

test("keeps prerequisite evidence course-scoped and normalizes legacy aliases", () => {
  const now = new Date("2026-08-15T12:00:00.000Z");
  const progressFor = (courseId: string, foundationAuthority: "activity-observed" | "receipt-verified"): CourseProgress => ({
    courseId,
    topic: courseId,
    lastLessonId: "0-1",
    lastLessonTitle: "Dependent",
    completedLessonIds: ["0-0", "0-1"],
    lastActivityAt: "2026-08-01T12:00:00.000Z",
    startedAt: "2026-08-01T12:00:00.000Z",
    lessons: {
      "0-0": {
        lessonId: "0-0",
        lessonTitle: "Foundation",
        objectiveId: "module-0",
        status: "learned",
        evidenceAuthority: foundationAuthority,
        attempts: 1,
        totalQuestions: 1,
        firstAttemptCorrect: 1,
        score: 1,
        confidence: "high",
        intervalStage: 0,
        nextReviewAt: "2026-08-20T12:00:00.000Z",
        lastStudiedAt: "2026-08-01T12:00:00.000Z",
      },
      "0-1": {
        lessonId: "0-1",
        lessonTitle: "Dependent",
        prerequisiteObjectiveIds: ["module-0"],
        status: "learned",
        evidenceAuthority: "receipt-verified",
        attempts: 1,
        totalQuestions: 1,
        firstAttemptCorrect: 1,
        score: 1,
        confidence: "high",
        intervalStage: 0,
        nextReviewAt: "2026-08-10T12:00:00.000Z",
        lastStudiedAt: "2026-08-01T12:00:00.000Z",
      },
    },
  });
  const courseA = progressFor("course-a", "activity-observed");
  const courseB = progressFor("course-b", "receipt-verified");
  courseB.lessons["0-1"].nextReviewAt = "2026-08-20T12:00:00.000Z";

  expect(buildPrerequisiteSafeReviewQueue([courseA, courseB], now)).toEqual([]);
  courseA.lessons["0-0"].evidenceAuthority = "receipt-verified";
  expect(buildPrerequisiteSafeReviewQueue([courseA, courseB], now).map((item) => `${item.courseId}:${item.lessonId}`))
    .toEqual(["course-a:0-1"]);
});

function readiness(
  objectiveId: string,
  satisfiesPrerequisite: boolean,
  prerequisitesSatisfied = true,
): ObjectiveReadinessProjection {
  return {
    objectiveId,
    state: satisfiesPrerequisite ? "practicing" : "unseen",
    band: satisfiesPrerequisite ? "guided" : "foundation",
    evidenceConfidence: satisfiesPrerequisite ? "receipt-verified" : "none",
    evidenceIds: [],
    satisfiesPrerequisite,
    prerequisitesSatisfied,
    reasonCodes: [],
  };
}

function candidate(overrides: Partial<InterleavableReviewCandidate> & Pick<InterleavableReviewCandidate, "courseId" | "lessonId" | "objectiveId">): InterleavableReviewCandidate {
  const { courseId, lessonId, objectiveId, ...rest } = overrides;
  return {
    courseId,
    topic: `Topic ${courseId}`,
    lessonId,
    lessonTitle: `Lesson ${lessonId}`,
    objectiveId,
    kind: "spaced",
    dueAt: "2026-08-15T09:00:00.000Z",
    priority: 50,
    reason: "Spaced recall is due",
    estimatedMinutes: 4,
    confidence: "medium",
    performanceBand: "developing",
    calibration: "calibrated",
    variants: [{ id: `variant-${lessonId}`, objectiveId, contextKey: lessonId }],
    variantExposures: [],
    ...rest,
  };
}

test("interleaves only within urgency tiers and never schedules an unproven prerequisite", () => {
  const candidates = [
    candidate({ courseId: "course-a", lessonId: "0-0", objectiveId: "objective-a", performanceBand: "fragile", priority: 90 }),
    candidate({ courseId: "course-a", lessonId: "0-1", objectiveId: "objective-a", performanceBand: "fragile", priority: 80 }),
    candidate({ courseId: "course-b", lessonId: "0-0", objectiveId: "objective-b", performanceBand: "fragile", priority: 70 }),
    candidate({ courseId: "course-c", lessonId: "0-0", objectiveId: "objective-c", dueAt: "2026-08-13T09:00:00.000Z", priority: 100 }),
    candidate({
      courseId: "course-d",
      lessonId: "0-0",
      objectiveId: "objective-dependent",
      performanceBand: "fragile",
      priority: 200,
      prerequisiteObjectiveIds: ["objective-prerequisite"],
    }),
  ] as const;
  const snapshot = JSON.stringify(candidates);

  const session = composeInterleavedReviewSession({
    candidates,
    readiness: {
      "objective-prerequisite": readiness("objective-prerequisite", false),
    },
    now: new Date("2026-08-15T12:00:00.000Z"),
  });

  expect(session.map((item) => `${item.urgency}:${item.candidate.objectiveId}`)).toEqual([
    "fragile:objective-a",
    "fragile:objective-a",
    "fragile:objective-b",
    "overdue:objective-c",
  ]);
  expect(session.some((item) => item.candidate.objectiveId === "objective-dependent")).toBe(false);
  expect(JSON.stringify(candidates)).toBe(snapshot);
});

test("never lets variety move a low-priority item ahead of stronger evidence", () => {
  const now = new Date("2026-08-15T12:00:00.000Z");
  const ordered = interleaveAdaptiveReviewCandidates([
    candidate({ courseId: "course-a", lessonId: "high-a", objectiveId: "objective-a", priority: 100 }),
    candidate({ courseId: "course-a", lessonId: "high-b", objectiveId: "objective-a", priority: 99 }),
    candidate({ courseId: "course-b", lessonId: "low", objectiveId: "objective-b", priority: 1 }),
  ], now);
  expect(ordered.map((item) => item.priority)).toEqual([100, 99, 1]);
});

test("admits a dependent review only after its prerequisite has receipt-backed readiness", () => {
  const dependent = candidate({
    courseId: "course-d",
    lessonId: "0-1",
    objectiveId: "objective-dependent",
    prerequisiteObjectiveIds: ["objective-prerequisite"],
  });
  const session = composeInterleavedReviewSession({
    candidates: [dependent],
    readiness: {
      "objective-prerequisite": readiness("objective-prerequisite", true),
    },
    now: new Date("2026-08-15T12:00:00.000Z"),
  });

  expect(session).toHaveLength(1);
  expect(session[0].candidate.objectiveId).toBe("objective-dependent");
  expect(session[0].variant.id).toBe("variant-0-1");
});

test("fails closed for transitively blocked prerequisites and mismatched variants", () => {
  const dependent = candidate({
    courseId: "course-d",
    lessonId: "0-2",
    objectiveId: "objective-dependent",
    prerequisiteObjectiveIds: ["objective-prerequisite"],
    variants: [{ id: "wrong-objective", objectiveId: "objective-other", contextKey: "other" }],
  });
  const transitivelyBlocked = composeInterleavedReviewSession({
    candidates: [dependent],
    readiness: {
      "objective-prerequisite": readiness("objective-prerequisite", true, false),
    },
  });
  expect(transitivelyBlocked).toEqual([]);

  const mismatchedVariant = composeInterleavedReviewSession({
    candidates: [dependent],
    readiness: {
      "objective-prerequisite": readiness("objective-prerequisite", true),
    },
  });
  expect(mismatchedVariant).toEqual([]);
});
