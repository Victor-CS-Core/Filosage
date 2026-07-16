"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookMarked,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Library,
  RefreshCw,
  Search,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import type { Course } from "@/lib/course-types";

export default function Home() {
  const router = useRouter();
  const { isOwner } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("");

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

  return (
    <AppShell>
      <div className="home-page">
        <section className="home-hero" aria-labelledby="home-title">
          <div className="hero-copy">
            <div className="hero-status"><span /> Public learning library</div>
            <h1 id="home-title">Learn with structure.<br />Understand with depth.</h1>
            <p>
              Teach turns complex subjects into calm, focused learning paths—clear explanations, visual models, and retrieval practice included.
            </p>

            {isOwner ? (
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
                <span>No account required to learn.</span>
              </div>
            )}
          </div>

          <div className="learning-method" aria-label="Teach learning method">
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
              <p className="overline">Published by Teach</p>
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
                      <span>{course.modules.length} modules</span>
                      <span>{lessonCount} lessons</span>
                    </span>
                    <span className="course-row-action">Begin <ArrowRight size={16} /></span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <footer className="home-footer">
          <span className="brand-mark" aria-hidden="true"><BookOpen size={16} /></span>
          <p>Designed for deliberate learning, not endless scrolling.</p>
        </footer>
      </div>
    </AppShell>
  );
}
