"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarCheck2, Clock3, Flame, LoaderCircle, Sparkles } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import type { CourseProgress } from "@/lib/learning-types";
import { listLocalProgress } from "@/lib/learning-progress";
import { removeDeletedLocalCourses } from "@/lib/local-course-data";

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
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    const load = async (): Promise<CourseProgress[]> => {
      // Reviews work without an account: device progress carries the schedule.
      if (!user) return removeDeletedLocalCourses(listLocalProgress());
      const token = await user.getIdToken();
      const response = await fetch("/api/progress", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) return [];
      const data = await response.json() as { progress: CourseProgress[] };
      return data.progress;
    };
    void load()
      .then((result) => { if (!cancelled) setProgress(result); })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [authLoading, user]);

  const allLessons = useMemo(() => progress.flatMap((course) => Object.values(course.lessons).map((lesson) => ({
    ...lesson,
    courseId: course.courseId,
    topic: course.topic,
  }))), [progress]);
  const due = useMemo(() => allLessons
    .filter((lesson) => Date.parse(lesson.nextReviewAt) <= now)
    .sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt))
    .slice(0, SESSION_SIZE), [allLessons, now]);
  const upcoming = useMemo(() => allLessons
    .filter((lesson) => Date.parse(lesson.nextReviewAt) > now)
    .sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt))
    .slice(0, 3), [allLessons, now]);
  const streak = useMemo(() => streakFor(progress), [progress]);
  const sessionMinutes = Math.max(3, due.length * 3);

  if (authLoading || !loaded) {
    return <AppShell><div className="center-state"><LoaderCircle className="spin" size={25} /><h1>Preparing today&apos;s dose</h1></div></AppShell>;
  }

  return (
    <AppShell>
      <div className="review-page">
        <header className="review-header">
          <div>
            <p className="overline">Today&apos;s dose</p>
            <h1>{due.length ? `${due.length} concept${due.length === 1 ? "" : "s"} ready to strengthen` : "You are caught up for today."}</h1>
            <p>{due.length
              ? `Answer from memory before it fades. This takes about ${sessionMinutes} minutes across everything you are learning, and your result sets each concept's next return date.`
              : "Understanding lasts because concepts return right before you would forget them. Keep learning and tomorrow's dose will be waiting."}</p>
          </div>
          <div className="review-header-stats">
            <span className="review-count"><Sparkles size={17} /> {due.length} due now</span>
            {streak > 0 && <span className="review-streak"><Flame size={16} /> {streak}-day streak</span>}
          </div>
        </header>

        {due.length ? (
          <div className="review-list">
            {due.map((lesson, index) => (
              <button
                className="review-item"
                key={`${lesson.courseId}-${lesson.lessonId}`}
                onClick={() => router.push(`/course/${encodeURIComponent(lesson.topic)}/lesson/${lesson.lessonId}?id=${lesson.courseId}&review=1`)}
              >
                <span className="review-index">{index + 1}</span>
                <span><small>{lesson.topic}</small><strong>{lesson.lessonTitle}</strong><em><Clock3 size={13} /> Due {new Date(lesson.nextReviewAt).toLocaleDateString()}</em></span>
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
