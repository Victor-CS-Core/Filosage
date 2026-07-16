"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Circle,
  Compass,
  Library,
  LockKeyhole,
  LogOut,
  Menu,
  Moon,
  Plus,
  Sun,
  X,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";
import type { Course } from "@/lib/course-types";

const AuthModal = dynamic(() => import("@/components/AuthModal"), { ssr: false });

interface AppShellProps {
  children: React.ReactNode;
  activeTopic?: string;
  activeLessonId?: string;
  activeCourseId?: string | null;
}

export default function AppShell({
  children,
  activeTopic,
  activeLessonId,
  activeCourseId,
}: AppShellProps) {
  const { theme, toggle } = useTheme();
  const { user, isOwner, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [courses, setCourses] = useState<Course[]>([]);
  const [newTopic, setNewTopic] = useState("");
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(activeCourseId ?? null);
  const [showAuth, setShowAuth] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!isOwner || !user) {
      return;
    }

    let cancelled = false;
    async function loadCourses() {
      try {
        const token = await user!.getIdToken();
        const response = await fetch("/api/courses?scope=mine", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const data = (await response.json()) as { courses: Course[] };
        if (!cancelled) setCourses(data.courses);
      } catch (error) {
        console.error("Could not load studio courses:", error);
      }
    }

    void Promise.resolve().then(loadCourses);
    return () => {
      cancelled = true;
    };
  }, [isOwner, user, pathname]);

  const totalLessons = useMemo(
    () => courses.reduce((sum, course) => sum + course.modules.reduce((n, module) => n + module.lessons.length, 0), 0),
    [courses],
  );

  const startCourse = (event: React.FormEvent) => {
    event.preventDefault();
    const topic = newTopic.trim();
    if (!isOwner) {
      setShowAuth(true);
      return;
    }
    if (!topic) return;
    setNewTopic("");
    router.push(`/course/${encodeURIComponent(topic)}`);
  };

  const navigateCourse = (course: Course) => {
    const id = course.id ?? course.courseId;
    setExpandedCourseId((current) => (current === id ? null : id ?? null));
    router.push(`/course/${encodeURIComponent(course.topic)}${id ? `?id=${id}` : ""}`);
  };

  const sidebar = (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="sidebar-brand-row">
        <button className="brand" onClick={() => router.push("/")} aria-label="Teach home">
          <span className="brand-mark" aria-hidden="true"><BookOpen size={18} /></span>
          <span><strong>Teach</strong><small>Learning studio</small></span>
        </button>
        <button className="icon-button mobile-only" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
          <X size={19} />
        </button>
      </div>

      <nav className="sidebar-nav">
        <button className={`nav-link ${pathname === "/" ? "is-active" : ""}`} onClick={() => router.push("/")}>
          <Compass size={18} />
          <span>Discover</span>
        </button>

        <div className="nav-rule" />

        {isOwner ? (
          <>
            <div className="sidebar-heading-row">
              <span>Studio</span>
              <span className="sidebar-count" aria-label={`${courses.length} courses`}>{courses.length}</span>
            </div>

            <form className="new-course-form" onSubmit={startCourse}>
              <label htmlFor="new-course-topic">Build a learning path</label>
              <div className="compact-input-row">
                <input
                  id="new-course-topic"
                  value={newTopic}
                  onChange={(event) => setNewTopic(event.target.value)}
                  placeholder="Enter any topic"
                  maxLength={120}
                />
                <button className="icon-button icon-button-accent" type="submit" disabled={!newTopic.trim()} aria-label="Create course">
                  <Plus size={18} />
                </button>
              </div>
            </form>

            <div className="course-tree" aria-label="Your courses">
              {courses.length === 0 ? (
                <div className="sidebar-empty">
                  <Library size={18} />
                  <p>Your private courses will appear here.</p>
                </div>
              ) : courses.map((course) => {
                const id = course.id ?? course.courseId ?? course.topic;
                const expanded = expandedCourseId === id;
                const active = activeCourseId ? activeCourseId === id : activeTopic === course.topic;
                return (
                  <div className="course-tree-item" key={id}>
                    <button className={`course-tree-trigger ${active ? "is-active" : ""}`} onClick={() => navigateCourse(course)}>
                      {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      <span>{course.topic}</span>
                      <span className={`visibility-dot ${course.isPublic ? "is-public" : ""}`} title={course.isPublic ? "Public" : "Private"} />
                    </button>
                    {expanded && course.modules.map((module, moduleIndex) => (
                      <div className="course-tree-module" key={`${id}-${moduleIndex}`}>
                        <p>{module.title}</p>
                        {module.lessons.map((lesson, lessonIndex) => {
                          const lessonId = `${moduleIndex}-${lessonIndex}`;
                          const lessonActive = active && activeLessonId === lessonId;
                          return (
                            <button
                              key={lessonId}
                              className={`course-tree-lesson ${lessonActive ? "is-active" : ""}`}
                              onClick={() => router.push(`/course/${encodeURIComponent(course.topic)}/lesson/${lessonId}?id=${id}`)}
                            >
                              <Circle size={8} fill={lessonActive ? "currentColor" : "none"} />
                              <span>{lesson.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {courses.length > 0 && (
              <p className="sidebar-summary">{totalLessons} lessons across {courses.length} courses</p>
            )}
          </>
        ) : (
          <div className="studio-lockup">
            <LockKeyhole size={18} />
            <div>
              <strong>Private Studio</strong>
              <p>Authoring and AI tools are owner-only.</p>
            </div>
            <button className="button button-secondary button-small" onClick={() => setShowAuth(true)} disabled={authLoading}>
              Owner sign in
            </button>
          </div>
        )}
      </nav>

      <div className="sidebar-footer">
        <button className="icon-button" onClick={toggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        {isOwner && user ? (
          <div className="account-compact">
            {user.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="avatar-fallback">{user.email?.slice(0, 1).toUpperCase()}</span>
            )}
            <span><strong>Owner</strong><small>{user.email}</small></span>
            <button className="icon-button" onClick={signOut} aria-label="Sign out"><LogOut size={17} /></button>
          </div>
        ) : (
          <span className="public-mode-label">Public learning mode</span>
        )}
      </div>
    </aside>
  );

  return (
    <div className="app-shell">
      <header className="mobile-topbar">
        <button className="icon-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
        <button className="brand brand-mobile" onClick={() => router.push("/")}>
          <span className="brand-mark" aria-hidden="true"><BookOpen size={17} /></span>
          <strong>Teach</strong>
        </button>
        <button className="icon-button" onClick={toggle} aria-label="Toggle theme">
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>

      {mobileOpen && (
        <div className="mobile-sidebar-layer is-open" onMouseDown={() => setMobileOpen(false)}>
          <div onMouseDown={(event) => event.stopPropagation()}>{sidebar}</div>
        </div>
      )}
      <div className="desktop-sidebar">{sidebar}</div>

      <main className="app-main">{children}</main>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}
