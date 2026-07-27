"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Award, BookOpenCheck, CheckCircle2, Clock3, Flame, LoaderCircle, SlidersHorizontal, Target, UserRound } from "lucide-react";
import AchievementBadge from "@/components/AchievementBadge";
import AppShell from "@/components/AppShell";
import DashboardCustomizer from "@/components/DashboardCustomizer";
import { useAuth } from "@/components/AuthProvider";
import { useLearnerState } from "@/components/useLearnerState";
import { evaluateBadges } from "@/lib/badges";
import type { Course } from "@/lib/course-types";
import type { CourseProgress, LessonProgress } from "@/lib/learning-types";

type BadgeFilter = "all" | "earned" | "in-progress";

function dateKey(date: Date) { return date.toISOString().slice(0, 10); }

function currentStreak(lessons: LessonProgress[]) {
  const dates = new Set(lessons.map((lesson) => lesson.lastStudiedAt.slice(0, 10)));
  const cursor = new Date();
  if (!dates.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (dates.has(dateKey(cursor))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, account, isPro, loading: authLoading, signInWithGoogle } = useAuth();
  const { state, update, syncStatus } = useLearnerState();
  const [progress, setProgress] = useState<CourseProgress[]>([]);
  const [authoredCourses, setAuthoredCourses] = useState<Course[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<BadgeFilter>("all");
  const [customizerOpen, setCustomizerOpen] = useState(false);
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

  const lessons = progress.flatMap((course) => Object.values(course.lessons));
  const questions = lessons.reduce((sum, lesson) => sum + lesson.totalQuestions, 0);
  const correct = lessons.reduce((sum, lesson) => sum + lesson.firstAttemptCorrect, 0);
  const accuracy = questions ? Math.round((correct / questions) * 100) : 0;
  const minutes = progress.reduce((sum, course) => sum + (course.studyMinutes ?? 0), 0);
  const mastered = lessons.filter((lesson) => lesson.status === "mastered").length;
  const streak = currentStreak(lessons);
  const weekStart = now - 6 * 86_400_000;
  const weeklyCompleted = lessons.filter((lesson) => Date.parse(lesson.lastStudiedAt) >= weekStart).length;
  const badges = evaluateBadges({ progress, authoredCourses });
  const earned = badges.filter((badge) => badge.earned);
  const visibleBadges = filter === "earned" ? earned : filter === "in-progress" ? badges.filter((badge) => !badge.earned) : badges;
  const displayName = account?.displayName ?? user.displayName ?? "Erudoza learner";
  const activeSections = Object.values(state.dashboardPreferences.sections).filter(Boolean).length;

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
          <div><p className="overline">Learning profile</p><h1>{displayName}</h1><span>{isPro ? "Pro learning account" : "Free learning account"}</span></div>
          <button className="button button-secondary" onClick={() => setCustomizerOpen(true)}><SlidersHorizontal size={17} /> Customize dashboard</button>
        </header>

        {!loaded ? <div className="dashboard-loading"><span /><span /><span /></div> : (
          <>
            <section className="profile-summary" aria-label="Learning summary">
              <article><span><Flame size={20} /></span><div><small>Current streak</small><strong>{streak} {streak === 1 ? "day" : "days"}</strong></div></article>
              <article><span><Clock3 size={20} /></span><div><small>Tracked study time</small><strong>{Math.floor(minutes / 60)}h {minutes % 60}m</strong></div></article>
              <article><span><CheckCircle2 size={20} /></span><div><small>Concepts mastered</small><strong>{mastered}</strong></div></article>
              <article><span><Target size={20} /></span><div><small>First-try accuracy</small><strong>{accuracy ? `${accuracy}%` : "N/A"}</strong></div></article>
            </section>

            <div className="profile-layout">
              <main>
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
                  <strong>{Math.min(weeklyCompleted, state.weeklyLessonGoal)} of {state.weeklyLessonGoal} lessons</strong>
                  <div className="goal-track"><span style={{ width: `${Math.min(100, (weeklyCompleted / state.weeklyLessonGoal) * 100)}%` }} /></div>
                  <p>{weeklyCompleted >= state.weeklyLessonGoal ? "Goal complete. Keep the rhythm that works for you." : `${Math.max(0, state.weeklyLessonGoal - weeklyCompleted)} lesson${state.weeklyLessonGoal - weeklyCompleted === 1 ? "" : "s"} left this week.`}</p>
                  <button onClick={() => router.push("/progress")}>Review learning activity</button>
                </section>

                <section className="profile-preferences">
                  <div className="profile-side-heading"><SlidersHorizontal size={18} /><h2>Dashboard view</h2></div>
                  <dl><div><dt>View</dt><dd>{state.dashboardPreferences.preset === "custom" ? "Custom" : `${state.dashboardPreferences.preset[0].toUpperCase()}${state.dashboardPreferences.preset.slice(1)}`}</dd></div><div><dt>Visible sections</dt><dd>{activeSections + 1}</dd></div></dl>
                  <button onClick={() => setCustomizerOpen(true)}>Change dashboard view</button>
                </section>

                <section className="profile-library-summary">
                  <div className="profile-side-heading"><BookOpenCheck size={18} /><h2>Your library</h2></div>
                  <dl><div><dt>Courses started</dt><dd>{progress.length}</dd></div><div><dt>Courses created</dt><dd>{authoredCourses.length}</dd></div><div><dt>Lessons completed</dt><dd>{lessons.length}</dd></div></dl>
                  <button onClick={() => router.push("/library")}>Explore courses</button>
                </section>

                <section className="profile-badge-note"><Award size={19} /><div><strong>Badges reward useful work.</strong><p>There are no points to farm. Progress comes from completing lessons, recalling accurately, reviewing on time, and finishing courses.</p></div></section>
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

      {customizerOpen && <DashboardCustomizer
        open={customizerOpen}
        preferences={state.dashboardPreferences}
        syncStatus={syncStatus}
        onClose={() => setCustomizerOpen(false)}
        onSave={(next) => update((current) => ({ ...current, dashboardPreferences: next }))}
      />}
    </AppShell>
  );
}
