"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
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
import AccountEntryButton, { useAccountEntryMode } from "@/components/AccountEntryButton";
import { useAuth } from "@/components/AuthProvider";
import { trackProductEvent } from "@/lib/product-analytics";
import FilosageMark from "@/components/FilosageMark";
import type { Course, LessonData, Quiz } from "@/lib/course-types";
import type {
  Confidence,
  ConfidenceCalibration,
  CourseProgress,
  ProgressUpdate,
  ReviewKind,
} from "@/lib/learning-types";
import { isCurrentLearnerSession, learnerRequest, learnerSessionSnapshot, readLearnerStorage, writeLearnerStorage, removeLearnerStorage } from "@/lib/learner-storage";
import { readLearnerState, writeLearnerState } from "@/lib/learner-state";
import { getLocalProgress, saveLocalProgress } from "@/lib/learning-progress";
import { calibrationMessage, reviewKindLabel } from "@/lib/adaptive-learning";
import { retrievalVariantsForQuizBank, selectRetrievalVariant } from "@/lib/retrieval-planning";
import { useLearnerState } from "@/components/useLearnerState";
import SpeakButton from "@/components/SpeakButton";
import LessonVisualRenderer from "@/components/LessonVisual";
import LessonExperience, { type LessonExperienceState } from "@/components/LessonExperience";
import LessonIntegrityPanel from "@/components/LessonIntegrityPanel";
import InteractiveLessonBlock from "@/components/InteractiveLessonBlock";
import LessonSectionNavigator from "@/components/LessonSectionNavigator";
import LessonStudyTools from "@/components/LessonStudyTools";
import { useMasteryJourney } from "@/components/useMasteryJourney";
import {
  markdownToSpeech,
  normalizeLessonMarkdown,
  normalizeStructuredMarkdown,
} from "@/lib/markdown";
import { curateLessonVisuals, visualsToSpeech } from "@/lib/lesson-visuals";
import {
  deriveLessonInteractions,
  interactionsToSpeech,
  type InteractionEvidence,
} from "@/lib/lesson-interactions";
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
type ActivitySectionId = "experience" | "lab" | "guided" | "transfer" | "checks";

interface ActivitySection {
  id: ActivitySectionId;
  label: string;
  description: string;
}

