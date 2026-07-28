"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  Target,
  Waypoints,
  X,
} from "lucide-react";
import AppDrawer, { useAppDrawer } from "@/components/AppDrawer";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { trackProductEvent } from "@/lib/product-analytics";
import ErudozaMark from "@/components/ErudozaMark";
import type { Course, LessonData, Quiz } from "@/lib/course-types";
import type { Confidence, CourseProgress, ProgressUpdate } from "@/lib/learning-types";
import { getLocalProgress, saveLocalProgress } from "@/lib/learning-progress";
import { useLearnerState } from "@/components/useLearnerState";
import SpeakButton from "@/components/SpeakButton";
import LessonVisualRenderer from "@/components/LessonVisual";
import { markdownToSpeech, normalizeLessonMarkdown } from "@/lib/markdown";
import { curateLessonVisuals, visualsToSpeech } from "@/lib/lesson-visuals";
import { createClientId, deferClientTask } from "@/lib/browser-compat";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const LESSON_GENERATION_STAGES = [
  "Structuring the lesson",
  "Building the core explanation",
  "Creating examples and retrieval practice",
  "Reviewing clarity and accuracy",
] as const;

function randomIndex(maximum: number) {
  if (maximum <= 1) return 0;
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % maximum;
}

function randomizeQuizAnswers(lesson: LessonData): LessonData {
  const widestQuiz = Math.max(0, ...lesson.quizzes.map((quiz) => quiz.options.length));
  const rotation = randomIndex(widestQuiz);

  return {
    ...lesson,
    quizzes: lesson.quizzes.map((quiz, quizIndex) => {
      if (quiz.options.length < 2 || !quiz.options[quiz.correctIndex]) return quiz;
      const choices = quiz.options.map((option, optionIndex) => ({
        option,
        feedback: quiz.optionFeedback?.[optionIndex],
      }));
      const correctChoice = choices[quiz.correctIndex];
      const distractors = choices.filter((_, optionIndex) => optionIndex !== quiz.correctIndex);
      for (let index = distractors.length - 1; index > 0; index -= 1) {
        const swapIndex = randomIndex(index + 1);
        [distractors[index], distractors[swapIndex]] = [distractors[swapIndex], distractors[index]];
      }
      const correctIndex = (rotation + quizIndex) % quiz.options.length;
      const randomized = [...distractors];
      randomized.splice(correctIndex, 0, correctChoice);
      return {
        ...quiz,
        options: randomized.map((choice) => choice.option),
        optionFeedback: quiz.optionFeedback
          ? randomized.map((choice) => choice.feedback ?? quiz.explanation)
          : undefined,
        correctIndex,
      };
    }),
  };
}

interface QuizResult {
  attempts: number;
  firstAttemptCorrect: boolean;
  confidence: Confidence;
}

