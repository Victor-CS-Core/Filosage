"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import mermaid from "mermaid";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface Quiz {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface LessonData {
  content: string;
  diagram: string;
  quizzes: Quiz[];
}

/* ── Mermaid Diagram ────────────────────────────────── */
function MermaidDiagram({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const rendered = useRef(false);

  useEffect(() => {
    if (!ref.current || !chart || rendered.current) return;
    rendered.current = true;
    mermaid.initialize({ startOnLoad: false, theme: "default" });
    const id = `m${Math.random().toString(36).slice(2)}`;
    mermaid
      .render(id, chart)
      .then(({ svg }) => {
        if (ref.current) ref.current.innerHTML = svg;
      })
      .catch((e) => {
        console.warn("Mermaid error:", e);
        if (ref.current) ref.current.innerHTML = "<em>Diagram could not be rendered.</em>";
      });
  }, [chart]);

  if (!chart) return null;

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "24px",
        display: "flex",
        justifyContent: "center",
        overflowX: "auto",
        margin: "24px 0",
      }}
      ref={ref}
    />
  );
}

/* ── Interactive Quiz ───────────────────────────────── */
function InteractiveQuiz({ quiz, index }: { quiz: Quiz; index: number }) {
  const [selected, setSelected] = useState<number | null>(null);
  const revealed = selected !== null;

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        marginBottom: "16px",
      }}
    >
      <div
        style={{
          padding: "16px 20px",
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--border)",
          fontWeight: 600,
          color: "var(--text-primary)",
          fontSize: "0.95rem",
        }}
      >
        Question {index + 1}: {quiz.question}
      </div>
      <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {quiz.options.map((option, i) => {
          let cls = "quiz-option";
          if (revealed) {
            if (i === quiz.correctIndex) cls += " correct";
            else if (i === selected) cls += " incorrect";
          } else if (i === selected) {
            cls += " selected-neutral";
          }
          return (
            <button key={i} className={cls} disabled={revealed} onClick={() => setSelected(i)}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "22px",
                  height: "22px",
                  borderRadius: "50%",
                  border: "1.5px solid currentColor",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  marginRight: "10px",
                  flexShrink: 0,
                }}
              >
                {String.fromCharCode(65 + i)}
              </span>
              {option}
            </button>
          );
        })}
      </div>
      {revealed && (
        <div
          style={{
            padding: "14px 20px",
            background: selected === quiz.correctIndex ? "var(--success-subtle)" : "var(--error-subtle)",
            borderTop: "1px solid var(--border)",
            fontSize: "0.9rem",
            color: "var(--text-secondary)",
          }}
        >
          <strong style={{ color: selected === quiz.correctIndex ? "var(--success)" : "var(--error)" }}>
            {selected === quiz.correctIndex ? "✓ Correct!" : "✗ Incorrect."}
          </strong>{" "}
          {quiz.explanation}
        </div>
      )}
    </div>
  );
}

