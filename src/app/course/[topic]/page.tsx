"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import dynamic from "next/dynamic";

const AuthModal = dynamic(() => import("@/components/AuthModal"), { ssr: false });

interface Lesson { title: string; concept: string; }
interface Module { title: string; lessons: Lesson[]; }
interface Course {
  mission?: string;
  modules: Module[];
  courseId?: string;  // Firestore doc ID
  isPublic?: boolean;
  authorId?: string;
}

export default function CourseMap() {
  const params = useParams();
  const router = useRouter();
  const topic = decodeURIComponent(params.topic as string);
  const searchParams = useSearchParams();
  const courseId = searchParams.get("id");
  const { user } = useAuth();

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMod, setExpandedMod] = useState<number | null>(0);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const generateCourse = useCallback(async () => {
    try {
      // Get the auth token if user is signed in
      const token = user ? await user.getIdToken() : null;

      const res = await fetch("/api/generate-course", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ topic }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate course.");

      // Cache locally too
      localStorage.setItem(`course_${topic}`, JSON.stringify(data));
      setCourse(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [topic, user]);

  useEffect(() => {
    async function loadCourse() {
      if (courseId) {
        try {
          let headers: any = {};
          if (user) {
            const token = await user.getIdToken();
            headers = { Authorization: `Bearer ${token}` };
          }
          const res = await fetch(`/api/courses/${courseId}`, { headers });
          if (res.ok) {
            const data = await res.json();
            setCourse(data);
            // Also cache it locally so sidebar and subsequent loads are fast
            localStorage.setItem(`course_${topic}`, JSON.stringify(data));
            setLoading(false);
            return;
          }
        } catch (e) {
          console.error("Failed to fetch public course", e);
        }
      }

      const saved = localStorage.getItem(`course_${topic}`);
      if (saved) {
        setCourse(JSON.parse(saved));
        setLoading(false);
      } else {
        generateCourse();
      }
    }
    loadCourse();
  }, [topic, courseId, user, generateCourse]);

  const toggleVisibility = async () => {
    if (!user) { setShowAuth(true); return; }
    if (!course?.courseId) return;
    setTogglingVisibility(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/courses/${course.courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isPublic: !course.isPublic }),
      });
      if (res.ok) {
        const updated = { ...course, isPublic: !course.isPublic };
        setCourse(updated);
        localStorage.setItem(`course_${topic}`, JSON.stringify(updated));
      }
    } catch (err) {
      console.error(err);
      alert("Failed to update visibility.");
    } finally {
      setTogglingVisibility(false);
    }
  };

  const deleteCourse = async () => {
    if (!course?.courseId || !user) return;
    if (!confirm(`Are you sure you want to delete "${topic}"? This cannot be undone.`)) return;

    setDeleting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/courses/${course.courseId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        localStorage.removeItem(`course_${topic}`);
        router.push("/");
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete course.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to delete course.");
    } finally {
      setDeleting(false);
    }
  };

  /* ── Error state ── */
  if (error) {
    return (
      <AppShell activeTopic={topic}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px", gap: "16px" }}>
          <div style={{ fontSize: "2.5rem" }}>⚠️</div>
          <h2 style={{ color: "var(--error)" }}>Generation Failed</h2>
          <p style={{ color: "var(--text-secondary)", maxWidth: "500px", textAlign: "center" }}>{error}</p>
          <button onClick={() => router.push("/")} className="btn-secondary">← Back to Home</button>
        </div>
      </AppShell>
    );
  }

  /* ── Loading state ── */
  if (loading) {
    return (
      <AppShell activeTopic={topic}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px" }}>
          <div className="spinner" />
          <p style={{ color: "var(--text-secondary)", fontSize: "1rem" }}>
            Building your course on <strong>{topic}</strong>…
          </p>
        </div>
      </AppShell>
    );
  }

  const totalLessons = course?.modules?.reduce((acc, m) => acc + m.lessons.length, 0) ?? 0;
  const isOwner = user && (!course?.authorId || course?.authorId === user.uid);

  return (
    <AppShell activeTopic={topic}>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

      <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-canvas)" }}>
        {/* Header */}
        <div style={{ background: "var(--bg-content)", borderBottom: "1px solid var(--border)", padding: "32px 40px 28px" }}>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "8px", fontWeight: 500 }}>COURSE</p>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)", marginBottom: "12px" }}>
            {topic}
          </h1>
          {course?.mission && (
            <p style={{ color: "var(--text-secondary)", fontSize: "1rem", maxWidth: "680px", lineHeight: 1.6 }}>
              {course.mission}
            </p>
          )}

          {/* Stats + Visibility */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "20px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>📦 {course?.modules?.length ?? 0} modules</span>
            <span style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>📖 {totalLessons} lessons</span>

            {/* Visibility badge — only for owners */}
            {isOwner && course?.courseId && (
              <button
                onClick={toggleVisibility}
                disabled={togglingVisibility}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  padding: "5px 12px",
                  borderRadius: "var(--radius-pill)",
                  border: `1.5px solid ${course.isPublic ? "var(--success)" : "var(--border-strong)"}`,
                  background: course.isPublic ? "var(--success-subtle)" : "var(--bg-surface)",
                  color: course.isPublic ? "var(--success)" : "var(--text-secondary)",
                  fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {togglingVisibility ? "…" : course.isPublic ? "🌐 Public" : "🔒 Private"}
              </button>
            )}

            {isOwner && course?.courseId && (
              <button
                onClick={deleteCourse}
                disabled={deleting}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  padding: "5px 12px",
                  borderRadius: "var(--radius-pill)",
                  border: "1.5px solid var(--error-subtle)",
                  background: "var(--bg-surface)",
                  color: "var(--error)",
                  fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--error-subtle)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-surface)";
                }}
              >
                {deleting ? "…" : "🗑️ Delete"}
              </button>
            )}

            {/* Sign-in nudge for unauthenticated users */}
            {!user && (
              <button onClick={() => setShowAuth(true)} style={{ fontSize: "0.8rem", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                Sign in to save this course →
              </button>
            )}
          </div>
        </div>

        {/* Module Accordion */}
        <div style={{ padding: "32px 40px", display: "flex", flexDirection: "column", gap: "16px", maxWidth: "860px" }}>
          {course?.modules?.map((mod, modIdx) => (
            <div key={modIdx} style={{ background: "var(--bg-content)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
              {/* Module header */}
              <button
                onClick={() => setExpandedMod(expandedMod === modIdx ? null : modIdx)}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", background: "none", border: "none", cursor: "pointer", textAlign: "left", borderBottom: expandedMod === modIdx ? "1px solid var(--border)" : "none" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <span style={{ width: "32px", height: "32px", borderRadius: "8px", background: "var(--accent-subtle)", border: "1px solid var(--accent-border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", fontWeight: 700, color: "var(--accent)", flexShrink: 0 }}>
                    {modIdx + 1}
                  </span>
                  <div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "2px" }}>Module {modIdx + 1}</div>
                    <div style={{ fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>{mod.title}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{mod.lessons.length} lessons</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>{expandedMod === modIdx ? "▲" : "▼"}</span>
                </div>
              </button>

              {/* Lessons list */}
              {expandedMod === modIdx && (
                <div>
                  {mod.lessons.map((lesson, lesIdx) => (
                    <button
                      key={lesIdx}
                      onClick={() => router.push(`/course/${encodeURIComponent(topic)}/lesson/${modIdx}-${lesIdx}`)}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: "16px", padding: "16px 24px", background: "none", border: "none", borderBottom: lesIdx < mod.lessons.length - 1 ? "1px solid var(--border)" : "none", cursor: "pointer", textAlign: "left", transition: "background 0.15s" }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--bg-surface)")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "none")}
                    >
                      <div style={{ width: "36px", height: "36px", borderRadius: "50%", border: "2px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", color: "var(--text-muted)", flexShrink: 0 }}>
                        {lesIdx + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, color: "var(--text-primary)", marginBottom: "2px" }}>{lesson.title}</div>
                        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lesson.concept}</div>
                      </div>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.9rem", flexShrink: 0 }}>→</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
