"use client";

import { useEffect, useState, useRef } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { useAuth } from "@/components/AuthProvider";
import { useRouter, usePathname } from "next/navigation";
import dynamic from "next/dynamic";

const AuthModal = dynamic(() => import("@/components/AuthModal"), { ssr: false });

interface Lesson { title: string; concept: string; }
interface Module { title: string; lessons: Lesson[]; }
interface Lesson { title: string; concept: string; }
interface Module { title: string; lessons: Lesson[]; }
interface CourseEntry { id?: string; topic: string; modules: Module[]; isPublic?: boolean; }

interface AppShellProps {
  children: React.ReactNode;
  /** Topic currently being viewed, if any */
  activeTopic?: string;
  /** lessonId string like "0-2", if inside a lesson */
  activeLessonId?: string;
}

export default function AppShell({ children, activeTopic, activeLessonId }: AppShellProps) {
  const { theme, toggle } = useTheme();
  const { user, signOut } = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const [courses, setCourses] = useState<CourseEntry[]>([]);
  const [expandedTopic, setExpandedTopic] = useState<string | null>(activeTopic ?? null);
  const [newTopic, setNewTopic] = useState("");
  const [starting, setStarting] = useState(false);
  
  const sidebarBodyRef = useRef<HTMLDivElement>(null);

  // Preserve sidebar scroll position
  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLDivElement;
      sessionStorage.setItem("sidebarScroll", target.scrollTop.toString());
    };
    
    const el = sidebarBodyRef.current;
    if (el) el.addEventListener("scroll", handleScroll);
    return () => {
      if (el) el.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Restore sidebar scroll position when layout updates
  useEffect(() => {
    const el = sidebarBodyRef.current;
    if (el) {
      const saved = sessionStorage.getItem("sidebarScroll");
      if (saved) {
        // Need to use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
          el.scrollTop = parseInt(saved, 10);
        });
      }
    }
  }, [courses, expandedTopic, pathname]);

  // Reset form when navigation completes
  useEffect(() => {
    setStarting(false);
    setNewTopic("");
  }, [pathname]);

  // Read courses
  useEffect(() => {
    // One-time cleanup of old local courses to migrate cleanly
    if (typeof window !== "undefined" && !localStorage.getItem("cleaned_v1")) {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("course_") || key.startsWith("lesson_"))) {
          localStorage.removeItem(key);
        }
      }
      localStorage.setItem("cleaned_v1", "true");
    }

    async function fetchCourses() {
      if (user) {
        try {
          const token = await user.getIdToken();
          const res = await fetch("/api/courses?scope=mine", {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            const loaded = data.courses.map((c: any) => ({
              id: c.id,
              topic: c.topic,
              modules: c.modules ?? [],
              isPublic: c.isPublic
            }));
            setCourses(loaded);
            return;
          }
        } catch (err) {
          console.error("Failed to fetch courses from Firestore", err);
        }
      }
      
      // Fallback to localStorage for guests
      const entries: CourseEntry[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("course_")) {
          const topic = key.replace("course_", "");
          try {
            const data = JSON.parse(localStorage.getItem(key)!);
            entries.push({ topic, modules: data.modules ?? [] });
          } catch {
            // ignore corrupt entries
          }
        }
      }
      entries.sort((a, b) => a.topic.localeCompare(b.topic));
      setCourses(entries);
    }
    
    async function syncGuestCourses() {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith("course_")) {
            try {
              const data = JSON.parse(localStorage.getItem(key)!);
              if (!data.courseId) {
                const topic = key.replace("course_", "");
                const res = await fetch("/api/courses", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                  },
                  body: JSON.stringify({ topic, mission: data.mission, modules: data.modules })
                });
                if (res.ok) {
                  const result = await res.json();
                  data.courseId = result.courseId;
                  data.authorId = user.uid;
                  localStorage.setItem(key, JSON.stringify(data));
                }
              }
            } catch (err) {}
          }
        }
      } catch (err) {
        console.error("Failed to sync guest courses", err);
      }
    }

    async function initialize() {
      if (user) {
        await syncGuestCourses();
      }
      fetchCourses();
    }
    
    initialize();
  }, [pathname, user]); // re-read when route or user changes

  const handleNewCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopic.trim()) return;
    setStarting(true);
    router.push(`/course/${encodeURIComponent(newTopic.trim())}`);
  };

  const [activeMod, activeLes] = activeLessonId
    ? activeLessonId.split("-").map(Number)
    : [-1, -1];

  return (
    <div className="app-shell">
      {/* ── LEFT SIDEBAR ──────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-logo">✦ Teach</span>
          <button
            onClick={toggle}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              padding: "4px 8px",
              fontSize: "14px",
              lineHeight: 1,
              color: "var(--text-secondary)",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-surface-hover)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "none";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
            }}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>

        <div className="sidebar-body" ref={sidebarBodyRef}>
          {/* New course input */}
          <form onSubmit={handleNewCourse} style={{ marginBottom: "16px" }}>
            <input
              className="input"
              style={{ fontSize: "0.85rem", padding: "8px 12px", marginBottom: "8px" }}
              placeholder="New topic..."
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
            />
            <button
              type="submit"
              className="btn-primary"
              disabled={starting || !newTopic.trim()}
              style={{ width: "100%", padding: "8px 12px", fontSize: "0.85rem", opacity: (!newTopic.trim() && !starting) ? 0.6 : 1, cursor: (!newTopic.trim() && !starting) ? "not-allowed" : "pointer" }}
            >
              {starting ? "Starting..." : "+ New Course"}
            </button>
          </form>

          <hr className="divider" style={{ margin: "0 0 12px" }} />

          {/* Navigation Links */}
          <div style={{ marginBottom: "20px" }}>
            <button
              onClick={() => router.push("/")}
              style={{
                width: "100%", textAlign: "left", padding: "8px 12px", background: pathname === "/" ? "var(--bg-surface-hover)" : "none",
                border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", color: pathname === "/" ? "var(--text-primary)" : "var(--text-secondary)",
                fontWeight: pathname === "/" ? 600 : 500, display: "flex", alignItems: "center", gap: "8px", transition: "all 0.15s"
              }}
              onMouseEnter={(e) => { if (pathname !== "/") (e.currentTarget as HTMLElement).style.background = "var(--bg-surface)"; }}
              onMouseLeave={(e) => { if (pathname !== "/") (e.currentTarget as HTMLElement).style.background = "none"; }}
            >
              <span>🧭</span> Discover
            </button>
          </div>

          <div className="sidebar-section-title">My Courses</div>

          {courses.length === 0 && (
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", padding: "8px 10px" }}>
              No courses yet. Enter a topic above!
            </p>
          )}

          {!user && courses.length > 0 && (
            <div style={{ padding: "8px 10px", marginBottom: "8px", background: "rgba(255, 170, 0, 0.1)", borderRadius: "6px", border: "1px solid rgba(255, 170, 0, 0.2)" }}>
              <p style={{ fontSize: "0.75rem", color: "#e69900", margin: 0, lineHeight: 1.4 }}>
                ⚠️ <strong>Guest Mode:</strong> These courses are saved locally and will be lost if you clear your browser data. <button onClick={() => setShowAuth(true)} style={{ background: "none", border: "none", color: "inherit", textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: "inherit", fontWeight: "bold" }}>Sign in to save.</button>
              </p>
            </div>
          )}

          {courses.map((c, idx) => {
            const isActiveTopic = c.topic === activeTopic;
            const isExpanded = expandedTopic === c.topic;

            return (
              <div key={c.id || `${c.topic}-${idx}`}>
                <button
                  onClick={() => {
                    setExpandedTopic(expandedTopic === c.topic ? null : c.topic);
                    if (pathname !== `/course/${encodeURIComponent(c.topic)}`) {
                      if (c.id) {
                        router.push(`/course/${encodeURIComponent(c.topic)}?id=${c.id}`);
                      } else {
                        router.push(`/course/${encodeURIComponent(c.topic)}`);
                      }
                    }
                  }}
                  className={`nav-item ${isActiveTopic ? "active" : ""}`}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: "12px", flexShrink: 0, opacity: 0.7 }}>
                      {expandedTopic === c.topic ? "📂" : "📁"}
                    </span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.topic}
                    </span>
                  </div>
                  {c.isPublic !== undefined && (
                    <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px", background: c.isPublic ? "var(--success-subtle)" : "var(--bg-surface)", color: c.isPublic ? "var(--success)" : "var(--text-muted)", flexShrink: 0 }}>
                      {c.isPublic ? "Public" : "Private"}
                    </span>
                  )}
                </button>

                {/* Lesson tree — only show when this course is expanded */}
                {isExpanded && c.modules.map((mod, modIdx) => (
                  <div key={modIdx}>
                    <div
                      style={{
                        padding: "5px 10px 3px 26px",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.07em",
                        color: "var(--text-muted)",
                      }}
                    >
                      {mod.title}
                    </div>
                    {mod.lessons.map((lesson, lesIdx) => {
                      const lessonId = `${modIdx}-${lesIdx}`;
                      const isLessonActive = isActiveTopic && lessonId === activeLessonId;
                      return (
                        <button
                          key={lesIdx}
                          className={`nav-lesson-item ${isLessonActive ? "active" : ""}`}
                          onClick={() => {
                            const url = `/course/${encodeURIComponent(c.topic)}/lesson/${lessonId}`;
                            router.push(c.id ? `${url}?id=${c.id}` : url);
                          }}
                          title={lesson.title}
                        >
                          <span style={{ color: isLessonActive ? "var(--accent)" : "var(--text-muted)", flexShrink: 0, marginTop: "1px" }}>
                            {isLessonActive ? "●" : "○"}
                          </span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{lesson.title}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* ── User Footer ──────────────────────────────── */}
        <div style={{ borderTop: "1px solid var(--border)", padding: "12px 8px" }}>
          {user ? (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px" }}>
              {user.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.photoURL} alt="avatar" width={30} height={30}
                  referrerPolicy="no-referrer"
                  style={{ borderRadius: "50%", flexShrink: 0 }} />
              ) : (
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--accent)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "white", fontSize: "0.8rem", fontWeight: 700, flexShrink: 0 }}>
                  {user.displayName?.[0] ?? "?"}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text-primary)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.displayName ?? user.email}
                </div>
              </div>
              <button onClick={signOut} className="btn-ghost"
                style={{ padding: "4px 8px", fontSize: "0.75rem", flexShrink: 0 }}
                title="Sign out">
                ↩
              </button>
            </div>
          ) : (
            <button onClick={() => setShowAuth(true)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px",
                padding: "8px 10px", background: "none", border: "none", cursor: "pointer",
                borderRadius: "var(--radius-sm)", transition: "background 0.15s" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-surface-hover)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "none")}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", border: "1.5px dashed var(--border-strong)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--text-muted)", fontSize: "1rem", flexShrink: 0 }}>👤</div>
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                Sign in
              </span>
            </button>
          )}
        </div>
      </aside>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

      {/* ── MAIN SLOT ──────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
