"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  Compass,
  Flame,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import AchievementBadge from "@/components/AchievementBadge";
import AppShell from "@/components/AppShell";
import DashboardCustomizer from "@/components/DashboardCustomizer";
import { useAppDrawer } from "@/components/AppDrawer";
import LandingPage from "@/components/marketing/LandingPage";
import { useAuth } from "@/components/AuthProvider";
import { useLearnerState } from "@/components/useLearnerState";
import { evaluateBadges, featuredBadges } from "@/lib/badges";
import type { DashboardMainSection, DashboardMetric, DashboardSideSection } from "@/lib/dashboard-preferences";
import type { Course } from "@/lib/course-types";
import type { CourseProgress, LessonProgress } from "@/lib/learning-types";
import {
  buildAdaptiveReviewQueue,
  buildDailyMission,
  buildWeeklyMilestone,
  reviewKindLabel,
} from "@/lib/adaptive-learning";
import { trackProductEvent } from "@/lib/product-analytics";

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

export default function Home() {
  const router = useRouter();
  const { user, account, isPro, loading: authLoading } = useAuth();
  const { state: learnerState, update: updateLearnerState, syncStatus } = useLearnerState();
  const [courses, setCourses] = useState<Course[]>([]);
  const [authoredCourses, setAuthoredCourses] = useState<Course[]>([]);
  const [progress, setProgress] = useState<CourseProgress[]>([]);
  const [loaded, setLoaded] = useState(false);
  const dashboardCustomizer = useAppDrawer("dashboard-customizer");
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    void user.getIdToken().then((token) => Promise.all([
      fetch("/api/progress", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).then((response) => response.ok ? response.json() : { progress: [] }),
      fetch("/api/courses?scope=public", { cache: "no-store" }).then((response) => response.ok ? response.json() : { courses: [] }),
      isPro
        ? fetch("/api/courses?scope=mine", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).then((response) => response.ok ? response.json() : { courses: [] })
        : Promise.resolve({ courses: [] }),
    ])).then(([progressData, courseData, authoredCourseData]) => {
      if (!cancelled) {
        setProgress((progressData as { progress: CourseProgress[] }).progress);
        setCourses((courseData as { courses: Course[] }).courses);
        setAuthoredCourses((authoredCourseData as { courses: Course[] }).courses);
      }
    }).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [authLoading, isPro, user]);

  useEffect(() => {
    if (!user || !loaded) return;
    const mission = buildDailyMission(progress, new Date(now));
    if (learnerState.reminderPreferences.inAppEnabled && (mission.review || mission.forward)) {
      trackProductEvent("daily_mission_viewed", {
        route: "/",
        courseId: mission.review?.courseId ?? mission.forward?.courseId,
        lessonId: mission.review?.lessonId ?? mission.forward?.lessonId,
        oncePerSession: true,
      });
    }
    const milestone = buildWeeklyMilestone(progress, learnerState.weeklyLessonGoal, new Date(now));
    if (milestone.isComplete) {
      trackProductEvent("weekly_milestone_completed", {
        route: "/",
        oncePerSession: true,
      });
    }
  }, [learnerState.reminderPreferences.inAppEnabled, learnerState.weeklyLessonGoal, loaded, now, progress, user]);

  if (!user) {
    return (
      <AppShell>
        <LandingPage />
      </AppShell>
    );
  }

  const lessons = progress.flatMap((item) => Object.values(item.lessons));
  const due = buildAdaptiveReviewQueue(progress, new Date(now));
  const dailyMission = buildDailyMission(progress, new Date(now));
  const weeklyMilestone = buildWeeklyMilestone(progress, learnerState.weeklyLessonGoal, new Date(now));
  const mastered = lessons.filter((lesson) => lesson.status === "mastered").length;
  const totalQuestions = lessons.reduce((sum, lesson) => sum + lesson.totalQuestions, 0);
  const correct = lessons.reduce((sum, lesson) => sum + lesson.firstAttemptCorrect, 0);
  const accuracy = totalQuestions ? Math.round((correct / totalQuestions) * 100) : 0;
  const minutes = progress.reduce((sum, item) => sum + (item.studyMinutes ?? 0), 0);
  const continueProgress = progress[0];
  const continueHref = continueProgress
    ? continueProgress.nextLessonId
      ? `/course/${encodeURIComponent(continueProgress.topic)}/lesson/${continueProgress.nextLessonId}?id=${continueProgress.courseId}`
      : `/course/${encodeURIComponent(continueProgress.topic)}?id=${continueProgress.courseId}`
    : null;
  const startedIds = new Set(progress.map((item) => item.courseId));
  const picks = courses.filter((course) => !startedIds.has(course.id ?? course.courseId ?? "")).slice(0, 3);
  const firstName = (account?.displayName ?? user.displayName ?? "Learner").split(" ")[0];
  const preferences = learnerState.dashboardPreferences;
  const badges = evaluateBadges({ progress, authoredCourses });
  const dashboardBadges = featuredBadges(badges);
  const earnedBadges = badges.filter((badge) => badge.earned).length;
  const hasVisibleSideSections = preferences.sideOrder.some((section) => preferences.sections[section]);
  const hasDailyMission = learnerState.reminderPreferences.inAppEnabled && Boolean(dailyMission.review || dailyMission.forward);
  const focusTask = dailyMission.review ?? dailyMission.forward;

  const startDailyMission = () => {
    const task = dailyMission.review ?? dailyMission.forward;
    if (!task) return;
    trackProductEvent("daily_mission_started", {
      route: "/",
      courseId: task.courseId,
      lessonId: task.lessonId,
    });
    if (dailyMission.review) {
      const check = dailyMission.review.kind === "delayed-7"
        ? "&check=day7"
        : dailyMission.review.kind === "delayed-28"
          ? "&check=day28"
          : "";
      router.push(`/course/${encodeURIComponent(task.topic)}/lesson/${task.lessonId}?id=${task.courseId}&review=1${check}`);
      return;
    }
    router.push(`/course/${encodeURIComponent(task.topic)}/lesson/${task.lessonId}?id=${task.courseId}`);
  };

  const snapshotMetrics: Record<DashboardMetric, { label: string; value: string | number; icon: React.ReactNode }> = {
    studyTime: { label: "Study time", value: `${Math.floor(minutes / 60)}h ${minutes % 60}m`, icon: <Clock3 size={18} /> },
    lessons: { label: "Lessons learned", value: lessons.length, icon: <CheckCircle2 size={18} /> },
    streak: { label: "Current streak", value: `${streakFor(lessons)} ${streakFor(lessons) === 1 ? "day" : "days"}`, icon: <Flame size={18} /> },
    accuracy: { label: "Quiz accuracy", value: accuracy ? `${accuracy}%` : "N/A", icon: <Target size={18} /> },
    mastered: { label: "Concepts mastered", value: mastered, icon: <BrainCircuit size={18} /> },
  };

  const renderMainSection = (section: DashboardMainSection) => {
    if (!preferences.sections[section]) return null;
    if (section === "nextUp") return (
      <section className="dashboard-section" key={section}>
        <div className="dashboard-section-heading"><h2>Next up</h2><button onClick={() => router.push("/library")}>Explore library</button></div>
        <div className="today-picks">
          {learnerState.reminderPreferences.inAppEnabled && due.length > 0 && <button className="today-pick review-pick" onClick={() => router.push("/review")}><span><CalendarCheck2 size={20} /></span><strong>Review queue: {due.length} concept{due.length === 1 ? "" : "s"}</strong><small>Ordered by retention risk and delayed evidence checks.</small><em>Start with the most fragile</em></button>}
          {picks.map((course, index) => {
            const id = course.id ?? course.courseId;
            return <button className={`today-pick tone-${index + 1}`} key={id ?? course.topic} onClick={() => router.push(`/course/${encodeURIComponent(course.topic)}?id=${id}`)}><span><BookOpenCheck size={20} /></span><strong>{course.topic}</strong><small>{course.outcome ?? course.mission}</small><em>{course.estimatedMinutes ?? 30} min</em></button>;
          })}
          {(!learnerState.reminderPreferences.inAppEnabled || !due.length) && !picks.length && <div className="dashboard-empty compact"><CheckCircle2 size={21} /><div><strong>You are caught up.</strong><p>Your next useful review will appear here.</p></div></div>}
        </div>
      </section>
    );
    if (section === "achievements") return (
      <section className="dashboard-section dashboard-achievements" key={section}>
        <div className="dashboard-section-heading"><div><h2>Achievements</h2><span>{earnedBadges} of {badges.length} earned</span></div><button onClick={() => router.push("/profile#achievements")}>View all</button></div>
        <div className="achievement-preview">{dashboardBadges.map((badge) => <AchievementBadge key={badge.id} badge={badge} compact />)}</div>
      </section>
    );
    return <section className="dashboard-insight" key={section}><Sparkles size={20} /><div><strong>Learning tip</strong><p>Try to explain the idea before rereading it. The effort of recalling it helps strengthen the memory.</p></div></section>;
  };

  const renderSideSection = (section: DashboardSideSection) => {
    if (!preferences.sections[section]) return null;
    if (section === "snapshot") return (
      <section className="learning-snapshot" key={section}>
        <div><h2>Your learning snapshot</h2><span>All time</span></div>
        <dl>{(Object.keys(snapshotMetrics) as DashboardMetric[]).filter((metric) => preferences.metrics[metric]).map((metric) => <div key={metric}><dt>{snapshotMetrics[metric].icon} {snapshotMetrics[metric].label}</dt><dd>{snapshotMetrics[metric].value}</dd></div>)}</dl>
      </section>
    );
    return <section className="quick-actions" key={section}><h2>Quick actions</h2><button onClick={() => router.push("/review")}><CalendarCheck2 size={18} /><span><strong>Start today&apos;s review</strong><small>{due.length ? `${due.length} concept${due.length === 1 ? "" : "s"} ready now` : "No reviews due"}</small></span><ArrowRight size={15} /></button><button onClick={() => router.push("/library")}><Compass size={18} /><span><strong>Explore a new topic</strong><small>Browse published courses</small></span><ArrowRight size={15} /></button>{isPro && <button onClick={() => router.push("/create")}><BrainCircuit size={18} /><span><strong>Create a course</strong><small>Use one course credit</small></span><ArrowRight size={15} /></button>}<button onClick={() => router.push("/progress")}><TrendingUp size={18} /><span><strong>See your progress</strong><small>{mastered} concepts mastered</small></span><ArrowRight size={15} /></button></section>;
  };

  return (
    <AppShell>
      <div className="dashboard-page">
        <header className="dashboard-welcome-card">
          <div className="dashboard-welcome-copy">
            <div className="dashboard-heading-meta">
              <p>{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</p>
              <button type="button" onClick={dashboardCustomizer.openDrawer} aria-expanded={dashboardCustomizer.open}><SlidersHorizontal size={15} /> Customize</button>
            </div>
            <h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {firstName}.</h1>
            <p>{hasDailyMission
              ? "Your learning brief is ready. Start with the highest-value step, then keep your momentum moving."
              : continueProgress
                ? "Your next lesson is waiting. Continue where you left off or choose a fresh direction."
                : "Build a focused learning path around the capability you need next."}</p>
          </div>
          <aside className="dashboard-learning-brief" aria-label="Today's learning brief">
            {!loaded ? (
              <div className="dashboard-brief-loading" aria-label="Preparing your learning brief"><span /><span /><span /></div>
            ) : (
              <ul>
                <li><Target size={18} aria-hidden="true" /><span><small>Primary focus</small><strong>{focusTask?.lessonTitle ?? continueProgress?.nextLessonTitle ?? continueProgress?.topic ?? "Choose your first course"}</strong></span></li>
                <li><CalendarCheck2 size={18} aria-hidden="true" /><span><small>Review readiness</small><strong>{due.length ? `${due.length} concept${due.length === 1 ? "" : "s"} ready` : "Review queue clear"}</strong></span></li>
                <li><TrendingUp size={18} aria-hidden="true" /><span><small>Weekly rhythm</small><strong>{weeklyMilestone.completed} of {weeklyMilestone.target} lessons complete</strong></span></li>
              </ul>
            )}
          </aside>
        </header>

        {!loaded ? <div className="dashboard-loading"><span /><span /><span /></div> : (
          <div className={`dashboard-grid ${hasVisibleSideSections ? "" : "is-single-column"}`}>
            <div className="dashboard-main-column">
              <div className={`dashboard-focus-grid ${hasDailyMission ? "" : "is-single-card"}`}>
              {hasDailyMission && (
                <section className="daily-mission" aria-labelledby="daily-mission-title">
                  <div className="daily-mission-heading">
                    <div>
                      <p className="overline">{dailyMission.recovered ? "Welcome back" : "Focused session"}</p>
                      <h2 id="daily-mission-title">Today&apos;s mission</h2>
                      <p>{dailyMission.recovered
                        ? "No catch-up debt. Start with the most useful action and continue from here."
                        : "One retention check and one forward step, selected from your evidence."}</p>
                    </div>
                    <span><Clock3 size={15} /> About {dailyMission.estimatedMinutes} min</span>
                  </div>
                  <ol className="daily-mission-steps">
                    {dailyMission.review && (
                      <li>
                        <span>1</span>
                        <div><small>{reviewKindLabel(dailyMission.review.kind)}</small><strong>{dailyMission.review.lessonTitle}</strong><em>{dailyMission.review.reason}</em></div>
                      </li>
                    )}
                    {dailyMission.forward && (
                      <li>
                        <span>{dailyMission.review ? "2" : "1"}</span>
                        <div><small>Forward step · {dailyMission.forward.topic}</small><strong>{dailyMission.forward.lessonTitle}</strong><em>Build new capability after retrieval.</em></div>
                      </li>
                    )}
                  </ol>
                  <div className="daily-mission-footer">
                    <div>
                      <strong>{weeklyMilestone.completed} of {weeklyMilestone.target} this week</strong>
                      <span><i style={{ width: `${weeklyMilestone.percent}%` }} /></span>
                    </div>
                    <button className="button button-primary" type="button" onClick={startDailyMission}>
                      Start mission <ArrowRight size={16} />
                    </button>
                  </div>
                </section>
              )}

              <section className="dashboard-section dashboard-continue-section">
                <div className="dashboard-section-heading"><h2>Continue learning</h2>{continueProgress && <button onClick={() => router.push("/progress")}>View progress</button>}</div>
                {continueProgress ? (
                  <button className="continue-card" onClick={() => continueHref && router.push(continueHref)}>
                    <span className="continue-icon"><BookOpenCheck size={24} /></span>
                    <span className="continue-copy"><small>{continueProgress.nextLessonId ? "In progress" : "Course complete"}</small><strong>{continueProgress.topic}</strong><span>{continueProgress.nextLessonTitle ?? "Review your course map"}</span><span className="continue-progress"><i><b style={{ width: `${Math.round((continueProgress.completedLessonIds.length / Math.max(continueProgress.totalLessons ?? continueProgress.completedLessonIds.length, 1)) * 100)}%` }} /></i><em>{continueProgress.completedLessonIds.length}/{continueProgress.totalLessons ?? "?"} lessons</em></span></span>
                    <span className="continue-action">{continueProgress.nextLessonId ? "Continue" : "Review"} <ArrowRight size={16} /></span>
                  </button>
                ) : (
                  <div className="dashboard-empty"><Compass size={23} /><div><strong>Choose your first course</strong><p>Start a published course or create one for your own goal.</p></div><button className="button button-primary" onClick={() => router.push(isPro ? "/create" : "/library")}>{isPro ? "Create a course" : "Explore courses"}</button></div>
                )}
              </section>
              </div>

              {preferences.mainOrder.map(renderMainSection)}
            </div>

            {hasVisibleSideSections && <aside className="dashboard-side-column">
              {preferences.sideOrder.map(renderSideSection)}
            </aside>}
          </div>
        )}
      </div>
      <DashboardCustomizer
        open={dashboardCustomizer.open}
        preferences={preferences}
        syncStatus={syncStatus}
        onClose={dashboardCustomizer.closeDrawer}
        onSave={(next) => updateLearnerState((current) => ({ ...current, dashboardPreferences: next }))}
      />
    </AppShell>
  );
}
