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
  Crown,
  Flame,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import AchievementBadge from "@/components/AchievementBadge";
import AppShell from "@/components/AppShell";
import CourseLibrary from "@/components/CourseLibrary";
import DashboardCustomizer from "@/components/DashboardCustomizer";
import { useAppDrawer } from "@/components/AppDrawer";
import ErudozaMark from "@/components/ErudozaMark";
import { useAuth } from "@/components/AuthProvider";
import { useLearnerState } from "@/components/useLearnerState";
import { evaluateBadges, featuredBadges } from "@/lib/badges";
import type { DashboardMainSection, DashboardMetric, DashboardSideSection } from "@/lib/dashboard-preferences";
import type { Course } from "@/lib/course-types";
import type { CourseProgress, LessonProgress } from "@/lib/learning-types";

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
  const { user, account, isPro, loading: authLoading, signInWithGoogle } = useAuth();
  const { state: learnerState, update: updateLearnerState, syncStatus } = useLearnerState();
  const [courses, setCourses] = useState<Course[]>([]);
  const [authoredCourses, setAuthoredCourses] = useState<Course[]>([]);
  const [progress, setProgress] = useState<CourseProgress[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
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

  if (!user) {
    return (
      <AppShell>
        <div className="public-home">
          <section className="public-hero">
            <div className="public-hero-copy">
              <span className="hero-status"><span /> Public learning library</span>
              <h1>Understanding<br /><span>that lasts.</span></h1>
              <p>Every course is held to a published teaching standard, every concept returns for review before you forget it, and mastery is earned by meeting real criteria.</p>
              <div className="hero-actions">
                <button className="button button-primary" onClick={() => router.push("/library")}>Explore published courses <ArrowRight size={17} /></button>
                <button className="button button-secondary" onClick={() => void signInWithGoogle()}>Create a free account</button>
              </div>
            </div>
            <div className="public-hero-panel" aria-label="Erudoza learning loop">
              <div className="hero-panel-brand"><span className="brand-mark"><ErudozaMark /></span><span><small>Your daily dose of understanding.</small><strong>A course should change what you can do.</strong></span></div>
              <ol>
                <li><span><BrainCircuit size={19} /></span><div><strong>Correct the misconception</strong><p>Every lesson names the wrong belief it replaces, so you learn against your actual starting point.</p></div></li>
                <li><span><BookOpenCheck size={19} /></span><div><strong>Practice with visible reasoning</strong><p>Worked steps and transfer tasks connect explanation to real decisions.</p></div></li>
                <li><span><Target size={19} /></span><div><strong>Return before you forget</strong><p>Your daily dose brings each concept back right before it fades.</p></div></li>
              </ol>
            </div>
          </section>
          <div className="public-proof" aria-label="Why learn with Erudoza"><span><CheckCircle2 size={16} /> No account required to read</span><span><CheckCircle2 size={16} /> Progress stays yours</span><span><CheckCircle2 size={16} /> Every lesson passes a quality gate</span></div>

          <section className="public-library-preview" aria-labelledby="public-library-title">
            <div className="section-heading"><div><p className="overline">Published courses</p><h2 id="public-library-title">Explore the public library</h2><p>Start any course now. A free account saves your progress, courses, and review schedule across devices.</p></div><button className="text-button" onClick={() => router.push("/library")}>View all courses <ArrowRight size={15} /></button></div>
            <CourseLibrary featured />
          </section>

          <section className="public-method" id="method">
            <div><p className="overline">How learning works</p><h2>Understand, retain, and earn it.</h2><p className="method-standard-link">Every lesson here passes the <button className="text-button" onClick={() => router.push("/standard")}>Erudoza teaching standard</button> before you see it.</p></div>
            <div className="method-steps"><article><span>01</span><h3>Learn against your misconceptions</h3><p>Each lesson corrects a named wrong belief and builds the knowledge the next lesson needs.</p></article><article><span>02</span><h3>Explain it from memory</h3><p>Recall comes before answer choices, so you test memory instead of recognition. Your daily dose returns each concept before it fades.</p></article><article><span>03</span><h3>Earn the capstone</h3><p>Courses end in capstone work assessed against clear success criteria, so mastery means something you demonstrated.</p></article></div>
          </section>

          <section className="public-plans-cta"><div><Crown size={22} /><h2>Read any published course. Create your own with Pro.</h2><p>Free accounts sync your learning. Erudoza Pro adds private course creation and more tutor questions with monthly limits.</p></div><button className="button button-primary" onClick={() => router.push("/pricing")}>Compare plans <ArrowRight size={16} /></button></section>
        </div>
      </AppShell>
    );
  }

  const lessons = progress.flatMap((item) => Object.values(item.lessons));
  const due = lessons.filter((lesson) => Date.parse(lesson.nextReviewAt) <= now);
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

  const openSearch = (event: React.FormEvent) => {
    event.preventDefault();
    router.push(`/library${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ""}`);
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
          {due.length > 0 && <button className="today-pick review-pick" onClick={() => router.push("/review")}><span><CalendarCheck2 size={20} /></span><strong>Today&apos;s dose: {due.length} concept{due.length === 1 ? "" : "s"}</strong><small>Strengthen recall before it fades.</small><em>About {Math.max(3, due.length * 3)} min</em></button>}
          {picks.map((course, index) => {
            const id = course.id ?? course.courseId;
            return <button className={`today-pick tone-${index + 1}`} key={id ?? course.topic} onClick={() => router.push(`/course/${encodeURIComponent(course.topic)}?id=${id}`)}><span><BookOpenCheck size={20} /></span><strong>{course.topic}</strong><small>{course.outcome ?? course.mission}</small><em>{course.estimatedMinutes ?? 30} min</em></button>;
          })}
          {!due.length && !picks.length && <div className="dashboard-empty compact"><CheckCircle2 size={21} /><div><strong>You are caught up.</strong><p>Your next useful review will appear here.</p></div></div>}
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
    return <section className="quick-actions" key={section}><h2>Quick actions</h2><button onClick={() => router.push("/review")}><CalendarCheck2 size={18} /><span><strong>Take today&apos;s dose</strong><small>{due.length ? `${due.length} concept${due.length === 1 ? "" : "s"} ready now` : "No reviews due"}</small></span><ArrowRight size={15} /></button><button onClick={() => router.push("/library")}><Compass size={18} /><span><strong>Explore a new topic</strong><small>Browse published courses</small></span><ArrowRight size={15} /></button>{isPro && <button onClick={() => router.push("/create")}><BrainCircuit size={18} /><span><strong>Create a course</strong><small>Use one course credit</small></span><ArrowRight size={15} /></button>}<button onClick={() => router.push("/progress")}><TrendingUp size={18} /><span><strong>See your progress</strong><small>{mastered} concepts mastered</small></span><ArrowRight size={15} /></button></section>;
  };

  return (
    <AppShell>
      <div className="dashboard-page">
        <header className="dashboard-heading">
          <div className="dashboard-heading-copy"><div className="dashboard-heading-meta"><p>{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</p><button type="button" onClick={dashboardCustomizer.openDrawer} aria-expanded={dashboardCustomizer.open}><SlidersHorizontal size={15} /> Customize</button></div><h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {firstName}.</h1><span>What would you like to learn today?</span></div>
          <form className="dashboard-search" onSubmit={openSearch}><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search topics, skills, or courses" aria-label="Search courses" /><button type="submit" aria-label="Search"><ArrowRight size={17} /></button></form>
        </header>

        {!loaded ? <div className="dashboard-loading"><span /><span /><span /></div> : (
          <div className={`dashboard-grid ${hasVisibleSideSections ? "" : "is-single-column"}`}>
            <div className="dashboard-main-column">
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

              {preferences.mainOrder.map(renderMainSection)}
            </div>

            {hasVisibleSideSections && <aside className="dashboard-side-column">
              {preferences.sideOrder.map(renderSideSection)}
            </aside>}
          </div>
        )}
      </div>
      {dashboardCustomizer.open && <DashboardCustomizer
        open={dashboardCustomizer.open}
        preferences={preferences}
        syncStatus={syncStatus}
        onClose={dashboardCustomizer.closeDrawer}
        onSave={(next) => updateLearnerState((current) => ({ ...current, dashboardPreferences: next }))}
      />}
    </AppShell>
  );
}