/* ── Main Lesson View ───────────────────────────────── */
export default function LessonView() {
  const params = useParams();
  const router = useRouter();

  const topic = decodeURIComponent(params.topic as string);
  const lessonIdStr = params.lessonId as string;
  const [modIndex, lesIndex] = lessonIdStr.split("-").map(Number);
  const { user } = useAuth();

  const [course, setCourse] = useState<{ modules: { title: string; lessons: { title: string; concept: string }[] }[] } | null>(null);
  const [lessonData, setLessonData] = useState<LessonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Chat */
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isTutorOpen, setIsTutorOpen] = useState(false);
  const chatInitialized = useRef(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const initChat = useCallback((lessonTitle: string) => {
    if (!chatInitialized.current) {
      chatInitialized.current = true;
      setMessages([
        {
          id: "init",
          role: "assistant",
          content: `Hi! I'm your AI Tutor for **${lessonTitle}**. Read through the material on the left, then ask me anything — I'll help you understand it!`,
        },
      ]);
    }
  }, []);

  const fetchLessonData = useCallback(
    async (lesson: { title: string; concept: string }, courseId?: string) => {
      const cacheKey = `lesson_${topic}_${modIndex}_${lesIndex}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setLessonData(JSON.parse(cached));
        setLoading(false);
        initChat(lesson.title);
        return;
      }
      try {
        const token = user ? await user.getIdToken() : null;
        const res = await fetch("/api/generate-lesson", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            topic,
            lessonTitle: lesson.title,
            lessonConcept: lesson.concept,
            courseId: courseId ?? null,
            lessonId: lessonIdStr,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to generate lesson.");
        localStorage.setItem(cacheKey, JSON.stringify(data));
        setLessonData(data);
        initChat(lesson.title);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [topic, modIndex, lesIndex, initChat]
  );

  const searchParams = useSearchParams();
  const courseId = searchParams.get("id");

  useEffect(() => {
    async function loadCourseAndLesson() {
      // 1. Resolve parent course
      let c: any = null;
      if (courseId) {
        try {
          let headers: any = {};
          if (user) {
            const token = await user.getIdToken();
            headers = { Authorization: `Bearer ${token}` };
          }
          const res = await fetch(`/api/courses/${courseId}`, { headers });
          if (res.ok) {
            c = await res.json();
            localStorage.setItem(`course_${topic}`, JSON.stringify(c));
          }
        } catch (e) {
          console.error("Failed to fetch parent course", e);
        }
      }

      if (!c) {
        const saved = localStorage.getItem(`course_${topic}`);
        if (saved) c = JSON.parse(saved);
      }

      if (!c) {
        router.push(`/course/${encodeURIComponent(topic)}`);
        return;
      }

      setCourse(c);

      // 2. Resolve lesson
      const lesson = c.modules[modIndex]?.lessons[lesIndex];
      if (lesson) {
        // First try the new GET endpoint to fetch existing lesson
        if (c.courseId) {
          try {
            const res = await fetch(`/api/courses/${c.courseId}/lessons/${lessonIdStr}`);
            if (res.ok) {
              const data = await res.json();
              localStorage.setItem(`lesson_${topic}_${modIndex}_${lesIndex}`, JSON.stringify(data));
              setLessonData(data);
              setLoading(false);
              initChat(lesson.title);
              return; // Success, skip generation
            }
          } catch(e) {}
        }
        
        // Fallback: Generate it (or fetch from DB via POST if generate-lesson supports it)
        fetchLessonData(lesson, c.courseId);
      } else {
        router.push(`/course/${encodeURIComponent(topic)}`);
      }
    }
    
    loadCourseAndLesson();
  }, [topic, modIndex, lesIndex, courseId, user, router, fetchLessonData, lessonIdStr, initChat]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const onChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !lessonData) return;

    const lesson = course?.modules[modIndex]?.lessons[lesIndex];
    const newMessages: Message[] = [
      ...messages,
      { id: Date.now().toString(), role: "user", content: chatInput },
    ];
    setMessages(newMessages);
    setChatInput("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          data: {
            topic,
            lessonTitle: lesson?.title,
            lessonConcept: lesson?.concept,
            lessonContent: lessonData.content,
          },
        }),
      });

      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: "assistant", content: "" };
        setMessages([...newMessages, assistantMsg]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          assistantMsg.content += decoder.decode(value, { stream: true });
          setMessages([...newMessages, { ...assistantMsg }]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const lesson = course?.modules[modIndex]?.lessons[lesIndex];
  const module = course?.modules[modIndex];

  /* ── Derived lesson nav ─ */
  const allLessons = course?.modules.flatMap((m, mi) =>
    m.lessons.map((l, li) => ({ ...l, id: `${mi}-${li}` }))
  ) ?? [];
  const currentFlat = allLessons.findIndex((l) => l.id === lessonIdStr);
  const prevLesson = currentFlat > 0 ? allLessons[currentFlat - 1] : null;
  const nextLesson = currentFlat < allLessons.length - 1 ? allLessons[currentFlat + 1] : null;

  /* ── Error ── */
  if (error) {
    return (
      <AppShell activeTopic={topic} activeLessonId={lessonIdStr}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", padding: "40px" }}>
          <div style={{ fontSize: "2.5rem" }}>⚠️</div>
          <h2 style={{ color: "var(--error)" }}>Failed to load lesson</h2>
          <p style={{ color: "var(--text-secondary)", maxWidth: "480px", textAlign: "center" }}>{error}</p>
          <button onClick={() => router.push(`/course/${encodeURIComponent(topic)}`)} className="btn-secondary">
            ← Back to Course
          </button>
        </div>
      </AppShell>
    );
  }

  /* ── Loading ── */
  if (loading || !lessonData) {
    return (
      <AppShell activeTopic={topic} activeLessonId={lessonIdStr}>
        <div style={{ flex: 1, padding: "40px 48px", background: "var(--bg-canvas)" }}>
          <div style={{ maxWidth: "720px", margin: "0 auto", animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }}>
            <div style={{ height: "40px", width: "70%", background: "var(--border)", borderRadius: "var(--radius-sm)", marginBottom: "16px" }} />
            <div style={{ height: "20px", width: "40%", background: "var(--border)", borderRadius: "var(--radius-sm)", marginBottom: "40px" }} />
            <div style={{ height: "1px", width: "100%", background: "var(--border)", marginBottom: "40px" }} />
            <div style={{ height: "20px", width: "100%", background: "var(--border)", borderRadius: "var(--radius-sm)", marginBottom: "12px" }} />
            <div style={{ height: "20px", width: "95%", background: "var(--border)", borderRadius: "var(--radius-sm)", marginBottom: "12px" }} />
            <div style={{ height: "20px", width: "90%", background: "var(--border)", borderRadius: "var(--radius-sm)", marginBottom: "12px" }} />
            <div style={{ height: "20px", width: "85%", background: "var(--border)", borderRadius: "var(--radius-sm)", marginBottom: "32px" }} />
            <div style={{ height: "200px", width: "100%", background: "var(--border)", borderRadius: "var(--radius-md)", marginBottom: "32px" }} />
          </div>
          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: .5; }
            }
          `}</style>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell activeTopic={topic} activeLessonId={lessonIdStr}>
      {/* Outer row: reading content + optional tutor panel */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* ── READING COLUMN ──────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          {/* Breadcrumb + Toolbar */}
          <div
            style={{
              background: "var(--bg-content)",
              borderBottom: "1px solid var(--border)",
              padding: "0 32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: "52px",
              flexShrink: 0,
            }}
          >
            <nav className="breadcrumb" style={{ padding: 0, border: "none", background: "none" }}>
              <button
                onClick={() => router.push(`/course/${encodeURIComponent(topic)}`)}
                className="btn-ghost"
                style={{ padding: "4px 8px", fontSize: "0.82rem" }}
              >
                {topic}
              </button>
              <span className="breadcrumb-sep">›</span>
              <span style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>{module?.title}</span>
              <span className="breadcrumb-sep">›</span>
              <span className="breadcrumb-active" style={{ fontSize: "0.82rem" }}>{lesson?.title}</span>
            </nav>
            <button
              onClick={() => setIsTutorOpen((v) => !v)}
              className="btn-secondary"
              style={{ fontSize: "0.82rem", padding: "6px 14px", gap: "6px" }}
            >
              💬 {isTutorOpen ? "Hide Tutor" : "Ask Tutor"}
            </button>
          </div>

          {/* Scrollable reading area */}
          <div style={{ flex: 1, overflowY: "auto", padding: "40px 48px", background: "var(--bg-canvas)" }}>
            <div style={{ maxWidth: "720px", margin: "0 auto" }}>
              {/* Lesson heading */}
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "2.2rem",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  marginBottom: "8px",
                  color: "var(--text-primary)",
                }}
              >
                {lesson?.title}
              </h1>
              <p style={{ color: "var(--text-muted)", marginBottom: "36px", fontSize: "1.05rem" }}>
                {lesson?.concept}
              </p>

              <hr style={{ border: "none", borderTop: "1px solid var(--border)", marginBottom: "36px" }} />

              {/* Reading material */}
              <div className="markdown-content" style={{ marginBottom: "40px" }}>
                <ReactMarkdown>{lessonData.content}</ReactMarkdown>
              </div>

              {/* Diagram */}
              {lessonData.diagram && (
                <>
                  <h3
                    style={{
                      fontFamily: "var(--font-display)",
                      marginBottom: "12px",
                      color: "var(--text-primary)",
                      fontSize: "1.1rem",
                    }}
                  >
                    Concept Visualization
                  </h3>
                  <MermaidDiagram chart={lessonData.diagram} />
                </>
              )}

              {/* Quizzes */}
              {lessonData.quizzes?.length > 0 && (
                <div style={{ marginTop: "48px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      marginBottom: "20px",
                    }}
                  >
                    <div
                      style={{
                        width: "4px",
                        height: "28px",
                        borderRadius: "2px",
                        background: "var(--accent)",
                        flexShrink: 0,
                      }}
                    />
                    <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.3rem", color: "var(--text-primary)" }}>
                      Check Your Understanding
                    </h2>
                  </div>
                  {lessonData.quizzes.map((quiz, idx) => (
                    <InteractiveQuiz key={idx} quiz={quiz} index={idx} />
                  ))}
                </div>
              )}

              {/* Prev / Next navigation */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: "56px",
                  paddingTop: "24px",
                  borderTop: "1px solid var(--border)",
                  gap: "16px",
                }}
              >
                {prevLesson ? (
                  <button
                    onClick={() => router.push(`/course/${encodeURIComponent(topic)}/lesson/${prevLesson.id}`)}
                    className="btn-secondary"
                    style={{ gap: "8px" }}
                  >
                    ← {prevLesson.title}
                  </button>
                ) : (
                  <button
                    onClick={() => router.push(`/course/${encodeURIComponent(topic)}`)}
                    className="btn-secondary"
                  >
                    ← Back to Course
                  </button>
                )}
                {nextLesson && (
                  <button
                    onClick={() => router.push(`/course/${encodeURIComponent(topic)}/lesson/${nextLesson.id}`)}
                    className="btn-primary"
                    style={{ gap: "8px" }}
                  >
                    {nextLesson.title} →
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── AI TUTOR PANEL ──────────────────────────── */}
        {isTutorOpen && (
          <aside className="tutor-panel">
            <div className="tutor-panel-header">
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "var(--success)",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.95rem" }}>AI Tutor</span>
              <button
                onClick={() => setIsTutorOpen(false)}
                className="btn-ghost"
                style={{ marginLeft: "auto", padding: "4px 8px" }}
              >
                ✕
              </button>
            </div>

            {/* Chat messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: msg.role === "assistant" ? "flex-start" : "flex-end",
                    maxWidth: "90%",
                    padding: "10px 14px",
                    borderRadius: msg.role === "assistant" ? "4px 12px 12px 12px" : "12px 4px 12px 12px",
                    background: msg.role === "assistant" ? "var(--bg-surface)" : "var(--accent)",
                    border: msg.role === "assistant" ? "1px solid var(--border)" : "none",
                    color: msg.role === "assistant" ? "var(--text-primary)" : "white",
                    fontSize: "0.875rem",
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {msg.content}
                </div>
              ))}
              <div ref={chatBottomRef} />
            </div>

            {/* Chat input */}
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
              <form onSubmit={onChatSubmit} style={{ display: "flex", gap: "8px" }}>
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onChatSubmit(e as unknown as React.FormEvent); }
                  }}
                  placeholder="Ask about the reading…"
                  rows={2}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    fontSize: "0.875rem",
                    fontFamily: "var(--font-body)",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    color: "var(--text-primary)",
                    outline: "none",
                    resize: "none",
                  }}
                />
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ padding: "8px 14px", alignSelf: "flex-end", fontSize: "0.875rem" }}
                >
                  Send
                </button>
              </form>
            </div>
          </aside>
        )}
      </div>
    </AppShell>
  );
}
