import type {
  Confidence,
  ConfidenceCalibration,
  CourseProgress,
  DelayedCheck,
  LessonProgress,
  PerformanceBand,
  ReviewKind,
} from "@/lib/learning-types";

const DAY_MS = 86_400_000;
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30, 60] as const;

export interface AdaptiveSchedule {
  score: number;
  performanceBand: PerformanceBand;
  calibration: ConfidenceCalibration;
  intervalStage: number;
  intervalDays: number;
  nextReviewAt: string;
}

export interface AdaptiveReviewCandidate {
  courseId: string;
  topic: string;
  lessonId: string;
  lessonTitle: string;
  kind: ReviewKind;
  dueAt: string;
  priority: number;
  reason: string;
  estimatedMinutes: number;
  confidence: Confidence;
  performanceBand: PerformanceBand;
  calibration: ConfidenceCalibration;
}

export interface ForwardMission {
  courseId: string;
  topic: string;
  lessonId: string;
  lessonTitle: string;
  estimatedMinutes: number;
}

export interface DailyMission {
  review: AdaptiveReviewCandidate | null;
  forward: ForwardMission | null;
  estimatedMinutes: number;
  recovered: boolean;
}

export interface WeeklyMilestone {
  completed: number;
  target: number;
  remaining: number;
  percent: number;
  isComplete: boolean;
  weekStartedAt: string;
}

function clampScore(score: number) {
  return Math.max(0, Math.min(1, Number.isFinite(score) ? score : 0));
}

export function performanceBandFor(score: number): PerformanceBand {
  const normalized = clampScore(score);
  if (normalized >= 0.85) return "secure";
  if (normalized >= 0.65) return "developing";
  return "fragile";
}

export function confidenceCalibrationFor(
  confidence: Confidence,
  score: number,
): ConfidenceCalibration {
  const normalized = clampScore(score);
  if (confidence === "high" && normalized < 0.7) return "overconfident";
  if (confidence === "low" && normalized >= 0.8) return "underconfident";
  return "calibrated";
}

export function scheduleAdaptiveReview({
  score,
  confidence,
  previousStage = 0,
  isReview,
  now = new Date(),
}: {
  score: number;
  confidence: Confidence;
  previousStage?: number;
  isReview: boolean;
  now?: Date;
}): AdaptiveSchedule {
  const normalizedScore = clampScore(score);
  const performanceBand = performanceBandFor(normalizedScore);
  const calibration = confidenceCalibrationFor(confidence, normalizedScore);
  const boundedPrevious = Math.max(0, Math.min(REVIEW_INTERVAL_DAYS.length - 1, previousStage));

  let intervalStage = boundedPrevious;
  if (performanceBand === "fragile") {
    intervalStage = 0;
  } else if (isReview && performanceBand === "secure") {
    intervalStage = Math.min(boundedPrevious + 1, REVIEW_INTERVAL_DAYS.length - 1);
  } else if (!isReview && performanceBand === "secure") {
    intervalStage = 1;
  }

  const baseDays = REVIEW_INTERVAL_DAYS[intervalStage];
  const intervalDays = calibration === "overconfident"
    ? Math.max(1, Math.floor(baseDays / 2))
    : confidence === "low" && performanceBand !== "secure"
      ? Math.max(1, Math.floor(baseDays * 0.75))
      : baseDays;

  return {
    score: normalizedScore,
    performanceBand,
    calibration,
    intervalStage,
    intervalDays,
    nextReviewAt: new Date(now.getTime() + intervalDays * DAY_MS).toISOString(),
  };
}

function delayedCheck(dueAt: string, completedAt?: string): DelayedCheck {
  return completedAt ? { dueAt, completedAt } : { dueAt };
}

export function updateDelayedChecks(
  completedAt: string,
  current: LessonProgress["delayedChecks"],
  reviewKind: ReviewKind | undefined,
  observedAt: string,
): NonNullable<LessonProgress["delayedChecks"]> {
  const completedTime = Date.parse(completedAt);
  const baseTime = Number.isFinite(completedTime) ? completedTime : Date.parse(observedAt);
  const day7Due = current?.day7.dueAt ?? new Date(baseTime + 7 * DAY_MS).toISOString();
  const day28Due = current?.day28.dueAt ?? new Date(baseTime + 28 * DAY_MS).toISOString();
  return {
    day7: delayedCheck(
      day7Due,
      reviewKind === "delayed-7" ? observedAt : current?.day7.completedAt,
    ),
    day28: delayedCheck(
      day28Due,
      reviewKind === "delayed-28" ? observedAt : current?.day28.completedAt,
    ),
  };
}

function overdueDays(dueAt: string, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(dueAt)) / DAY_MS));
}

function nextDueKind(lesson: LessonProgress, now: Date): { kind: ReviewKind; dueAt: string } | null {
  const completedTime = Date.parse(lesson.completedAt ?? "");
  const day7 = lesson.delayedChecks?.day7 ?? (
    Number.isFinite(completedTime)
      ? { dueAt: new Date(completedTime + 7 * DAY_MS).toISOString() }
      : undefined
  );
  if (day7 && !day7.completedAt && Date.parse(day7.dueAt) <= now.getTime()) {
    return { kind: "delayed-7", dueAt: day7.dueAt };
  }
  const day28 = lesson.delayedChecks?.day28 ?? (
    Number.isFinite(completedTime)
      ? { dueAt: new Date(completedTime + 28 * DAY_MS).toISOString() }
      : undefined
  );
  if (day28 && !day28.completedAt && Date.parse(day28.dueAt) <= now.getTime()) {
    return { kind: "delayed-28", dueAt: day28.dueAt };
  }
  if (Date.parse(lesson.nextReviewAt) <= now.getTime()) {
    return { kind: "spaced", dueAt: lesson.nextReviewAt };
  }
  return null;
}

