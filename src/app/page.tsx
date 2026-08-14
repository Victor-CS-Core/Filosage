"use client";

import Link from "next/link";
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
  weeklyMilestoneProgressLabel,
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
  const { user, account, canCreateCourses, loading: authLoading } = useAuth();
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
      fetch("/api/courses?scope=mine", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).then((response) => response.ok ? response.json() : { courses: [] }),
    ])).then(([progressData, courseData, authoredCourseData]) => {
      if (!cancelled) {
        setProgress((progressData as { progress: CourseProgress[] }).progress);
        setCourses((courseData as { courses: Course[] }).courses);
        setAuthoredCourses((authoredCourseData as { courses: Course[] }).courses);
      }
    }).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [authLoading, user]);

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
  const weeklyMilestoneHeroLabel = weeklyMilestoneProgressLabel(weeklyMilestone, true);
  const weeklyMilestoneSummaryLabel = weeklyMilestoneProgressLabel(weeklyMilestone);
  const mastered = lessons.filter((lesson) => lesson.status === "mastered").length;
  const totalQuestions = lessons.reduce((sum, lesson) => sum + lesson.totalQuestions, 0);
  const correct = lessons.reduce((sum, lesson) => sum + lesson.firstAttemptCorrect, 0);
  const accuracy = totalQuestions ? Math.round((correct / totalQuestions) * 100) : 0;
  const minutes = progress.reduce((sum, item) => sum + (item.studyMinutes ?? 0), 0);
  const continueProgress = progress[0];
  const continueCapstonePassed = continueProgress?.capstone?.status === "passed";
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
  const focusTitle = focusTask?.lessonTitle
    ?? continueProgress?.nextLessonTitle
    ?? continueProgress?.topic
    ?? "Choose your first course";
  const focusTopic = focusTask?.topic ?? continueProgress?.topic;
  const focusMinutes = hasDailyMission ? dailyMission.estimatedMinutes : undefined;

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
    mastered: { label: "Secure concepts", value: mastered, icon: <BrainCircuit size={18} /> },
  };

  const renderMainSection = (section: DashboardMainSection) => {
    if (!preferences.sections[section]) return null;
    if (section === "nextUp") return (
      <section className="dashboard-section" key={section}>
        <div className="dashboard-section-heading"><h2>Next up</h2><Link href="/library">Explore library</Link></div>
        <div className="today-picks">
          {learnerState.reminderPreferences.inAppEnabled && due.length > 0 && <Link className="today-pick review-pick" href="/review"><span className="today-pick-icon"><CalendarCheck2 size={20} /></span><span className="today-pick-copy"><strong>Review queue: {due.length} concept{due.length === 1 ? "" : "s"}</strong><small>Ordered by retention risk and delayed evidence checks.</small></span><em>Start review</em><ArrowRight size={16} /></Link>}
          {picks.map((course, index) => {
            const id = course.id ?? course.courseId;
            return <Link className={`today-pick tone-${index + 1}`} key={id ?? course.topic} href={`/course/${encodeURIComponent(course.topic)}?id=${id}`}><span className="today-pick-icon"><BookOpenCheck size={20} /></span><span className="today-pick-copy"><strong>{course.topic}</strong><small>{course.outcome ?? course.mission}</small></span><em>{course.estimatedMinutes ?? 30} min</em><ArrowRight size={16} /></Link>;
          })}
          {(!learnerState.reminderPreferences.inAppEnabled || !due.length) && !picks.length && <div className="dashboard-empty compact"><CheckCircle2 size={21} /><div><strong>You are caught up.</strong><p>Your next useful review will appear here.</p></div></div>}
        </div>
      </section>
    );
    if (section === "achievements") return (
      <section className="dashboard-section dashboard-achievements" key={section}>
        <div className="dashboard-section-heading"><div><h2>Achievements</h2><span>{earnedBadges} of {badges.length} earned</span></div><Link href="/profile#achievements">View all</Link></div>
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
    return <section className="quick-actions" key={section}><h2>Quick actions</h2><Link href="/review"><CalendarCheck2 size={18} /><span><strong>Start today&apos;s review</strong><small>{due.length ? `${due.length} concept${due.length === 1 ? "" : "s"} ready now` : "No reviews due"}</small></span><ArrowRight size={15} /></Link><Link href="/library"><Compass size={18} /><span><strong>Explore a new topic</strong><small>Browse published courses</small></span><ArrowRight size={15} /></Link>{canCreateCourses && <Link href="/create"><BrainCircuit size={18} /><span><strong>Create a course</strong><small>{account?.courseCapacity?.remaining == null ? "Use one outline credit" : `${account.courseCapacity.remaining} course slot remaining`}</small></span><ArrowRight size={15} /></Link>}<Link href="/progress"><TrendingUp size={18} /><span><strong>See your progress</strong><small>{mastered} secure concepts</small></span><ArrowRight size={15} /></Link></section>;
  };

  return (
    <AppShell>
      <div className="dashboard-page">
        <header className="guided-day-intro">
          <div>
            <p>{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</p>
            <h1>Welcome back, {firstName}.</h1>
            <span>{hasDailyMission
              ? "Your next useful step is ready."
              : continueProgress
                ? "Continue from where your evidence last left off."
                : "Build a focused path around the capability you need next."}</span>
          </div>
          <button className="guided-day-customize" type="button" onClick={dashboardCustomizer.openDrawer} aria-expanded={dashboardCustomizer.open}><SlidersHorizontal size={16} /> Customize</button>
        </header>

        <div className="guided-day-hero">
          <section className="guided-day-focus" aria-label="Today's learning path">
            <div className="guided-day-focus-body">
              <h2 id="guided-day-focus-title">{focusTitle}</h2>
              <div className="guided-day-focus-meta">
                {focusTopic && <span><BookOpenCheck size={16} /> {focusTopic}</span>}
                {focusMinutes && <span><Clock3 size={16} /> About {focusMinutes} min</span>}
              </div>
              <p className="guided-day-focus-note">{hasDailyMission && dailyMission.review
                ? dailyMission.review.reason
                : continueProgress
                  ? "Pick up from your latest evidence and keep the sequence moving."
                  : "Start with one useful outcome. Filosage will turn it into a focused sequence."}</p>
              <div className="guided-day-focus-action">
                {hasDailyMission ? (
                  <button className="button button-primary" type="button" onClick={startDailyMission}>Begin focused session <ArrowRight size={16} /></button>
                ) : continueProgress ? (
                  <Link className="button button-primary" href={continueHref ?? "/progress"}>{continueProgress.nextLessonId ? "Continue learning" : continueCapstonePassed ? "Review course" : "Open course"} <ArrowRight size={16} /></Link>
                ) : (
                  <Link className="button button-primary" href={canCreateCourses ? "/create" : "/library"}>{canCreateCourses ? "Create a course" : "Explore courses"} <ArrowRight size={16} /></Link>
                )}
              </div>
            </div>

            <div className="guided-day-focus-visual" role="group" aria-label="Your focused session sequence">
              <div className="guided-day-route" aria-hidden="true"><i /><i /></div>
              <div className={`guided-day-node is-first ${dailyMission.review ? "is-current" : "is-ready"}`}>
                <span>{dailyMission.review ? <CalendarCheck2 size={24} /> : <CheckCircle2 size={24} />}</span>
                <strong>{dailyMission.review ? "Recall" : "Ready"}</strong>
                <small>{dailyMission.review ? reviewKindLabel(dailyMission.review.kind) : "Queue checked"}</small>
              </div>
              <div className={`guided-day-node is-middle ${dailyMission.review ? "is-next" : "is-current"}`}>
                <span><BookOpenCheck size={26} /></span>
                <strong>{continueProgress ? "Learn" : "Choose"}</strong>
                <small>{focusMinutes ? `${focusMinutes} minutes` : "One next step"}</small>
              </div>
              <div className="guided-day-node is-last">
                <span><Sparkles size={23} /></span>
                <strong>Reflect</strong>
                <small>Record evidence</small>
              </div>
              <div className="guided-day-focus-progress">
                <strong>{weeklyMilestoneHeroLabel}</strong>
                <span aria-hidden="true"><i style={{ width: `${weeklyMilestone.percent}%` }} /></span>
              </div>
            </div>
          </section>

          <aside className="guided-day-week" aria-label="Today's plan">
            <div className="guided-day-week-heading"><h2>Today</h2><span>{weeklyMilestone.percent}% this week</span></div>
            {!loaded ? (
              <div className="dashboard-brief-loading" aria-label="Preparing your learning brief"><span /><span /><span /></div>
            ) : (
              <ul>
                <li><span><Target size={18} aria-hidden="true" /></span><p><small>Current focus</small><strong>{focusTitle}</strong></p></li>
                <li><span><CalendarCheck2 size={18} aria-hidden="true" /></span><p><small>Review readiness</small><strong>{due.length ? `${due.length} concept${due.length === 1 ? "" : "s"} ready now` : "Review queue clear"}</strong></p></li>
                <li><span><TrendingUp size={18} aria-hidden="true" /></span><p><small>Weekly rhythm</small><strong>{weeklyMilestone.isComplete ? "Weekly milestone complete" : `${weeklyMilestone.remaining} lesson${weeklyMilestone.remaining === 1 ? "" : "s"} left`}</strong></p></li>
              </ul>
            )}
            <div className="guided-day-week-progress"><span><i style={{ width: `${weeklyMilestone.percent}%` }} /></span><small>{weeklyMilestoneSummaryLabel}</small></div>
          </aside>
        </div>

        {loaded && (
          <section className="dashboard-evidence-band" aria-labelledby="dashboard-evidence-title">
            <header><h2 id="dashboard-evidence-title">Why this is next</h2><Link href="/progress">See learning evidence</Link></header>
            <dl>
              <div><dt>Review signal</dt><dd>{due.length ? `${due.length} concept${due.length === 1 ? "" : "s"} ready` : "Queue clear"}</dd></div>
              <div><dt>Course position</dt><dd>{continueProgress ? `${continueProgress.completedLessonIds.length} of ${continueProgress.totalLessons ?? "?"} lessons` : "Choose a path"}</dd></div>
              <div><dt>Weekly goal</dt><dd>{weeklyMilestoneSummaryLabel}</dd></div>
            </dl>
          </section>
        )}

        {!loaded ? <div className="dashboard-loading"><span /><span /><span /></div> : (
          <div className={`dashboard-grid ${hasVisibleSideSections ? "" : "is-single-column"}`}>
            <div className="dashboard-main-column">
              <section className="dashboard-section dashboard-continue-section">
                <div className="dashboard-section-heading"><h2>Continue learning</h2>{continueProgress && <Link href="/progress">View progress</Link>}</div>
                {continueProgress ? (
                  <Link className="continue-card" href={continueHref ?? "/progress"}>
                    <span className="continue-icon"><BookOpenCheck size={24} /></span>
                    <span className="continue-copy"><small>{continueProgress.nextLessonId ? "In progress" : continueCapstonePassed ? "Course complete" : "Lessons finished"}</small><strong>{continueProgress.topic}</strong><span>{continueProgress.nextLessonTitle ?? (continueCapstonePassed ? "Review your course map" : "Open the course map to review the remaining requirements")}</span><span className="continue-progress"><i><b style={{ width: `${Math.round((continueProgress.completedLessonIds.length / Math.max(continueProgress.totalLessons ?? continueProgress.completedLessonIds.length, 1)) * 100)}%` }} /></i><em>{continueProgress.completedLessonIds.length}/{continueProgress.totalLessons ?? "?"} lessons</em></span></span>
                    <span className="continue-action">{continueProgress.nextLessonId ? "Continue" : continueCapstonePassed ? "Review" : "Open course"} <ArrowRight size={16} /></span>
                  </Link>
                ) : (
                  <div className="dashboard-empty"><Compass size={23} /><div><strong>Choose your first course</strong><p>Start a published course or create one for your own goal.</p></div><Link className="button button-primary" href={canCreateCourses ? "/create" : "/library"}>{canCreateCourses ? "Create a course" : "Explore courses"}</Link></div>
                )}
              </section>

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
