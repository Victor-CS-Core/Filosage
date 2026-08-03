"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bookmark,
  Clock3,
  Filter,
  Layers3,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import AppDrawer, { useAppDrawer } from "@/components/AppDrawer";
import { useLearnerState } from "@/components/useLearnerState";
import { useAuth } from "@/components/AuthProvider";
import type { Course } from "@/lib/course-types";
import { deferClientTask } from "@/lib/browser-compat";
import CourseBanner from "@/components/CourseBanner";

export default function CourseLibrary({ featured = false }: { featured?: boolean }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [ownedCourses, setOwnedCourses] = useState<Course[]>([]);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("All levels");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { state, update } = useLearnerState();
  const { user, isPro } = useAuth();
  const filterDrawer = useAppDrawer("library-filters");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/courses?scope=public", { cache: "no-store" });
      if (!response.ok) throw new Error("The public library could not be reached.");
      const data = await response.json() as { courses: Course[] };
      setCourses(data.courses);
      if (user && isPro) {
        try {
          const token = await user.getIdToken();
          const ownedResponse = await fetch("/api/courses?scope=mine", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          if (ownedResponse.ok) {
            const ownedData = await ownedResponse.json() as { courses: Course[] };
            setOwnedCourses(ownedData.courses);
          } else {
            setOwnedCourses([]);
          }
        } catch {
          setOwnedCourses([]);
        }
      } else {
        setOwnedCourses([]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The public library could not be reached.");
    } finally {
      setLoading(false);
    }
  }, [isPro, user]);

  useEffect(() => {
    deferClientTask(() => setQuery(new URLSearchParams(window.location.search).get("q") ?? ""));
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
  const drafts = useMemo(() => ownedCourses.filter((course) => !course.isPublic), [ownedCourses]);

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
          <div className="library-controls-desktop">
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
          <button className="button button-secondary library-filter-trigger" type="button" onClick={filterDrawer.openDrawer} aria-expanded={filterDrawer.open}>
            <Filter size={17} /> Search and filter
            {(query || level !== "All levels") && <span>{Number(Boolean(query)) + Number(level !== "All levels")}</span>}
          </button>
        </div>
      )}

      {!featured && filterDrawer.open && (
        <AppDrawer open={filterDrawer.open} onClose={filterDrawer.closeDrawer} labelledBy="library-filter-title" size="compact" mobilePlacement="bottom" className="library-filter-drawer">
          <section className="library-filter-panel">
            <header className="app-drawer-header">
              <div><small>Course library</small><h2 id="library-filter-title">Find the right course</h2><p>Search by topic, then narrow by level.</p></div>
              <button className="icon-button" type="button" onClick={filterDrawer.closeDrawer} aria-label="Close course filters"><X size={18} /></button>
            </header>
            <div className="app-drawer-body library-filter-fields">
              <label>
                <span>Search published courses</span>
                <span className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Topics, skills, or courses" /></span>
              </label>
              <label>
                <span>Level</span>
                <span className="filter-field"><Filter size={16} /><select value={level} onChange={(event) => setLevel(event.target.value)}>{levels.map((item) => <option key={item}>{item}</option>)}</select></span>
              </label>
            </div>
            <footer className="app-drawer-footer">
              <button className="button button-quiet" type="button" onClick={() => { setQuery(""); setLevel("All levels"); }}>Reset</button>
              <button className="button button-primary" type="button" onClick={filterDrawer.closeDrawer}>Show {visible.length} {visible.length === 1 ? "course" : "courses"}</button>
            </footer>
          </section>
        </AppDrawer>
      )}

      {loading ? (
        <div className="library-card-grid" aria-label="Loading published courses">
          {[0, 1, 2, 3].map((item) => <div className="course-card-skeleton" key={item} />)}
        </div>
      ) : error ? (
        <div className="state-panel"><RefreshCw size={22} /><div><h3>Library unavailable</h3><p>{error}</p></div><button className="button button-secondary" onClick={load}>Try again</button></div>
      ) : visible.length || drafts.length ? (
        <>
        {!featured && drafts.length > 0 && (
          <section className="owner-course-section" aria-labelledby="your-drafts-title">
            <div className="owner-course-heading">
              <div><p className="overline">Private workspace</p><h2 id="your-drafts-title">Your current courses</h2><p>Continue building these courses. Only you can see them until you publish.</p></div>
              <span className="owner-course-count">{drafts.length}</span>
            </div>
            <div className="library-card-grid owner-course-grid">
              {drafts.map((course, index) => {
                const id = course.id ?? course.courseId ?? `${course.topic}-${index}`;
                const lessons = course.modules.reduce((total, module) => total + module.lessons.length, 0);
                const hours = Math.max(1, Math.round((course.estimatedMinutes ?? lessons * 12) / 60));
                return <article className="course-card owner-course-card" key={id}>
                  <CourseBanner course={course} variant="card" eager={index === 0} />
                  <div className="course-card-body">
                    <span className="course-card-category">Private draft</span>
                    <h3>{course.topic}</h3>
                    <p>{course.outcome ?? course.mission ?? "Continue shaping this course and generate its lessons when it is ready."}</p>
                    <span className="course-card-meta"><span><Layers3 size={14} /> {lessons} lessons</span><span><Clock3 size={14} /> {hours} {hours === 1 ? "hour" : "hours"}</span><span>{course.level ?? "Foundations"}</span></span>
                    <span className="course-card-cta">Continue editing <ArrowRight size={15} /></span>
                  </div>
                  <Link className="course-card-open" href={`/course/${encodeURIComponent(course.topic)}?id=${id}`} aria-label={`Continue ${course.topic}`}>
                    <span className="sr-only">Continue {course.topic}</span>
                  </Link>
                </article>;
              })}
            </div>
          </section>
        )}
        {visible.length > 0 ? <section aria-labelledby={!featured ? "published-courses-title" : undefined}>
          {!featured && <h2 className="sr-only" id="published-courses-title">Published courses</h2>}
          <div className="library-card-grid">
          {visible.map((course, index) => {
            const id = course.id ?? course.courseId ?? `${course.topic}-${index}`;
            const lessons = course.modules.reduce((total, module) => total + module.lessons.length, 0);
            const hours = Math.max(1, Math.round((course.estimatedMinutes ?? lessons * 12) / 60));
            const bookmarked = state.courseBookmarks.includes(id);
            return (
              <article className="course-card" key={id}>
                <CourseBanner course={course} variant="card" eager={index === 0 && drafts.length === 0} />
                <div className="course-card-body">
                  <span className="course-card-category">{course.category ?? "Course"}</span>
                  <h3>{course.topic}</h3>
                  <p>{course.outcome ?? course.mission ?? "Learn the subject through a structured sequence of lessons and practice."}</p>
                  <span className="course-card-meta">
                    <span><Layers3 size={14} /> {lessons} lessons</span>
                    <span><Clock3 size={14} /> {hours} {hours === 1 ? "hour" : "hours"}</span>
                    <span>{course.level ?? "Foundations"}</span>
                  </span>
                  <span className="course-card-cta">View course <ArrowRight size={15} /></span>
                </div>
                <Link className="course-card-open" href={`/course/${encodeURIComponent(course.topic)}?id=${id}`} aria-label={`Open ${course.topic}`}>
                  <span className="sr-only">Open {course.topic}</span>
                </Link>
                <button className={`course-bookmark ${bookmarked ? "is-active" : ""}`} onClick={() => toggleBookmark(id)} aria-label={bookmarked ? `Remove ${course.topic} from saved courses` : `Save ${course.topic}`} aria-pressed={bookmarked}>
                  <Bookmark size={17} fill={bookmarked ? "currentColor" : "none"} />
                </button>
              </article>
            );
          })}
          </div>
        </section> : !featured ? <div className="state-panel"><Search size={22} /><div><h3>No matching published courses</h3><p>Your private courses are shown above. Try a broader topic or a different level.</p></div><button className="button button-secondary" onClick={() => { setQuery(""); setLevel("All levels"); }}>Clear filters</button></div> : null}
        </>
      ) : (
        <div className="state-panel"><Search size={22} /><div><h3>No matching courses</h3><p>Try a broader topic or a different level.</p></div><button className="button button-secondary" onClick={() => { setQuery(""); setLevel("All levels"); }}>Clear filters</button></div>
      )}
    </div>
  );
}
