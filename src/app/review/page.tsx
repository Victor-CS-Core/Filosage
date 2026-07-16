"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarCheck2, Clock3, LoaderCircle, Sparkles } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import type { CourseProgress } from "@/lib/learning-types";

export default function ReviewPage() {
  const router = useRouter();
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const [progress, setProgress] = useState<CourseProgress[]>([]);
  const [loadedForUid, setLoadedForUid] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    let cancelled = false;
    void user.getIdToken().then((token) => fetch("/api/progress", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as { progress: CourseProgress[] };
      if (!cancelled) setProgress(data.progress);
    }).finally(() => {
      if (!cancelled) setLoadedForUid(user.uid);
    });
    return () => { cancelled = true; };
  }, [authLoading, user]);

  const due = useMemo(() => progress.flatMap((course) => Object.values(course.lessons).map((lesson) => ({
    ...lesson,
    courseId: course.courseId,
    topic: course.topic,
  }))).filter((lesson) => Date.parse(lesson.nextReviewAt) <= now)
    .sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt))
    .slice(0, 3), [now, progress]);

  if (authLoading || (user && loadedForUid !== user.uid)) {
    return <AppShell><div className="center-state"><LoaderCircle className="spin" size={25} /><h1>Preparing today&apos;s review</h1></div></AppShell>;
  }

  if (!user) {
    return (
      <AppShell>
        <div className="center-state review-signin-state">
          <span className="state-icon"><CalendarCheck2 size={23} /></span>
          <p className="overline">Review queue</p>
          <h1>Return before the idea fades.</h1>
          <p>Sign in to schedule concepts across devices and build durable recall. Published courses remain free without an account.</p>
          <button className="button button-primary" onClick={() => void signInWithGoogle()}>Sign in to review</button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="review-page">
        <header className="review-header">
          <div>
            <p className="overline">Focused recall</p>
            <h1>{due.length ? "Three concepts. One deliberate session." : "Nothing is due right now."}</h1>
            <p>{due.length ? "Answer before rereading. Erudoza will shorten or extend the next interval from your result." : "Continue a course and your next review will appear here automatically."}</p>
          </div>
          <span className="review-count"><Sparkles size={17} /> {due.length} due now</span>
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
            <div><strong>Your memory has breathing room.</strong><p>Start or continue a published course to schedule the next useful review.</p></div>
            <button className="button button-secondary" onClick={() => router.push("/#library")}>Browse courses</button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
