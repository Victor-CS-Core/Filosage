"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Bot,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Lightbulb,
  ListChecks,
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
import type {
  Confidence,
  ConfidenceCalibration,
  CourseProgress,
  ProgressUpdate,
  ReviewKind,
} from "@/lib/learning-types";
import { getLocalProgress, saveLocalProgress } from "@/lib/learning-progress";
import { calibrationMessage, reviewKindLabel } from "@/lib/adaptive-learning";
import { useLearnerState } from "@/components/useLearnerState";
import SpeakButton from "@/components/SpeakButton";
import LessonVisualRenderer from "@/components/LessonVisual";
import LessonExperience, { type LessonExperienceState } from "@/components/LessonExperience";
import LessonIntegrityPanel from "@/components/LessonIntegrityPanel";
import InteractiveLessonBlock from "@/components/InteractiveLessonBlock";
import LessonSectionNavigator from "@/components/LessonSectionNavigator";
import { useMasteryJourney } from "@/components/useMasteryJourney";
import {
  markdownToSpeech,
  normalizeLessonMarkdown,
  normalizeStructuredMarkdown,
} from "@/lib/markdown";
import { curateLessonVisuals, visualsToSpeech } from "@/lib/lesson-visuals";
import { deriveLessonInteractions, interactionsToSpeech } from "@/lib/lesson-interactions";
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
  receipt?: string;
}

type LessonPane = "learn" | "activities";
type ActivitySectionId = "experience" | "guided" | "transfer" | "checks";

interface ActivitySection {
  id: ActivitySectionId;
  label: string;
  description: string;
}

