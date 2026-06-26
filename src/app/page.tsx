"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { useRouter } from "next/navigation";

interface Course {
  id: string;
  topic: string;
  mission?: string;
  authorName?: string;
  authorPhoto?: string;
}

export default function Home() {
  const router = useRouter();
  const [publicCourses, setPublicCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPublic() {
      try {
        const res = await fetch("/api/courses?scope=public");
        if (res.ok) {
          const data = await res.json();
          setPublicCourses(data.courses);
        }
      } catch (err) {
        console.error("Failed to fetch public courses", err);
      } finally {
        setLoading(false);
      }
    }
    fetchPublic();
  }, []);
  return (
    <AppShell>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px",
          gap: "24px",
          background: "var(--bg-canvas)",
          overflowY: "auto",
        }}
      >
        <div
          className="animate-fade-in"
          style={{
            maxWidth: "560px",
            width: "100%",
            textAlign: "center",
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "20px",
              background: "var(--accent-subtle)",
              border: "1.5px solid var(--accent-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "2rem",
              margin: "0 auto 28px",
            }}
          >
            ✦
          </div>

          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "2.4rem",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: "var(--text-primary)",
              marginBottom: "12px",
              lineHeight: 1.2,
            }}
          >
            What do you want to learn?
          </h1>
          <p
            style={{
              color: "var(--text-secondary)",
              fontSize: "1.1rem",
              marginBottom: "40px",
              lineHeight: 1.6,
            }}
          >
            Enter any topic, skill, or subject. The AI will build you a
            personalized course with lessons, diagrams, and quizzes.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "10px",
              marginBottom: "40px",
            }}
          >
            {[
              "⚛️ Quantum Physics",
              "🧠 Machine Learning",
              "🎸 Music Theory",
              "📐 Linear Algebra",
              "🌿 Plant Biology",
              "🏛️ Roman History",
            ].map((suggestion) => {
              const label = suggestion.split(" ").slice(1).join(" ");
              return (
                <button
                  key={label}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "var(--radius-md)",
                    border: "1.5px solid var(--border)",
                    background: "var(--bg-content)",
                    color: "var(--text-secondary)",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    fontFamily: "var(--font-body)",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLButtonElement).style.borderColor = "var(--accent)";
                    (e.target as HTMLButtonElement).style.color = "var(--accent)";
                    (e.target as HTMLButtonElement).style.background = "var(--accent-subtle)";
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLButtonElement).style.borderColor = "var(--border)";
                    (e.target as HTMLButtonElement).style.color = "var(--text-secondary)";
                    (e.target as HTMLButtonElement).style.background = "var(--bg-content)";
                  }}
                  onClick={() => router.push(`/course/${encodeURIComponent(label)}`)}
                >
                  {suggestion}
                </button>
              );
            })}
          </div>

          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "40px" }}>
            👈 Or enter your own topic in the sidebar to get started.
          </p>

          {/* Discover Section */}
          <div style={{ width: "100%", textAlign: "left", paddingTop: "40px", borderTop: "1px solid var(--border)" }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
              Discover Public Courses
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", marginBottom: "24px" }}>
              Explore what others are learning.
            </p>

            {loading ? (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                <div className="spinner" style={{ width: "16px", height: "16px", borderWidth: "2px" }} /> Loading courses...
              </div>
            ) : publicCourses.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No public courses available yet.</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "16px" }}>
                {publicCourses.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => router.push(`/course/${encodeURIComponent(c.topic)}?id=${c.id}`)}
                    style={{
                      background: "var(--bg-content)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)",
                      padding: "20px", textAlign: "left", cursor: "pointer", transition: "all 0.15s",
                      boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", gap: "12px"
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
                      (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                      (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-md)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                      (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                      (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm)";
                    }}
                  >
                    <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3 }}>
                      {c.topic}
                    </h3>
                    {c.mission && (
                      <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {c.mission}
                      </p>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "auto", paddingTop: "12px" }}>
                      {c.authorPhoto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.authorPhoto} alt="" style={{ width: 20, height: 20, borderRadius: "50%" }} />
                      ) : (
                        <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--accent)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: "bold" }}>
                          {c.authorName?.[0] ?? "?"}
                        </div>
                      )}
                      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        {c.authorName ?? "Anonymous"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

    </AppShell>
  );
}
