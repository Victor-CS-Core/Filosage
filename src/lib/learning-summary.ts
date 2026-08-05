import type { CourseProgress, LessonProgress, PerformanceBand } from "@/lib/learning-types";

export interface CourseLessonProgress extends LessonProgress {
  courseId: string;
  topic: string;
}

export function learningLessons(progress: CourseProgress[]): CourseLessonProgress[] {
  return progress.flatMap((course) => Object.values(course.lessons).map((lesson) => ({
    ...lesson,
    courseId: course.courseId,
    topic: course.topic,
  })));
}

export function completedLearningLessons(progress: CourseProgress[]) {
  return learningLessons(progress).filter((lesson) => Boolean(lesson.completedAt) || lesson.status !== "started");
}

export function dueReviewLessons(progress: CourseProgress[], now = Date.now()) {
  return completedLearningLessons(progress).filter((lesson) => {
    const dueAt = Date.parse(lesson.nextReviewAt);
    return Number.isFinite(dueAt) && dueAt <= now;
  });
}

export function learningBandCounts(progress: CourseProgress[]) {
  const counts: Record<PerformanceBand, number> = { fragile: 0, developing: 0, secure: 0 };
  for (const lesson of completedLearningLessons(progress)) {
    const band = lesson.performanceBand ?? (lesson.status === "mastered" ? "secure" : "developing");
    counts[band] += 1;
  }
  return counts;
}

export function calibrationCounts(progress: CourseProgress[]) {
  const counts = { calibrated: 0, overconfident: 0, underconfident: 0, measured: 0 };
  for (const lesson of completedLearningLessons(progress)) {
    if (!lesson.calibration) continue;
    counts[lesson.calibration] += 1;
    counts.measured += 1;
  }
  return counts;
}

export function currentLearningStreak(progress: CourseProgress[], now = new Date()) {
  const activityDates = new Set<string>();
  for (const lesson of learningLessons(progress)) {
    activityDates.add(lesson.lastStudiedAt.slice(0, 10));
    for (const review of lesson.reviewHistory ?? []) activityDates.add(review.observedAt.slice(0, 10));
  }
  const cursor = new Date(now);
  const dateKey = () => cursor.toISOString().slice(0, 10);
  if (!activityDates.has(dateKey())) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (activityDates.has(dateKey())) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export function practiceEvidenceCount(progress: CourseProgress[]) {
  return completedLearningLessons(progress).filter((lesson) => lesson.experienceEvidence).length;
}

export function passedCapstoneCount(progress: CourseProgress[]) {
  return progress.filter((course) => course.capstone?.status === "passed").length;
}
