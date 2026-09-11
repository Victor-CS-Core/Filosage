"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarCheck2, Flame, TrendingUp } from "lucide-react";
import AppShell from "@/components/AppShell";
import CourseDeck, { type CourseDeckItem } from "@/components/CourseDeck";
import { useAuth } from "@/components/AuthProvider";
import { useLearnerState } from "@/components/useLearnerState";
import type { Course } from "@/lib/course-types";
import type { CourseProgress, LessonProgress } from "@/lib/learning-types";
import { buildPrerequisiteSafeReviewQueue } from "@/lib/review-readiness";
import { buildWeeklyMilestone } from "@/lib/adaptive-learning";
import { trackProductEvent } from "@/lib/product-analytics";
import { normalizeDisplayName } from "@/lib/display-name";

function streakFor(lessons: LessonProgress[]) {
  const dates = new Set(lessons.map((lesson) => lesson.lastStudiedAt.slice(0, 10)));
  let streak = 0;
  const cursor = new Date();
  if (!dates.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function lessonEstimate(course: Course | undefined, lessonId: string | null | undefined) {
  if (!course || !lessonId) return undefined;
  const [moduleIndex, lessonIndex] = lessonId.split("-").map(Number);
  if (!Number.isInteger(moduleIndex) || !Number.isInteger(lessonIndex)) return undefined;
  return course.modules[moduleIndex]?.lessons[lessonIndex]?.estimatedMinutes;
}

function nextReviewLabel(lessons: LessonProgress[], dueCount: number, now: number) {
  if (dueCount) return `${dueCount} due now`;
  const nextTimestamp = lessons
    .map((lesson) => Date.parse(lesson.nextReviewAt))
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > now)
    .sort((first, second) => first - second)[0];
  if (!nextTimestamp) return "Queue clear";
  const today = new Date(now);
  const next = new Date(nextTimestamp);
  const todayKey = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const nextKey = new Date(next.getFullYear(), next.getMonth(), next.getDate()).getTime();
  const dayDifference = Math.round((nextKey - todayKey) / 86_400_000);
  if (dayDifference <= 0) return "Later today";
  if (dayDifference === 1) return "Tomorrow";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(next);
}

function buildDeckItems(progress: CourseProgress[], publicCourses: Course[], ownedCourses: Course[]): CourseDeckItem[] {
  const coursesById = new Map<string, Course>();
  for (const course of [...publicCourses, ...ownedCourses]) {
    const id = course.id ?? course.courseId;
    if (id) coursesById.set(id, course);
  }

  return progress
    .filter((item) => Boolean(item.nextLessonId) || item.capstone?.status !== "passed")
    .sort((first, second) => Date.parse(second.lastActivityAt) - Date.parse(first.lastActivityAt))
    .map((item) => {
      const course = coursesById.get(item.courseId)
        ?? [...ownedCourses, ...publicCourses].find((candidate) => candidate.topic === item.topic);
      const courseLessonCount = course?.modules.reduce((total, module) => total + module.lessons.length, 0);
      const totalLessons = item.totalLessons ?? courseLessonCount;
      const progressPercent = totalLessons
        ? Math.min(100, Math.max(0, Math.round((item.completedLessonIds.length / totalLessons) * 100)))
        : null;
      const href = item.nextLessonId
        ? `/course/${encodeURIComponent(item.topic)}/lesson/${item.nextLessonId}?id=${item.courseId}`
        : `/course/${encodeURIComponent(item.topic)}?id=${item.courseId}`;

      return {
        id: item.courseId,
        topic: item.topic,
        category: course?.category,
        banner: course?.banner,
        href,
        nextLessonTitle: item.nextLessonTitle ?? (item.capstone?.status === "needs_revision" ? "Revise your capstone" : "Review the course map"),
        completedLessons: item.completedLessonIds.length,
        totalLessons,
        progressPercent,
        estimatedMinutes: lessonEstimate(course, item.nextLessonId),
      };
    });
}

export default function LearnerHome() {
  const { user, account, canCreateCourses, loading: authLoading } = useAuth();
  const { state: learnerState } = useLearnerState();
  const [courses, setCourses] = useState<Course[]>([]);
  const [authoredCourses, setAuthoredCourses] = useState<Course[]>([]);
  const [progress, setProgress] = useState<CourseProgress[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [now] = useState(() => Date.now());

  const privateDataBlocked = authLoading || !account || account.legalAcceptanceRequired || account.identityLinkRequired;
  useEffect(() => {
    if (!user || privateDataBlocked) return;
    let cancelled = false;
    const controller = new AbortController();
    const readJson = async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await fetch(input, { ...init, signal: controller.signal });
      if (!response.ok) throw new Error(`Learner home request failed with ${response.status}.`);
      return response.json() as Promise<unknown>;
    };
    void user.getIdToken().then((token) => {
      controller.signal.throwIfAborted();
      return Promise.all([
        readJson("/api/progress", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
        readJson("/api/courses?scope=public", { cache: "no-store" }),
        readJson("/api/courses?scope=mine", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }),
      ]);
    }).then(([progressData, courseData, authoredCourseData]) => {
      if (!cancelled) {
        setProgress((progressData as { progress: CourseProgress[] }).progress);
        setCourses((courseData as { courses: Course[] }).courses);
        setAuthoredCourses((authoredCourseData as { courses: Course[] }).courses);
      }
    }).catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; controller.abort(); };
  }, [privateDataBlocked, loadAttempt, user]);

  const deckItems = useMemo(() => buildDeckItems(progress, courses, authoredCourses), [authoredCourses, courses, progress]);
  const due = useMemo(() => buildPrerequisiteSafeReviewQueue(progress, new Date(now)), [now, progress]);

  useEffect(() => {
    if (!user || !loaded || loadError || due.length === 0) return;
    trackProductEvent("return_recommendation_viewed", {
      route: "/",
      surface: "home_review",
      oncePerSession: true,
    });
  }, [due.length, loadError, loaded, user]);

  if (!user) return null;

  const lessons = progress.flatMap((item) => Object.values(item.lessons));
  const weeklyMilestone = buildWeeklyMilestone(progress, learnerState.weeklyLessonGoal, new Date(now));
  const streak = streakFor(lessons);
  const firstName = (normalizeDisplayName(account?.displayName)
    ?? normalizeDisplayName(user.displayName)
    ?? "Learner").split(" ")[0];
  const reviewLabel = nextReviewLabel(lessons, due.length, now);

  return (
    <AppShell>
      <div className="course-deck-page">
        {!loaded ? (
          <div className="course-deck-loading" aria-label="Preparing your active courses" aria-busy="true">
            <span /><span /><span />
          </div>
        ) : loadError ? (
          <section className="course-deck-error" role="alert" aria-labelledby="course-deck-error-title">
            <CalendarCheck2 size={30} aria-hidden="true" />
            <h1 id="course-deck-error-title">Your learning path couldn&apos;t load.</h1>
            <p>Your courses and progress are still intact. Check the connection and try again.</p>
            <button className="button course-deck-primary" type="button" onClick={() => {
              setLoaded(false);
              setLoadError(false);
              setLoadAttempt((attempt) => attempt + 1);
            }}>Try again</button>
          </section>
        ) : (
          <>
            <CourseDeck items={deckItems} firstName={firstName} canCreateCourses={canCreateCourses} />
            <section className="course-deck-signals" aria-label="Learning momentum">
              <Link href="/progress">
                <TrendingUp size={23} aria-hidden="true" />
                <span><small>Weekly</small><strong>{weeklyMilestone.completed} / {weeklyMilestone.target}</strong></span>
              </Link>
              <Link href="/review" onClick={() => trackProductEvent("return_recommendation_started", { route: "/", surface: "home_review" })}>
                <CalendarCheck2 size={23} aria-hidden="true" />
                <span><small>Review</small><strong>{reviewLabel}</strong></span>
              </Link>
              <Link href="/profile#achievements">
                <Flame size={23} aria-hidden="true" />
                <span><small>Streak</small><strong>{streak} {streak === 1 ? "day" : "days"}</strong></span>
              </Link>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
