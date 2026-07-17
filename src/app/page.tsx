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
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import CourseLibrary from "@/components/CourseLibrary";
import ErudozaMark from "@/components/ErudozaMark";
import { useAuth } from "@/components/AuthProvider";
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
  const [courses, setCourses] = useState<Course[]>([]);
  const [progress, setProgress] = useState<CourseProgress[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    void Promise.all([
      user.getIdToken().then((token) => fetch("/api/progress", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).then((response) => response.ok ? response.json() : { progress: [] })),
      fetch("/api/courses?scope=public", { cache: "no-store" }).then((response) => response.ok ? response.json() : { courses: [] }),
    ]).then(([progressData, courseData]) => {
      if (!cancelled) {
        setProgress((progressData as { progress: CourseProgress[] }).progress);
        setCourses((courseData as { courses: Course[] }).courses);
      }
    }).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [authLoading, user]);

  if (!user) {
    return (
      <AppShell>
        <div className="public-home">
          <section className="public-hero">
            <div className="public-hero-copy">
              <span className="hero-status"><span /> Public learning library</span>
              <h1>Understand more.<br /><span>Achieve more.</span></h1>
              <p>Focused courses that turn difficult subjects into clear mental models, deliberate practice, and knowledge you can retrieve when it matters.</p>
              <div className="hero-actions">
                <button className="button button-primary" onClick={() => router.push("/library")}>Explore published courses <ArrowRight size={17} /></button>
                <button className="button button-secondary" onClick={() => void signInWithGoogle()}>Create a free account</button>
              </div>
              <div className="public-proof"><span><CheckCircle2 size={16} /> No account required to read</span><span><CheckCircle2 size={16} /> Progress stays yours</span><span><CheckCircle2 size={16} /> Pro creation is metered</span></div>
            </div>
            <div className="public-hero-panel" aria-label="Erudoza learning loop">
              <div className="hero-panel-brand"><span className="brand-mark"><ErudozaMark /></span><span><small>Your daily dose of understanding.</small><strong>A course should change what you can do.</strong></span></div>
              <ol>
                <li><span><BrainCircuit size={19} /></span><div><strong>See the structure</strong><p>Begin with the mental model and relationships.</p></div></li>
                <li><span><BookOpenCheck size={19} /></span><div><strong>Work through examples</strong><p>Connect explanation to concrete decisions and cases.</p></div></li>
                <li><span><Target size={19} /></span><div><strong>Retrieve, then return</strong><p>Practice from memory and revisit at the useful moment.</p></div></li>
              </ol>
            </div>
          </section>

          <section className="public-library-preview" aria-labelledby="public-library-title">
            <div className="section-heading"><div><p className="overline">Learn without a gate</p><h2 id="public-library-title">Explore the public library</h2><p>Start any published course now. A free account adds cloud progress, saved courses, and adaptive reviews.</p></div><button className="text-button" onClick={() => router.push("/library")}>View all courses <ArrowRight size={15} /></button></div>
            <CourseLibrary featured />
          </section>

          <section className="public-method" id="method">
            <div><p className="overline">Built for durable learning</p><h2>Move from exposure to mastery.</h2></div>
            <div className="method-steps"><article><span>01</span><h3>Follow a crafted sequence</h3><p>Each lesson builds the prerequisite knowledge the next lesson expects.</p></article><article><span>02</span><h3>Explain it from memory</h3><p>Free recall comes before choices, so recognition never masquerades as understanding.</p></article><article><span>03</span><h3>Return before it fades</h3><p>Confidence and performance determine when a concept appears for review.</p></article></div>
          </section>

          <section className="public-plans-cta"><div><Crown size={22} /><h2>Read freely. Create when you need a path of your own.</h2><p>Free accounts sync learning. Erudoza Pro adds private course creation and lesson-grounded guidance with clear usage limits.</p></div><button className="button button-primary" onClick={() => router.push("/pricing")}>Compare plans <ArrowRight size={16} /></button></section>
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
  const firstName = (account?.displayName ?? user?.displayName ?? "Learner").split(" ")[0];

  const openSearch = (event: React.FormEvent) => {
    event.preventDefault();
    router.push(`/library${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ""}`);
  };

  return (
    <AppShell>
      <div className="dashboard-page">
        <header className="dashboard-heading">
          <div><p>{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</p><h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {firstName}.</h1><span>What will you understand more deeply today?</span></div>
          <form className="dashboard-search" onSubmit={openSearch}><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search topics, skills, or courses" aria-label="Search courses" /><button type="submit" aria-label="Search"><ArrowRight size={17} /></button></form>
        </header>

        {!loaded ? <div className="dashboard-loading"><span /><span /><span /></div> : (
          <div className="dashboard-grid">
            <div className="dashboard-main-column">
              <section className="dashboard-section">
                <div className="dashboard-section-heading"><h2>Continue learning</h2>{continueProgress && <button onClick={() => router.push("/progress")}>View progress</button>}</div>
                {continueProgress ? (
                  <button className="continue-card" onClick={() => continueHref && router.push(continueHref)}>
                    <span className="continue-icon"><BookOpenCheck size={24} /></span>
                    <span className="continue-copy"><small>{continueProgress.nextLessonId ? "In progress" : "Course complete"}</small><strong>{continueProgress.topic}</strong><span>{continueProgress.nextLessonTitle ?? "Review your course map"}</span><span className="continue-progress"><i><b style={{ width: `${Math.round((continueProgress.completedLessonIds.length / Math.max(continueProgress.totalLessons ?? continueProgress.completedLessonIds.length, 1)) * 100)}%` }} /></i><em>{continueProgress.completedLessonIds.length}/{continueProgress.totalLessons ?? "—"} lessons</em></span></span>
                    <span className="continue-action">{continueProgress.nextLessonId ? "Continue" : "Review"} <ArrowRight size={16} /></span>
                  </button>
                ) : (
                  <div className="dashboard-empty"><Compass size={23} /><div><strong>Choose your first learning path</strong><p>Start with a published course or craft one around your own goal.</p></div><button className="button button-primary" onClick={() => router.push(isPro ? "/create" : "/library")}>{isPro ? "Create a course" : "Explore courses"}</button></div>
                )}
              </section>

              <section className="dashboard-section">
                <div className="dashboard-section-heading"><h2>Today&apos;s direction</h2><button onClick={() => router.push("/library")}>Explore library</button></div>
                <div className="today-picks">
                  {due.length > 0 && <button className="today-pick review-pick" onClick={() => router.push("/review")}><span><CalendarCheck2 size={20} /></span><strong>Review {due.length} concept{due.length === 1 ? "" : "s"}</strong><small>Strengthen recall before it fades.</small><em>About {Math.max(3, due.length * 3)} min</em></button>}
                  {picks.map((course, index) => {
                    const id = course.id ?? course.courseId;
                    return <button className={`today-pick tone-${index + 1}`} key={id ?? course.topic} onClick={() => router.push(`/course/${encodeURIComponent(course.topic)}?id=${id}`)}><span><BookOpenCheck size={20} /></span><strong>{course.topic}</strong><small>{course.outcome ?? course.mission}</small><em>{course.estimatedMinutes ?? 30} min path</em></button>;
                  })}
                  {!due.length && !picks.length && <div className="dashboard-empty compact"><CheckCircle2 size={21} /><div><strong>You are caught up.</strong><p>Your next useful review will appear here.</p></div></div>}
                </div>
              </section>

              <section className="dashboard-insight"><Sparkles size={20} /><div><strong>Learning principle</strong><p>Try to explain the idea before rereading it. The effort to retrieve is part of what makes the memory durable.</p></div></section>
            </div>

            <aside className="dashboard-side-column">
              <section className="learning-snapshot"><div><h2>Your learning snapshot</h2><span>All time</span></div><dl><div><dt><Clock3 size={18} /> Study time</dt><dd>{Math.floor(minutes / 60)}h {minutes % 60}m</dd></div><div><dt><CheckCircle2 size={18} /> Lessons learned</dt><dd>{lessons.length}</dd></div><div><dt><Flame size={18} /> Current streak</dt><dd>{streakFor(lessons)} {streakFor(lessons) === 1 ? "day" : "days"}</dd></div><div><dt><Target size={18} /> Quiz accuracy</dt><dd>{accuracy || "—"}{accuracy ? "%" : ""}</dd></div></dl></section>
              <section className="quick-actions"><h2>Quick actions</h2><button onClick={() => router.push("/review")}><CalendarCheck2 size={18} /><span><strong>Review due concepts</strong><small>{due.length ? `${due.length} ready now` : "Queue is clear"}</small></span><ArrowRight size={15} /></button><button onClick={() => router.push("/library")}><Compass size={18} /><span><strong>Explore a new topic</strong><small>Browse published courses</small></span><ArrowRight size={15} /></button>{isPro && <button onClick={() => router.push("/create")}><BrainCircuit size={18} /><span><strong>Craft a course</strong><small>Use one course credit</small></span><ArrowRight size={15} /></button>}<button onClick={() => router.push("/progress")}><TrendingUp size={18} /><span><strong>See your progress</strong><small>{mastered} concepts mastered</small></span><ArrowRight size={15} /></button></section>
            </aside>
          </div>
        )}
      </div>
    </AppShell>
  );
}
