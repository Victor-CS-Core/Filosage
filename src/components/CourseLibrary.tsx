"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bookmark,
  BookOpen,
  Clock3,
  Filter,
  Layers3,
  RefreshCw,
  Search,
} from "lucide-react";
import { useLearnerState } from "@/components/useLearnerState";
import type { Course } from "@/lib/course-types";

export default function CourseLibrary({ featured = false }: { featured?: boolean }) {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("All levels");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { state, update } = useLearnerState();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/courses?scope=public", { cache: "no-store" });
      if (!response.ok) throw new Error("The public library could not be reached.");
      const data = await response.json() as { courses: Course[] };
      setCourses(data.courses);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The public library could not be reached.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => setQuery(new URLSearchParams(window.location.search).get("q") ?? ""));
    void Promise.resolve().then(load);
  }, [load]);

  const levels = useMemo(() => ["All levels", ...Array.from(new Set(courses.map((course) => course.level).filter(Boolean)))], [courses]);
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = courses.filter((course) => {
      const matchesLevel = level === "All levels" || course.level === level;
      const matchesQuery = !normalized || [course.topic, course.mission, course.category, course.outcome]
        .filter(Boolean).some((value) => value!.toLowerCase().includes(normalized));
      return matchesLevel && matchesQuery;
    });
    return featured ? filtered.slice(0, 4) : filtered;
  }, [courses, featured, level, query]);

  const toggleBookmark = (courseId: string) => update((current) => ({
    ...current,
    courseBookmarks: current.courseBookmarks.includes(courseId)
      ? current.courseBookmarks.filter((id) => id !== courseId)
      : [...current.courseBookmarks, courseId],
  }));

  return (
    <div className={`library-browser ${featured ? "is-featured" : ""}`}>
      {!featured && (
        <div className="library-controls">
          <label className="search-field library-search">
            <Search size={18} /><span className="sr-only">Search published courses</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search topics, skills, or courses" />
          </label>
          <label className="filter-field">
            <Filter size={16} /><span className="sr-only">Filter by level</span>
            <select value={level} onChange={(event) => setLevel(event.target.value)}>
              {levels.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
      )}

      {loading ? (
        <div className="library-card-grid" aria-label="Loading published courses">
          {[0, 1, 2, 3].map((item) => <div className="course-card-skeleton" key={item} />)}
        </div>
      ) : error ? (
        <div className="state-panel"><RefreshCw size={22} /><div><h3>Library unavailable</h3><p>{error}</p></div><button className="button button-secondary" onClick={load}>Try again</button></div>
      ) : visible.length ? (
        <div className="library-card-grid">
          {visible.map((course, index) => {
            const id = course.id ?? course.courseId ?? `${course.topic}-${index}`;
            const lessons = course.modules.reduce((total, module) => total + module.lessons.length, 0);
            const bookmarked = state.courseBookmarks.includes(id);
            return (
              <article className="course-card" key={id}>
                <button className="course-card-open" onClick={() => router.push(`/course/${encodeURIComponent(course.topic)}?id=${id}`)} aria-label={`Open ${course.topic}`}>
                  <span className={`course-card-symbol tone-${index % 4}`}><BookOpen size={23} /></span>
                  <span className="course-card-category">{course.category ?? "Focused learning"}</span>
                  <h3>{course.topic}</h3>
                  <p>{course.outcome ?? course.mission ?? "Build durable understanding through a focused sequence."}</p>
                  <span className="course-card-meta">
                    <span><Layers3 size={14} /> {lessons} lessons</span>
                    <span><Clock3 size={14} /> {Math.max(1, Math.round((course.estimatedMinutes ?? lessons * 12) / 60))} hr</span>
                    <span>{course.level ?? "Foundations"}</span>
                  </span>
                  <span className="course-card-cta">View course <ArrowRight size={15} /></span>
                </button>
                <button className={`course-bookmark ${bookmarked ? "is-active" : ""}`} onClick={() => toggleBookmark(id)} aria-label={bookmarked ? `Remove ${course.topic} from saved courses` : `Save ${course.topic}`} aria-pressed={bookmarked}>
                  <Bookmark size={17} fill={bookmarked ? "currentColor" : "none"} />
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="state-panel"><Search size={22} /><div><h3>No matching courses</h3><p>Try a broader topic or a different level.</p></div><button className="button button-secondary" onClick={() => { setQuery(""); setLevel("All levels"); }}>Clear filters</button></div>
      )}
    </div>
  );
}
