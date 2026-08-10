"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  Brain,
  CalendarClock,
  CheckCircle2,
  Circle,
  Layers3,
  Lightbulb,
  MessageSquareText,
  NotebookPen,
  RefreshCw,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import type { Quiz } from "@/lib/course-types";

type StudyTool = "notes" | "flashcards" | "practice";
type ReviewRating = "again" | "got-it";

interface LessonStudyToolsProps {
  lessonKey: string;
  lessonTitle: string;
  lessonConcept: string;
  lessonContent: string;
  learningObjective?: string;
  keyTakeaways?: string[];
  quizzes: Quiz[];
  quizOutcomes: Record<number, { firstAttemptCorrect: boolean }>;
  noteDraft: string;
  onNoteChange: (value: string) => void;
  noteStatus: string;
  noteStatusIsError: boolean;
  canUseTutor: boolean;
  experienceAvailable: boolean;
  experienceComplete: boolean;
  guidedPracticeAvailable: boolean;
  guidedPracticeComplete: boolean;
  transferAvailable: boolean;
  transferComplete: boolean;
  checksComplete: boolean;
  onClose: () => void;
  onOpenTutor: (prompt: string) => void;
  onOpenChecks: () => void;
}

const TOOLS: Array<{ id: StudyTool; label: string; icon: typeof NotebookPen }> = [
  { id: "notes", label: "Notes", icon: NotebookPen },
  { id: "flashcards", label: "Flashcards", icon: Layers3 },
  { id: "practice", label: "Next steps", icon: Brain },
];

interface StudyFlashcard {
  id: string;
  prompt: string;
  answer: string;
  detail: string;
}

interface ReviewSession {
  version: 1;
  signature: string;
  queue: string[];
  currentIndex: number;
  ratings: Record<string, ReviewRating>;
  attempts: Record<string, number>;
  completed: boolean;
  nextReviewAt: string | null;
}

