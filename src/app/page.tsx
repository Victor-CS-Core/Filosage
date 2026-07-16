"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookMarked,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Crown,
  Library,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import ErudozaMark from "@/components/ErudozaMark";
import { useAuth } from "@/components/AuthProvider";
import type { Course } from "@/lib/course-types";
import type { CourseProgress } from "@/lib/learning-types";
import { listLocalProgress } from "@/lib/learning-progress";

export default function Home() {
  const router = useRouter();
  const { user, isPro, loading: authLoading } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("");
  const [progress, setProgress] = useState<CourseProgress[]>([]);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/courses?scope=public");
      if (!response.ok) throw new Error("The public library could not be reached.");
      const data = (await response.json()) as { courses: Course[] };
      setCourses(data.courses);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The public library could not be reached.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadCourses);
  }, [loadCourses]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      queueMicrotask(() => setProgress(listLocalProgress()));
      return;
    }
    let cancelled = false;
    void user.getIdToken().then((token) => fetch("/api/progress", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as { progress: CourseProgress[] };
      if (!cancelled) setProgress(data.progress);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [authLoading, user]);

  const filteredCourses = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return courses;
    return courses.filter((course) =>
      [course.topic, course.mission, course.authorName]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized)),
    );
  }, [courses, query]);

  const createCourse = (event: React.FormEvent) => {
    event.preventDefault();
    const value = topic.trim();
    if (!value) return;
    router.push(`/course/${encodeURIComponent(value)}`);
  };

  const continueProgress = progress[0];
  const dueReviews = progress.reduce((count, item) => count + Object.values(item.lessons).filter(
    (lesson) => Date.parse(lesson.nextReviewAt) <= Date.now(),
  ).length, 0);
  const progressByCourse = useMemo(
    () => new Map(progress.map((item) => [item.courseId, item])),
    [progress],
  );

  return (
    <AppShell>
      <div className="home-page">
        {continueProgress && (
          <section className="today-section" aria-labelledby="today-title">
            <div className="today-heading">
              <div>
                <p className="overline">Today</p>
                <h2 id="today-title">Pick up where understanding left off.</h2>
              </div>
              <span><Clock3 size={16} /> {dueReviews} review{dueReviews === 1 ? "" : "s"} due</span>
            </div>
            <div className="today-actions">
              <button
                className="continue-row"
                onClick={() => router.push(`/course/${encodeURIComponent(continueProgress.topic)}/lesson/${continueProgress.lastLessonId}?id=${continueProgress.courseId}`)}
              >
                <span><small>Continue learning</small><strong>{continueProgress.topic}</strong><em>{continueProgress.lastLessonTitle}</em></span>
                <ArrowRight size={18} />
              </button>
              <button className="review-row" onClick={() => user ? router.push("/review") : router.push(`/course/${encodeURIComponent(continueProgress.topic)}?id=${continueProgress.courseId}`)}>
                <Sparkles size={18} />
                <span><strong>{dueReviews ? `Review ${dueReviews} due concept${dueReviews === 1 ? "" : "s"}` : "Your review queue is clear"}</strong><small>{dueReviews ? "Strengthen recall before it fades." : "Learn something new and we will schedule the return."}</small></span>
              </button>
            </div>
          </section>
        )}
        <section className="home-hero" aria-labelledby="home-title">
          <div className="hero-copy">
            <div className="hero-status"><span /> Public learning library</div>
            <h1 id="home-title">Understand more.<br /><span>Achieve more.</span></h1>
            <p>
              Erudoza makes complex subjects feel clear and personal, with focused learning paths, visual models, and retrieval practice that help understanding last.
            </p>

            {isPro ? (
              <form className="hero-create" onSubmit={createCourse}>
                <label htmlFor="hero-topic">What do you want to master next?</label>
                <div>
                  <input
                    id="hero-topic"
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    placeholder="e.g. systems thinking, music theory, molecular biology"
                    maxLength={120}
                  />
                  <button className="button button-primary" type="submit" disabled={!topic.trim()}>
                    Build course <ArrowRight size={17} />
                  </button>
                </div>
              </form>
            ) : (
              <div className="hero-actions">
                <a className="button button-primary" href="#library">Explore public courses <ArrowRight size={17} /></a>
                <button className="button button-quiet" onClick={() => router.push("/pricing")}><Crown size={16} /> Create with Erudoza Pro</button>
                <span>Published lessons stay free.</span>
              </div>
            )}
          </div>

          <div className="learning-method" aria-label="Erudoza learning method">
            <div className="method-header">
              <span>One learning loop</span>
              <span>Built for retention</span>
            </div>
            <ol>
              <li>
                <span className="method-index">A</span>
                <div><strong>Frame the concept</strong><p>Start with the mental model, not a wall of information.</p></div>
                <BrainCircuit size={19} />
              </li>
              <li>
                <span className="method-index">B</span>
                <div><strong>Make it visible</strong><p>Use diagrams and examples to expose the relationships.</p></div>
                <BookMarked size={19} />
              </li>
              <li>
                <span className="method-index">C</span>
                <div><strong>Retrieve, then advance</strong><p>Test understanding before moving to the next idea.</p></div>
                <CheckCircle2 size={19} />
              </li>
            </ol>
          </div>
        </section>

        <section className="library-section" id="library" aria-labelledby="library-title">
          <div className="section-heading library-heading">
            <div>
              <p className="overline">Published by Erudoza</p>
              <h2 id="library-title">Public course library</h2>
              <p>Open a course and learn at your own pace. Progress stays on this device.</p>
            </div>
            <label className="search-field">
              <Search size={17} />
              <span className="sr-only">Search courses</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the library" />
            </label>
          </div>

          {loading ? (
            <div className="course-list" aria-label="Loading public courses">
              {[0, 1, 2].map((item) => <div className="course-row-skeleton" key={item} />)}
            </div>
          ) : error ? (
            <div className="state-panel">
              <RefreshCw size={22} />
              <div><h3>Library unavailable</h3><p>{error}</p></div>
              <button className="button button-secondary" onClick={loadCourses}>Try again</button>
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="state-panel">
              <Library size={22} />
              <div>
                <h3>{query ? "No matching courses" : "The first public course is coming soon"}</h3>
                <p>{query ? "Try a broader topic or clear your search." : "Published learning paths will appear here."}</p>
              </div>
              {query && <button className="button button-secondary" onClick={() => setQuery("")}>Clear search</button>}
            </div>
          ) : (
            <div className="course-list">
              {filteredCourses.map((course, index) => {
                const id = course.id ?? course.courseId;
                const lessonCount = course.modules.reduce((sum, module) => sum + module.lessons.length, 0);
                const courseProgress = id ? progressByCourse.get(id) : undefined;
                const estimatedMinutes = course.estimatedMinutes ?? lessonCount * 12;
                return (
                  <button
                    className="course-row"
                    key={id ?? `${course.topic}-${index}`}
                    onClick={() => router.push(`/course/${encodeURIComponent(course.topic)}${id ? `?id=${id}` : ""}`)}
                  >
                    <span className="course-row-main">
                      <strong>{course.topic}</strong>
                      <span>{course.mission || "A structured path from first principles to confident understanding."}</span>
                    </span>
                    <span className="course-row-meta">
                      <span>{course.level ?? "Foundations"}</span>
                      <span>{Math.max(1, Math.round(estimatedMinutes / 60))} hr</span>
                      <span>{lessonCount} lessons</span>
                    </span>
                    <span className="course-row-action">{courseProgress ? "Continue" : "Begin"} <ArrowRight size={16} /></span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <footer className="home-footer">
          <span className="brand-mark" aria-hidden="true"><ErudozaMark /></span>
          <p><strong>Erudoza</strong> · Your daily dose of understanding.</p>
        </footer>
      </div>
    </AppShell>
  );
}
