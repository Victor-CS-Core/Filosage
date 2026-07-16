"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import mermaid from "mermaid";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Lightbulb,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/components/ThemeProvider";
import type { Course, LessonData, Quiz } from "@/lib/course-types";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

function MermaidDiagram({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!ref.current || !chart) return;
    let cancelled = false;
    const id = `teach-diagram-${crypto.randomUUID()}`;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: theme === "dark" ? "dark" : "neutral",
      fontFamily: "var(--font-body)",
    });
    mermaid
      .render(id, chart)
      .then(({ svg }) => {
        if (cancelled || !ref.current) return;

        ref.current.innerHTML = svg;
        const svgElement = ref.current.querySelector("svg");
        if (!svgElement) return;

        const viewBox = svgElement.viewBox.baseVal;
        const aspectRatio = viewBox.height > 0 ? viewBox.width / viewBox.height : 1;
        ref.current.dataset.orientation =
          aspectRatio < 0.8
            ? "portrait"
            : aspectRatio > 1.55
              ? "landscape"
              : "balanced";

        svgElement.removeAttribute("width");
        svgElement.removeAttribute("height");
        svgElement.style.removeProperty("max-width");
        svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");
        svgElement.setAttribute("aria-hidden", "true");
      })
      .catch(() => {
        if (!cancelled && ref.current) {
          delete ref.current.dataset.orientation;
          ref.current.innerHTML = "<p>Visualization unavailable for this lesson.</p>";
        }
      });
    return () => {
      cancelled = true;
    };
  }, [chart, theme]);

  return <div className="concept-diagram" ref={ref} role="img" aria-label="Concept diagram" />;
}

