"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Flame, Lightbulb, LoaderCircle, Target, TrendingUp } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import type { CourseProgress, LessonProgress } from "@/lib/learning-types";
import { useLearnerState } from "@/components/useLearnerState";

function dateKey(date: Date) { return date.toISOString().slice(0, 10); }

function currentStreak(lessons: LessonProgress[]) {
  const dates = new Set(lessons.map((lesson) => lesson.lastStudiedAt.slice(0, 10)));
  const cursor = new Date();
  if (!dates.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (dates.has(dateKey(cursor))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}

export default function ProgressPage() {
  const router = useRouter();
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const { state, update } = useLearnerState();
  const [progress, setProgress] = useState<CourseProgress[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void user.getIdToken().then((token) => fetch("/api/progress", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as { progress: CourseProgress[] };
      if (!cancelled) setProgress(data.progress);
    }).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [user]);

  const lessons = useMemo(() => progress.flatMap((course) => Object.values(course.lessons).map((lesson) => ({ ...lesson, topic: course.topic, courseId: course.courseId }))), [progress]);
  const corrected = useMemo(() => lessons
    .filter((lesson) => lesson.misconception && lesson.completedAt)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")), [lessons]);
  const totalQuestions = lessons.reduce((sum, lesson) => sum + lesson.totalQuestions, 0);
  const accuracy = totalQuestions ? Math.round((lessons.reduce((sum, lesson) => sum + lesson.firstAttemptCorrect, 0) / totalQuestions) * 100) : 0;
  const mastered = lessons.filter((lesson) => lesson.status === "mastered").length;
  const minutes = progress.reduce((sum, course) => sum + (course.studyMinutes ?? 0), 0);
  const week = Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - (6 - index)); return { key: dateKey(date), label: date.toLocaleDateString("en", { weekday: "short" }), count: lessons.filter((lesson) => lesson.lastStudiedAt.slice(0, 10) === dateKey(date)).length }; });
  const maxDay = Math.max(1, ...week.map((day) => day.count));
  const weeklyCompleted = week.reduce((sum, day) => sum + day.count, 0);

  if (authLoading) return <AppShell><div className="center-state"><LoaderCircle className="spin" size={25} /><h1>Preparing your learning record</h1></div></AppShell>;
  if (!user) return <AppShell><div className="center-state"><TrendingUp size={26} /><p className="overline">Your progress</p><h1>Keep your learning in one place.</h1><p>Create a free account to sync progress, reviews, saved courses, and notes across devices.</p><button className="button button-primary" onClick={() => void signInWithGoogle()}>Create a free account</button></div></AppShell>;

  return (
    <AppShell>
      <div className="progress-page">
        <header className="page-header"><div><p className="overline">Learning record</p><h1>Your progress</h1><p>Progress here means understanding that lasts: what you can now explain, what you have stopped being wrong about, and what returns for review next.</p></div></header>
        {!loaded ? <div className="dashboard-loading"><span /><span /><span /></div> : (
          <>
            <section className="progress-metrics" aria-label="Learning summary"><article><span><Flame size={21} /></span><div><small>Current streak</small><strong>{currentStreak(lessons)} {currentStreak(lessons) === 1 ? "day" : "days"}</strong><em>Study days in a row</em></div></article><article><span><Clock3 size={21} /></span><div><small>Tracked study time</small><strong>{Math.floor(minutes / 60)}h {minutes % 60}m</strong><em>Completed lessons</em></div></article><article><span><CheckCircle2 size={21} /></span><div><small>Concepts mastered</small><strong>{mastered}</strong><em>{lessons.length} lessons completed</em></div></article><article><span><Target size={21} /></span><div><small>First-try accuracy</small><strong>{accuracy ? `${accuracy}%` : "—"}</strong><em>Across retrieval checks</em></div></article><article><span><Lightbulb size={21} /></span><div><small>Misconceptions corrected</small><strong>{corrected.length}</strong><em>Beliefs replaced with understanding</em></div></article></section>
            <div className="progress-layout">
              <section className="activity-panel"><div className="panel-heading"><div><CalendarDays size={19} /><h2>Learning activity</h2></div><span>Last 7 days</span></div><div className="activity-chart" aria-label={`${weeklyCompleted} lessons studied in the last seven days`}>{week.map((day) => <div key={day.key}><span className="activity-bar-track"><i style={{ height: `${Math.max(day.count ? 14 : 3, (day.count / maxDay) * 100)}%` }}><b>{day.count || ""}</b></i></span><small>{day.label}</small></div>)}</div></section>
              <section className="goal-panel"><div className="panel-heading"><div><Target size={19} /><h2>Weekly goal</h2></div><button onClick={() => update((current) => ({ ...current, weeklyLessonGoal: current.weeklyLessonGoal >= 10 ? 3 : current.weeklyLessonGoal + 1 }))}>Adjust</button></div><strong>{Math.min(weeklyCompleted, state.weeklyLessonGoal)} of {state.weeklyLessonGoal} lessons</strong><div className="goal-track"><span style={{ width: `${Math.min(100, (weeklyCompleted / state.weeklyLessonGoal) * 100)}%` }} /></div><p>{weeklyCompleted >= state.weeklyLessonGoal ? "Weekly goal complete." : `${state.weeklyLessonGoal - weeklyCompleted} lesson${state.weeklyLessonGoal - weeklyCompleted === 1 ? "" : "s"} left to reach this week’s goal.`}</p></section>
              <section className="mastery-panel"><div className="panel-heading"><div><TrendingUp size={19} /><h2>Course progress</h2></div></div><div className="mastery-list">{progress.length ? progress.map((course) => { const learned = course.completedLessonIds.length; const total = Math.max(course.totalLessons ?? learned, 1); const percent = Math.round((learned / total) * 100); return <button key={course.courseId} onClick={() => router.push(`/course/${encodeURIComponent(course.topic)}?id=${course.courseId}`)}><span><strong>{course.topic}</strong><small>{learned}/{total} lessons</small></span><i><b style={{ width: `${percent}%` }} /></i><em>{percent}%</em></button>; }) : <div className="dashboard-empty compact"><div><strong>No course progress yet</strong><p>Start a published course to see your progress here.</p></div><button className="button button-secondary" onClick={() => router.push("/library")}>Explore courses</button></div>}</div></section>
              {corrected.length > 0 && (
                <section className="misconception-panel"><div className="panel-heading"><div><Lightbulb size={19} /><h2>What you stopped being wrong about</h2></div><span>{corrected.length} corrected</span></div>
                  <ul className="misconception-list">
                    {corrected.slice(0, 6).map((lesson) => (
                      <li key={`${lesson.courseId}-${lesson.lessonId}`}>
                        <p>&ldquo;{lesson.misconception}&rdquo;</p>
                        <small>Corrected in {lesson.lessonTitle} · {lesson.topic}</small>
                      </li>
                    ))}
                  </ul>
                  <p className="misconception-note">Every Erudoza lesson names the misconception it corrects. This list is your understanding, made visible.</p>
                </section>
              )}
              <section className="next-step-panel"><div className="panel-heading"><div><ArrowRight size={19} /><h2>Continue learning</h2></div></div>{progress.slice(0, 3).map((course) => { const href = course.nextLessonId ? `/course/${encodeURIComponent(course.topic)}/lesson/${course.nextLessonId}?id=${course.courseId}` : `/course/${encodeURIComponent(course.topic)}?id=${course.courseId}`; return <button key={course.courseId} onClick={() => router.push(href)}><span><strong>{course.nextLessonId ? "Continue" : "Review"} {course.topic}</strong><small>{course.nextLessonTitle ?? "Course overview"}</small></span><ArrowRight size={16} /></button>; })}{!progress.length && <p>Your next lesson will appear after you start a course.</p>}</section>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