function plainLessonText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/[>*_`|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function concise(value: string, maximum = 520) {
  const cleaned = plainLessonText(value);
  if (cleaned.length <= maximum) return cleaned;
  const shortened = cleaned.slice(0, maximum + 1);
  const finalBreak = Math.max(shortened.lastIndexOf(". "), shortened.lastIndexOf("; "), shortened.lastIndexOf(", "));
  return `${shortened.slice(0, finalBreak > maximum * 0.6 ? finalBreak + 1 : maximum).trim()}...`;
}

function contentSectionCards(content: string, lessonTitle: string): StudyFlashcard[] {
  return content
    .split(/\n(?=#{1,6}\s)/g)
    .flatMap((section, index) => {
      const lines = section.trim().split("\n");
      const headingMatch = lines[0]?.match(/^#{1,6}\s+(.+)$/);
      const heading = concise(headingMatch?.[1] ?? (index === 0 ? lessonTitle : "this part of the lesson"), 90);
      const answer = concise(headingMatch ? lines.slice(1).join("\n") : section);
      if (answer.length < 35) return [];
      return [{
        id: `section-${index}`,
        prompt: `What should you remember about "${heading}"?`,
        answer,
        detail: `From the "${heading}" section of this lesson.`,
      }];
    });
}

function buildLessonFlashcards({
  lessonTitle,
  lessonConcept,
  lessonContent,
  learningObjective,
  keyTakeaways = [],
  quizzes,
  quizOutcomes,
}: Pick<LessonStudyToolsProps, "lessonTitle" | "lessonConcept" | "lessonContent" | "learningObjective" | "keyTakeaways" | "quizzes" | "quizOutcomes">) {
  const cleanedContent = plainLessonText(lessonContent);
  const sentences = cleanedContent.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => concise(sentence)).filter((sentence) => sentence.length >= 45) ?? [];
  const attemptedQuizIndexes = Object.keys(quizOutcomes)
    .map(Number)
    .filter((index) => Number.isInteger(index) && quizzes[index])
    .sort((left, right) => Number(quizOutcomes[left].firstAttemptCorrect) - Number(quizOutcomes[right].firstAttemptCorrect));
  const desiredCount = Math.min(10, Math.max(4,
    1 + Math.ceil(cleanedContent.length / 650) + attemptedQuizIndexes.length + keyTakeaways.length,
  ));
  const candidates: StudyFlashcard[] = [
    {
      id: "concept",
      prompt: `Explain the central idea of "${lessonTitle}" in your own words.`,
      answer: concise(lessonConcept),
      detail: "Use the lesson concept as your anchor.",
    },
    ...(learningObjective ? [{
      id: "objective",
      prompt: "What should you be able to do after this lesson?",
      answer: concise(learningObjective),
      detail: "This is the lesson's learning objective.",
    }] : []),
    ...keyTakeaways.map((takeaway, index) => ({
      id: `takeaway-${index}`,
      prompt: `Recall key takeaway ${index + 1}.`,
      answer: concise(takeaway),
      detail: "A checked takeaway from the lesson.",
    })),
    ...attemptedQuizIndexes.map((index) => {
      const quiz = quizzes[index];
      return {
        id: `check-${index}`,
        prompt: concise(quiz.question, 280),
        answer: concise(quiz.options[quiz.correctIndex] ?? quiz.explanation),
        detail: quizOutcomes[index].firstAttemptCorrect
          ? "From a lesson check you completed."
          : `Worth another look: ${concise(quiz.explanation)}`,
      };
    }),
    ...contentSectionCards(lessonContent, lessonTitle),
    ...sentences.map((sentence, index) => ({
      id: `sentence-${index}`,
      prompt: `Which lesson idea begins "${sentence.split(" ").slice(0, 7).join(" ")}..."?`,
      answer: sentence,
      detail: "Recall the complete idea before revealing it.",
    })),
    {
      id: "why-it-matters",
      prompt: `Why does "${lessonTitle}" matter?`,
      answer: concise(learningObjective ?? lessonConcept),
      detail: "Connect the concept to the outcome of the lesson.",
    },
    {
      id: "demonstrate-understanding",
      prompt: "What would demonstrate that you understand this lesson?",
      answer: concise(learningObjective ?? `Explain ${lessonConcept} and apply it to a new situation.`),
      detail: "Aim for an explanation you could use beyond this lesson.",
    },
    {
      id: "retrieve-first",
      prompt: "What idea should you retrieve first when this topic comes up?",
      answer: concise(sentences[0] ?? lessonConcept),
      detail: "Start with the idea that organizes the rest of the lesson.",
    },
  ];
  const uniqueCards: StudyFlashcard[] = [];
  const seen = new Set<string>();
  for (const card of candidates) {
    if (!card.prompt || !card.answer) continue;
    const key = `${card.prompt.toLocaleLowerCase()}::${card.answer.toLocaleLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueCards.push(card);
    if (uniqueCards.length === desiredCount) break;
  }
  return uniqueCards.slice(0, 10);
}

function shuffled<T>(values: T[]) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomValues = new Uint32Array(1);
    crypto.getRandomValues(randomValues);
    const swapIndex = randomValues[0] % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function nextReviewDate(hasWeakCards: boolean) {
  const date = new Date();
  date.setDate(date.getDate() + (hasWeakCards ? 1 : 3));
  return date.toISOString();
}

