"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Award, BookOpenCheck, BrainCircuit, BriefcaseBusiness, CalendarClock, CheckCircle2, CircleDot, LoaderCircle, SlidersHorizontal, Target, UserRound } from "lucide-react";
import AchievementBadge from "@/components/AchievementBadge";
import AppShell from "@/components/AppShell";
import DashboardCustomizer from "@/components/DashboardCustomizer";
import { useAppDrawer } from "@/components/AppDrawer";
import { useAuth } from "@/components/AuthProvider";
import { useLearnerState } from "@/components/useLearnerState";
import { evaluateBadges } from "@/lib/badges";
import type { Course } from "@/lib/course-types";
import type { CourseProgress } from "@/lib/learning-types";
import {
  calibrationCounts,
  completedLearningLessons,
  currentLearningStreak,
  dueReviewLessons,
  learningBandCounts,
  passedCapstoneCount,
  practiceEvidenceCount,
} from "@/lib/learning-summary";

type BadgeFilter = "all" | "earned" | "in-progress";

export default function ProfilePage() {
  const router = useRouter();
  const { user, account, isPro, loading: authLoading, signInWithGoogle } = useAuth();
  const { state, update, syncStatus } = useLearnerState();
  const [progress, setProgress] = useState<CourseProgress[]>([]);
  const [authoredCourses, setAuthoredCourses] = useState<Course[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<BadgeFilter>("all");
  const dashboardCustomizer = useAppDrawer("dashboard-customizer");
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void user.getIdToken().then((token) => Promise.all([
      fetch("/api/progress", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).then((response) => response.ok ? response.json() : { progress: [] }),
      isPro
        ? fetch("/api/courses?scope=mine", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).then((response) => response.ok ? response.json() : { courses: [] })
        : Promise.resolve({ courses: [] }),
    ])).then(([progressData, courseData]) => {
      if (!cancelled) {
        setProgress((progressData as { progress: CourseProgress[] }).progress);
        setAuthoredCourses((courseData as { courses: Course[] }).courses);
      }
    }).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [isPro, user]);

  if (authLoading) return <AppShell><div className="center-state"><LoaderCircle className="spin" size={25} /><h1>Preparing your profile</h1></div></AppShell>;
  if (!user) return <AppShell><div className="center-state"><UserRound size={28} /><p className="overline">Your learning profile</p><h1>Keep your progress and achievements together.</h1><p>Create a free account to sync learning progress, reviews, bookmarks, notes, and badges across devices.</p><button className="button button-primary" onClick={() => void signInWithGoogle()}>Create a free account</button></div></AppShell>;

  const lessons = completedLearningLessons(progress);
  const bands = learningBandCounts(progress);
  const calibration = calibrationCounts(progress);
  const reviewsDue = dueReviewLessons(progress, now).length;
  const evidenceCount = practiceEvidenceCount(progress);
  const capstonesPassed = passedCapstoneCount(progress);
  const streak = currentLearningStreak(progress, new Date(now));
  const weekStart = now - 6 * 86_400_000;
  const weeklyCompleted = lessons.filter((lesson) => Date.parse(lesson.lastStudiedAt) >= weekStart).length;
  const badges = evaluateBadges({ progress, authoredCourses });
  const earned = badges.filter((badge) => badge.earned);
  const visibleBadges = filter === "earned" ? earned : filter === "in-progress" ? badges.filter((badge) => !badge.earned) : badges;
  const displayName = account?.displayName ?? user.displayName ?? "Erudoza learner";
  const activeSections = Object.values(state.dashboardPreferences.sections).filter(Boolean).length;
  const focusCourse = [...progress].sort((left, right) => right.lastActivityAt.localeCompare(left.lastActivityAt)).find((course) => course.nextLessonId) ?? progress[0];
  const focusCompleted = focusCourse?.completedLessonIds.length ?? 0;
  const focusTotal = Math.max(focusCourse?.totalLessons ?? focusCompleted, 1);
  const focusPercent = focusCourse ? Math.round((focusCompleted / focusTotal) * 100) : 0;
  const publishedCourses = authoredCourses.filter((course) => course.isPublic).length;
  const draftCourses = authoredCourses.length - publishedCourses;
  const syncLabel = syncStatus === "saving" ? "Syncing changes" : syncStatus === "error" ? "Saved on this device" : "Learning record synced";

  return (
    <AppShell>
      <div className="profile-page">
        <header className="profile-identity">
          <div className="profile-avatar">
            {user.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
            ) : <UserRound size={30} />}
          </div>
          <div><p className="overline">Learning profile</p><h1>{displayName}</h1><span>{isPro ? "Pro learning account" : "Free learning account"} &middot; {syncLabel}</span></div>
          <button className="button button-secondary" onClick={dashboardCustomizer.openDrawer} aria-expanded={dashboardCustomizer.open}><SlidersHorizontal size={17} /> Customize dashboard</button>
        </header>

        {!loaded ? <div className="dashboard-loading"><span /><span /><span /></div> : (
          <>
            <section className="profile-summary profile-record-summary" aria-label="Capability record">
              <article><span><CheckCircle2 size={20} /></span><div><small>Secure concepts</small><strong>{bands.secure}</strong><em>Holding after practice</em></div></article>
              <article><span><CalendarClock size={20} /></span><div><small>Reviews due</small><strong>{reviewsDue}</strong><em>{reviewsDue ? "Ready to strengthen" : "Review queue clear"}</em></div></article>
              <article><span><BriefcaseBusiness size={20} /></span><div><small>Practice evidence</small><strong>{evidenceCount}</strong><em>Saved lesson responses</em></div></article>
              <article><span><Award size={20} /></span><div><small>Assessed capstones</small><strong>{capstonesPassed}</strong><em>Passed demonstrations</em></div></article>
            </section>

            <div className="profile-layout">
              <main>
                <section className="profile-focus" aria-labelledby="profile-focus-title">
                  <div className="profile-section-heading"><div><p className="overline">Current direction</p><h2 id="profile-focus-title">What you are building now</h2><p>Your profile leads with the next capability in motion, not a lifetime total.</p></div></div>
                  {focusCourse ? <button type="button" className="profile-focus-course" onClick={() => router.push(focusCourse.nextLessonId ? `/course/${encodeURIComponent(focusCourse.topic)}/lesson/${focusCourse.nextLessonId}?id=${focusCourse.courseId}` : `/course/${encodeURIComponent(focusCourse.topic)}?id=${focusCourse.courseId}`)}>
                    <span><small>{focusCourse.nextLessonId ? "Next lesson" : "Course review"}</small><strong>{focusCourse.topic}</strong><p>{focusCourse.nextLessonTitle ?? "Review your course outcome and completed work."}</p></span>
                    <span className="profile-focus-progress"><i><b style={{ width: `${focusPercent}%` }} /></i><em>{focusCompleted} of {focusTotal} lessons</em></span>
                    <ArrowRight size={18} />
                  </button> : <div className="profile-focus-empty"><BrainCircuit size={22} /><div><strong>Choose the capability you want to build.</strong><p>Start a course and this space will show the clearest next action.</p></div><button className="button button-secondary" type="button" onClick={() => router.push("/library")}>Explore courses</button></div>}
                </section>

                <section className="profile-capability" aria-labelledby="profile-capability-title">
                  <div className="profile-section-heading"><div><p className="overline">Learning record</p><h2 id="profile-capability-title">How your understanding is holding</h2><p>These states come from retrieval performance, confidence, and scheduled reviews.</p></div></div>
                  <div className="profile-capability-bands">
                    <div><span className="is-secure"><CheckCircle2 size={16} /></span><strong>{bands.secure}</strong><small>Secure</small><p>Evidence is holding.</p></div>
                    <div><span className="is-developing"><CircleDot size={16} /></span><strong>{bands.developing}</strong><small>Developing</small><p>Needs more application.</p></div>
                    <div><span className="is-fragile"><CalendarClock size={16} /></span><strong>{bands.fragile}</strong><small>Fragile</small><p>Prioritize review.</p></div>
                    <div><span><Target size={16} /></span><strong>{calibration.measured ? `${Math.round((calibration.calibrated / calibration.measured) * 100)}%` : "Not measured"}</strong><small>Calibrated</small><p>{calibration.measured ? `${calibration.measured} confidence checks measured.` : "Complete a check to measure calibration."}</p></div>
                  </div>
                  <button className="text-button profile-record-link" type="button" onClick={() => router.push("/progress")}>Open the full learning record <ArrowRight size={15} /></button>
                </section>

                <section className="profile-achievements" id="achievements">
                  <div className="profile-section-heading"><div><p className="overline">Badge collection</p><h2>Achievements</h2><p>Each badge marks a learning behavior, a mastery milestone, or a contribution to the library.</p></div><strong>{earned.length}<span> / {badges.length}</span></strong></div>
                  <div className="badge-filter" role="group" aria-label="Filter achievements">
                    {(["all", "earned", "in-progress"] as BadgeFilter[]).map((option) => <button key={option} className={filter === option ? "is-active" : ""} aria-pressed={filter === option} onClick={() => setFilter(option)}>{option === "all" ? "All badges" : option === "earned" ? "Earned" : "In progress"}</button>)}
                  </div>
                  <div className="badge-collection">{visibleBadges.map((badge) => <AchievementBadge key={badge.id} badge={badge} />)}</div>
                </section>
              </main>

              <aside className="profile-side">
                <section className="profile-goal">
                  <div className="profile-side-heading"><Target size={18} /><h2>Weekly goal</h2></div>
                  <strong>{Math.min(weeklyCompleted, state.weeklyLessonGoal)} of {state.weeklyLessonGoal} concept sessions</strong>
                  <div className="goal-track"><span style={{ width: `${Math.min(100, (weeklyCompleted / state.weeklyLessonGoal) * 100)}%` }} /></div>
                  <p>{weeklyCompleted >= state.weeklyLessonGoal ? `Goal complete with a ${streak}-day learning rhythm.` : `${Math.max(0, state.weeklyLessonGoal - weeklyCompleted)} session${state.weeklyLessonGoal - weeklyCompleted === 1 ? "" : "s"} left this week. Your current streak is ${streak} day${streak === 1 ? "" : "s"}.`}</p>
                  <button onClick={() => router.push("/progress")}>Review learning activity</button>
                </section>

                <section className="profile-preferences">
                  <div className="profile-side-heading"><SlidersHorizontal size={18} /><h2>Dashboard view</h2></div>
                  <dl><div><dt>View</dt><dd>{state.dashboardPreferences.preset === "custom" ? "Custom" : `${state.dashboardPreferences.preset[0].toUpperCase()}${state.dashboardPreferences.preset.slice(1)}`}</dd></div><div><dt>Visible sections</dt><dd>{activeSections + 1}</dd></div></dl>
                  <button onClick={dashboardCustomizer.openDrawer} aria-expanded={dashboardCustomizer.open}>Change dashboard view</button>
                </section>

                <section className="profile-library-summary">
                  <div className="profile-side-heading"><BookOpenCheck size={18} /><h2>{isPro ? "Learning and authoring" : "Your library"}</h2></div>
                  <dl><div><dt>Courses in progress</dt><dd>{progress.length}</dd></div><div><dt>Lessons completed</dt><dd>{lessons.length}</dd></div>{isPro && <><div><dt>Private drafts</dt><dd>{draftCourses}</dd></div><div><dt>Published courses</dt><dd>{publishedCourses}</dd></div></>}</dl>
                  <button onClick={() => router.push(isPro ? "/create" : "/library")}>{isPro ? "Open course studio" : "Explore courses"}</button>
                </section>

                <section className="profile-badge-note"><Award size={19} /><div><strong>Recognition follows useful work.</strong><p>Badges stay secondary to demonstrated understanding, review evidence, and finished course work.</p></div></section>
                <section className="profile-preferences">
                  <div className="profile-side-heading"><UserRound size={18} /><h2>Account and privacy</h2></div>
                  <p>Download your information, submit a privacy request, or close your account.</p>
                  <button onClick={() => router.push("/privacy-center")}>Open privacy center</button>
                </section>
              </aside>
            </div>
          </>
        )}
      </div>

      <DashboardCustomizer
        open={dashboardCustomizer.open}
        preferences={state.dashboardPreferences}
        syncStatus={syncStatus}
        onClose={dashboardCustomizer.closeDrawer}
        onSave={(next) => update((current) => ({ ...current, dashboardPreferences: next }))}
      />
    </AppShell>
  );
}
