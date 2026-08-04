"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarCheck2, Clock3, Flame, RefreshCw, Sparkles } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import type { CourseProgress } from "@/lib/learning-types";
import { listLocalProgress } from "@/lib/learning-progress";
import { removeDeletedLocalCourses } from "@/lib/local-course-data";
import { buildAdaptiveReviewQueue, reviewKindLabel } from "@/lib/adaptive-learning";
import { trackProductEvent } from "@/lib/product-analytics";

const SESSION_SIZE = 10;

function streakFor(progress: CourseProgress[]) {
  const dates = new Set(progress.flatMap((course) => Object.values(course.lessons).map((lesson) => lesson.lastStudiedAt.slice(0, 10))));
  const cursor = new Date();
  if (!dates.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (dates.has(cursor.toISOString().slice(0, 10))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}

export default function ReviewPage() {
  const router = useRouter();
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const [progress, setProgress] = useState<CourseProgress[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    const load = async (): Promise<CourseProgress[]> => {
      // Reviews work without an account: device progress carries the schedule.
      if (!user) return removeDeletedLocalCourses(listLocalProgress());
      const token = await user.getIdToken();
      const response = await fetch("/api/progress", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Your review schedule could not be loaded.");
      const data = await response.json() as { progress: CourseProgress[] };
      return data.progress;
    };
    void load()
      .then((result) => { if (!cancelled) { setProgress(result); setLoadError(null); } })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(controller.signal.aborted
          ? "Your review schedule took too long to respond."
          : error instanceof Error ? error.message : "Your review schedule could not be loaded.");
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [authLoading, loadAttempt, user]);

  const allLessons = useMemo(() => progress.flatMap((course) => Object.values(course.lessons).map((lesson) => ({
    ...lesson,
    courseId: course.courseId,
    topic: course.topic,
  }))), [progress]);
  const fullQueue = useMemo(
    () => buildAdaptiveReviewQueue(progress, new Date(now)),
    [now, progress],
  );
  const due = useMemo(() => fullQueue.slice(0, SESSION_SIZE), [fullQueue]);
  const upcoming = useMemo(() => allLessons
    .filter((lesson) => Date.parse(lesson.nextReviewAt) > now)
    .sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt))
    .slice(0, 3), [allLessons, now]);
  const streak = useMemo(() => streakFor(progress), [progress]);
  const sessionMinutes = Math.max(3, due.reduce((sum, lesson) => sum + lesson.estimatedMinutes, 0));

  useEffect(() => {
    if (!loaded || !due.length) return;
    const first = due[0];
    trackProductEvent("review_due", {
      route: "/review",
      courseId: first.courseId,
      lessonId: first.lessonId,
      oncePerSession: true,
    });
  }, [due, loaded]);

  if (authLoading || !loaded) {
    return <AppShell><div className="review-page review-loading-state" aria-busy="true" aria-label="Preparing today's review"><header><span /><span /><span /></header><div><span /><span /><span /></div></div></AppShell>;
  }

  if (loadError) {
    return <AppShell><div className="review-page"><section className="review-recovery" role="alert"><CalendarCheck2 size={28} /><p className="overline">Review unavailable</p><h1>Your schedule is safe.</h1><p>{loadError} Try again without losing any learning progress.</p><div><button className="button button-primary" onClick={() => { setLoaded(false); setLoadError(null); setLoadAttempt((attempt) => attempt + 1); }}><RefreshCw size={15} /> Try again</button><button className="button button-secondary" onClick={() => router.push("/library")}>Explore courses</button></div></section></div></AppShell>;
  }

  return (
    <AppShell>
      <div className="review-page">
        <header className="review-header">
          <div>
            <p className="overline">Today&apos;s dose</p>
            <h1>{due.length ? `${fullQueue.length} concept${fullQueue.length === 1 ? "" : "s"} ready, ordered by need` : "You are caught up for today."}</h1>
            <p>{due.length
              ? `Start with the most fragile evidence. This session takes about ${sessionMinutes} minutes, and each result recalibrates when that concept returns.`
              : "Understanding lasts because concepts return right before you would forget them. Keep learning and tomorrow's dose will be waiting."}</p>
          </div>
          <div className="review-header-stats">
            <span className="review-count"><Sparkles size={17} /> {fullQueue.length} due now</span>
            {streak > 0 && <span className="review-streak"><Flame size={16} /> {streak}-day streak</span>}
          </div>
        </header>

        {due.length ? (
          <div className="review-list">
            {due.map((lesson, index) => (
              <button
                className="review-item"
                key={`${lesson.courseId}-${lesson.lessonId}`}
                onClick={() => {
                  const check = lesson.kind === "delayed-7" ? "&check=day7" : lesson.kind === "delayed-28" ? "&check=day28" : "";
                  router.push(`/course/${encodeURIComponent(lesson.topic)}/lesson/${lesson.lessonId}?id=${lesson.courseId}&review=1${check}`);
                }}
              >
                <span className="review-index">{index + 1}</span>
                <span>
                  <small>{lesson.topic}</small>
                  <strong>{lesson.lessonTitle}</strong>
                  <span className="review-adaptation"><b>{reviewKindLabel(lesson.kind)}</b>{lesson.reason}</span>
                  <em><Clock3 size={13} /> Due {new Date(lesson.dueAt).toLocaleDateString()} · {lesson.estimatedMinutes} min</em>
                </span>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
        ) : (
          <div className="review-clear-state">
            <CalendarCheck2 size={27} />
            <div><strong>Nothing is due right now.</strong><p>Complete a lesson and it joins your review schedule automatically.</p></div>
            <button className="button button-secondary" onClick={() => router.push("/library")}>Browse courses</button>
          </div>
        )}

        {upcoming.length > 0 && (
          <section className="review-upcoming" aria-labelledby="upcoming-title">
            <h2 id="upcoming-title">Coming back soon</h2>
            <ul>
              {upcoming.map((lesson) => (
                <li key={`${lesson.courseId}-${lesson.lessonId}`}>
                  <span><strong>{lesson.lessonTitle}</strong><small>{lesson.topic}</small></span>
                  <em>{new Date(lesson.nextReviewAt).toLocaleDateString("en", { month: "short", day: "numeric" })}</em>
                </li>
              ))}
            </ul>
            <p>Each concept returns on its own schedule: sooner when an answer felt shaky, later as it strengthens.</p>
          </section>
        )}

        {!user && allLessons.length > 0 && (
          <div className="review-sync-hint">
            <p>Your review schedule lives on this device. <button className="text-button" onClick={() => void signInWithGoogle()}>Create a free account</button> to keep it across devices.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