function reviewDateLabel(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

export default function LessonStudyTools({
  lessonKey,
  lessonTitle,
  lessonConcept,
  lessonContent,
  learningObjective,
  keyTakeaways,
  quizzes,
  quizOutcomes,
  noteDraft,
  onNoteChange,
  noteStatus,
  noteStatusIsError,
  canUseTutor,
  experienceAvailable,
  experienceComplete,
  guidedPracticeAvailable,
  guidedPracticeComplete,
  transferAvailable,
  transferComplete,
  checksComplete,
  onClose,
  onOpenTutor,
  onOpenChecks,
}: LessonStudyToolsProps) {
  const [activeTool, setActiveTool] = useState<StudyTool>("notes");
  const [reviewSession, setReviewSession] = useState<ReviewSession | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const flashcards = useMemo(() => buildLessonFlashcards({
    lessonTitle,
    lessonConcept,
    lessonContent,
    learningObjective,
    keyTakeaways,
    quizzes,
    quizOutcomes,
  }), [keyTakeaways, learningObjective, lessonConcept, lessonContent, lessonTitle, quizOutcomes, quizzes]);
  const flashcardById = useMemo(() => new Map(flashcards.map((card) => [card.id, card])), [flashcards]);
  const deckSignature = flashcards.map((card) => card.id).join("|");
  const storageKey = `filosage-study-review:v1:${lessonKey}`;
  const currentCardId = reviewSession?.queue[reviewSession.currentIndex];
  const currentCard = currentCardId ? flashcardById.get(currentCardId) : undefined;
  const sessionCardIds = reviewSession ? [...new Set(reviewSession.queue)] : [];
  const weakCardIds = reviewSession
    ? sessionCardIds.filter((cardId) => reviewSession.ratings[cardId] === "again")
    : [];
  const rememberedCount = reviewSession
    ? sessionCardIds.filter((cardId) => reviewSession.ratings[cardId] === "got-it").length
    : 0;

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      let storedSession: ReviewSession | null = null;
      try {
        const storedValue = window.localStorage.getItem(storageKey);
        if (storedValue) {
          const parsed = JSON.parse(storedValue) as Partial<ReviewSession>;
          const knownIds = new Set(flashcards.map((card) => card.id));
          if (
            parsed.version === 1
            && parsed.signature === deckSignature
            && Array.isArray(parsed.queue)
            && parsed.queue.length > 0
            && parsed.queue.every((id) => typeof id === "string" && knownIds.has(id))
            && typeof parsed.currentIndex === "number"
            && parsed.currentIndex >= 0
            && parsed.currentIndex < parsed.queue.length
            && typeof parsed.ratings === "object"
            && typeof parsed.attempts === "object"
          ) {
            storedSession = parsed as ReviewSession;
          }
        }
      } catch {
        storedSession = null;
      }
      setReviewSession(storedSession);
      setRevealed(false);
      setHydratedStorageKey(storageKey);
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, [deckSignature, flashcards, storageKey]);

  useEffect(() => {
    if (hydratedStorageKey !== storageKey) return;
    try {
      if (reviewSession) {
        window.localStorage.setItem(storageKey, JSON.stringify(reviewSession));
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // Device storage may be unavailable; the active session still works in memory.
    }
  }, [hydratedStorageKey, reviewSession, storageKey]);

  const selectTool = (tool: StudyTool) => {
    setActiveTool(tool);
  };

  const handleToolKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? TOOLS.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + TOOLS.length) % TOOLS.length;
    selectTool(TOOLS[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  const startReview = (cardIds = flashcards.map((card) => card.id)) => {
    setReviewSession({
      version: 1,
      signature: deckSignature,
      queue: cardIds,
      currentIndex: 0,
      ratings: {},
      attempts: {},
      completed: false,
      nextReviewAt: null,
    });
    setRevealed(false);
    setAnnouncement(`${cardIds.length}-card recall session started.`);
  };

  const shuffleRemainingCards = () => {
    setReviewSession((current) => {
      if (!current || current.completed) return current;
      return {
        ...current,
        queue: [
          ...current.queue.slice(0, current.currentIndex),
          ...shuffled(current.queue.slice(current.currentIndex)),
        ],
      };
    });
    setRevealed(false);
    setAnnouncement("The remaining cards were shuffled.");
  };

  const revealCard = () => {
    setRevealed((current) => {
      const next = !current;
      setAnnouncement(next ? "Answer revealed. Rate how well you recalled it." : "Prompt shown.");
      return next;
    });
  };

  const rateCard = (rating: ReviewRating) => {
    if (!reviewSession || !currentCardId) return;
    const nextAttempts = (reviewSession.attempts[currentCardId] ?? 0) + 1;
    const shouldRepeat = rating === "again" && nextAttempts < 3;
    const nextQueue = shouldRepeat ? [...reviewSession.queue, currentCardId] : reviewSession.queue;
    const nextRatings = { ...reviewSession.ratings, [currentCardId]: rating };
    const nextIndex = reviewSession.currentIndex + 1;
    const completed = nextIndex >= nextQueue.length;
    const hasWeakCards = flashcards.some((card) => nextRatings[card.id] === "again");

    setReviewSession({
      ...reviewSession,
      queue: nextQueue,
      currentIndex: completed ? reviewSession.currentIndex : nextIndex,
      ratings: nextRatings,
      attempts: { ...reviewSession.attempts, [currentCardId]: nextAttempts },
      completed,
      nextReviewAt: completed ? nextReviewDate(hasWeakCards) : null,
    });
    setRevealed(false);
    if (completed) {
      setAnnouncement("Recall session complete.");
    } else if (shouldRepeat) {
      setAnnouncement("Marked to review again. This card will return once more.");
    } else {
      setAnnouncement(rating === "got-it" ? "Marked as remembered. Next card." : "Marked for tomorrow's review. Next card.");
    }
  };

  return (
    <aside className="lesson-study-panel" id="lesson-study-panel">
      <header className="study-panel-heading">
        <span className="study-panel-mark"><BookOpenCheck size={19} /></span>
        <div>
          <strong id="study-tools-title">Study workspace</strong>
          <small>Tools grounded in this lesson</small>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close study tools"><X size={18} /></button>
      </header>

      <div className="study-tool-tabs" role="tablist" aria-label="Study tools">
        {TOOLS.map((tool, index) => {
          const Icon = tool.icon;
          const selected = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              ref={(node) => { tabRefs.current[index] = node; }}
              id={`study-${tool.id}-tab`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`study-${tool.id}-panel`}
              tabIndex={selected ? 0 : -1}
              className={selected ? "is-active" : ""}
              onClick={() => selectTool(tool.id)}
              onKeyDown={(event) => handleToolKeyDown(event, index)}
            >
              <Icon size={16} />
              <span>{tool.label}</span>
            </button>
          );
        })}
      </div>

      <div className="study-tool-body">
        <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
        {activeTool === "notes" && (
          <section id="study-notes-panel" role="tabpanel" aria-labelledby="study-notes-tab" className="study-tool-panel lesson-note-section">
            <div className="study-section-intro">
              <div><strong>Capture what matters</strong><p>Use your own words. Short, useful notes beat a transcript.</p></div>
              <span className="study-save-state" role={noteStatusIsError ? "alert" : "status"}>{noteStatus}</span>
            </div>
            <label className="sr-only" htmlFor="lesson-note">Your notes</label>
            <textarea id="lesson-note" value={noteDraft} onChange={(event) => onNoteChange(event.target.value)} maxLength={12_000} rows={10} placeholder="What changed in your understanding?" />
            <span>{noteDraft.length.toLocaleString()}/12,000</span>
            <section className="study-key-point"><span><Lightbulb size={17} /></span><div><strong>Keep this idea close</strong><p>{lessonConcept}</p></div></section>
          </section>
        )}

        {activeTool === "flashcards" && (
          <section id="study-flashcards-panel" role="tabpanel" aria-labelledby="study-flashcards-tab" className="study-tool-panel flashcard-tool">
            {!reviewSession ? (
              <div className="flashcard-intro">
                <span className="flashcard-stack" aria-hidden="true"><Layers3 size={25} /></span>
                <div><strong>Turn this lesson into recall</strong><p>Review {flashcards.length} prompts built from this lesson. Answers from checks only join the deck after you attempt them.</p></div>
                <button className="button button-primary" type="button" onClick={() => startReview()}><Sparkles size={16} /> Start {flashcards.length}-card recall</button>
                <small>Session progress is saved on this device.</small>
              </div>
            ) : reviewSession.completed ? (
              <div className="flashcard-summary">
                <span className="flashcard-summary-mark"><CheckCircle2 size={27} /></span>
                <div>
                  <strong>Recall session complete</strong>
                  <p>{weakCardIds.length
                    ? `${rememberedCount} of ${sessionCardIds.length} cards feel solid. ${weakCardIds.length} ${weakCardIds.length === 1 ? "card needs" : "cards need"} another pass.`
                    : `You remembered all ${sessionCardIds.length} cards.`}</p>
                </div>
                <div className="flashcard-summary-next"><CalendarClock size={17} /><span>Next review <strong>{reviewDateLabel(reviewSession.nextReviewAt)}</strong></span></div>
                <div className="flashcard-summary-actions">
                  {weakCardIds.length > 0 && <button className="button button-primary" type="button" onClick={() => startReview(weakCardIds)}><RotateCcw size={16} /> Review weak cards now</button>}
                  <button className={`button ${weakCardIds.length ? "button-secondary" : "button-primary"}`} type="button" onClick={() => startReview()}><RefreshCw size={16} /> Review full deck</button>
                </div>
                <small>Saved on this device for this lesson.</small>
              </div>
            ) : currentCard ? (
              <div className="flashcard-session">
                <div className="flashcard-session-meta">
                  <span>Card {reviewSession.currentIndex + 1} of {reviewSession.queue.length}</span>
                  <button className="text-button" type="button" onClick={shuffleRemainingCards}><RefreshCw size={14} /> Shuffle remaining</button>
                </div>
                <button className={`flashcard ${revealed ? "is-revealed" : ""}`} type="button" onClick={revealCard} aria-pressed={revealed} aria-label={revealed ? "Hide flashcard answer" : "Reveal flashcard answer"}>
                  <span className="flashcard-inner">
                    <span className="flashcard-face flashcard-front" aria-hidden={revealed}>
                      <span className="flashcard-face-label">Prompt</span>
                      <strong>{currentCard.prompt}</strong>
                      <small>Think first, then reveal</small>
                    </span>
                    <span className="flashcard-face flashcard-back" aria-hidden={!revealed}>
                      <span className="flashcard-face-label">Answer</span>
                      <strong>{currentCard.answer}</strong>
                      <span className="flashcard-detail">{currentCard.detail}</span>
                      <small>Rate your recall below</small>
                    </span>
                  </span>
                </button>
                <div className="flashcard-actions">
                  {!revealed ? (
                    <button className="button button-primary" type="button" onClick={revealCard}>Reveal answer</button>
                  ) : (
                    <div className="flashcard-rating-controls" aria-label="Rate this flashcard">
                      <button className="button button-secondary" type="button" onClick={() => rateCard("again")}><RotateCcw size={16} /> Review again</button>
                      <button className="button button-primary" type="button" onClick={() => rateCard("got-it")}><CheckCircle2 size={16} /> Got it</button>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        )}

        {activeTool === "practice" && (
          <section id="study-practice-panel" role="tabpanel" aria-labelledby="study-practice-tab" className="study-tool-panel practice-tool">
            <header className="study-section-intro"><div><strong>Choose your next move</strong><p>Continue in Activities for scored work, or open Tutor for guided explanation.</p></div></header>
            <div className="practice-tool-list">
              <button type="button" onClick={onOpenChecks} disabled={!quizzes.length}>
                <span><BookOpenCheck size={18} /></span><div><strong>Open lesson checks</strong><small>{quizzes.length ? `${quizzes.length} ${quizzes.length === 1 ? "check" : "checks"} in Activities` : "No checks in this lesson"}</small></div><ArrowRight size={16} />
              </button>
              <button type="button" onClick={() => onOpenTutor(`Ask me to teach back the central idea from "${lessonTitle}" in my own words. Do not explain it first. Ask one question, wait for my answer, then identify one strength and one gap.`)} disabled={!canUseTutor}>
                <span><MessageSquareText size={18} /></span><div><strong>Teach it back with Tutor</strong><small>{canUseTutor ? "Practice an explanation one question at a time" : "Sign in to use tutor practice"}</small></div><ArrowRight size={16} />
              </button>
              <button type="button" onClick={() => onOpenTutor(`Give me a new, concrete example of "${lessonConcept}". Then ask me to explain why the example fits.`)} disabled={!canUseTutor}>
                <span><Sparkles size={18} /></span><div><strong>Try a fresh example in Tutor</strong><small>{canUseTutor ? "Transfer the idea to a new situation" : "Sign in to use tutor practice"}</small></div><ArrowRight size={16} />
              </button>
            </div>
            <section className="mastery-checklist">
              <strong>Activity status</strong>
              <ul>
                {experienceAvailable && <ActivityStatus label="Active lesson evidence" complete={experienceComplete} />}
                {guidedPracticeAvailable && <ActivityStatus label="Guided practice" complete={guidedPracticeComplete} />}
                {transferAvailable && <ActivityStatus label="Apply the idea" complete={transferComplete} />}
                {quizzes.length > 0 && <ActivityStatus label="Lesson checks" complete={checksComplete} />}
              </ul>
            </section>
          </section>
        )}
      </div>
    </aside>
  );
}

function ActivityStatus({ label, complete }: { label: string; complete: boolean }) {
  const Icon = complete ? CheckCircle2 : Circle;
  return <li className={complete ? "is-done" : ""}><Icon size={15} /><span>{label}<small>{complete ? "Complete" : "Not complete"}</small></span></li>;
}