function KnowledgeCheck({
  quiz,
  index,
  total,
  onMastered,
  onContinue,
}: {
  quiz: Quiz;
  index: number;
  total: number;
  onMastered: (index: number, result: QuizResult) => void;
  onContinue?: () => void;
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
    <fieldset className={`knowledge-check ${submittedConfidence ? "is-complete" : ""}`}>
      <legend className="sr-only">Practice {index + 1}: {quiz.question}</legend>
      <div className="activity-meta">
        <span>Practice {index + 1} of {total}</span>
        <span aria-live="polite">{submittedConfidence ? "Complete" : choicesVisible ? "Choose an answer" : "Recall first"}</span>
      </div>
      <div className="knowledge-question">
        <span aria-hidden="true">{index + 1}</span>
        <h3>{quiz.question}</h3>
      </div>
      {!choicesVisible && (
        <div className="free-recall">
          <div className="free-recall-heading">
            <label htmlFor={`recall-${index}`}>Start from memory</label>
            <small>Write a few words before revealing the choices. This reflection stays private.</small>
          </div>
          <textarea id={`recall-${index}`} value={recall} onChange={(event) => setRecall(event.target.value)} rows={2} placeholder="Capture the key idea in your own words…" />
          <button className="button button-secondary button-small" type="button" onClick={() => setChoicesVisible(true)}>Reveal answer choices <ChevronRight size={15} /></button>
        </div>
      )}
      {choicesVisible && recall.trim() && (
        <div className="recall-summary">
          <span>Your recall</span>
          <p>{recall}</p>
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
              type="button"
              aria-pressed={selected === optionIndex}
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
            <strong>{selected === quiz.correctIndex ? "Correct" : "Not quite"}</strong>
          </div>
          <p>{quiz.optionFeedback?.[selected] ?? quiz.explanation}</p>
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
          {submittedConfidence && onContinue && (
            <button className="button button-primary button-small practice-continue" type="button" onClick={onContinue}>
              Continue to practice {index + 2} <ArrowRight size={15} />
            </button>
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
  const { user, isOwner, isPro } = useAuth();
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [quizResultState, setQuizResultState] = useState<{ key: string; results: Record<number, QuizResult> }>({ key: "", results: {} });
  const [completionState, setCompletionState] = useState<{ key: string; complete: boolean }>({ key: "", complete: false });
  const [transferState, setTransferState] = useState<{ key: string; response: string; revealed: boolean }>({
    key: "",
    response: "",
    revealed: false,
  });
  const tutorDrawer = useAppDrawer("lesson-tutor");
  const studyToolsDrawer = useAppDrawer("lesson-study-tools");
  const tutorOpen = tutorDrawer.open;
  const studyToolsOpen = studyToolsDrawer.open;
  const [activePracticeState, setActivePracticeState] = useState<{ key: string; index: number }>({ key: "", index: 0 });
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatting, setChatting] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [progressSyncError, setProgressSyncError] = useState<string | null>(null);
  const [reviewScheduleState, setReviewScheduleState] = useState<{ key: string; at: string | null }>({ key: "", at: null });
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const noteHydratedRef = useRef(false);
  const generationStartedAtRef = useRef(0);
  const generationRequestRef = useRef<{ lessonKey: string; requestId: string } | null>(null);
  const noteKey = courseId ? `${courseId}:${lessonId}` : `${topic}:${lessonId}`;
  const quizResults = useMemo(
    () => quizResultState.key === noteKey ? quizResultState.results : {},
    [noteKey, quizResultState],
  );
  const complete = completionState.key === noteKey && completionState.complete;
  const transferResponse = transferState.key === noteKey ? transferState.response : "";
  const transferRevealed = transferState.key === noteKey && transferState.revealed;
  const transferComplete = !lessonData?.transferTask || (transferRevealed && Boolean(transferResponse.trim()));
  const lessonBookmarked = learnerState.lessonBookmarks.includes(noteKey);
  const activePracticeIndex = activePracticeState.key === noteKey ? activePracticeState.index : 0;
  const reviewScheduledAt = reviewScheduleState.key === noteKey ? reviewScheduleState.at : null;

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

  useEffect(() => {
    if (!isGenerating) return;

    const updateEstimatedProgress = () => {
      const elapsedSeconds = Math.max(0, (Date.now() - generationStartedAtRef.current) / 1000);
      let nextProgress: number;
      if (elapsedSeconds <= 6) {
        nextProgress = 8 + (elapsedSeconds / 6) * 22;
      } else if (elapsedSeconds <= 18) {
        nextProgress = 30 + ((elapsedSeconds - 6) / 12) * 26;
      } else if (elapsedSeconds <= 36) {
        nextProgress = 56 + ((elapsedSeconds - 18) / 18) * 22;
      } else {
        nextProgress = 78 + Math.min(((elapsedSeconds - 36) / 60) * 14, 14);
      }
      setGenerationProgress((current) => Math.max(current, Math.round(nextProgress)));
    };

    updateEstimatedProgress();
    const interval = window.setInterval(updateEstimatedProgress, 700);
    return () => window.clearInterval(interval);
  }, [isGenerating]);

  const loadLesson = useCallback(async () => {
    if (!courseId) {
      setError("This lesson link is missing its course reference.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessages([]);
    setChatInput("");
    setChatError(null);
    setProgressSyncError(null);
    setIsGenerating(false);
    setGenerationProgress(0);
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
        setLessonData(randomizeQuizAnswers(await lessonResponse.json() as LessonData));
        return;
      }

      if (!isPro || !resolvedCourse.canManage) {
        const data = await lessonResponse.json();
        throw new Error(data.error || "This lesson has not been published yet.");
      }

      generationStartedAtRef.current = Date.now();
      setGenerationProgress(8);
      setIsGenerating(true);
      const generationKey = `${courseId}:${lessonId}`;
      if (generationRequestRef.current?.lessonKey !== generationKey) {
        generationRequestRef.current = { lessonKey: generationKey, requestId: createClientId() };
      }
      const generationResponse = await fetch("/api/generate-lesson", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": generationRequestRef.current.requestId,
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
      setGenerationProgress(100);
      setLessonData(randomizeQuizAnswers(generated as LessonData));
      generationRequestRef.current = null;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The lesson could not be opened.");
    } finally {
      setIsGenerating(false);
      setLoading(false);
    }
  }, [courseId, getToken, moduleIndex, lessonIndex, lessonId, isPro, topic]);

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
          if (!cancelled) {
            setCompletionState({ key: noteKey, complete: !reviewMode && Boolean(data.progress?.completedLessonIds.includes(lessonId)) });
            setReviewScheduleState({ key: noteKey, at: data.progress?.lessons[lessonId]?.nextReviewAt ?? null });
          }
          return;
        }
      }
      const local = getLocalProgress(courseId, topic);
      if (!cancelled) {
        setCompletionState({ key: noteKey, complete: !reviewMode && Boolean(local?.completedLessonIds.includes(lessonId)) });
        setReviewScheduleState({ key: noteKey, at: local?.lessons[lessonId]?.nextReviewAt ?? null });
      }
    };
    void loadProgress().catch(() => {
      if (!cancelled) setCompletionState({ key: noteKey, complete: false });
    });
    return () => { cancelled = true; };
  }, [courseId, lessonId, noteKey, reviewMode, topic, user]);

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
  const generationStageIndex = generationProgress < 30 ? 0 : generationProgress < 56 ? 1 : generationProgress < 78 ? 2 : 3;
  const normalizedContent = useMemo(
    () => lessonData && lesson ? normalizeLessonMarkdown(lessonData.content, lesson.title) : "",
    [lesson, lessonData],
  );
  const lessonVisuals = useMemo(
    () => curateLessonVisuals(lessonData?.visuals),
    [lessonData?.visuals],
  );
  const lessonSpeechText = useMemo(() => {
    if (!lesson) return "";
    const at = (placement: "after-purpose" | "after-explanation" | "before-guided-practice") =>
      visualsToSpeech(lessonVisuals.filter((visual) => visual.placement === placement));
    return [
      `${lesson.title}.`,
      at("after-purpose"),
      markdownToSpeech(normalizedContent),
      at("after-explanation"),
      at("before-guided-practice"),
    ].filter(Boolean).join(" ");
  }, [lesson, lessonVisuals, normalizedContent]);

  useEffect(() => {
    if (!courseId || !lessonData || !lesson || isOwner) return;
    trackProductEvent("lesson_started", {
      route: "/lesson",
      courseId,
      lessonId,
      oncePerSession: true,
    });
  }, [courseId, isOwner, lesson, lessonData, lessonId]);

  const markComplete = useCallback(async () => {
    if (!courseId || complete || !lessonData || !lesson || !transferComplete) return;
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
      misconception: lesson.misconception,
    };

    const localProgress = saveLocalProgress(update);
    setReviewScheduleState({ key: noteKey, at: localProgress.lessons[lessonId]?.nextReviewAt ?? null });
    setProgressSyncError(null);
    if (user) {
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(update),
        });
        const data = await response.json().catch(() => ({})) as { nextReviewAt?: string };
        if (!response.ok) throw new Error("Saved on this device. Cloud progress will retry when you complete another activity.");
        if (data.nextReviewAt) setReviewScheduleState({ key: noteKey, at: data.nextReviewAt });
      } catch (saveError) {
        setProgressSyncError(saveError instanceof Error ? saveError.message : "Saved on this device, but cloud sync is pending.");
      }
    }
    setCompletionState({ key: noteKey, complete: true });
    trackProductEvent("lesson_completed", {
      route: "/lesson",
      courseId,
      lessonId,
      exclude: isOwner,
      oncePerSession: true,
    });
    if (!reviewMode) {
      trackProductEvent("first_practice_completed", {
        route: "/lesson",
        courseId,
        lessonId,
        exclude: isOwner,
        oncePerSession: true,
      });
    }
  }, [allLessons.length, complete, courseId, isOwner, lesson, lessonData, lessonId, nextLesson, noteKey, quizResults, reviewMode, topic, transferComplete, user]);

  const onMastered = (index: number, result: QuizResult) => {
    setQuizResultState((current) => ({ key: noteKey, results: { ...(current.key === noteKey ? current.results : {}), [index]: result } }));
  };

  const advancePractice = () => {
    if (!lessonData) return;
    setActivePracticeState({
      key: noteKey,
      index: Math.min(activePracticeIndex + 1, lessonData.quizzes.length - 1),
    });
  };

  useEffect(() => {
    if (!lessonData?.quizzes.length || complete) return;
    if (Object.keys(quizResults).length !== lessonData.quizzes.length) return;
    if (!transferComplete) return;
    const timeout = window.setTimeout(() => { void markComplete(); }, 250);
    return () => window.clearTimeout(timeout);
  }, [complete, lessonData, markComplete, quizResults, transferComplete]);

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
          messages: nextMessages.slice(-11).map(({ role, content }) => ({ role, content })),
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
      const visibleMessages = nextMessages.slice(-23);
      setMessages([...visibleMessages, { id: assistantId, role: "assistant", content }]);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        content += decoder.decode(value, { stream: true });
        setMessages([...visibleMessages, { id: assistantId, role: "assistant", content }]);
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
          {isGenerating ? (
            <section className="lesson-generation-status" aria-labelledby="lesson-generation-title">
              <div className="lesson-generation-brand">
                <span className="brand-mark" aria-hidden="true"><ErudozaMark /></span>
                <span>Preparing your next lesson</span>
              </div>
              <h1 id="lesson-generation-title">{lesson?.title ?? "Creating your lesson"}</h1>
              <p className="lesson-generation-stage" aria-live="polite">
                {LESSON_GENERATION_STAGES[generationStageIndex]}
              </p>
              <div className="lesson-generation-progress">
                <div>
                  <span>Estimated progress</span>
                  <strong>{generationProgress}%</strong>
                </div>
                <div
                  className="lesson-generation-track"
                  role="progressbar"
                  aria-label="Lesson generation progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={generationProgress}
                >
                  <span style={{ transform: `scaleX(${generationProgress / 100})` }} />
                </div>
              </div>
              <ol className="lesson-generation-steps" aria-label="Lesson preparation stages">
                {LESSON_GENERATION_STAGES.map((stage, index) => (
                  <li
                    key={stage}
                    className={index < generationStageIndex ? "is-complete" : index === generationStageIndex ? "is-current" : ""}
                  >
                    <span aria-hidden="true">{index < generationStageIndex ? <Check size={13} /> : index + 1}</span>
                    <small>{stage}</small>
                  </li>
                ))}
              </ol>
              <p className="lesson-generation-note">This usually takes less than a minute. Keep this page open while Erudoza prepares the explanation, examples, and practice.</p>
            </section>
          ) : (
            <>
              <div className="lesson-loading-bar" />
              <div className="lesson-skeleton" aria-label="Opening lesson"><span /><span /><span /><span /><span /></div>
            </>
          )}
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
            {lessonData && lesson && (
              <SpeakButton
                label="Read this lesson aloud"
                text={lessonSpeechText}
              />
            )}
            <button className={`icon-button lesson-bookmark ${lessonBookmarked ? "is-active" : ""}`} onClick={() => updateLearnerState((current) => ({ ...current, lessonBookmarks: current.lessonBookmarks.includes(noteKey) ? current.lessonBookmarks.filter((item) => item !== noteKey) : [...current.lessonBookmarks, noteKey] }))} aria-label={lessonBookmarked ? "Remove lesson bookmark" : "Bookmark lesson"} aria-pressed={lessonBookmarked}>
              <Bookmark size={17} fill={lessonBookmarked ? "currentColor" : "none"} />
            </button>
            <button
              className={`button button-secondary button-small study-tools-toggle ${studyToolsOpen ? "is-active" : ""}`}
              type="button"
              aria-expanded={studyToolsOpen}
              aria-controls="lesson-study-panel"
              onClick={studyToolsDrawer.toggleDrawer}
            >
              <NotebookPen size={16} /> {studyToolsOpen ? "Close tools" : "Study tools"}
            </button>
            {user ? (
              <button className={`button button-secondary button-small ${tutorOpen ? "is-active" : ""}`} onClick={tutorDrawer.toggleDrawer} aria-expanded={tutorOpen}>
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

              {lessonData.aiAssisted && (
                <aside className="lesson-ai-notice" data-ai-generated="true">
                  <Bot size={17} />
                  <p><strong>AI-assisted lesson</strong><span>Review important claims against reliable sources before relying on them.</span></p>
                </aside>
              )}

              {(lessonData.learningObjective || lessonData.connection) && (
                <section className="lesson-contract" aria-label="Lesson purpose">
                  {lessonData.learningObjective && (
                    <div><Target size={18} /><span><small>Learning objective</small><strong>{lessonData.learningObjective}</strong></span></div>
                  )}
                  {lessonData.connection && (
                    <div><Waypoints size={18} /><span><small>Why this comes next</small><strong>{lessonData.connection}</strong></span></div>
                  )}
                </section>
              )}

              {lessonVisuals.filter((visual) => visual.placement === "after-purpose").map((visual) => <LessonVisualRenderer key={visual.id} visual={visual} />)}

              <div className="markdown-content"><ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizedContent}</ReactMarkdown></div>

              {lessonVisuals.filter((visual) => visual.placement === "after-explanation").map((visual) => <LessonVisualRenderer key={visual.id} visual={visual} />)}

              {lessonVisuals.filter((visual) => visual.placement === "before-guided-practice").map((visual) => <LessonVisualRenderer key={visual.id} visual={visual} />)}

              {lessonData.guidedPractice && (
                <section className="lesson-section guided-practice" aria-labelledby="guided-practice-title">
                  <div className="lesson-section-heading">
                    <p className="overline">Guided practice</p>
                    <h2 id="guided-practice-title">Work through the idea</h2>
                    <p>{lessonData.guidedPractice.prompt}</p>
                  </div>
                  <ol>
                    {lessonData.guidedPractice.steps.map((step, index) => (
                      <li key={`${step}-${index}`}><span>{index + 1}</span><p>{step}</p></li>
                    ))}
                  </ol>
                  <details className="model-answer">
                    <summary>Compare with a worked response</summary>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{lessonData.guidedPractice.modelAnswer}</ReactMarkdown>
                  </details>
                </section>
              )}

              {lessonData.keyTakeaways?.length ? (
                <section className="lesson-section key-takeaways" aria-labelledby="takeaways-title">
                  <div className="lesson-section-heading"><p className="overline">Consolidate</p><h2 id="takeaways-title">What to retain</h2></div>
                  <ul>{lessonData.keyTakeaways.map((takeaway) => <li key={takeaway}><Check size={16} /><span>{takeaway}</span></li>)}</ul>
                </section>
              ) : null}

              {lessonData.transferTask && (
                <section className="lesson-section transfer-practice" aria-labelledby="transfer-title">
                  <div className="lesson-section-heading">
                    <p className="overline">Transfer</p>
                    <h2 id="transfer-title">Use it in a new situation</h2>
                    <p>{lessonData.transferTask.prompt}</p>
                  </div>
                  <div className="transfer-criteria">
                    <strong>A strong response will:</strong>
                    <ul>{lessonData.transferTask.successCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
                  </div>
                  <label htmlFor="transfer-response">Your response</label>
                  <textarea
                    id="transfer-response"
                    rows={5}
                    value={transferResponse}
                    onChange={(event) => setTransferState({ key: noteKey, response: event.target.value, revealed: false })}
                    placeholder="Apply the idea in your own words."
                  />
                  <small>This response stays on this page and is not sent to the tutor.</small>
                  <button
                    className="button button-secondary button-small"
                    type="button"
                    disabled={!transferResponse.trim()}
                    onClick={() => setTransferState((current) => ({ ...current, key: noteKey, revealed: true }))}
                  >
                    Compare response
                  </button>
                  {transferRevealed && (
                    <div className="transfer-model" aria-live="polite">
                      <strong>Model response</strong>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{lessonData.transferTask.modelResponse}</ReactMarkdown>
                    </div>
                  )}
                </section>
              )}

              {lessonData.quizzes.length > 0 && (
                <section className="lesson-section checks-section" aria-labelledby="checks-title">
                  <div className="lesson-section-heading">
                    <p className="overline">Retrieval practice</p>
                    <h2 id="checks-title">Check your understanding</h2>
                    <p>Work through one activity at a time. Recall first, choose the best option, then rate your confidence.</p>
                  </div>
                  <div className="practice-sequence-status" aria-live="polite">
                    <span>Practice {activePracticeIndex + 1} of {lessonData.quizzes.length}</span>
                    <span>{Object.keys(quizResults).length} complete</span>
                  </div>
                  <div className="practice-sequence-track" role="progressbar" aria-label="Retrieval practice progress" aria-valuemin={0} aria-valuemax={lessonData.quizzes.length} aria-valuenow={Object.keys(quizResults).length}>
                    <span style={{ transform: `scaleX(${Object.keys(quizResults).length / lessonData.quizzes.length})` }} />
                  </div>
                  <div className="knowledge-list">
                    <KnowledgeCheck
                      key={`${noteKey}-${activePracticeIndex}-${lessonData.quizzes[activePracticeIndex].question}`}
                      quiz={lessonData.quizzes[activePracticeIndex]}
                      index={activePracticeIndex}
                      total={lessonData.quizzes.length}
                      onMastered={onMastered}
                      onContinue={activePracticeIndex < lessonData.quizzes.length - 1 ? advancePractice : undefined}
                    />
                  </div>
                </section>
              )}

              <div className={`completion-banner ${complete ? "is-complete" : ""}`}>
                <div>{complete ? <CheckCircle2 size={22} /> : <CircleAlert size={22} />}</div>
                <span>
                  <strong>{complete ? (reviewMode ? "Review complete" : "Lesson complete") : "Complete the activities"}</strong>
                  <small>{complete ? (
                    progressSyncError
                    || `${user ? "Progress synced." : "Progress saved on this device."}${reviewScheduledAt ? ` Review scheduled for ${new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric" }).format(new Date(reviewScheduledAt))}.` : user ? " Your next review has been scheduled." : " Sign in to sync it."}`
                  ) : lessonData.transferTask && !transferComplete ? "Complete the transfer task, then finish each retrieval check." : "Answer every prompt correctly and rate your confidence."}</small>
                </span>
                {!complete && lessonData.quizzes.length === 0 && transferComplete && (
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

          {!tutorOpen && studyToolsOpen && (
            <AppDrawer open={studyToolsOpen} onClose={studyToolsDrawer.closeDrawer} labelledBy="study-tools-title" size="medium" mobilePlacement="bottom" className="lesson-study-app-drawer">
              <aside className="lesson-study-panel" id="lesson-study-panel">
                <div className="study-panel-heading"><NotebookPen size={18} /><div><strong id="study-tools-title">Study workspace</strong><small>{user ? "Synced with your account" : "Saved on this device"}</small></div><button className="icon-button" type="button" onClick={studyToolsDrawer.closeDrawer} aria-label="Close study tools"><X size={17} /></button></div>
                <section className="lesson-note-section">
                  <label htmlFor="lesson-note">Your notes</label>
                  <textarea id="lesson-note" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} maxLength={12_000} rows={9} placeholder="Capture the idea in your own words…" />
                  <span>{noteDraft.length.toLocaleString()}/12,000 · <span role={learnerSyncStatus === "error" ? "alert" : "status"}>{learnerSyncStatus === "saving" ? "Saving…" : learnerSyncStatus === "error" ? learnerSyncError : learnerSyncStatus === "saved" ? "Saved" : user ? "Synced" : "On this device"}</span></span>
                </section>
                <section className="study-key-point"><span><Lightbulb size={17} /></span><div><strong>Core idea</strong><p>{lesson.concept}</p></div></section>
                <section className="mastery-checklist"><strong>Lesson checklist</strong><ul><li className="is-done"><Check size={15} /> Read the explanation</li>{lessonData.transferTask && <li className={transferComplete ? "is-done" : ""}><Check size={15} /> Apply the idea</li>}<li className={complete ? "is-done" : ""}><Check size={15} /> Complete the retrieval checks</li></ul></section>
              </aside>
            </AppDrawer>
          )}

          {user && tutorOpen && (
            <AppDrawer open={tutorOpen} onClose={tutorDrawer.closeDrawer} labelledBy="tutor-title" size="medium" mobilePlacement="full" className="tutor-app-drawer">
            <aside className="tutor-drawer">
              <div className="tutor-header">
                <span className="tutor-avatar"><ErudozaMark /></span>
                <div><strong id="tutor-title">Erudoza AI Tutor</strong><small>AI-generated responses grounded in this lesson</small></div>
                <button className="icon-button" onClick={tutorDrawer.closeDrawer} aria-label="Close tutor"><X size={18} /></button>
              </div>
              <div className="tutor-messages" aria-live="polite">
                {messages.length === 0 && (
                  <div className="tutor-message tutor-assistant" data-ai-generated="true">
                    <span><Bot size={14} /></span>
                    <div><p>Ask about a concept, worked example, or answer choice from <strong>{lesson.title}</strong>.</p></div>
                  </div>
                )}
                {messages.map((message) => (
                  <div className={`tutor-message tutor-${message.role}`} key={message.id} {...(message.role === "assistant" ? { "data-ai-generated": "true" } : {})}>
                    {message.role === "assistant" && <span><Bot size={14} /></span>}
                    <div><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content || "…"}</ReactMarkdown></div>
                  </div>
                ))}
                {chatError && <p className="form-error"><CircleAlert size={15} /> {chatError}</p>}
                <div ref={chatBottomRef} />
              </div>
              <form className="tutor-composer" onSubmit={sendMessage}>
                <label htmlFor="tutor-input">Ask about this lesson</label>
                <div className="tutor-input-shell">
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
                    placeholder="Ask about a concept, example, or answer choice"
                    rows={3}
                    maxLength={4_000}
                  />
                  <button className="icon-button icon-button-accent" type="submit" disabled={!chatInput.trim() || chatting} aria-label="Send question">
                    {chatting ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
                  </button>
                </div>
                <small className="tutor-disclaimer">AI can make mistakes. Verify important information.</small>
              </form>
            </aside>
            </AppDrawer>
          )}
        </div>
      </div>
    </AppShell>
  );
}
