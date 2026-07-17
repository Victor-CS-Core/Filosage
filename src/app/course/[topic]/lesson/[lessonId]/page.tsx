"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Lightbulb,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  NotebookPen,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import ErudozaMark from "@/components/ErudozaMark";
import { useTheme } from "@/components/ThemeProvider";
import type { Course, LessonData, Quiz } from "@/lib/course-types";
import type { Confidence, CourseProgress, ProgressUpdate } from "@/lib/learning-types";
import { getLocalProgress, saveLocalProgress } from "@/lib/learning-progress";
import { useLearnerState } from "@/components/useLearnerState";
import { normalizeLessonMarkdown } from "@/lib/markdown";
import { createClientId, deferClientTask } from "@/lib/browser-compat";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

function MermaidDiagram({ chart, summary }: { chart: string; summary?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    if (!ref.current || !chart) return;
    let cancelled = false;
    const id = `erudoza-diagram-${createClientId()}`;
    void import("mermaid")
      .then(({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          fontFamily: "Inter Variable, Inter, sans-serif",
          themeVariables: {
            fontSize: "16px",
            fontFamily: "Inter Variable, Inter, sans-serif",
            primaryColor: theme === "dark" ? "#12254D" : "#FAFAF7",
            primaryTextColor: theme === "dark" ? "#FAFAF7" : "#0D1B3D",
            primaryBorderColor: theme === "dark" ? "#40527A" : "#B9C3D0",
            secondaryColor: theme === "dark" ? "#163D52" : "#E5F7F4",
            tertiaryColor: theme === "dark" ? "#182C52" : "#EAF3FF",
            lineColor: theme === "dark" ? "#A8B3C7" : "#43506B",
          },
        });
        return mermaid.render(id, chart);
      })
      .then(({ svg }) => {
        if (cancelled || !ref.current) return;

        ref.current.innerHTML = svg;
        const svgElement = ref.current.querySelector("svg");
        if (!svgElement) return;

        let fittedWidth = svgElement.viewBox.baseVal.width;
        let fittedHeight = svgElement.viewBox.baseVal.height;
        const graphRoot = Array.from(svgElement.children).find(
          (child): child is SVGGElement => child.tagName.toLowerCase() === "g",
        );

        if (graphRoot) {
          const bounds = graphRoot.getBBox();
          if (bounds.width > 0 && bounds.height > 0) {
            const padding = Math.max(14, Math.min(bounds.width, bounds.height) * 0.08);
            fittedWidth = bounds.width + padding * 2;
            fittedHeight = bounds.height + padding * 2;
            svgElement.setAttribute(
              "viewBox",
              `${bounds.x - padding} ${bounds.y - padding} ${fittedWidth} ${fittedHeight}`,
            );
          }
        }

        const aspectRatio = fittedHeight > 0 ? fittedWidth / fittedHeight : 1;
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

  return (
    <div>
      <div className="concept-diagram" ref={ref} role="img" aria-label={summary || "Concept diagram"} />
      <details className="diagram-transcript">
        <summary>View diagram as text</summary>
        <p>{summary || chart.split("\n").filter((line) => line.includes("-->")).join("; ") || "The diagram shows the relationships described in this lesson."}</p>
      </details>
    </div>
  );
}

interface QuizResult {
  attempts: number;
  firstAttemptCorrect: boolean;
  confidence: Confidence;
}

function KnowledgeCheck({
  quiz,
  index,
  onMastered,
}: {
  quiz: Quiz;
  index: number;
  onMastered: (index: number, result: QuizResult) => void;
}) {
  const [recall, setRecall] = useState("");
  const [choicesVisible, setChoicesVisible] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [mastered, setMastered] = useState(false);
  const [submittedConfidence, setSubmittedConfidence] = useState<Confidence | null>(null);

  const choose = (optionIndex: number) => {
    if (selected !== null) return;
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    setSelected(optionIndex);
    if (optionIndex === quiz.correctIndex) setMastered(true);
  };

  const reset = () => setSelected(null);

  return (
    <fieldset className="knowledge-check">
      <div className="knowledge-question">
        <span>{String(index + 1).padStart(2, "0")}</span>
        <legend>{quiz.question}</legend>
      </div>
      {!choicesVisible && (
        <div className="free-recall">
          <label htmlFor={`recall-${index}`}>Write what you remember before seeing the choices</label>
          <textarea id={`recall-${index}`} value={recall} onChange={(event) => setRecall(event.target.value)} rows={3} placeholder="A rough answer is enough. This private reflection is only for you." />
          <button className="button button-secondary button-small" type="button" onClick={() => setChoicesVisible(true)}>Compare with choices</button>
        </div>
      )}
      {choicesVisible && <div className="answer-list">
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
      </div>}
      {selected !== null && (
        <div className={`answer-explanation ${selected === quiz.correctIndex ? "is-correct" : "is-incorrect"}`} aria-live="polite">
          <div>
            {selected === quiz.correctIndex ? <CheckCircle2 size={18} /> : <Lightbulb size={18} />}
            <strong>{selected === quiz.correctIndex ? "Exactly right" : "Use this clue"}</strong>
          </div>
          <p>{quiz.explanation}</p>
          {selected !== quiz.correctIndex && <button className="text-button" onClick={reset}><RotateCcw size={14} /> Try again</button>}
          {mastered && (
            <div className="confidence-check" role="group" aria-label="How confident did that answer feel?">
              <span>How confident did that feel?</span>
              {(["low", "medium", "high"] as Confidence[]).map((confidence) => (
                <button key={confidence} type="button" disabled={submittedConfidence !== null} className={submittedConfidence === confidence ? "is-selected" : ""} onClick={() => {
                  setSubmittedConfidence(confidence);
                  onMastered(index, { attempts, firstAttemptCorrect: attempts === 1, confidence });
                }}>
                  {confidence === "low" ? "Unsure" : confidence === "medium" ? "Mostly sure" : "Certain"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </fieldset>
  );
}

export default function LessonView() {
  const params = useParams<{ topic: string; lessonId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const topic = decodeURIComponent(params.topic);
  const lessonId = params.lessonId;
  const courseId = searchParams.get("id");
  const reviewMode = searchParams.get("review") === "1";
  const [moduleIndex, lessonIndex] = lessonId.split("-").map(Number);
  const { user, isPro } = useAuth();
  const {
    state: learnerState,
    update: updateLearnerState,
    ready: learnerStateReady,
    syncStatus: learnerSyncStatus,
    syncError: learnerSyncError,
  } = useLearnerState();
  const [course, setCourse] = useState<Course | null>(null);
  const [lessonData, setLessonData] = useState<LessonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quizResults, setQuizResults] = useState<Record<number, QuizResult>>({});
  const [complete, setComplete] = useState(false);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatting, setChatting] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [progressSyncError, setProgressSyncError] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const noteHydratedRef = useRef(false);
  const noteKey = courseId ? `${courseId}:${lessonId}` : `${topic}:${lessonId}`;
  const lessonBookmarked = learnerState.lessonBookmarks.includes(noteKey);

  useEffect(() => {
    noteHydratedRef.current = false;
  }, [noteKey]);

  useEffect(() => {
    if (!learnerStateReady) return;
    const savedNote = learnerState.notes[noteKey] ?? "";
    deferClientTask(() => {
      setNoteDraft(savedNote);
      noteHydratedRef.current = true;
    });
  }, [learnerState.notes, learnerStateReady, noteKey]);

  useEffect(() => {
    if (!noteHydratedRef.current || noteDraft === (learnerState.notes[noteKey] ?? "")) return;
    const timeout = window.setTimeout(() => {
      const timestamp = new Date().toISOString();
      updateLearnerState((current) => ({
        ...current,
        notes: { ...current.notes, [noteKey]: noteDraft },
        noteUpdatedAt: { ...current.noteUpdatedAt, [noteKey]: timestamp },
      }));
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [learnerState.notes, noteDraft, noteKey, updateLearnerState]);

  const getToken = useCallback(async () => (user ? user.getIdToken() : null), [user]);

  const loadLesson = useCallback(async () => {
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

      if (!isPro || resolvedCourse.authorId !== user?.uid) {
        const data = await lessonResponse.json();
        throw new Error(data.error || "This lesson has not been published yet.");
      }

      const generationResponse = await fetch("/api/generate-lesson", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": createClientId(),
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
  }, [courseId, getToken, moduleIndex, lessonIndex, lessonId, isPro, topic, user]);

  useEffect(() => {
    void Promise.resolve().then(loadLesson);
  }, [loadLesson]);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    const loadProgress = async () => {
      if (user) {
        const token = await user.getIdToken();
        const response = await fetch(`/api/progress?courseId=${encodeURIComponent(courseId)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (response.ok) {
          const data = await response.json() as { progress: CourseProgress | null };
          if (!cancelled) setComplete(!reviewMode && Boolean(data.progress?.completedLessonIds.includes(lessonId)));
          return;
        }
      }
      const local = getLocalProgress(courseId, topic);
      if (!cancelled) setComplete(!reviewMode && Boolean(local?.completedLessonIds.includes(lessonId)));
    };
    void loadProgress().catch(() => {
      if (!cancelled) setComplete(false);
    });
    return () => { cancelled = true; };
  }, [courseId, lessonId, reviewMode, topic, user]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

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
  const normalizedContent = useMemo(
    () => lessonData && lesson ? normalizeLessonMarkdown(lessonData.content, lesson.title) : "",
    [lesson, lessonData],
  );

  const markComplete = useCallback(async () => {
    if (!courseId || complete || !lessonData || !lesson) return;
    const results = Object.values(quizResults);
    if (lessonData.quizzes.length && results.length !== lessonData.quizzes.length) return;
    const confidences = results.map((result) => result.confidence);
    const confidence: Confidence = confidences.includes("low") ? "low" : confidences.includes("medium") ? "medium" : "high";
    const update: ProgressUpdate = {
      courseId,
      topic,
      lessonId,
      lessonTitle: lesson.title,
      totalQuestions: lessonData.quizzes.length,
      firstAttemptCorrect: results.filter((result) => result.firstAttemptCorrect).length,
      attempts: results.reduce((sum, result) => sum + result.attempts, 0),
      confidence,
      review: reviewMode,
      totalLessons: allLessons.length,
      estimatedMinutes: lesson.estimatedMinutes ?? 12,
      nextLessonId: nextLesson?.id ?? null,
      nextLessonTitle: nextLesson?.title ?? null,
    };

    saveLocalProgress(update);
    setProgressSyncError(null);
    if (user) {
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(update),
        });
        if (!response.ok) throw new Error("Saved on this device. Cloud progress will retry when you complete another activity.");
      } catch (saveError) {
        setProgressSyncError(saveError instanceof Error ? saveError.message : "Saved on this device, but cloud sync is pending.");
      }
    }
    setComplete(true);
  }, [allLessons.length, complete, courseId, lesson, lessonData, lessonId, nextLesson, quizResults, reviewMode, topic, user]);

  const onMastered = (index: number, result: QuizResult) => {
    setQuizResults((current) => ({ ...current, [index]: result }));
  };

  useEffect(() => {
    if (!lessonData?.quizzes.length || complete) return;
    if (Object.keys(quizResults).length !== lessonData.quizzes.length) return;
    const timeout = window.setTimeout(() => { void markComplete(); }, 250);
    return () => window.clearTimeout(timeout);
  }, [complete, lessonData, markComplete, quizResults]);

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const input = chatInput.trim();
    if (!input || !lessonData || !lesson || !courseId || !user || chatting) return;
    const nextMessages: Message[] = [...messages, { id: createClientId(), role: "user", content: input }];
    setMessages(nextMessages);
    setChatInput("");
    setChatting(true);
    setChatError(null);

    try {
      const token = await getToken();
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "Idempotency-Key": createClientId() },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
          data: {
            courseId,
            lessonId,
          },
        }),
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "The tutor could not respond.");
      }

      const assistantId = createClientId();
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

  if (loading) {
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
            {isPro && <button className="button button-primary" onClick={loadLesson}>Try again</button>}
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
            <button className={`icon-button lesson-bookmark ${lessonBookmarked ? "is-active" : ""}`} onClick={() => updateLearnerState((current) => ({ ...current, lessonBookmarks: current.lessonBookmarks.includes(noteKey) ? current.lessonBookmarks.filter((item) => item !== noteKey) : [...current.lessonBookmarks, noteKey] }))} aria-label={lessonBookmarked ? "Remove lesson bookmark" : "Bookmark lesson"} aria-pressed={lessonBookmarked}>
              <Bookmark size={17} fill={lessonBookmarked ? "currentColor" : "none"} />
            </button>
            {user ? (
              <button className={`button button-secondary button-small ${tutorOpen ? "is-active" : ""}`} onClick={() => setTutorOpen((open) => !open)}>
                <MessageSquareText size={16} /> {tutorOpen ? "Close tutor" : "Ask tutor"}
              </button>
            ) : (
              <span className="owner-only-note"><LockKeyhole size={14} /> Sign in for lesson help</span>
            )}
          </div>
        </header>

        <div className="lesson-workspace">
          <article className="lesson-scroll">
            <div className="reading-column">
              <div className="lesson-progress-top" role="progressbar" aria-label="Course progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={lessonProgress}><span style={{ transform: `scaleX(${lessonProgress / 100})` }} /></div>
              <header className="lesson-title-block">
                <p className="overline">{currentModule?.title}</p>
                <h1>{lesson.title}</h1>
                <p>{lesson.concept}</p>
              </header>

              <div className="markdown-content"><ReactMarkdown>{normalizedContent}</ReactMarkdown></div>

              {lessonData.diagram && (
                <section className="lesson-section" aria-labelledby="model-title">
                  <div className="lesson-section-heading"><p className="overline">Mental model</p><h2 id="model-title">See the relationships</h2></div>
                  <MermaidDiagram chart={lessonData.diagram} summary={lessonData.diagramSummary} />
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
                      <KnowledgeCheck key={`${quiz.question}-${index}`} quiz={quiz} index={index} onMastered={onMastered} />
                    ))}
                  </div>
                </section>
              )}

              <div className={`completion-banner ${complete ? "is-complete" : ""}`}>
                <div>{complete ? <CheckCircle2 size={22} /> : <CircleAlert size={22} />}</div>
                <span>
                  <strong>{complete ? (reviewMode ? "Review complete" : "Lesson learned") : "Demonstrate understanding"}</strong>
                  <small>{complete ? (progressSyncError || (user ? "Progress synced. Your next review has been scheduled." : "Progress saved on this device. Sign in to sync it.")) : "Answer every prompt correctly and rate your confidence."}</small>
                </span>
                {!complete && lessonData.quizzes.length === 0 && (
                  <button className="button button-secondary button-small" onClick={() => void markComplete()}>Mark learned</button>
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

          {!tutorOpen && (
            <aside className="lesson-study-panel" aria-label="Lesson study tools">
              <div className="study-panel-heading"><NotebookPen size={18} /><div><strong>Study workspace</strong><small>{user ? "Synced with your account" : "Saved on this device"}</small></div></div>
              <section className="lesson-note-section">
                <label htmlFor="lesson-note">Your notes</label>
                <textarea id="lesson-note" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} maxLength={12_000} rows={9} placeholder="Capture the idea in your own words…" />
                <span>{noteDraft.length.toLocaleString()}/12,000 · <span role={learnerSyncStatus === "error" ? "alert" : "status"}>{learnerSyncStatus === "saving" ? "Saving…" : learnerSyncStatus === "error" ? learnerSyncError : learnerSyncStatus === "saved" ? "Saved" : user ? "Synced" : "On this device"}</span></span>
              </section>
              <section className="study-key-point"><span><Lightbulb size={17} /></span><div><strong>Core idea</strong><p>{lesson.concept}</p></div></section>
              <section className="mastery-checklist"><strong>To master this lesson</strong><ul><li className="is-done"><Check size={15} /> Read the explanation</li><li className={lessonData.diagram ? "is-done" : ""}><Check size={15} /> Inspect the mental model</li><li className={complete ? "is-done" : ""}><Check size={15} /> Complete retrieval practice</li></ul></section>
            </aside>
          )}

          {user && tutorOpen && (
            <aside className="tutor-drawer" aria-label="AI tutor">
              <div className="tutor-header">
                <span className="tutor-avatar"><ErudozaMark /></span>
                <div><strong>Erudoza Tutor</strong><small>Grounded in this lesson</small></div>
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