function KnowledgeCheck({
  quiz,
  index,
  onAnswered,
}: {
  quiz: Quiz;
  index: number;
  onAnswered: (index: number) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  const choose = (optionIndex: number) => {
    if (selected !== null) return;
    setSelected(optionIndex);
    onAnswered(index);
  };

  const reset = () => setSelected(null);

  return (
    <article className="knowledge-check">
      <div className="knowledge-question">
        <span>{String(index + 1).padStart(2, "0")}</span>
        <h3>{quiz.question}</h3>
      </div>
      <div className="answer-list">
        {quiz.options.map((option, optionIndex) => {
          const revealed = selected !== null;
          const correct = revealed && optionIndex === quiz.correctIndex;
          const incorrect = revealed && optionIndex === selected && optionIndex !== quiz.correctIndex;
          return (
            <button
              key={`${option}-${optionIndex}`}
              className={`answer-option ${correct ? "is-correct" : ""} ${incorrect ? "is-incorrect" : ""}`}
              onClick={() => choose(optionIndex)}
              disabled={revealed}
            >
              <span>{String.fromCharCode(65 + optionIndex)}</span>
              <strong>{option}</strong>
              {correct && <Check size={17} />}
              {incorrect && <X size={17} />}
            </button>
          );
        })}
      </div>
      {selected !== null && (
        <div className={`answer-explanation ${selected === quiz.correctIndex ? "is-correct" : "is-incorrect"}`} role="status">
          <div>
            {selected === quiz.correctIndex ? <CheckCircle2 size={18} /> : <Lightbulb size={18} />}
            <strong>{selected === quiz.correctIndex ? "Exactly right" : "Use this clue"}</strong>
          </div>
          <p>{quiz.explanation}</p>
          {selected !== quiz.correctIndex && <button className="text-button" onClick={reset}><RotateCcw size={14} /> Try again</button>}
        </div>
      )}
    </article>
  );
}

export default function LessonView() {
  const params = useParams<{ topic: string; lessonId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const topic = decodeURIComponent(params.topic);
  const lessonId = params.lessonId;
  const courseId = searchParams.get("id");
  const [moduleIndex, lessonIndex] = lessonId.split("-").map(Number);
  const { user, isOwner, loading: authLoading } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [lessonData, setLessonData] = useState<LessonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answered, setAnswered] = useState<number[]>([]);
  const [complete, setComplete] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatting, setChatting] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const getToken = useCallback(async () => (user ? user.getIdToken() : null), [user]);

  const loadLesson = useCallback(async () => {
    if (authLoading) return;
    if (!courseId) {
      setError("This lesson link is missing its course reference.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const courseResponse = await fetch(`/api/courses/${courseId}`, { headers });
      const courseData = await courseResponse.json();
      if (!courseResponse.ok) throw new Error(courseData.error || "The course could not be opened.");

      const resolvedCourse = { ...courseData, id: courseId, courseId } as Course;
      const lesson = resolvedCourse.modules[moduleIndex]?.lessons[lessonIndex];
      if (!lesson) throw new Error("This lesson is not part of the course.");
      setCourse(resolvedCourse);

      const lessonResponse = await fetch(`/api/courses/${courseId}/lessons/${lessonId}`, { headers });
      if (lessonResponse.ok) {
        setLessonData(await lessonResponse.json());
        return;
      }

      if (!isOwner) {
        const data = await lessonResponse.json();
        throw new Error(data.error || "This lesson has not been published yet.");
      }

      const generationResponse = await fetch("/api/generate-lesson", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          topic,
          lessonTitle: lesson.title,
          lessonConcept: lesson.concept,
          courseId,
          lessonId,
        }),
      });
      const generated = await generationResponse.json();
      if (!generationResponse.ok) throw new Error(generated.error || "The lesson could not be generated.");
      setLessonData(generated);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The lesson could not be opened.");
    } finally {
      setLoading(false);
    }
  }, [authLoading, courseId, getToken, moduleIndex, lessonIndex, lessonId, isOwner, topic]);

  useEffect(() => {
    void Promise.resolve().then(loadLesson);
  }, [loadLesson]);

  useEffect(() => {
    if (!courseId) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`teach-progress:${courseId}`) || "[]") as string[];
      queueMicrotask(() => setComplete(saved.includes(lessonId)));
    } catch {
      queueMicrotask(() => setComplete(false));
    }
  }, [courseId, lessonId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  const markComplete = useCallback(() => {
    if (!courseId || complete) return;
    try {
      const key = `teach-progress:${courseId}`;
      const saved = JSON.parse(localStorage.getItem(key) || "[]") as string[];
      const next = Array.from(new Set([...saved, lessonId]));
      localStorage.setItem(key, JSON.stringify(next));
      setComplete(true);
    } catch {
      setComplete(true);
    }
  }, [complete, courseId, lessonId]);

  const onAnswered = (index: number) => {
    setAnswered((current) => {
      const next = Array.from(new Set([...current, index]));
      if (lessonData && next.length === lessonData.quizzes.length) {
        window.setTimeout(markComplete, 250);
      }
      return next;
    });
  };

  const lesson = course?.modules[moduleIndex]?.lessons[lessonIndex];
  const currentModule = course?.modules[moduleIndex];
  const allLessons = useMemo(
    () => course?.modules.flatMap((courseModule, currentModuleIndex) =>
      courseModule.lessons.map((item, currentLessonIndex) => ({
        ...item,
        id: `${currentModuleIndex}-${currentLessonIndex}`,
      })),
    ) ?? [],
    [course],
  );
  const currentPosition = allLessons.findIndex((item) => item.id === lessonId);
  const previousLesson = currentPosition > 0 ? allLessons[currentPosition - 1] : null;
  const nextLesson = currentPosition >= 0 && currentPosition < allLessons.length - 1 ? allLessons[currentPosition + 1] : null;
  const lessonProgress = allLessons.length ? Math.round(((currentPosition + (complete ? 1 : 0)) / allLessons.length) * 100) : 0;

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const input = chatInput.trim();
    if (!input || !lessonData || !lesson || !isOwner || chatting) return;
    const nextMessages: Message[] = [...messages, { id: crypto.randomUUID(), role: "user", content: input }];
    setMessages(nextMessages);
    setChatInput("");
    setChatting(true);
    setChatError(null);

    try {
      const token = await getToken();
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
          data: {
            topic,
            lessonTitle: lesson.title,
            lessonConcept: lesson.concept,
            lessonContent: lessonData.content,
          },
        }),
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "The tutor could not respond.");
      }

      const assistantId = crypto.randomUUID();
      let content = "";
      setMessages([...nextMessages, { id: assistantId, role: "assistant", content }]);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        content += decoder.decode(value, { stream: true });
        setMessages([...nextMessages, { id: assistantId, role: "assistant", content }]);
      }
    } catch (sendError) {
      setChatError(sendError instanceof Error ? sendError.message : "The tutor could not respond.");
    } finally {
      setChatting(false);
    }
  };

  const lessonHref = (id: string) => `/course/${encodeURIComponent(topic)}/lesson/${id}${courseId ? `?id=${courseId}` : ""}`;

  if (loading || authLoading) {
    return (
      <AppShell activeTopic={topic} activeLessonId={lessonId} activeCourseId={courseId}>
        <div className="lesson-loading">
          <div className="lesson-loading-bar" />
          <div className="lesson-skeleton"><span /><span /><span /><span /><span /></div>
        </div>
      </AppShell>
    );
  }

  if (error || !course || !lessonData || !lesson) {
    return (
      <AppShell activeTopic={topic} activeLessonId={lessonId} activeCourseId={courseId}>
        <div className="center-state error-state">
          <span className="state-icon"><CircleAlert size={23} /></span>
          <p className="overline">Lesson unavailable</p>
          <h1>This concept isn’t ready to open</h1>
          <p>{error || "The lesson could not be found."}</p>
          <div className="state-actions">
            <button className="button button-secondary" onClick={() => router.push(`/course/${encodeURIComponent(topic)}${courseId ? `?id=${courseId}` : ""}`)}><ArrowLeft size={16} /> Back to course</button>
            {isOwner && <button className="button button-primary" onClick={loadLesson}>Try again</button>}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell activeTopic={topic} activeLessonId={lessonId} activeCourseId={courseId}>
      <div className="lesson-page">
        <header className="lesson-toolbar">
          <nav aria-label="Breadcrumb">
            <button onClick={() => router.push(`/course/${encodeURIComponent(topic)}?id=${courseId}`)}>{topic}</button>
            <ChevronRight size={14} />
            <span>{currentModule?.title}</span>
          </nav>
          <div className="lesson-toolbar-actions">
            <span>{currentPosition + 1} of {allLessons.length}</span>
            {isOwner ? (
              <button className={`button button-secondary button-small ${tutorOpen ? "is-active" : ""}`} onClick={() => setTutorOpen((open) => !open)}>
                <MessageSquareText size={16} /> {tutorOpen ? "Close tutor" : "Ask tutor"}
              </button>
            ) : (
              <span className="owner-only-note"><LockKeyhole size={14} /> AI tutor is owner-only</span>
            )}
          </div>
        </header>

        <div className="lesson-workspace">
          <article className="lesson-scroll">
            <div className="reading-column">
              <div className="lesson-progress-top"><span style={{ transform: `scaleX(${lessonProgress / 100})` }} /></div>
              <header className="lesson-title-block">
                <p className="overline">{currentModule?.title}</p>
                <h1>{lesson.title}</h1>
                <p>{lesson.concept}</p>
              </header>

              <div className="markdown-content"><ReactMarkdown>{lessonData.content}</ReactMarkdown></div>

              {lessonData.diagram && (
                <section className="lesson-section" aria-labelledby="model-title">
                  <div className="lesson-section-heading"><p className="overline">Mental model</p><h2 id="model-title">See the relationships</h2></div>
                  <MermaidDiagram chart={lessonData.diagram} />
                </section>
              )}

              {lessonData.quizzes.length > 0 && (
                <section className="lesson-section checks-section" aria-labelledby="checks-title">
                  <div className="lesson-section-heading">
                    <p className="overline">Retrieval practice</p>
                    <h2 id="checks-title">Check your understanding</h2>
                    <p>Answer from memory. Feedback appears after each choice.</p>
                  </div>
                  <div className="knowledge-list">
                    {lessonData.quizzes.map((quiz, index) => (
                      <KnowledgeCheck key={`${quiz.question}-${index}`} quiz={quiz} index={index} onAnswered={onAnswered} />
                    ))}
                  </div>
                </section>
              )}

              <div className={`completion-banner ${complete ? "is-complete" : ""}`}>
                <div>{complete ? <CheckCircle2 size={22} /> : <CircleAlert size={22} />}</div>
                <span>
                  <strong>{complete ? "Lesson complete" : "Finish the knowledge checks"}</strong>
                  <small>{complete ? "Your progress is saved on this device." : "Complete each prompt to record this lesson."}</small>
                </span>
                {!complete && answered.length === lessonData.quizzes.length && (
                  <button className="button button-secondary button-small" onClick={markComplete}>Mark complete</button>
                )}
              </div>

              <nav className="lesson-navigation" aria-label="Lesson navigation">
                {previousLesson ? (
                  <button className="lesson-nav-link lesson-nav-previous" onClick={() => router.push(lessonHref(previousLesson.id))}>
                    <ArrowLeft size={17} /><span><small>Previous</small><strong>{previousLesson.title}</strong></span>
                  </button>
                ) : (
                  <button className="lesson-nav-link lesson-nav-previous" onClick={() => router.push(`/course/${encodeURIComponent(topic)}?id=${courseId}`)}>
                    <ArrowLeft size={17} /><span><small>Return to</small><strong>Course overview</strong></span>
                  </button>
                )}
                {nextLesson && (
                  <button className="lesson-nav-link lesson-nav-next" onClick={() => router.push(lessonHref(nextLesson.id))}>
                    <span><small>Next lesson</small><strong>{nextLesson.title}</strong></span><ArrowRight size={17} />
                  </button>
                )}
              </nav>
            </div>
          </article>

          {isOwner && tutorOpen && (
            <aside className="tutor-drawer" aria-label="AI tutor">
              <div className="tutor-header">
                <span className="tutor-avatar"><Bot size={19} /></span>
                <div><strong>Teach Tutor</strong><small>Grounded in this lesson</small></div>
                <button className="icon-button" onClick={() => setTutorOpen(false)} aria-label="Close tutor"><X size={18} /></button>
              </div>
              <div className="tutor-messages" aria-live="polite">
                {messages.length === 0 && (
                  <div className="tutor-message tutor-assistant">
                    <span><Bot size={14} /></span>
                    <div><p>I’m ready to help you reason through <strong>{lesson.title}</strong>. Ask about an idea, example, or quiz choice.</p></div>
                  </div>
                )}
                {messages.map((message) => (
                  <div className={`tutor-message tutor-${message.role}`} key={message.id}>
                    {message.role === "assistant" && <span><Bot size={14} /></span>}
                    <div><ReactMarkdown>{message.content || "…"}</ReactMarkdown></div>
                  </div>
                ))}
                {chatError && <p className="form-error"><CircleAlert size={15} /> {chatError}</p>}
                <div ref={chatBottomRef} />
              </div>
              <form className="tutor-composer" onSubmit={sendMessage}>
                <label htmlFor="tutor-input">Ask about this lesson</label>
                <textarea
                  id="tutor-input"
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="What would you like to reason through?"
                  rows={3}
                  maxLength={4_000}
                />
                <button className="icon-button icon-button-accent" type="submit" disabled={!chatInput.trim() || chatting} aria-label="Send question">
                  {chatting ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
                </button>
              </form>
            </aside>
          )}
        </div>
      </div>
    </AppShell>
  );
}