function KnowledgeCheck({
  quiz,
  index,
  total,
  onMastered,
  onContinue,
  verifyAnswer,
}: {
  quiz: Quiz;
  index: number;
  total: number;
  onMastered: (index: number, result: QuizResult) => void;
  onContinue?: () => void;
  verifyAnswer?: (optionIndex: number) => Promise<{
    correct: boolean;
    attempts: number;
    firstAttemptCorrect: boolean;
    receipt?: string;
  }>;
}) {
  const [recall, setRecall] = useState("");
  const [choicesVisible, setChoicesVisible] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [mastered, setMastered] = useState(false);
  const [submittedConfidence, setSubmittedConfidence] = useState<Confidence | null>(null);
  const [firstAttemptCorrect, setFirstAttemptCorrect] = useState(false);
  const [receipt, setReceipt] = useState<string | undefined>();
  const [checking, setChecking] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const choose = async (optionIndex: number) => {
    if (selected !== null || checking) return;
    const nextAttempts = attempts + 1;
    setVerificationError(null);
    if (!verifyAnswer) {
      setAttempts(nextAttempts);
      setFirstAttemptCorrect(nextAttempts === 1 && optionIndex === quiz.correctIndex);
      setSelected(optionIndex);
      if (optionIndex === quiz.correctIndex) setMastered(true);
      return;
    }
    setChecking(true);
    try {
      const verified = await verifyAnswer(optionIndex);
      setAttempts(verified.attempts);
      setFirstAttemptCorrect(verified.firstAttemptCorrect);
      setReceipt(verified.receipt);
      setSelected(optionIndex);
      setMastered(verified.correct);
    } catch (error) {
      setVerificationError(error instanceof Error ? error.message : "This answer could not be verified.");
    } finally {
      setChecking(false);
    }
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
              onClick={() => void choose(optionIndex)}
              disabled={revealed || checking}
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
      {verificationError && <p className="form-error" role="alert">{verificationError}</p>}
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
                  onMastered(index, { attempts, firstAttemptCorrect, confidence, receipt });
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
  const requestedCheck = searchParams.get("check");
  const reviewKind: ReviewKind = requestedCheck === "day7"
    ? "delayed-7"
    : requestedCheck === "day28"
      ? "delayed-28"
      : "spaced";
  const [moduleIndex, lessonIndex] = lessonId.split("-").map(Number);
  const { user, isOwner, isPro, loading: authLoading, signInWithGoogle } = useAuth();
  const masteryJourney = useMasteryJourney(courseId, user);
  const masteryPlan = masteryJourney.plan;
  const addMasteryEvidence = masteryJourney.addEvidence;
  const {
    state: learnerState,
    update: updateLearnerState,
    ready: learnerStateReady,
    syncStatus: learnerSyncStatus,
    syncError: learnerSyncError,
  } = useLearnerState();
  const noteKey = courseId ? `${courseId}:${lessonId}` : `${topic}:${lessonId}`;
  const lessonViewKey = `${noteKey}:${reviewKind}:${reviewMode ? "review" : "learn"}`;
  const [courseRecord, setCourseRecord] = useState<{ key: string; value: Course | null }>({ key: lessonViewKey, value: null });
  const [lessonDataRecord, setLessonDataRecord] = useState<{ key: string; value: LessonData | null }>({ key: lessonViewKey, value: null });
  const course = courseRecord.key === lessonViewKey ? courseRecord.value : null;
  const lessonData = lessonDataRecord.key === lessonViewKey ? lessonDataRecord.value : null;
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
  const [experienceState, setExperienceState] = useState<{ key: string; value: LessonExperienceState | null }>({ key: "", value: null });
  const tutorDrawer = useAppDrawer("lesson-tutor");
  const studyToolsDrawer = useAppDrawer("lesson-study-tools");
  const closeTutorDrawer = tutorDrawer.closeDrawer;
  const closeStudyToolsDrawer = studyToolsDrawer.closeDrawer;
  const tutorOpen = tutorDrawer.open;
  const studyToolsOpen = studyToolsDrawer.open;
  const [activePracticeState, setActivePracticeState] = useState<{ key: string; index: number }>({ key: "", index: 0 });
  const [lessonPaneState, setLessonPaneState] = useState<{ key: string; pane: LessonPane }>({ key: "", pane: "learn" });
  const [activitySectionState, setActivitySectionState] = useState<{ key: string; id: ActivitySectionId | null }>({ key: "", id: null });
  const [guidedPracticeState, setGuidedPracticeState] = useState<{ key: string; complete: boolean }>({ key: "", complete: false });
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatting, setChatting] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [progressSyncError, setProgressSyncError] = useState<string | null>(null);
  const [reviewScheduleState, setReviewScheduleState] = useState<{ key: string; at: string | null }>({ key: "", at: null });
  const [calibrationState, setCalibrationState] = useState<{
    key: string;
    value: ConfidenceCalibration | null;
  }>({ key: "", value: null });
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const noteHydratedRef = useRef(false);
  const generationStartedAtRef = useRef(0);
  const generationRequestRef = useRef<{ lessonKey: string; requestId: string } | null>(null);
  const lessonLoadsInFlightRef = useRef(new Set<string>());
  const activeLessonViewRef = useRef(lessonViewKey);
  const quizResults = useMemo(
    () => quizResultState.key === noteKey ? quizResultState.results : {},
    [noteKey, quizResultState],
  );
  const complete = completionState.key === noteKey && completionState.complete;
  const transferResponse = transferState.key === noteKey ? transferState.response : "";
  const transferRevealed = transferState.key === noteKey && transferState.revealed;
  const transferComplete = !lessonData?.transferTask || (transferRevealed && transferResponse.trim().length >= 20);
  const experienceValue = useMemo(() => lessonData?.experience
    ? experienceState.key === noteKey && experienceState.value?.type === lessonData.experience.type
      ? experienceState.value
      : { type: lessonData.experience.type, response: "", completed: false }
    : null, [experienceState, lessonData, noteKey]);
  const experienceComplete = reviewMode || !lessonData?.experience || experienceValue?.completed === true;
  const lessonPane = lessonPaneState.key === noteKey ? lessonPaneState.pane : reviewMode ? "activities" : "learn";
  const guidedPracticeComplete = !lessonData?.guidedPractice
    || (guidedPracticeState.key === noteKey && guidedPracticeState.complete);
  const lessonBookmarked = learnerState.lessonBookmarks.includes(noteKey);
  const activePracticeIndex = activePracticeState.key === noteKey ? activePracticeState.index : 0;
  const reviewScheduledAt = reviewScheduleState.key === noteKey ? reviewScheduleState.at : null;
  const confidenceCalibration = calibrationState.key === noteKey ? calibrationState.value : null;
  const activitySections = useMemo<ActivitySection[]>(() => {
    if (!lessonData) return [];
    return [
      ...(lessonData.experience ? [{ id: "experience" as const, label: "Active lesson", description: "Create evidence while you learn" }] : []),
      ...(lessonData.guidedPractice ? [{ id: "guided" as const, label: "Guided practice", description: "Work through the method" }] : []),
      ...(lessonData.transferTask ? [{ id: "transfer" as const, label: "Transfer task", description: "Apply it in a new situation" }] : []),
      ...(lessonData.quizzes.length ? [{ id: "checks" as const, label: "Knowledge checks", description: `${lessonData.quizzes.length} retrieval ${lessonData.quizzes.length === 1 ? "check" : "checks"}` }] : []),
    ];
  }, [lessonData]);
  const requestedActivityId = activitySectionState.key === noteKey ? activitySectionState.id : null;
  const activeActivityId = activitySections.some((section) => section.id === requestedActivityId)
    ? requestedActivityId
    : activitySections[0]?.id ?? null;
  const activeActivityIndex = Math.max(0, activitySections.findIndex((section) => section.id === activeActivityId));
  const checksComplete = Boolean(lessonData?.quizzes.length)
    && Object.keys(quizResults).length === lessonData?.quizzes.length;
  const completedActivityIds = useMemo(() => new Set<ActivitySectionId>([
    ...(complete ? activitySections.map((section) => section.id) : []),
    ...(!complete && lessonData?.experience && experienceComplete ? ["experience" as const] : []),
    ...(!complete && lessonData?.guidedPractice && guidedPracticeComplete ? ["guided" as const] : []),
    ...(!complete && lessonData?.transferTask && transferComplete ? ["transfer" as const] : []),
    ...(!complete && lessonData?.quizzes.length && checksComplete ? ["checks" as const] : []),
  ]), [activitySections, checksComplete, complete, experienceComplete, guidedPracticeComplete, lessonData, transferComplete]);
  const completedActivityCount = activitySections.filter((section) => completedActivityIds.has(section.id)).length;

  const selectLessonPane = (pane: LessonPane) => {
    setLessonPaneState({ key: noteKey, pane });
  };

  const selectActivitySection = (id: ActivitySectionId) => {
    if (activeActivityId === "guided" && id !== "guided") {
      setGuidedPracticeState({ key: noteKey, complete: true });
    }
    setActivitySectionState({ key: noteKey, id });
  };

  const moveThroughActivities = (direction: -1 | 1) => {
    if (!activeActivityId) return;
    if (activeActivityId === "guided" && direction > 0) {
      setGuidedPracticeState({ key: noteKey, complete: true });
    }
    const next = activitySections[activeActivityIndex + direction];
    if (next) selectActivitySection(next.id);
  };

  useEffect(() => {
    noteHydratedRef.current = false;
  }, [noteKey]);

  useEffect(() => {
    if (!lessonData?.experience) return;
    let cancelled = false;
    const expectedType = lessonData.experience.type;
    deferClientTask(() => {
      if (cancelled) return;
      let saved: LessonExperienceState | null = null;
      try {
        const parsed = JSON.parse(localStorage.getItem(`erudoza-experience-draft:${noteKey}`) ?? "null") as Partial<LessonExperienceState> | null;
        if (parsed?.type === expectedType && typeof parsed.response === "string") {
          saved = { type: expectedType, response: parsed.response.slice(0, 8_000), completed: parsed.completed === true && parsed.response.trim().length >= 20 };
        }
      } catch {
        localStorage.removeItem(`erudoza-experience-draft:${noteKey}`);
      }
      setExperienceState((current) => current.key === noteKey
        ? current
        : { key: noteKey, value: saved ?? { type: expectedType, response: "", completed: false } });
    });
    return () => { cancelled = true; };
  }, [lessonData?.experience, noteKey]);

  useEffect(() => {
    if (!lessonData?.transferTask || transferState.key === noteKey) return;
    deferClientTask(() => {
      try {
        const parsed = JSON.parse(localStorage.getItem(`erudoza-transfer-draft:${noteKey}`) ?? "null") as { response?: unknown; revealed?: unknown } | null;
        const savedResponse = parsed?.response;
        if (typeof savedResponse === "string") {
          setTransferState((current) => current.key === noteKey ? current : {
            key: noteKey,
            response: savedResponse.slice(0, 8_000),
            revealed: parsed?.revealed === true && savedResponse.trim().length >= 20,
          });
        }
      } catch {
        localStorage.removeItem(`erudoza-transfer-draft:${noteKey}`);
      }
    });
  }, [lessonData?.transferTask, noteKey, transferState.key]);

  useEffect(() => {
    if (!learnerStateReady) return;
    let cancelled = false;
    const savedNote = learnerState.notes[noteKey] ?? "";
    deferClientTask(() => {
      if (cancelled) return;
      setNoteDraft(savedNote);
      noteHydratedRef.current = true;
    });
    return () => { cancelled = true; };
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
    activeLessonViewRef.current = lessonViewKey;
    closeTutorDrawer();
    closeStudyToolsDrawer();
    void Promise.resolve().then(() => {
      if (activeLessonViewRef.current !== lessonViewKey) return;
      setLoading(true);
      setIsGenerating(false);
      setGenerationProgress(0);
      setError(null);
      setMessages([]);
      setChatInput("");
      setChatting(false);
      setChatError(null);
      setNoteDraft("");
      setProgressSyncError(null);
      generationRequestRef.current = null;
    });
  }, [closeStudyToolsDrawer, closeTutorDrawer, lessonViewKey]);

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
    const requestViewKey = lessonViewKey;
    const isCurrentView = () => activeLessonViewRef.current === requestViewKey;
    if (authLoading) return;
    if (!user) {
      if (isCurrentView()) setLoading(false);
      return;
    }
    if (!courseId) {
      if (isCurrentView()) {
        setError("This lesson link is missing its course reference.");
        setLoading(false);
      }
      return;
    }
    if (lessonLoadsInFlightRef.current.has(requestViewKey)) return;
    lessonLoadsInFlightRef.current.add(requestViewKey);

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
      if (!isCurrentView()) return;
      if (!courseResponse.ok) throw new Error(courseData.error || "The course could not be opened.");

      const resolvedCourse = { ...courseData, id: courseId, courseId } as Course;
      const lesson = resolvedCourse.modules[moduleIndex]?.lessons[lessonIndex];
      if (!lesson) throw new Error("This lesson is not part of the course.");
      setCourseRecord({ key: requestViewKey, value: resolvedCourse });

      const lessonResponse = await fetch(`/api/courses/${courseId}/lessons/${lessonId}`, { headers });
      if (lessonResponse.ok) {
        const loadedLesson = await lessonResponse.json() as LessonData;
        if (isCurrentView()) setLessonDataRecord({ key: requestViewKey, value: randomizeQuizAnswers(loadedLesson) });
        return;
      }

      if (!resolvedCourse.canManage) {
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
        keepalive: true,
        body: JSON.stringify({
          topic,
          lessonTitle: lesson.title,
          lessonConcept: lesson.concept,
          courseId,
          lessonId,
        }),
      });
      const generated = await generationResponse.json();
      if (!isCurrentView()) return;
      if (!generationResponse.ok) throw new Error(generated.error || "The lesson could not be generated.");
      setGenerationProgress(100);
      setLessonDataRecord({ key: requestViewKey, value: randomizeQuizAnswers(generated as LessonData) });
      generationRequestRef.current = null;
    } catch (loadError) {
      if (isCurrentView()) setError(loadError instanceof Error ? loadError.message : "The lesson could not be opened.");
    } finally {
      lessonLoadsInFlightRef.current.delete(requestViewKey);
      if (isCurrentView()) {
        setIsGenerating(false);
        setLoading(false);
      }
    }
  }, [authLoading, courseId, getToken, moduleIndex, lessonIndex, lessonId, lessonViewKey, topic, user]);

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
            const savedLesson = data.progress?.lessons[lessonId];
            setReviewScheduleState({ key: noteKey, at: savedLesson?.nextReviewAt ?? null });
            if (savedLesson?.experienceEvidence) {
              setExperienceState({ key: noteKey, value: { ...savedLesson.experienceEvidence, completed: true } });
            }
          }
          return;
        }
      }
      const local = getLocalProgress(courseId, topic);
      if (!cancelled) {
        setCompletionState({ key: noteKey, complete: !reviewMode && Boolean(local?.completedLessonIds.includes(lessonId)) });
        const savedLesson = local?.lessons[lessonId];
        setReviewScheduleState({ key: noteKey, at: savedLesson?.nextReviewAt ?? null });
        if (savedLesson?.experienceEvidence) {
          setExperienceState({ key: noteKey, value: { ...savedLesson.experienceEvidence, completed: true } });
        }
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
  const lessonInteractions = useMemo(
    () => lessonData ? deriveLessonInteractions(lessonData) : [],
    [lessonData],
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
      interactionsToSpeech(lessonInteractions),
      at("before-guided-practice"),
    ].filter(Boolean).join(" ");
  }, [lesson, lessonInteractions, lessonVisuals, normalizedContent]);

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
    if (!courseId || complete || !lessonData || !lesson || !transferComplete || !experienceComplete) return;
    const operationViewKey = activeLessonViewRef.current;
    const isCurrentView = () => activeLessonViewRef.current === operationViewKey;
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
      reviewKind: reviewMode ? reviewKind : undefined,
      totalLessons: allLessons.length,
      estimatedMinutes: lesson.estimatedMinutes ?? 12,
      nextLessonId: nextLesson?.id ?? null,
      nextLessonTitle: nextLesson?.title ?? null,
      misconception: lesson.misconception,
      activityEvidence: {
        quizResults: Object.entries(quizResults).map(([quizIndex, result]) => ({
          quizIndex: Number(quizIndex),
          attempts: result.attempts,
          firstAttemptCorrect: result.firstAttemptCorrect,
          confidence: result.confidence,
          receipt: result.receipt,
        })),
        transferResponse: lessonData.transferTask ? transferResponse.trim() : undefined,
        experienceEvidence: !reviewMode && lessonData.experience && experienceValue?.completed
          ? { type: lessonData.experience.type, response: experienceValue.response.trim(), completed: true }
          : undefined,
      },
    };

    const localProgress = saveLocalProgress(update);
    setReviewScheduleState({ key: noteKey, at: localProgress.lessons[lessonId]?.nextReviewAt ?? null });
    setCalibrationState({ key: noteKey, value: localProgress.lessons[lessonId]?.calibration ?? null });
    setProgressSyncError(null);
    const requiresCloudAuthorCompletion = Boolean(course?.canManage && !isOwner);
    let cloudSaved = !user;
    if (user) {
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(update),
        });
        const data = await response.json().catch(() => ({})) as {
          nextReviewAt?: string;
          calibration?: ConfidenceCalibration;
        };
        if (!response.ok) throw new Error("Saved on this device. Cloud progress will retry when you complete another activity.");
        cloudSaved = true;
        if (isCurrentView() && data.nextReviewAt) setReviewScheduleState({ key: noteKey, at: data.nextReviewAt });
        if (isCurrentView() && data.calibration) setCalibrationState({ key: noteKey, value: data.calibration });
      } catch (saveError) {
        if (isCurrentView()) setProgressSyncError(saveError instanceof Error ? saveError.message : "Saved on this device, but cloud sync is pending.");
      }
    }
    if (requiresCloudAuthorCompletion && !cloudSaved) return;
    const observedAt = new Date().toISOString();
    const objectiveId = `module-${moduleIndex}`;
    const firstTryScore = lessonData.quizzes.length
      ? update.firstAttemptCorrect / lessonData.quizzes.length
      : 1;
    if (isCurrentView()) setCompletionState({ key: noteKey, complete: true });
    if (cloudSaved) {
      localStorage.removeItem(`erudoza-experience-draft:${noteKey}`);
      localStorage.removeItem(`erudoza-transfer-draft:${noteKey}`);
    }
    await addMasteryEvidence([
      ...(!reviewMode ? [{
        id: createClientId(),
        courseId,
        objectiveId,
        type: "lesson" as const,
        result: "passed" as const,
        label: `Completed ${lesson.title}`,
        observedAt,
        lessonId,
        lessonTitle: lesson.title,
        confidence,
      }] : []),
      ...(lessonData.quizzes.length ? [{
        id: createClientId(),
        courseId,
        objectiveId,
        type: "retrieval" as const,
        result: firstTryScore >= 0.7 ? "passed" as const : "needs_work" as const,
        label: reviewMode
          ? `${reviewKindLabel(reviewKind)}: ${lesson.objective ?? lesson.concept}`
          : `Retrieval check: ${lesson.objective ?? lesson.concept}`,
        observedAt,
        lessonId,
        lessonTitle: lesson.title,
        confidence,
        score: firstTryScore,
      }] : []),
      ...(lessonData.transferTask ? [{
        id: createClientId(),
        courseId,
        objectiveId,
        type: "transfer" as const,
        result: "attempted" as const,
        label: `Transfer attempt: ${lesson.objective ?? lesson.concept}`,
        observedAt,
        lessonId,
        lessonTitle: lesson.title,
      }] : []),
    ]);
    trackProductEvent("lesson_completed", {
      route: "/lesson",
      courseId,
      lessonId,
      exclude: isOwner,
      oncePerSession: true,
    });
    trackProductEvent("confidence_calibrated", {
      route: "/lesson",
      courseId,
      lessonId,
      score: firstTryScore * 100,
      exclude: isOwner,
    });
    if (reviewMode) {
      trackProductEvent("review_completed", {
        route: "/lesson",
        courseId,
        lessonId,
        score: firstTryScore * 100,
        exclude: isOwner,
      });
      if (reviewKind !== "spaced") {
        trackProductEvent("delayed_check_completed", {
          route: "/lesson",
          courseId,
          lessonId,
          score: firstTryScore * 100,
          exclude: isOwner,
        });
      }
    }
    if (!reviewMode) {
      const elapsedMs = masteryPlan?.createdAt
        ? Math.max(0, Date.now() - new Date(masteryPlan.createdAt).getTime())
        : undefined;
      if (lessonData.quizzes.length) {
        trackProductEvent("retrieval_attempted", {
          route: "/lesson",
          courseId,
          lessonId,
          objectiveId,
          exclude: isOwner,
        });
      }
      if (lessonData.transferTask) {
        trackProductEvent("transfer_attempted", {
          route: "/lesson",
          courseId,
          lessonId,
          objectiveId,
          exclude: isOwner,
        });
      }
      trackProductEvent("first_practice_completed", {
        route: "/lesson",
        courseId,
        lessonId,
        exclude: isOwner,
        oncePerSession: true,
        elapsedMs,
      });
    }
  }, [addMasteryEvidence, allLessons.length, complete, course?.canManage, courseId, experienceComplete, experienceValue, isOwner, lesson, lessonData, lessonId, masteryPlan, moduleIndex, nextLesson, noteKey, quizResults, reviewKind, reviewMode, topic, transferComplete, transferResponse, user]);

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
    if (!transferComplete || !experienceComplete) return;
    const timeout = window.setTimeout(() => { void markComplete(); }, 250);
    return () => window.clearTimeout(timeout);
  }, [complete, experienceComplete, lessonData, markComplete, quizResults, transferComplete]);

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const input = chatInput.trim();
    if (!input || !lessonData || !lesson || !courseId || !user || chatting) return;
    const operationViewKey = activeLessonViewRef.current;
    const isCurrentView = () => activeLessonViewRef.current === operationViewKey;
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
      if (!isCurrentView()) return;
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
        if (!isCurrentView()) {
          await reader.cancel();
          return;
        }
        content += decoder.decode(value, { stream: true });
        setMessages([...visibleMessages, { id: assistantId, role: "assistant", content }]);
      }
    } catch (sendError) {
      if (isCurrentView()) setChatError(sendError instanceof Error ? sendError.message : "The tutor could not respond.");
    } finally {
      if (isCurrentView()) setChatting(false);
    }
  };

  const updateExperienceEvidence = useCallback((value: LessonExperienceState) => {
    setExperienceState({ key: noteKey, value });
    try {
      localStorage.setItem(`erudoza-experience-draft:${noteKey}`, JSON.stringify(value));
    } catch {
      // Storage can be unavailable in private browsing; the in-memory draft still works.
    }
  }, [noteKey]);

  const updateTransferDraft = useCallback((response: string, revealed: boolean) => {
    const value = { key: noteKey, response, revealed };
    setTransferState(value);
    try {
      localStorage.setItem(`erudoza-transfer-draft:${noteKey}`, JSON.stringify({ response, revealed }));
    } catch {
      // Storage can be unavailable in private browsing; the in-memory draft still works.
    }
  }, [noteKey]);

  const verifyAuthorAnswer = useCallback(async (quizIndex: number, optionIndex: number) => {
    if (!courseId || !lessonData) throw new Error("This activity is not ready.");
    const token = await getToken();
    const response = await fetch("/api/lesson-activity", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        courseId,
        lessonId,
        quizIndex,
        selectedOption: lessonData.quizzes[quizIndex]?.options[optionIndex],
      }),
    });
    const data = await response.json().catch(() => ({})) as {
      error?: string;
      correct?: boolean;
      attempts?: number;
      firstAttemptCorrect?: boolean;
      receipt?: string;
    };
    if (!response.ok || typeof data.correct !== "boolean" || typeof data.attempts !== "number") {
      throw new Error(data.error || "This answer could not be verified.");
    }
    return {
      correct: data.correct,
      attempts: data.attempts,
      firstAttemptCorrect: data.firstAttemptCorrect === true,
      receipt: data.receipt,
    };
  }, [courseId, getToken, lessonData, lessonId]);

  const lessonHref = (id: string) => `/course/${encodeURIComponent(topic)}/lesson/${id}${courseId ? `?id=${courseId}` : ""}`;

  if (!authLoading && !user) {
    return (
      <AppShell activeTopic={topic} activeLessonId={lessonId} activeCourseId={courseId}>
        <div className="center-state lesson-account-gate">
          <span className="state-icon"><LockKeyhole size={23} /></span>
          <p className="overline">Free learner account required</p>
          <h1>Open the lesson when you’re signed in</h1>
          <p>You can inspect the complete course structure as a guest. Create a free account to read lessons, practice, and keep your progress.</p>
          <div className="state-actions">
            <button className="button button-primary" onClick={() => void signInWithGoogle()}><LockKeyhole size={16} /> Create a free account</button>
            <button className="button button-secondary" onClick={() => router.push(`/course/${encodeURIComponent(topic)}${courseId ? `?id=${courseId}` : ""}`)}><ArrowLeft size={16} /> Back to course</button>
          </div>
        </div>
      </AppShell>
    );
  }

  if (loading || authLoading) {
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
            <div className={`reading-column lesson-${lessonPane}-pane`}>
              <div className="lesson-progress-top" role="progressbar" aria-label="Course progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={lessonProgress}><span style={{ transform: `scaleX(${lessonProgress / 100})` }} /></div>
              <header className="lesson-title-block">
                <p className="overline">{currentModule?.title}</p>
                <h1>{lesson.title}</h1>
                <p>{lesson.concept}</p>
              </header>

              <div className="lesson-mode-tabs" role="tablist" aria-label="Lesson workspace">
                <button id="lesson-learn-tab" type="button" role="tab" aria-selected={lessonPane === "learn"} aria-controls="lesson-pane-content" className={lessonPane === "learn" ? "is-active" : ""} onClick={() => selectLessonPane("learn")}>
                  <BookOpenText size={17} /><span><strong>Learn</strong><small>Explanation and key ideas</small></span>
                </button>
                <button id="lesson-activities-tab" type="button" role="tab" aria-selected={lessonPane === "activities"} aria-controls="lesson-pane-content" className={lessonPane === "activities" ? "is-active" : ""} onClick={() => selectLessonPane("activities")}>
                  <ListChecks size={17} /><span><strong>Activities</strong><small>{completedActivityCount} of {activitySections.length} complete</small></span>
                </button>
              </div>

              {lessonPane === "activities" && (
                <div className="lesson-activities-header">
                  <header><div><p>Practice studio</p><h2>Turn the lesson into evidence</h2><span>Complete one focused activity at a time. Your drafts stay private.</span></div><strong>{completedActivityCount}/{activitySections.length}</strong></header>
                  {activitySections.length > 0 && (
                    <div className="activity-section-tabs" role="tablist" aria-label="Lesson activities">
                      {activitySections.map((section, index) => {
                        const sectionComplete = completedActivityIds.has(section.id);
                        return (
                          <button key={section.id} id={`activity-${section.id}-tab`} type="button" role="tab" aria-selected={activeActivityId === section.id} aria-controls="lesson-active-activity" className={`${activeActivityId === section.id ? "is-active" : ""} ${sectionComplete ? "is-complete" : ""}`} onClick={() => selectActivitySection(section.id)}>
                            <span>{sectionComplete ? <Check size={15} /> : index + 1}</span><strong>{section.label}</strong><small>{section.description}</small>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div id="lesson-pane-content" className="lesson-pane-content" role="tabpanel" aria-labelledby={lessonPane === "learn" ? "lesson-learn-tab" : "lesson-activities-tab"}>

              {lessonPane === "learn" && lessonData.aiAssisted && (
                <aside className="lesson-ai-notice" data-ai-generated="true">
                  <Bot size={17} />
                  <p><strong>AI-assisted lesson</strong><span>Review important claims against reliable sources before relying on them.</span></p>
                </aside>
              )}

              {lessonPane === "learn" && (lessonData.learningObjective || lessonData.connection) && (
                <section className="lesson-contract" aria-label="Lesson purpose">
                  {lessonData.learningObjective && (
                    <div><Target size={18} /><span><small>Learning objective</small><strong>{lessonData.learningObjective}</strong></span></div>
                  )}
                  {lessonData.connection && (
                    <div><Waypoints size={18} /><span><small>Why this comes next</small><strong>{lessonData.connection}</strong></span></div>
                  )}
                </section>
              )}

              {lessonPane === "learn" && lessonVisuals.filter((visual) => visual.placement === "after-purpose").map((visual) => <LessonVisualRenderer key={visual.id} visual={visual} />)}

              {lessonPane === "learn" && <LessonSectionNavigator markdown={normalizedContent} containerId="lesson-explanation" />}

              {lessonPane === "activities" && activeActivityId === "experience" && lessonData.experience && experienceValue && (
                <div id="lesson-active-activity" role="tabpanel" aria-labelledby="activity-experience-tab"><LessonExperience experience={lessonData.experience} value={experienceValue} onChange={updateExperienceEvidence} /></div>
              )}

              {lessonPane === "learn" && <div className="markdown-content" id="lesson-explanation"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ h2: ({ children }) => <h2 tabIndex={-1}>{children}</h2>, h3: ({ children }) => <h3 tabIndex={-1}>{children}</h3> }}>{normalizedContent}</ReactMarkdown></div>}

              {lessonPane === "learn" && lessonVisuals.filter((visual) => visual.placement === "after-explanation").map((visual) => <LessonVisualRenderer key={visual.id} visual={visual} />)}

              {lessonPane === "learn" && lessonInteractions.map((interaction) => <InteractiveLessonBlock key={interaction.id} interaction={interaction} />)}

              {lessonPane === "activities" && activeActivityId === "guided" && lessonData.guidedPractice && (
                <div id="lesson-active-activity" className="guided-activity-panel" role="tabpanel" aria-labelledby="activity-guided-tab">
                  {lessonVisuals.filter((visual) => visual.placement === "before-guided-practice").map((visual) => <LessonVisualRenderer key={visual.id} visual={visual} />)}
                  <section className="lesson-section guided-practice" aria-labelledby="guided-practice-title">
                    <div className="lesson-section-heading">
                      <p className="overline">Guided practice</p>
                      <h2 id="guided-practice-title">Work through the idea</h2>
                      <div className="structured-markdown guided-practice-prompt">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizeStructuredMarkdown(lessonData.guidedPractice.prompt)}</ReactMarkdown>
                      </div>
                    </div>
                    <ol>
                      {lessonData.guidedPractice.steps.map((step, index) => (
                        <li key={`${step}-${index}`}><span>{index + 1}</span><div className="structured-markdown guided-practice-step"><ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizeStructuredMarkdown(step)}</ReactMarkdown></div></li>
                      ))}
                    </ol>
                    <details className="model-answer">
                      <summary>Compare with a worked response</summary>
                      <div className="structured-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizeStructuredMarkdown(lessonData.guidedPractice.modelAnswer)}</ReactMarkdown></div>
                    </details>
                  </section>
                </div>
              )}

              {lessonPane === "learn" && lessonData.keyTakeaways?.length ? (
                <section className="lesson-section key-takeaways" aria-labelledby="takeaways-title">
                  <div className="lesson-section-heading"><p className="overline">Consolidate</p><h2 id="takeaways-title">What to retain</h2></div>
                  <ul>{lessonData.keyTakeaways.map((takeaway) => <li key={takeaway}><Check size={16} /><span>{takeaway}</span></li>)}</ul>
                </section>
              ) : null}

              {lessonPane === "learn" && (
                <div className="lesson-pane-continue">
                  <span><strong>Ready to use the idea?</strong><small>Move into a focused activity sequence without losing your place.</small></span>
                  <button className="button button-primary" type="button" onClick={() => selectLessonPane("activities")}>Open activities <ArrowRight size={16} /></button>
                </div>
              )}

              {lessonPane === "activities" && activeActivityId === "transfer" && lessonData.transferTask && (
                <section id="lesson-active-activity" className="lesson-section transfer-practice" role="tabpanel" aria-labelledby="activity-transfer-tab transfer-title">
                  <div className="lesson-section-heading">
                    <p className="overline">Transfer</p>
                    <h2 id="transfer-title">Use it in a new situation</h2>
                    <div className="structured-markdown transfer-prompt"><ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizeStructuredMarkdown(lessonData.transferTask.prompt)}</ReactMarkdown></div>
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
                    onChange={(event) => updateTransferDraft(event.target.value, false)}
                    placeholder="Apply the idea in your own words."
                  />
                  <small>This draft is saved on this device. On completion, it becomes part of your private learning evidence and is not sent to the tutor.</small>
                  <button
                    className="button button-secondary button-small"
                    type="button"
                    disabled={transferResponse.trim().length < 20}
                    onClick={() => updateTransferDraft(transferResponse.trim(), true)}
                  >
                    Compare response
                  </button>
                  {transferResponse.trim().length > 0 && transferResponse.trim().length < 20 && (
                    <small>Write at least 20 characters so the response shows a meaningful attempt.</small>
                  )}
                  {transferRevealed && (
                    <div className="transfer-model" aria-live="polite">
                      <strong>Model response</strong>
                      <div className="structured-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizeStructuredMarkdown(lessonData.transferTask.modelResponse)}</ReactMarkdown></div>
                    </div>
                  )}
                </section>
              )}

              {lessonPane === "activities" && activeActivityId === "checks" && lessonData.quizzes.length > 0 && (
                <section id="lesson-active-activity" className="lesson-section checks-section" role="tabpanel" aria-labelledby="activity-checks-tab checks-title">
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
                      verifyAnswer={course?.canManage && !course.isPublic && !isOwner
                        ? (optionIndex) => verifyAuthorAnswer(activePracticeIndex, optionIndex)
                        : undefined}
                    />
                  </div>
                </section>
              )}

              {lessonPane === "activities" && activitySections.length === 0 && (
                <div className="lesson-activities-empty"><CheckCircle2 size={22} /><div><strong>No additional activities</strong><p>Confirm that you reviewed the explanation to finish this lesson.</p></div></div>
              )}

              {lessonPane === "activities" && activitySections.length > 0 && (
                <div className="activity-panel-navigation">
                  <button className="button button-secondary" type="button" disabled={activeActivityIndex === 0} onClick={() => moveThroughActivities(-1)}><ArrowLeft size={16} /> Previous activity</button>
                  {activeActivityIndex < activitySections.length - 1 ? (
                    <button className="button button-primary" type="button" onClick={() => moveThroughActivities(1)}>Next activity <ArrowRight size={16} /></button>
                  ) : activeActivityId === "guided" && !guidedPracticeComplete ? (
                    <button className="button button-primary" type="button" onClick={() => setGuidedPracticeState({ key: noteKey, complete: true })}><Check size={16} /> Mark practice reviewed</button>
                  ) : null}
                </div>
              )}

              {lessonPane === "activities" && <div className={`completion-banner ${complete ? "is-complete" : ""}`}>
                <div>{complete ? <CheckCircle2 size={22} /> : <CircleAlert size={22} />}</div>
                <span>
                  <strong>{complete ? (reviewMode ? `${reviewKindLabel(reviewKind)} complete` : "Lesson complete") : "Complete the activities"}</strong>
                  <small>{complete ? (
                    progressSyncError
                    || `${user ? "Progress synced." : "Progress saved on this device."}${reviewScheduledAt ? ` Review scheduled for ${new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric" }).format(new Date(reviewScheduledAt))}.` : user ? " Your next review has been scheduled." : " Sign in to sync it."}`
                  ) : !experienceComplete ? "Complete and save the active lesson response before finishing the transfer and retrieval checks." : lessonData.transferTask && !transferComplete ? "Complete the transfer task, then finish each retrieval check." : "Answer every prompt correctly and rate your confidence."}</small>
                  {complete && confidenceCalibration && (
                    <em className={`calibration-note is-${confidenceCalibration}`}>
                      {calibrationMessage(confidenceCalibration)}
                    </em>
                  )}
                </span>
                {!complete && lessonData.quizzes.length === 0 && transferComplete && experienceComplete && (
                  <button className="button button-secondary button-small" onClick={() => void markComplete()}>Mark learned</button>
                )}
              </div>}

              {lessonPane === "learn" && courseId && (
                <LessonIntegrityPanel
                  key={noteKey}
                  courseId={courseId}
                  lessonId={lessonId}
                  provenance={lessonData.provenance}
                  getAuthToken={getToken}
                />
              )}

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
                <section className="mastery-checklist"><strong>Lesson checklist</strong><ul><li className="is-done"><Check size={15} /> Read the explanation</li>{lessonData.experience && <li className={experienceComplete ? "is-done" : ""}><Check size={15} /> Save the active lesson evidence</li>}{lessonData.transferTask && <li className={transferComplete ? "is-done" : ""}><Check size={15} /> Apply the idea</li>}<li className={complete ? "is-done" : ""}><Check size={15} /> Complete the retrieval checks</li></ul></section>
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