function KnowledgeCheck({
  quiz,
  index,
  position = index,
  total,
  onMastered,
  onCommit,
  onContinue,
  verifyAnswer,
}: {
  quiz: Quiz;
  index: number;
  position?: number;
  total: number;
  onMastered: (index: number, result: QuizResult) => void;
  onCommit?: () => void;
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
    onCommit?.();
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
      <legend className="sr-only">Practice {position + 1}: {quiz.question}</legend>
      <div className="activity-meta">
        <span>Practice {position + 1} of {total}</span>
        <span aria-live="polite">{submittedConfidence ? "Complete" : choicesVisible ? "Choose an answer" : "Recall first"}</span>
      </div>
      <div className="knowledge-question">
        <span aria-hidden="true">{position + 1}</span>
        <h3>{quiz.question}</h3>
      </div>
      {!choicesVisible && (
        <div className="free-recall">
          <div className="free-recall-heading">
            <label htmlFor={`recall-${index}`}>Start from memory</label>
            <small>Write a few words before revealing the choices. This reflection stays private.</small>
          </div>
          <textarea id={`recall-${index}`} value={recall} onChange={(event) => setRecall(event.target.value)} rows={2} placeholder="Capture the key idea in your own words…" />
          <button className="button button-secondary button-small" type="button" disabled={!recall.trim()} onClick={() => setChoicesVisible(true)}>Reveal answer choices <ChevronRight size={15} /></button>
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
              Continue to practice {position + 2} <ArrowRight size={15} />
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
  const { user, isOwner, canGenerateLessons, loading: authLoading } = useAuth();
  const session = useMemo(() => learnerSessionSnapshot(user?.uid ?? null), [user?.uid]);
  const entryMode = useAccountEntryMode();
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
  const lessonViewKey = `${user?.uid ?? "guest"}:${noteKey}:${reviewKind}:${reviewMode ? "review" : "learn"}`;
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
  const [transferDeviceSaved, setTransferDeviceSaved] = useState<boolean | null>(null);
  const [transferState, setTransferState] = useState<{ key: string; response: string; revealed: boolean }>({
    key: "",
    response: "",
    revealed: false,
  });
  const [experienceDeviceSaved, setExperienceDeviceSaved] = useState<boolean | null>(null);
  const [experienceState, setExperienceState] = useState<{ key: string; value: LessonExperienceState | null }>({ key: "", value: null });
  const [interactionEvidenceState, setInteractionEvidenceState] = useState<{ key: string; value: InteractionEvidence | null }>({ key: "", value: null });
  const [interactionHydrationErrorState, setInteractionHydrationErrorState] = useState<{ key: string; message: string | null }>({ key: "", message: null });
  const [interactionHydrationRetry, setInteractionHydrationRetry] = useState(0);
  const tutorDrawer = useAppDrawer("lesson-tutor");
  const studyToolsDrawer = useAppDrawer("lesson-study-tools");
  const closeTutorDrawer = tutorDrawer.closeDrawer;
  const closeStudyToolsDrawer = studyToolsDrawer.closeDrawer;
  const tutorOpen = tutorDrawer.open;
  const studyToolsOpen = studyToolsDrawer.open;
  const openTutorDrawer = tutorDrawer.openDrawer;
  const [activePracticeState, setActivePracticeState] = useState<{ key: string; index: number }>({ key: "", index: 0 });
  const [reviewVariantState, setReviewVariantState] = useState<{ key: string; id: string | null }>({ key: "", id: null });
  const [reviewCommitState, setReviewCommitState] = useState<{ key: string; committed: boolean }>({ key: "", committed: false });
  const [lessonPaneState, setLessonPaneState] = useState<{ key: string; pane: LessonPane }>({ key: "", pane: "learn" });
  const [activitySectionState, setActivitySectionState] = useState<{ key: string; id: ActivitySectionId | null }>({ key: "", id: null });
  const [guidedPracticeState, setGuidedPracticeState] = useState<{ key: string; complete: boolean }>({ key: "", complete: false });
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatting, setChatting] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteDeviceSaved, setNoteDeviceSaved] = useState<boolean | null>(null);
  const [progressSyncError, setProgressSyncError] = useState<string | null>(null);
  const [reviewScheduleState, setReviewScheduleState] = useState<{ key: string; at: string | null }>({ key: "", at: null });
  const [calibrationState, setCalibrationState] = useState<{
    key: string;
    value: ConfidenceCalibration | null;
  }>({ key: "", value: null });
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const tutorInputRef = useRef<HTMLTextAreaElement>(null);
  const noteHydratedRef = useRef(false);
  const generationStartedAtRef = useRef(0);
  const generationRequestRef = useRef<{ lessonKey: string; requestId: string } | null>(null);
  const interactionAttemptKeysRef = useRef(new Map<string, string>());
  const progressOperationKeysRef = useRef(new Map<string, string>());
  const lessonLoadsInFlightRef = useRef(new Set<string>());
  const activeLessonViewRef = useRef(lessonViewKey);
  const progressOperationIdForView = useCallback((viewKey = lessonViewKey) => {
    const existing = progressOperationKeysRef.current.get(viewKey);
    if (existing) return existing;
    const created = createClientId();
    progressOperationKeysRef.current.set(viewKey, created);
    return created;
  }, [lessonViewKey]);
  const quizResults = useMemo(
    () => quizResultState.key === lessonViewKey ? quizResultState.results : {},
    [lessonViewKey, quizResultState],
  );
  const lessonObjectiveId = lessonData?.lessonDesign?.scopeBudget.primaryObjectiveId
    ?? `objective-m${moduleIndex}-l${lessonIndex}`;
  const quizVariants = useMemo(
    () => retrievalVariantsForQuizBank(lessonData?.quizzes ?? [], lessonObjectiveId, lessonId),
    [lessonData?.quizzes, lessonId, lessonObjectiveId],
  );
  const activeQuizEntries = useMemo(() => {
    if (!lessonData) return [];
    const entries = lessonData.quizzes.map((quiz, sourceIndex) => ({ quiz, sourceIndex, variant: quizVariants[sourceIndex] }));
    if (!reviewMode) return entries.filter(({ quiz }) => quiz.intendedUse !== "review");
    if (reviewVariantState.key !== lessonViewKey) return [];
    const selectedId = reviewVariantState.id;
    const reviewEntries = entries.filter(({ quiz }) => quiz.intendedUse !== "initial");
    const selected = reviewEntries.find(({ variant }) => variant?.id === selectedId);
    return selected ? [selected] : [];
  }, [lessonData, lessonViewKey, quizVariants, reviewMode, reviewVariantState]);
  const reviewVariantHydrated = !reviewMode || reviewVariantState.key === lessonViewKey;
  const complete = completionState.key === lessonViewKey && completionState.complete;
  const transferResponse = transferState.key === noteKey ? transferState.response : "";
  const transferRevealed = transferState.key === noteKey && transferState.revealed;
  const transferComplete = reviewMode || !lessonData?.transferTask || (transferRevealed && transferResponse.trim().length >= 20);
  const experienceValue = useMemo(() => lessonData?.experience
    ? experienceState.key === noteKey && experienceState.value?.type === lessonData.experience.type
      ? experienceState.value
      : { type: lessonData.experience.type, response: "", completed: false }
    : null, [experienceState, lessonData, noteKey]);
  const experienceComplete = reviewMode || !lessonData?.experience || experienceValue?.completed === true;
  const lessonInteractions = useMemo(
    () => lessonData ? deriveLessonInteractions(lessonData) : [],
    [lessonData],
  );
  const practiceInteraction = useMemo(
    () => lessonInteractions.find((interaction) => interaction.type === "recognition" && interaction.purpose === "practice") ?? null,
    [lessonInteractions],
  );
  const learningInteractions = useMemo(
    () => lessonInteractions.filter((interaction) => interaction.id !== practiceInteraction?.id),
    [lessonInteractions, practiceInteraction?.id],
  );
  const interactionEvidence = interactionEvidenceState.key === noteKey ? interactionEvidenceState.value : null;
  const interactionComplete = reviewMode || !practiceInteraction || Boolean(
    interactionEvidence?.interactionId === practiceInteraction.id && interactionEvidence.completed,
  );
  const lessonPane = lessonPaneState.key === lessonViewKey ? lessonPaneState.pane : reviewMode ? "activities" : "learn";
  const reviewRecallLocked = reviewMode && !(reviewCommitState.key === lessonViewKey && reviewCommitState.committed);
  const guidedPracticeComplete = reviewMode || !lessonData?.guidedPractice
    || (guidedPracticeState.key === noteKey && guidedPracticeState.complete);
  const lessonBookmarked = learnerState.lessonBookmarks.includes(noteKey);
  const activePracticeIndex = Math.min(
    activePracticeState.key === lessonViewKey ? activePracticeState.index : 0,
    Math.max(0, activeQuizEntries.length - 1),
  );
  const reviewScheduledAt = reviewScheduleState.key === noteKey ? reviewScheduleState.at : null;
  const confidenceCalibration = calibrationState.key === noteKey ? calibrationState.value : null;
  const activitySections = useMemo<ActivitySection[]>(() => {
    if (!lessonData) return [];
    if (reviewMode) return activeQuizEntries.length
      ? [{ id: "checks" as const, label: "Knowledge check", description: "One focused retrieval check" }]
      : [];
    return [
      ...(lessonData.experience ? [{ id: "experience" as const, label: "Active lesson", description: "Create evidence while you learn" }] : []),
      ...(practiceInteraction && !reviewMode ? [{
        id: "lab" as const,
        label: practiceInteraction.items.every((item) => item.stimulus.kind === "signal") ? "Pattern lab" : "Recognition lab",
        description: `${practiceInteraction.items.length} recognition challenges`,
      }] : []),
      ...(lessonData.guidedPractice ? [{ id: "guided" as const, label: "Guided practice", description: "Work through the method" }] : []),
      ...(lessonData.transferTask ? [{ id: "transfer" as const, label: "Transfer task", description: "Apply it in a new situation" }] : []),
      ...(activeQuizEntries.length ? [{ id: "checks" as const, label: "Knowledge checks", description: `${activeQuizEntries.length} retrieval ${activeQuizEntries.length === 1 ? "check" : "checks"}` }] : []),
    ];
  }, [activeQuizEntries.length, lessonData, practiceInteraction, reviewMode]);
  const requestedActivityId = activitySectionState.key === lessonViewKey ? activitySectionState.id : null;
  const activeActivityId = activitySections.some((section) => section.id === requestedActivityId)
    ? requestedActivityId
    : activitySections[0]?.id ?? null;
  const activeActivityIndex = Math.max(0, activitySections.findIndex((section) => section.id === activeActivityId));
  const checksComplete = Boolean(activeQuizEntries.length)
    && Object.keys(quizResults).length === activeQuizEntries.length;
  const completedActivityIds = useMemo(() => new Set<ActivitySectionId>([
    ...(complete ? activitySections.map((section) => section.id) : []),
    ...(!complete && lessonData?.experience && experienceComplete ? ["experience" as const] : []),
    ...(!complete && practiceInteraction && interactionComplete ? ["lab" as const] : []),
    ...(!complete && lessonData?.guidedPractice && guidedPracticeComplete ? ["guided" as const] : []),
    ...(!complete && lessonData?.transferTask && transferComplete ? ["transfer" as const] : []),
    ...(!complete && activeQuizEntries.length && checksComplete ? ["checks" as const] : []),
  ]), [activeQuizEntries.length, activitySections, checksComplete, complete, experienceComplete, guidedPracticeComplete, interactionComplete, lessonData, practiceInteraction, transferComplete]);
  const completedActivityCount = activitySections.filter((section) => completedActivityIds.has(section.id)).length;
  const canAdvanceCurrentActivity = activeActivityId === "guided"
    || Boolean(activeActivityId && completedActivityIds.has(activeActivityId));

  const selectLessonPane = (pane: LessonPane) => {
    if (pane === "learn" && reviewRecallLocked) return;
    setLessonPaneState({ key: lessonViewKey, pane });
  };

  const focusLessonPane = (pane: LessonPane) => {
    selectLessonPane(pane);
    requestAnimationFrame(() => document.getElementById(`lesson-${pane}-tab`)?.focus());
  };

  const handleLessonPaneKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextPane = event.key === "ArrowLeft" || event.key === "Home" ? "learn" : "activities";
    if (nextPane === "learn" && reviewRecallLocked) return;
    focusLessonPane(nextPane);
  };

  const selectActivitySection = (id: ActivitySectionId) => {
    if (activeActivityId === "guided" && id !== "guided") {
      setGuidedPracticeState({ key: noteKey, complete: true });
    }
    setActivitySectionState({ key: lessonViewKey, id });
  };

  const openLessonChecks = () => {
    selectLessonPane("activities");
    setActivitySectionState({ key: lessonViewKey, id: "checks" });
    closeStudyToolsDrawer();
    window.setTimeout(() => {
      document.getElementById("activity-checks-tab")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 180);
  };

  const handleActivityKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) || !activitySections.length) return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? activitySections.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + activitySections.length) % activitySections.length;
    const nextSection = activitySections[nextIndex];
    selectActivitySection(nextSection.id);
    requestAnimationFrame(() => document.getElementById(`activity-${nextSection.id}-tab`)?.focus());
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
      if (cancelled || !isCurrentLearnerSession(session)) return;
      let saved: LessonExperienceState | null = null;
      try {
        const parsed = readLearnerStorage<Partial<LessonExperienceState>>(user?.uid ?? null, "experience-draft", noteKey);
        if (parsed?.type === expectedType && typeof parsed.response === "string") {
          saved = { type: expectedType, response: parsed.response.slice(0, 8_000), completed: parsed.completed === true && parsed.response.trim().length >= 20 };
        }
      } catch {
        removeLearnerStorage(user?.uid ?? null, "experience-draft", noteKey);
      }
      setExperienceState((current) => current.key === noteKey
        ? current
        : { key: noteKey, value: saved ?? { type: expectedType, response: "", completed: false } });
    });
    return () => { cancelled = true; };
  }, [lessonData?.experience, noteKey, session, user?.uid]);

  useEffect(() => {
    if (!lessonData?.transferTask || transferState.key === noteKey) return;
    deferClientTask(() => {
      if (!isCurrentLearnerSession(session)) return;
      try {
        const parsed = readLearnerStorage<{ response?: unknown; revealed?: unknown }>(user?.uid ?? null, "transfer-draft", noteKey);
        const savedResponse = parsed?.response;
        if (typeof savedResponse === "string") {
          setTransferState((current) => current.key === noteKey ? current : {
            key: noteKey,
            response: savedResponse.slice(0, 8_000),
            revealed: parsed?.revealed === true && savedResponse.trim().length >= 20,
          });
        }
      } catch {
        removeLearnerStorage(user?.uid ?? null, "transfer-draft", noteKey);
      }
    });
  }, [lessonData?.transferTask, noteKey, session, transferState.key, user?.uid]);

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
      if (!isCurrentLearnerSession(session)) return;
      const timestamp = new Date().toISOString();
      updateLearnerState((current) => ({
        ...current,
        notes: { ...current.notes, [noteKey]: noteDraft },
        noteUpdatedAt: { ...current.noteUpdatedAt, [noteKey]: timestamp },
      }));
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [learnerState.notes, noteDraft, noteKey, session, updateLearnerState]);

  const updateNoteDraft = useCallback((value: string) => {
    if (!user || !isCurrentLearnerSession(session)) return;
    setNoteDraft(value);
    const local = readLearnerState(user.uid);
    const timestamp = new Date().toISOString();
    setNoteDeviceSaved(writeLearnerState({
      ...local, notes: { ...local.notes, [noteKey]: value },
      noteUpdatedAt: { ...local.noteUpdatedAt, [noteKey]: timestamp }, updatedAt: timestamp,
    }, user.uid));
  }, [noteKey, session, user]);

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
    const isCurrentView = () => isCurrentLearnerSession(session) && activeLessonViewRef.current === requestViewKey;
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
      const courseResponse = await learnerRequest(user, `/api/courses/${courseId}`);
      const courseData = await courseResponse.json();
      if (!isCurrentView()) return;
      if (!courseResponse.ok) throw new Error(courseData.error || "The course could not be opened.");

      const resolvedCourse = { ...courseData, id: courseId, courseId } as Course;
      const lesson = resolvedCourse.modules[moduleIndex]?.lessons[lessonIndex];
      if (!lesson) throw new Error("This lesson is not part of the course.");
      setCourseRecord({ key: requestViewKey, value: resolvedCourse });

      const lessonResponse = await learnerRequest(user, `/api/courses/${courseId}/lessons/${lessonId}`);
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
      const generationResponse = await learnerRequest(user, "/api/generate-lesson", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
      const generated = await generationResponse.json() as {
        error?: string;
        code?: string;
        resetAt?: string;
        diagnostic?: string[];
      } & LessonData;
      if (!isCurrentView()) return;
      if (!generationResponse.ok) {
        if (generated.code === "GENERATION_IN_PROGRESS" && generated.resetAt) {
          const waitSeconds = Math.max(1, Math.ceil((Date.parse(generated.resetAt) - Date.now()) / 1_000));
          throw new Error(`A previous lesson attempt is still closing. Try again in about ${waitSeconds} seconds.`);
        }
        const diagnostic = isOwner && generated.diagnostic?.length
          ? ` Diagnostic: ${generated.diagnostic.join(" · ")}`
          : "";
        throw new Error(`${generated.error || "The lesson could not be generated."}${diagnostic}`);
      }
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
  }, [authLoading, courseId, session, isOwner, moduleIndex, lessonIndex, lessonId, lessonViewKey, topic, user]);

  useEffect(() => {
    void Promise.resolve().then(loadLesson);
  }, [loadLesson]);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    const chooseReviewVariant = (savedLesson: CourseProgress["lessons"][string] | undefined) => {
      if (!reviewMode || !lessonData || cancelled) return;
      const reviewEligibleVariants = quizVariants.filter((_, index) => lessonData.quizzes[index]?.intendedUse !== "initial");
      const selected = selectRetrievalVariant(
        reviewEligibleVariants,
        savedLesson?.retrievalVariantExposures ?? [],
      );
      setReviewVariantState({ key: lessonViewKey, id: selected?.id ?? null });
      setActivePracticeState({ key: lessonViewKey, index: 0 });
      setQuizResultState({ key: lessonViewKey, results: {} });
    };
    const loadProgress = async () => {
      let progress = getLocalProgress(courseId, user?.uid ?? null);
      if (user) {
        try {
          const response = await learnerRequest(user, `/api/progress?courseId=${encodeURIComponent(courseId)}`, { cache: "no-store" });
          if (response.ok) {
            const data = await response.json() as { progress: CourseProgress | null };
            progress = data.progress ?? progress;
          }
        } catch {
          // The fallback belongs to this exact account; guests never inherit it.
        }
      }
      if (cancelled || !isCurrentLearnerSession(session)) return;
      setCompletionState({ key: lessonViewKey, complete: !reviewMode && Boolean(progress?.completedLessonIds.includes(lessonId)) });
      const savedLesson = progress?.lessons[lessonId];
      chooseReviewVariant(savedLesson);
      setReviewScheduleState({ key: noteKey, at: savedLesson?.nextReviewAt ?? null });
      if (savedLesson?.experienceEvidence) {
        setExperienceState((current) => current.key === noteKey && current.value?.response
          ? current
          : { key: noteKey, value: { ...savedLesson.experienceEvidence!, completed: true } });
      }
      if (savedLesson?.interactionEvidence) setInteractionEvidenceState({ key: noteKey, value: savedLesson.interactionEvidence });
    };
    void loadProgress();
    return () => { cancelled = true; };
  }, [courseId, lessonData, lessonId, lessonViewKey, noteKey, quizVariants, reviewMode, session, topic, user]);

  useEffect(() => {
    if (!courseId || !user || !practiceInteraction || reviewMode) return;
    let cancelled = false;
    const loadInteractionEvidence = async () => {
      setInteractionHydrationErrorState({ key: noteKey, message: null });
      const query = new URLSearchParams({
        courseId,
        lessonId,
        progressOperationId: progressOperationIdForView(),
        interactionId: practiceInteraction.id,
      });
      const response = await learnerRequest(user, `/api/lesson-interaction?${query.toString()}`, {
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({})) as { evidence?: InteractionEvidence; error?: string };
      if (!response.ok) throw new Error(data.error || "Saved practice progress could not be loaded.");
      if (!cancelled && isCurrentLearnerSession(session) && data.evidence?.interactionId === practiceInteraction.id && data.evidence.itemResults.length) {
        setInteractionEvidenceState({ key: noteKey, value: data.evidence });
      }
    };
    void loadInteractionEvidence().catch((loadError) => {
      if (!cancelled) setInteractionHydrationErrorState({
        key: noteKey,
        message: loadError instanceof Error ? loadError.message : "Saved practice progress could not be loaded.",
      });
    });
    return () => { cancelled = true; };
  }, [courseId, interactionHydrationRetry, lessonId, noteKey, practiceInteraction, progressOperationIdForView, reviewMode, session, user]);

  useEffect(() => {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    chatBottomRef.current?.scrollIntoView({ behavior, block: "nearest" });
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
  const essentialVisualFallback = lessonVisuals.length === 0
    && lessonData?.visualPlan?.applicability === "essential"
    ? lessonData.visualPlan.accessibleFallback
    : undefined;
  const lessonSpeechText = useMemo(() => {
    if (!lesson) return "";
    const at = (placement: "after-purpose" | "after-explanation" | "before-guided-practice") =>
      visualsToSpeech(lessonVisuals.filter((visual) => visual.placement === placement));
    return [
      `${lesson.title}.`,
      at("after-purpose"),
      markdownToSpeech(normalizedContent),
      at("after-explanation"),
      essentialVisualFallback?.content,
      interactionsToSpeech(lessonInteractions),
      at("before-guided-practice"),
    ].filter(Boolean).join(" ");
  }, [essentialVisualFallback?.content, lesson, lessonInteractions, lessonVisuals, normalizedContent]);

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
    if (!isCurrentLearnerSession(session) || !courseId || complete || !lessonData || !lesson || !transferComplete || !experienceComplete || !interactionComplete) return;
    if (reviewMode && (!reviewVariantHydrated || activeQuizEntries.length !== 1)) return;
    const operationViewKey = activeLessonViewRef.current;
    const isCurrentView = () => isCurrentLearnerSession(session) && activeLessonViewRef.current === operationViewKey;
    const results = Object.values(quizResults);
    if (activeQuizEntries.length && results.length !== activeQuizEntries.length) return;
    const confidences = results.map((result) => result.confidence);
    const confidence: Confidence = confidences.includes("low") ? "low" : confidences.includes("medium") ? "medium" : "high";
    const update: ProgressUpdate = {
      courseId,
      topic,
      lessonId,
      lessonTitle: lesson.title,
      objectiveId: lessonObjectiveId,
      prerequisiteObjectiveIds: lessonData.lessonDesign?.prerequisites.objectiveIds,
      retrievalVariantId: reviewMode ? activeQuizEntries[0]?.variant?.id : undefined,
      retrievalVariantIds: activeQuizEntries.flatMap(({ variant }) => variant ? [variant.id] : []),
      retrievalVariantBank: quizVariants.filter((_, index) => lessonData.quizzes[index]?.intendedUse !== "initial"),
      totalQuestions: activeQuizEntries.length + (interactionEvidence?.itemCount ?? 0),
      firstAttemptCorrect: results.filter((result) => result.firstAttemptCorrect).length + (interactionEvidence?.firstAttemptCorrect ?? 0),
      attempts: results.reduce((sum, result) => sum + result.attempts, 0) + (interactionEvidence?.attempts ?? 0),
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
        interactionEvidence: !reviewMode && interactionEvidence?.completed
          ? interactionEvidence
          : undefined,
      },
    };

    setProgressSyncError(null);
    if (!user) {
      const localProgress = saveLocalProgress(update, null);
      setReviewScheduleState({ key: noteKey, at: localProgress.lessons[lessonId]?.nextReviewAt ?? null });
      setCalibrationState({ key: noteKey, value: localProgress.lessons[lessonId]?.calibration ?? null });
    }
    const requiresCloudCompletion = Boolean(user);
    let cloudSaved = !user;
    if (user) {
      try {
        const progressOperationId = progressOperationIdForView(operationViewKey);
        const response = await learnerRequest(user, "/api/progress", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": progressOperationId },
          body: JSON.stringify(update),
        });
        const data = await response.json().catch(() => ({})) as {
          nextReviewAt?: string;
          calibration?: ConfidenceCalibration;
        };
        if (!isCurrentView()) return;
        if (!response.ok) throw new Error("Progress was not verified. Keep this page open and try the activity again.");
        progressOperationKeysRef.current.delete(operationViewKey);
        cloudSaved = true;
        saveLocalProgress(update, user?.uid ?? null);
        if (isCurrentView() && data.nextReviewAt) setReviewScheduleState({ key: noteKey, at: data.nextReviewAt });
        if (isCurrentView() && data.calibration) setCalibrationState({ key: noteKey, value: data.calibration });
      } catch (saveError) {
        if (isCurrentView()) setProgressSyncError(saveError instanceof Error ? saveError.message : "Progress could not be verified yet.");
      }
    }
    if (!isCurrentView() || (requiresCloudCompletion && !cloudSaved)) return;
    const observedAt = new Date().toISOString();
    const objectiveId = lessonObjectiveId;
    const firstTryScore = update.totalQuestions
      ? update.firstAttemptCorrect / update.totalQuestions
      : 1;
    if (isCurrentView()) setCompletionState({ key: lessonViewKey, complete: true });
    if (cloudSaved) {
        removeLearnerStorage(user?.uid ?? null, "experience-draft", noteKey);
        removeLearnerStorage(user?.uid ?? null, "transfer-draft", noteKey);
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
      ...(activeQuizEntries.length ? [{
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
      if (activeQuizEntries.length) {
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
  }, [activeQuizEntries, addMasteryEvidence, allLessons.length, complete, courseId, experienceComplete, experienceValue, interactionComplete, interactionEvidence, isOwner, lesson, lessonData, lessonId, lessonObjectiveId, lessonViewKey, masteryPlan, nextLesson, noteKey, progressOperationIdForView, quizResults, quizVariants, reviewKind, reviewMode, reviewVariantHydrated, session, topic, transferComplete, transferResponse, user]);

  const onMastered = (index: number, result: QuizResult) => {
    setQuizResultState((current) => ({ key: lessonViewKey, results: { ...(current.key === lessonViewKey ? current.results : {}), [index]: result } }));
  };

  const advancePractice = () => {
    if (!activeQuizEntries.length) return;
    setActivePracticeState({
      key: lessonViewKey,
      index: Math.min(activePracticeIndex + 1, activeQuizEntries.length - 1),
    });
  };

  useEffect(() => {
    if (!activeQuizEntries.length || complete) return;
    if (Object.keys(quizResults).length !== activeQuizEntries.length) return;
    if (!transferComplete || !experienceComplete || !interactionComplete) return;
    const timeout = window.setTimeout(() => { void markComplete(); }, 250);
    return () => window.clearTimeout(timeout);
  }, [activeQuizEntries.length, complete, experienceComplete, interactionComplete, markComplete, quizResults, transferComplete]);

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const input = chatInput.trim();
    if (!input || !lessonData || !lesson || !courseId || !user || chatting) return;
    const operationViewKey = activeLessonViewRef.current;
    const isCurrentView = () => isCurrentLearnerSession(session) && activeLessonViewRef.current === operationViewKey;
    const nextMessages: Message[] = [...messages, { id: createClientId(), role: "user", content: input }];
    setMessages(nextMessages);
    setChatInput("");
    setChatting(true);
    setChatError(null);

    try {
      const response = await learnerRequest(user, "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": createClientId() },
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

  const chooseTutorPrompt = (prompt: string) => {
    setChatInput(prompt);
    requestAnimationFrame(() => tutorInputRef.current?.focus());
  };

  const openTutorWithPrompt = (prompt: string) => {
    setChatInput(prompt);
    closeStudyToolsDrawer();
    openTutorDrawer();
    window.setTimeout(() => tutorInputRef.current?.focus(), 180);
  };

  const updateExperienceEvidence = useCallback((value: LessonExperienceState) => {
    if (!isCurrentLearnerSession(session)) return;
    setExperienceState({ key: noteKey, value });
    try {
      setExperienceDeviceSaved(writeLearnerStorage(user?.uid ?? null, "experience-draft", noteKey, value));
    } catch {
      // Storage can be unavailable in private browsing; the in-memory draft still works.
    }
  }, [noteKey, session, user]);

  const updateTransferDraft = useCallback((response: string, revealed: boolean) => {
    if (!isCurrentLearnerSession(session)) return;
    const value = { key: noteKey, response, revealed };
    setTransferState(value);
    try {
      setTransferDeviceSaved(writeLearnerStorage(user?.uid ?? null, "transfer-draft", noteKey, { response, revealed }));
    } catch {
      // Storage can be unavailable in private browsing; the in-memory draft still works.
    }
  }, [noteKey, session, user]);

  const verifyAuthorAnswer = useCallback(async (quizIndex: number, optionIndex: number) => {
    if (!courseId || !lessonData) throw new Error("This activity is not ready.");
    const response = await learnerRequest(user, "/api/lesson-activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId,
        lessonId,
        progressOperationId: progressOperationIdForView(),
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
    if (!isCurrentLearnerSession(session)) throw new Error("Your learning session changed. Try again after signing in.");
    if (!response.ok || typeof data.correct !== "boolean" || typeof data.attempts !== "number") {
      throw new Error(data.error || "This answer could not be verified.");
    }
    return {
      correct: data.correct,
      attempts: data.attempts,
      firstAttemptCorrect: data.firstAttemptCorrect === true,
      receipt: data.receipt,
    };
  }, [courseId, lessonData, lessonId, progressOperationIdForView, session, user]);

  const verifyRecognitionAnswer = useCallback(async (itemId: string, selectedIndex: number) => {
    if (!courseId || !practiceInteraction) throw new Error("This practice lab is not ready.");
    if (!user) throw new Error("Sign in again to verify this response.");
    const progressOperationId = progressOperationIdForView();
    const attemptKey = `${progressOperationId}:${practiceInteraction.id}:${itemId}:${selectedIndex}`;
    let idempotencyKey = interactionAttemptKeysRef.current.get(attemptKey);
    if (!idempotencyKey) {
      idempotencyKey = createClientId();
      interactionAttemptKeysRef.current.set(attemptKey, idempotencyKey);
    }
    const response = await learnerRequest(user, "/api/lesson-interaction", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        courseId,
        lessonId,
        progressOperationId,
        interactionId: practiceInteraction.id,
        itemId,
        selectedIndex,
      }),
    });
    const data = await response.json().catch(() => ({})) as {
      error?: string;
      correct?: boolean;
      attempts?: number;
      firstAttemptCorrect?: boolean;
      receipt?: string;
    };
    if (!isCurrentLearnerSession(session)) throw new Error("Your learning session changed. Try again after signing in.");
    if (!response.ok || typeof data.correct !== "boolean" || typeof data.attempts !== "number") {
      throw new Error(data.error || "This practice response could not be verified.");
    }
    interactionAttemptKeysRef.current.delete(attemptKey);
    return {
      correct: data.correct,
      attempts: data.attempts,
      firstAttemptCorrect: data.firstAttemptCorrect === true,
      receipt: data.receipt,
    };
  }, [courseId, lessonId, practiceInteraction, progressOperationIdForView, session, user]);

  const courseHref = `/course/${encodeURIComponent(topic)}${courseId ? `?id=${encodeURIComponent(courseId)}` : ""}`;
  const lessonHref = (id: string) => `/course/${encodeURIComponent(topic)}/lesson/${id}${courseId ? `?id=${encodeURIComponent(courseId)}` : ""}`;

  if (!authLoading && !user) {
    return (
      <AppShell activeTopic={topic} activeLessonId={lessonId} activeCourseId={courseId}>
        <div className="center-state lesson-account-gate">
          <span className="state-icon"><LockKeyhole size={23} /></span>
          <p className="overline">Free learner account required</p>
          <h1>Open the lesson when you’re signed in</h1>
          <p>You can inspect the complete course structure as a guest. {entryMode === "create"
            ? "Create a free account to read lessons, practice, and keep your progress."
            : entryMode === "sign-in"
              ? "Sign in to your existing account to read lessons, practice, and keep your progress."
              : "Lesson sign-in is unavailable right now; the public course outline remains available."}</p>
          <div className="state-actions">
            <AccountEntryButton icon={LockKeyhole} />
            <a className="button button-secondary" href={courseHref}><ArrowLeft size={16} /> Back to course</a>
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
                <span className="brand-mark" aria-hidden="true"><FilosageMark /></span>
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
              <p className="lesson-generation-note">This usually takes less than a minute. Keep this page open while Filosage prepares the explanation, examples, and practice.</p>
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
            <Link className="button button-secondary" href={`/course/${encodeURIComponent(topic)}${courseId ? `?id=${courseId}` : ""}`}><ArrowLeft size={16} /> Back to course</Link>
            {canGenerateLessons && <button className="button button-primary" onClick={loadLesson}>Try again</button>}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell activeTopic={topic} activeLessonId={lessonId} activeCourseId={courseId} activeCourse={course}>
      <div className="lesson-page">
        <header className="lesson-toolbar">
          <nav aria-label="Breadcrumb">
            <Link href={`/course/${encodeURIComponent(topic)}?id=${courseId}`}>{topic}</Link>
            <ChevronRight size={14} />
            <span>{currentModule?.title}</span>
          </nav>
          <div className="lesson-toolbar-actions">
            <span>{currentPosition + 1} of {allLessons.length}</span>
            {lessonData && lesson && !reviewRecallLocked && (
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
              aria-describedby={reviewRecallLocked ? "review-cues-locked" : undefined}
              disabled={reviewRecallLocked}
              onClick={studyToolsDrawer.toggleDrawer}
            >
              <NotebookPen size={16} /> {studyToolsOpen ? "Close tools" : "Study tools"}
            </button>
            {user ? (
              <button className={`button button-secondary button-small ${tutorOpen ? "is-active" : ""}`} onClick={tutorDrawer.toggleDrawer} aria-expanded={tutorOpen} aria-describedby={reviewRecallLocked ? "review-cues-locked" : undefined} disabled={reviewRecallLocked}>
                <MessageSquareText size={16} /> {tutorOpen ? "Close Filosage" : "Ask Filosage"}
              </button>
            ) : (
              <span className="owner-only-note"><LockKeyhole size={14} /> Sign in for lesson help</span>
            )}
            {reviewRecallLocked && <span id="review-cues-locked" className="review-cue-lock-note" role="status"><LockKeyhole size={14} /> Answer from memory to see lesson cues</span>}
          </div>
        </header>

        <div className="lesson-workspace">
          <article className="lesson-scroll">
            <div className={`reading-column lesson-${lessonPane}-pane`}>
              <div className="lesson-progress-top" role="progressbar" aria-label="Course progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={lessonProgress}><span style={{ transform: `scaleX(${lessonProgress / 100})` }} /></div>
              <header className="lesson-title-block">
                <p className="overline">{currentModule?.title}</p>
                <h1>{lesson.title}</h1>
                {reviewRecallLocked
                  ? <p>Complete the recall check before reviewing the lesson summary.</p>
                  : <p>{lesson.concept}</p>}
              </header>

              <div className="lesson-mode-tabs" role="tablist" aria-label="Lesson workspace">
                <button id="lesson-learn-tab" type="button" role="tab" aria-selected={lessonPane === "learn"} aria-controls="lesson-pane-content" aria-describedby={reviewRecallLocked ? "review-cues-locked" : undefined} disabled={reviewRecallLocked} tabIndex={lessonPane === "learn" ? 0 : -1} className={lessonPane === "learn" ? "is-active" : ""} onClick={() => selectLessonPane("learn")} onKeyDown={handleLessonPaneKeyDown}>
                  <BookOpenText size={17} /><span><strong>Learn</strong><small>Explanation and key ideas</small></span>
                </button>
                <button id="lesson-activities-tab" type="button" role="tab" aria-selected={lessonPane === "activities"} aria-controls="lesson-pane-content" tabIndex={lessonPane === "activities" ? 0 : -1} className={lessonPane === "activities" ? "is-active" : ""} onClick={() => selectLessonPane("activities")} onKeyDown={handleLessonPaneKeyDown}>
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
                          <button key={section.id} id={`activity-${section.id}-tab`} type="button" role="tab" aria-selected={activeActivityId === section.id} aria-controls="lesson-active-activity" tabIndex={activeActivityId === section.id ? 0 : -1} className={`${activeActivityId === section.id ? "is-active" : ""} ${sectionComplete ? "is-complete" : ""}`} onClick={() => selectActivitySection(section.id)} onKeyDown={(event) => handleActivityKeyDown(event, index)}>
                            <span>{sectionComplete ? <Check size={15} /> : index + 1}</span><strong>{section.label}</strong><small>{section.description}</small>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div key={lessonPane === "learn" ? "learn" : `activities-${activeActivityId}`} id="lesson-pane-content" className="lesson-pane-content" role="tabpanel" aria-labelledby={lessonPane === "learn" ? "lesson-learn-tab" : "lesson-activities-tab"}>

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
                <div id="lesson-active-activity" role="tabpanel" aria-labelledby="activity-experience-tab"><LessonExperience experience={lessonData.experience} value={experienceValue} onChange={updateExperienceEvidence} deviceSaved={experienceDeviceSaved} /></div>
              )}

              {lessonPane === "learn" && <div className="markdown-content" id="lesson-explanation"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ h2: ({ children }) => <h2 tabIndex={-1}>{children}</h2>, h3: ({ children }) => <h3 tabIndex={-1}>{children}</h3> }}>{normalizedContent}</ReactMarkdown></div>}

              {lessonPane === "learn" && lessonVisuals.filter((visual) => visual.placement === "after-explanation").map((visual) => <LessonVisualRenderer key={visual.id} visual={visual} />)}

              {lessonPane === "learn" && essentialVisualFallback && (
                <section className="lesson-visual-fallback" aria-labelledby="lesson-visual-fallback-title">
                  <p className="overline">Instructional visual alternative</p>
                  <h2 id="lesson-visual-fallback-title">Equivalent text representation</h2>
                  <div className="markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{essentialVisualFallback.content}</ReactMarkdown>
                  </div>
                </section>
              )}

              {lessonPane === "learn" && learningInteractions.map((interaction) => <InteractiveLessonBlock key={interaction.id} interaction={interaction} />)}

              {lessonPane === "activities" && activeActivityId === "lab" && practiceInteraction && (
                <div id="lesson-active-activity" role="tabpanel" aria-labelledby="activity-lab-tab">
                  {interactionHydrationErrorState.key === noteKey && interactionHydrationErrorState.message && (
                    <div className="form-error" role="alert">
                      <p>{interactionHydrationErrorState.message}</p>
                      <button className="button button-secondary button-small" type="button" onClick={() => setInteractionHydrationRetry((value) => value + 1)}>Retry saved progress</button>
                    </div>
                  )}
                  <InteractiveLessonBlock
                    key={`${noteKey}-${practiceInteraction.id}`}
                    interaction={practiceInteraction}
                    evidence={interactionEvidence ?? undefined}
                    onProgress={(value) => setInteractionEvidenceState({ key: noteKey, value })}
                    verifyRecognitionAnswer={verifyRecognitionAnswer}
                  />
                </div>
              )}

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
                  <small>{transferDeviceSaved === false ? "This browser could not save your draft. Keep this page open and copy your response before leaving." : transferResponse ? "This draft is saved on this device. On completion, it becomes part of your private learning evidence and is not sent to the tutor." : "Your response will be saved on this device as you write."}</small>
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

              {lessonPane === "activities" && activeActivityId === "checks" && activeQuizEntries.length > 0 && (
                <section id="lesson-active-activity" className="lesson-section checks-section" role="tabpanel" aria-labelledby="activity-checks-tab checks-title">
                  <div className="lesson-section-heading">
                    <p className="overline">Retrieval practice</p>
                    <h2 id="checks-title">Check your understanding</h2>
                    <p>Work through one activity at a time. Recall first, choose the best option, then rate your confidence.</p>
                  </div>
                  <div className="practice-sequence-status" aria-live="polite">
                    <span>Practice {activePracticeIndex + 1} of {activeQuizEntries.length}</span>
                    <span>{Object.keys(quizResults).length} complete</span>
                  </div>
                  <div className="practice-sequence-track" role="progressbar" aria-label="Retrieval practice progress" aria-valuemin={0} aria-valuemax={activeQuizEntries.length} aria-valuenow={Object.keys(quizResults).length}>
                    <span style={{ transform: `scaleX(${Object.keys(quizResults).length / activeQuizEntries.length})` }} />
                  </div>
                  <div className="knowledge-list">
                    <KnowledgeCheck
                      key={`${noteKey}-${activeQuizEntries[activePracticeIndex].sourceIndex}-${activeQuizEntries[activePracticeIndex].quiz.question}`}
                      quiz={activeQuizEntries[activePracticeIndex].quiz}
                      index={activeQuizEntries[activePracticeIndex].sourceIndex}
                      position={activePracticeIndex}
                      total={activeQuizEntries.length}
                      onMastered={onMastered}
                      onCommit={reviewMode ? () => setReviewCommitState({ key: lessonViewKey, committed: true }) : undefined}
                      onContinue={activePracticeIndex < activeQuizEntries.length - 1 ? advancePractice : undefined}
                      verifyAnswer={user
                        ? (optionIndex) => verifyAuthorAnswer(activeQuizEntries[activePracticeIndex].sourceIndex, optionIndex)
                        : undefined}
                    />
                  </div>
                </section>
              )}

              {lessonPane === "activities" && reviewMode && !reviewVariantHydrated && (
                <div className="lesson-activities-empty" aria-live="polite"><LoaderCircle className="spin" size={22} /><div><strong>Preparing this review</strong><p>Choosing a retrieval variant you have seen least recently.</p></div></div>
              )}

              {lessonPane === "activities" && reviewVariantHydrated && activitySections.length === 0 && (
                <div className="lesson-activities-empty"><CheckCircle2 size={22} /><div><strong>No additional activities</strong><p>Confirm that you reviewed the explanation to finish this lesson.</p></div></div>
              )}

              {lessonPane === "activities" && activitySections.length > 0 && (
                <div className="activity-panel-navigation">
                  <button className="button button-secondary" type="button" disabled={activeActivityIndex === 0} onClick={() => moveThroughActivities(-1)}><ArrowLeft size={16} /> Previous activity</button>
                  {activeActivityIndex < activitySections.length - 1 ? (
                    <span className="activity-panel-next">
                      {!canAdvanceCurrentActivity && <small id="activity-navigation-requirement">Complete and save this activity to continue.</small>}
                      <button className="button button-primary" type="button" disabled={!canAdvanceCurrentActivity} aria-describedby={!canAdvanceCurrentActivity ? "activity-navigation-requirement" : undefined} onClick={() => moveThroughActivities(1)}>Next activity <ArrowRight size={16} /></button>
                    </span>
                  ) : activeActivityId === "guided" && !guidedPracticeComplete ? (
                    <button className="button button-primary" type="button" onClick={() => setGuidedPracticeState({ key: noteKey, complete: true })}><Check size={16} /> Mark practice reviewed</button>
                  ) : null}
                </div>
              )}

              {lessonPane === "activities" && reviewVariantHydrated && <div className={`completion-banner ${complete ? "is-complete" : ""}`} role="status" aria-live="polite">
                <div>{complete ? <CheckCircle2 size={22} /> : <CircleAlert size={22} />}</div>
                <span>
                  <strong>{complete ? (reviewMode ? `${reviewKindLabel(reviewKind)} complete` : "Lesson complete") : "Complete the activities"}</strong>
                  <small>{complete ? (
                    progressSyncError
                    || `${user ? "Progress synced." : "Progress saved on this device."}${reviewScheduledAt ? ` Review scheduled for ${new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric" }).format(new Date(reviewScheduledAt))}.` : user ? " Your next review has been scheduled." : " Sign in to sync it."}`
                  ) : !experienceComplete ? "Complete and save the active lesson response before finishing the other activities." : !interactionComplete ? "Finish the practice lab, including focused retries for missed items." : lessonData.transferTask && !transferComplete ? "Complete the transfer task, then finish each retrieval check." : "Answer every prompt correctly and rate your confidence."}</small>
                  {complete && confidenceCalibration && (
                    <em className={`calibration-note is-${confidenceCalibration}`}>
                      {calibrationMessage(confidenceCalibration)}
                    </em>
                  )}
                </span>
                {!complete && activeQuizEntries.length === 0 && transferComplete && experienceComplete && interactionComplete && (
                  <button className="button button-secondary button-small" onClick={() => void markComplete()}>Mark learned</button>
                )}
              </div>}

              {lessonPane === "learn" && courseId && (
                <LessonIntegrityPanel
                  key={noteKey}
                  courseId={courseId}
                  lessonId={lessonId}
                  provenance={lessonData.provenance}
                  design={lessonData.lessonDesign}
                  getAuthToken={getToken}
                />
              )}

              <nav className="lesson-navigation" aria-label="Lesson navigation">
                {previousLesson ? (
                  <a className="lesson-nav-link lesson-nav-previous" href={lessonHref(previousLesson.id)}>
                    <ArrowLeft size={17} /><span><small>Previous</small><strong>{previousLesson.title}</strong></span>
                  </a>
                ) : (
                  <a className="lesson-nav-link lesson-nav-previous" href={courseHref}>
                    <ArrowLeft size={17} /><span><small>Return to</small><strong>Course overview</strong></span>
                  </a>
                )}
                {nextLesson && (
                  <a className="lesson-nav-link lesson-nav-next" href={lessonHref(nextLesson.id)}>
                    <span><small>Next lesson</small><strong>{nextLesson.title}</strong></span><ArrowRight size={17} />
                  </a>
                )}
              </nav>
              </div>
            </div>
          </article>

          {!reviewRecallLocked && !tutorOpen && studyToolsOpen && (
            <AppDrawer open={studyToolsOpen} onClose={studyToolsDrawer.closeDrawer} labelledBy="study-tools-title" size="medium" mobilePlacement="bottom" desktopPresentation="floating" draggable dragLabel="Study workspace window" className="lesson-study-app-drawer">
              <LessonStudyTools
                lessonKey={noteKey}
                courseId={courseId!}
                courseTopic={topic}
                lessonId={lessonId}
                moduleIndex={moduleIndex}
                lessonTitle={lesson.title}
                lessonConcept={lesson.concept}
                lessonContent={lessonData.content}
                learningObjective={lessonData.learningObjective}
                keyTakeaways={lessonData.keyTakeaways}
                quizzes={lessonData.quizzes}
                quizOutcomes={quizResults}
                noteDraft={noteDraft}
                onNoteChange={updateNoteDraft}
                noteStatus={noteDeviceSaved === false && learnerSyncStatus !== "saved" ? "This browser could not save your draft. Keep this page open." : noteDraft !== (learnerState.notes[noteKey] ?? "") ? "Saved on this device" : learnerSyncStatus === "saving" ? "Saving…" : learnerSyncStatus === "error" ? learnerSyncError ?? "Could not save" : learnerSyncStatus === "saved" ? "Saved" : user ? "Synced" : "On this device"}
                noteStatusIsError={learnerSyncStatus === "error"}
                canUseTutor={Boolean(user)}
                experienceAvailable={Boolean(lessonData.experience)}
                experienceComplete={experienceComplete}
                guidedPracticeAvailable={Boolean(lessonData.guidedPractice)}
                guidedPracticeComplete={guidedPracticeComplete}
                transferAvailable={Boolean(lessonData.transferTask)}
                transferComplete={transferComplete}
                checksComplete={checksComplete}
                onClose={studyToolsDrawer.closeDrawer}
                onOpenTutor={openTutorWithPrompt}
                onOpenChecks={openLessonChecks}
              />
            </AppDrawer>
          )}

          {!reviewRecallLocked && user && tutorOpen && (
            <AppDrawer open={tutorOpen} onClose={tutorDrawer.closeDrawer} labelledBy="tutor-title" size="medium" mobilePlacement="full" desktopPresentation="floating" draggable dragLabel="Ask Filosage window" className="tutor-app-drawer">
            <aside className="tutor-drawer">
              <header className="tutor-header">
                <span className="tutor-avatar"><FilosageMark /></span>
                <div className="tutor-heading"><span>Lesson tutor</span><strong id="tutor-title">Ask Filosage</strong><small>Grounded in “{lesson.title}”</small></div>
                <span className="tutor-grounded-status"><span aria-hidden="true" /> Lesson-aware</span>
                <button className="icon-button" onClick={tutorDrawer.closeDrawer} aria-label="Close tutor"><X size={18} /></button>
              </header>
              <div className="tutor-messages" aria-live="polite">
                {messages.length === 0 && (
                  <div className="tutor-welcome" data-ai-generated="true">
                    <div className="tutor-context-card"><span><Target size={18} /></span><div><small>Current focus</small><strong>{lesson.concept}</strong></div></div>
                    <div className="tutor-welcome-copy"><strong>Where should we begin?</strong><p>Choose a prompt or ask about any concept, example, or answer choice in this lesson.</p></div>
                    <div className="tutor-starters" aria-label="Suggested tutor prompts">
                      <button type="button" onClick={() => chooseTutorPrompt("Give me a small hint about the central idea without giving away the full answer.")}><Lightbulb size={16} /><span><strong>Give me a hint</strong><small>Start with one useful nudge</small></span><ArrowRight size={15} /></button>
                      <button type="button" onClick={() => chooseTutorPrompt(`Quiz me on “${lesson.title}” one question at a time. Wait for my answer before responding.`)}><ListChecks size={16} /><span><strong>Quiz me</strong><small>One question at a time</small></span><ArrowRight size={15} /></button>
                      <button type="button" onClick={() => chooseTutorPrompt(`Explain “${lesson.concept}” with a fresh, concrete example that is not already in the lesson.`)}><Waypoints size={16} /><span><strong>Use a fresh example</strong><small>See the idea in another context</small></span><ArrowRight size={15} /></button>
                    </div>
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
                    ref={tutorInputRef}
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder="Ask a question or choose a prompt above"
                    rows={3}
                    maxLength={4_000}
                  />
                  <button className="icon-button icon-button-accent" type="submit" disabled={!chatInput.trim() || chatting} aria-label="Send question">
                    {chatting ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}
                  </button>
                </div>
                <div className="tutor-composer-meta"><small>Enter to send · Shift+Enter for a new line</small><small className="tutor-disclaimer">AI can make mistakes. Verify important information.</small></div>
              </form>
            </aside>
            </AppDrawer>
          )}
        </div>
      </div>
    </AppShell>
  );
}