function reviewReason(
  kind: ReviewKind,
  lesson: LessonProgress,
  performanceBand: PerformanceBand,
  calibration: ConfidenceCalibration,
) {
  if (kind === "delayed-28") return "28-day retention check";
  if (kind === "delayed-7") return "7-day retention check";
  if (calibration === "overconfident") return "Confidence ran ahead of performance";
  if (performanceBand === "fragile") return lesson.misconception
    ? "Fragile concept and named misconception"
    : "Fragile first-try performance";
  if (calibration === "underconfident") return "Strong performance with low confidence";
  return "Spaced recall is due";
}

export function buildAdaptiveReviewQueue(
  progress: CourseProgress[],
  now = new Date(),
): AdaptiveReviewCandidate[] {
  return progress.flatMap((course) =>
    Object.values(course.lessons).flatMap((lesson) => {
      const due = nextDueKind(lesson, now);
      if (!due) return [];
      const score = lesson.score ?? (
        lesson.totalQuestions ? lesson.firstAttemptCorrect / lesson.totalQuestions : 1
      );
      const performanceBand = lesson.performanceBand ?? performanceBandFor(score);
      const calibration = lesson.calibration ?? confidenceCalibrationFor(lesson.confidence, score);
      const kindWeight = due.kind === "delayed-28" ? 40 : due.kind === "delayed-7" ? 30 : 0;
      const fragilityWeight = performanceBand === "fragile" ? 28 : performanceBand === "developing" ? 12 : 0;
      const calibrationWeight = calibration === "overconfident" ? 24 : calibration === "underconfident" ? 8 : 0;
      return [{
        courseId: course.courseId,
        topic: course.topic,
        lessonId: lesson.lessonId,
        lessonTitle: lesson.lessonTitle,
        kind: due.kind,
        dueAt: due.dueAt,
        priority: kindWeight + fragilityWeight + calibrationWeight + Math.min(30, overdueDays(due.dueAt, now) * 3),
        reason: reviewReason(due.kind, lesson, performanceBand, calibration),
        estimatedMinutes: Math.max(3, Math.min(10, Math.ceil((lesson.estimatedMinutes ?? 12) / 3))),
        confidence: lesson.confidence,
        performanceBand,
        calibration,
      }];
    }),
  ).sort((left, right) =>
    right.priority - left.priority
    || left.dueAt.localeCompare(right.dueAt)
    || left.lessonTitle.localeCompare(right.lessonTitle),
  );
}

export function buildDailyMission(
  progress: CourseProgress[],
  now = new Date(),
): DailyMission {
  const review = buildAdaptiveReviewQueue(progress, now)[0] ?? null;
  const forwardCourse = [...progress]
    .filter((course) => course.nextLessonId)
    .sort((left, right) => right.lastActivityAt.localeCompare(left.lastActivityAt))[0];
  const forward = forwardCourse?.nextLessonId ? {
    courseId: forwardCourse.courseId,
    topic: forwardCourse.topic,
    lessonId: forwardCourse.nextLessonId,
    lessonTitle: forwardCourse.nextLessonTitle ?? "Next lesson",
    estimatedMinutes: 12,
  } : null;
  const lastActivity = progress
    .map((course) => Date.parse(course.lastActivityAt))
    .filter(Number.isFinite)
    .sort((left, right) => right - left)[0];
  const recovered = Boolean(lastActivity && now.getTime() - lastActivity >= 2 * DAY_MS);
  return {
    review,
    forward,
    estimatedMinutes: (review?.estimatedMinutes ?? 0) + (forward?.estimatedMinutes ?? 0),
    recovered,
  };
}

function startOfWeek(now: Date) {
  const date = new Date(now);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  date.setHours(0, 0, 0, 0);
  return date;
}

export function buildWeeklyMilestone(
  progress: CourseProgress[],
  target: number,
  now = new Date(),
): WeeklyMilestone {
  const weekStartedAt = startOfWeek(now);
  const completed = progress.flatMap((course) => Object.values(course.lessons))
    .filter((lesson) => Date.parse(lesson.lastStudiedAt) >= weekStartedAt.getTime())
    .length;
  const normalizedTarget = Math.max(1, Math.min(50, Math.round(target)));
  return {
    completed,
    target: normalizedTarget,
    remaining: Math.max(0, normalizedTarget - completed),
    percent: Math.min(100, Math.round((completed / normalizedTarget) * 100)),
    isComplete: completed >= normalizedTarget,
    weekStartedAt: weekStartedAt.toISOString(),
  };
}

export function weeklyGoalChoices(currentTarget: number) {
  const normalizedTarget = Math.max(1, Math.min(50, Math.round(currentTarget)));
  return [...new Set([3, 5, 7, 10, normalizedTarget])].sort((left, right) => left - right);
}

export function reviewKindLabel(kind: ReviewKind) {
  if (kind === "delayed-7") return "7-day check";
  if (kind === "delayed-28") return "28-day check";
  return "Adaptive review";
}

export function calibrationMessage(calibration: ConfidenceCalibration) {
  if (calibration === "overconfident") {
    return "Your confidence was higher than your first-try performance. This concept will return sooner.";
  }
  if (calibration === "underconfident") {
    return "Your first-try performance was stronger than your confidence. Trust the evidence and keep practicing.";
  }
  return "Your confidence matched the evidence from this check.";
}
