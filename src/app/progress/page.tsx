"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarClock, CalendarDays, Flame, Lightbulb, RefreshCw, Share2, Target, TrendingUp } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import type { CourseProgress } from "@/lib/learning-types";
import { useLearnerState } from "@/components/useLearnerState";
import LearningScheduleSettings from "@/components/LearningScheduleSettings";
import { buildWeeklyMilestone, weeklyGoalChoices } from "@/lib/adaptive-learning";
import { trackProductEvent } from "@/lib/product-analytics";
import EvidencePortfolio from "@/components/EvidencePortfolio";
import MasteryPath from "@/components/MasteryPath";
import {
  calibrationCounts,
  completedLearningLessons,
  currentLearningStreak,
  dueReviewLessons,
  learningBandCounts,
  learningLessons,
  passedCapstoneCount,
} from "@/lib/learning-summary";

function dateKey(date: Date) { return date.toISOString().slice(0, 10); }

export default function ProgressPage() {
  const { user, loading: authLoading, signIn } = useAuth();
  const { state, update, ready: learnerStateReady } = useLearnerState();
  const [progress, setProgress] = useState<CourseProgress[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [reportCopied, setReportCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    void user.getIdToken().then((token) => fetch("/api/progress", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal })).then(async (response) => {
      if (!response.ok) throw new Error("Your learning record could not be loaded.");
      const data = await response.json() as { progress: CourseProgress[] };
      if (!cancelled) { setProgress(data.progress); setLoadError(null); }
    }).catch((error: unknown) => {
      if (!cancelled) setLoadError(controller.signal.aborted
        ? "Your learning record took too long to respond."
        : error instanceof Error ? error.message : "Your learning record could not be loaded.");
    }).finally(() => {
      window.clearTimeout(timeout);
      if (!cancelled) setLoaded(true);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [loadAttempt, user]);

  const allLessons = useMemo(() => learningLessons(progress), [progress]);
  const lessons = useMemo(() => completedLearningLessons(progress), [progress]);
  const addressedConcepts = useMemo(() => lessons
    .filter((lesson) => lesson.misconception)
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")), [lessons]);
  const totalQuestions = lessons.reduce((sum, lesson) => sum + lesson.totalQuestions, 0);
  const accuracy = totalQuestions ? Math.round((lessons.reduce((sum, lesson) => sum + lesson.firstAttemptCorrect, 0) / totalQuestions) * 100) : 0;
  const minutes = progress.reduce((sum, course) => sum + (course.studyMinutes ?? 0), 0);
  const week = Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - (6 - index)); return { key: dateKey(date), label: date.toLocaleDateString("en", { weekday: "short" }), count: allLessons.filter((lesson) => lesson.lastStudiedAt.slice(0, 10) === dateKey(date)).length }; });
  const maxDay = Math.max(1, ...week.map((day) => day.count));
  const weeklyCompleted = week.reduce((sum, day) => sum + day.count, 0);
  const weeklyMilestone = buildWeeklyMilestone(progress, state.weeklyLessonGoal);
  const weeklyTargets = weeklyGoalChoices(weeklyMilestone.target);
  const streak = currentLearningStreak(progress);
  const reviewsDue = dueReviewLessons(progress).length;
  const bands = learningBandCounts(progress);
  const calibration = calibrationCounts(progress);
  const calibrationRate = calibration.measured ? Math.round((calibration.calibrated / calibration.measured) * 100) : null;
  const capstonesPassed = passedCapstoneCount(progress);
  const nextCourse = [...progress].sort((left, right) => right.lastActivityAt.localeCompare(left.lastActivityAt)).find((course) => course.nextLessonId) ?? progress[0];
  const nextHref = reviewsDue > 0 ? "/review" : nextCourse?.nextLessonId ? `/course/${encodeURIComponent(nextCourse.topic)}/lesson/${nextCourse.nextLessonId}?id=${nextCourse.courseId}` : nextCourse ? `/course/${encodeURIComponent(nextCourse.topic)}?id=${nextCourse.courseId}` : "/library";
  const nextLabel = reviewsDue > 0 ? `${reviewsDue} review${reviewsDue === 1 ? "" : "s"} ready` : nextCourse ? nextCourse.nextLessonId ? `Continue ${nextCourse.topic}` : `Review ${nextCourse.topic}` : "Choose your first course";
  const nextDetail = reviewsDue > 0 ? "Strengthen concepts before they become fragile." : nextCourse?.nextLessonTitle ?? (nextCourse ? "Revisit your course outcome and finished work." : "Start building a learning record around a real outcome.");

  useEffect(() => {
    if (!loaded || !lessons.length) return;
    trackProductEvent("weekly_report_viewed", { route: "/progress", oncePerSession: true });
  }, [lessons.length, loaded]);

  const copyWeeklyReport = async () => {
    const report = [
      "My Filosage weekly learning report",
      `Lessons studied: ${weeklyCompleted}`,
      `Current streak: ${streak} day${streak === 1 ? "" : "s"}`,
      `First-try accuracy: ${totalQuestions ? `${accuracy}%` : "Not measured yet"}`,
      `Secure concepts: ${bands.secure}`,
      `Curriculum misconceptions addressed: ${addressedConcepts.length}`,
      `${window.location.origin}/library`,
    ].join("\n");
    await navigator.clipboard.writeText(report);
    setReportCopied(true);
    trackProductEvent("weekly_report_shared", { route: "/progress" });
  };

  if (authLoading) return <AppShell><div className="progress-page dashboard-loading" aria-busy="true"><span /><span /><span /></div></AppShell>;
  if (!user) return <AppShell><div className="center-state"><TrendingUp size={26} /><h1>Keep your learning in one place.</h1><p>Create a free account to sync progress, reviews, saved courses, and notes across devices.</p><button className="button button-primary" onClick={() => void signIn()}>Create a free account</button></div></AppShell>;

  return (
    <AppShell>
      <div className="progress-page">
        <header className="page-header"><div><h1>Your progress</h1><p>See completed lessons, saved practice, assessed capstones, and scheduled reviews without treating them as the same signal.</p></div></header>
        {!loaded || !learnerStateReady ? <div className="dashboard-loading" aria-busy="true"><span /><span /><span /></div> : loadError ? <section className="review-recovery" role="alert"><TrendingUp size={28} /><p className="overline">Progress unavailable</p><h2>Your record is still safe.</h2><p>{loadError}</p><button className="button button-primary" onClick={() => { setLoaded(false); setLoadError(null); setLoadAttempt((attempt) => attempt + 1); }}><RefreshCw size={15} /> Try again</button></section> : (
          <>
            <Link className="progress-next-action" href={nextHref}>
              <span className="progress-next-icon">{reviewsDue ? <CalendarClock size={22} /> : <ArrowRight size={22} />}</span>
              <span><small>Recommended next action</small><strong>{nextLabel}</strong><p>{nextDetail}</p></span>
              <ArrowRight size={20} />
            </Link>

            <section className="progress-health-summary" aria-label="Learning health summary">
              <article><small>Reviews due</small><strong>{reviewsDue}</strong><em>{reviewsDue ? "Ready to retrieve" : "Queue is clear"}</em></article>
              <article><small>Concept states</small><strong>{bands.secure} / {bands.developing} / {bands.fragile}</strong><em>Secure / developing / fragile</em></article>
              <article><small>Confidence calibration</small><strong>{calibrationRate === null ? "Not measured" : `${calibrationRate}%`}</strong><em>{calibration.measured ? `${calibration.measured} checks compared` : "Complete a confidence check"}</em></article>
              <article><small>Assessed capstones</small><strong>{capstonesPassed}</strong><em>Passed demonstrations</em></article>
            </section>

            <div className="progress-layout">
              <main className="progress-main-column">
                <section className="activity-panel"><div className="panel-heading"><div><CalendarDays size={19} /><h2>This week</h2></div><span>{weeklyCompleted} concept session{weeklyCompleted === 1 ? "" : "s"}</span></div><div className="activity-chart" aria-label={`${weeklyCompleted} distinct lessons studied in the last seven days`}>{week.map((day) => <div key={day.key}><span className="activity-bar-track"><i style={{ height: `${Math.max(day.count ? 14 : 3, (day.count / maxDay) * 100)}%` }}><b>{day.count || ""}</b></i></span><small>{day.label}</small></div>)}</div><div className="activity-footnote"><span><Flame size={15} /> {streak}-day learning rhythm</span><span>{Math.floor(minutes / 60)}h {minutes % 60}m tracked overall</span><span>{totalQuestions ? `${accuracy}% first-try accuracy` : "Accuracy not measured yet"}</span></div></section>
                <MasteryPath progress={progress} />
                <EvidencePortfolio progress={progress} />
                <section className="mastery-panel"><div className="panel-heading"><div><TrendingUp size={19} /><h2>Course progress</h2></div></div><div className="mastery-list">{progress.length ? progress.map((course) => { const learned = course.completedLessonIds.length; const total = Math.max(course.totalLessons ?? learned, 1); const percent = Math.round((learned / total) * 100); return <Link key={course.courseId} href={`/course/${encodeURIComponent(course.topic)}?id=${course.courseId}`}><span><strong>{course.topic}</strong><small>{learned}/{total} lessons</small></span><i><b style={{ width: `${percent}%` }} /></i><em>{percent}%</em></Link>; }) : <div className="dashboard-empty compact"><div><strong>No course progress yet</strong><p>Start a published course to see your progress here.</p></div><Link className="button button-secondary" href="/library">Explore courses</Link></div>}</div></section>
              </main>

              <aside className="progress-side-column">
                <section className="goal-panel"><div className="panel-heading"><div><Target size={19} /><h2>Weekly milestone</h2></div><label className="goal-adjust">Target <select aria-label="Weekly lesson target" value={weeklyMilestone.target} onChange={(event) => update((current) => ({ ...current, weeklyLessonGoal: Number(event.target.value) }))}>{weeklyTargets.map((goal) => <option value={goal} key={goal}>{goal}</option>)}</select></label></div><strong>{Math.min(weeklyMilestone.completed, weeklyMilestone.target)} of {weeklyMilestone.target} lessons</strong><div className="goal-track"><span style={{ width: `${weeklyMilestone.percent}%` }} /></div><p>{weeklyMilestone.isComplete ? "Weekly milestone complete. Continue only if it serves your outcome." : `${weeklyMilestone.remaining} lesson${weeklyMilestone.remaining === 1 ? "" : "s"} left. Missed days do not increase this target.`}</p></section>
                <section className="weekly-report-panel"><div className="panel-heading"><div><TrendingUp size={19} /><h2>Weekly summary</h2></div><span>Last 7 days</span></div><p>{weeklyCompleted ? `You practiced ${weeklyCompleted} lesson${weeklyCompleted === 1 ? "" : "s"}, addressed ${addressedConcepts.length} curriculum misconception${addressedConcepts.length === 1 ? "" : "s"}, and ${totalQuestions ? `answered ${accuracy}% of retrieval checks correctly on the first try` : "started building an evidence record"}.` : "Complete a lesson this week to begin a shareable learning summary."}</p><button className="button button-secondary" disabled={!weeklyCompleted} onClick={() => void copyWeeklyReport()}><Share2 size={15} /> {reportCopied ? "Weekly summary copied" : "Copy weekly summary"}</button></section>
                <LearningScheduleSettings
                  key={`${state.reminderPreferences.cadence}-${state.reminderPreferences.preferredTime}-${state.reminderPreferences.timezone}-${state.reminderPreferences.inAppEnabled}`}
                  preferences={state.reminderPreferences}
                  onChange={(reminderPreferences) => update((current) => ({ ...current, reminderPreferences }))}
                />
                {addressedConcepts.length > 0 && (
                  <section className="misconception-panel"><div className="panel-heading"><div><Lightbulb size={19} /><h2>Ideas the curriculum challenged</h2></div><span>{addressedConcepts.length} encountered</span></div>
                    <ul className="misconception-list">
                      {addressedConcepts.slice(0, 6).map((lesson) => (
                        <li key={`${lesson.courseId}-${lesson.lessonId}`}>
                          <p>&ldquo;{lesson.misconception}&rdquo;</p>
                          <small>Addressed in {lesson.lessonTitle} · {lesson.topic}</small>
                        </li>
                      ))}
                    </ul>
                    <p className="misconception-note">These are misconceptions the completed lessons were designed to challenge. They are not claims about beliefs you personally held or corrected.</p>
                  </section>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
