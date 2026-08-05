"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Brain,
  Check,
  Layers3,
  Lightbulb,
  MessageSquareText,
  NotebookPen,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import type { Quiz } from "@/lib/course-types";

type StudyTool = "notes" | "flashcards" | "practice";

interface LessonStudyToolsProps {
  lessonTitle: string;
  lessonConcept: string;
  learningObjective?: string;
  quizzes: Quiz[];
  noteDraft: string;
  onNoteChange: (value: string) => void;
  noteStatus: string;
  noteStatusIsError: boolean;
  canUseTutor: boolean;
  experienceAvailable: boolean;
  experienceComplete: boolean;
  transferAvailable: boolean;
  transferComplete: boolean;
  lessonComplete: boolean;
  onClose: () => void;
  onOpenTutor: (prompt: string) => void;
  onOpenChecks: () => void;
}

const TOOLS: Array<{ id: StudyTool; label: string; icon: typeof NotebookPen }> = [
  { id: "notes", label: "Notes", icon: NotebookPen },
  { id: "flashcards", label: "Flashcards", icon: Layers3 },
  { id: "practice", label: "Practice", icon: Brain },
];

export default function LessonStudyTools({
  lessonTitle,
  lessonConcept,
  learningObjective,
  quizzes,
  noteDraft,
  onNoteChange,
  noteStatus,
  noteStatusIsError,
  canUseTutor,
  experienceAvailable,
  experienceComplete,
  transferAvailable,
  transferComplete,
  lessonComplete,
  onClose,
  onOpenTutor,
  onOpenChecks,
}: LessonStudyToolsProps) {
  const [activeTool, setActiveTool] = useState<StudyTool>("notes");
  const [deckGenerated, setDeckGenerated] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [cardOrder, setCardOrder] = useState<number[]>([]);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const flashcards = useMemo(() => [
    {
      prompt: `Explain the central idea of “${lessonTitle}” in your own words.`,
      answer: lessonConcept,
      detail: learningObjective ? `Learning objective: ${learningObjective}` : "Use the lesson concept as your anchor.",
    },
    ...quizzes.map((quiz) => ({
      prompt: quiz.question,
      answer: quiz.options[quiz.correctIndex] ?? quiz.explanation,
      detail: quiz.explanation,
    })),
  ], [learningObjective, lessonConcept, lessonTitle, quizzes]);

  const orderedCards = cardOrder.length === flashcards.length
    ? cardOrder.map((index) => flashcards[index])
    : flashcards;
  const currentCard = orderedCards[cardIndex] ?? orderedCards[0];

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

  const generateDeck = () => {
    setCardOrder(flashcards.map((_, index) => index));
    setCardIndex(0);
    setRevealed(false);
    setDeckGenerated(true);
  };

  const shuffleDeck = () => {
    const nextOrder = flashcards.map((_, index) => index);
    for (let index = nextOrder.length - 1; index > 0; index -= 1) {
      const values = new Uint32Array(1);
      crypto.getRandomValues(values);
      const swapIndex = values[0] % (index + 1);
      [nextOrder[index], nextOrder[swapIndex]] = [nextOrder[swapIndex], nextOrder[index]];
    }
    setCardOrder(nextOrder);
    setCardIndex(0);
    setRevealed(false);
  };

  const moveCard = (direction: -1 | 1) => {
    setCardIndex((current) => (current + direction + orderedCards.length) % orderedCards.length);
    setRevealed(false);
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
            {!deckGenerated ? (
              <div className="flashcard-intro">
                <span className="flashcard-stack" aria-hidden="true"><Layers3 size={25} /></span>
                <div><strong>Turn this lesson into recall</strong><p>Build a {flashcards.length}-card deck from the lesson concept and checked answers. No tutor question is used.</p></div>
                <button className="button button-primary" type="button" onClick={generateDeck}><Sparkles size={16} /> Generate flashcards</button>
              </div>
            ) : (
              <div className="flashcard-session">
                <div className="flashcard-session-meta"><span>Card {cardIndex + 1} of {orderedCards.length}</span><button className="text-button" type="button" onClick={shuffleDeck}><RefreshCw size={14} /> Shuffle</button></div>
                <button className={`flashcard ${revealed ? "is-revealed" : ""}`} type="button" onClick={() => setRevealed((current) => !current)} aria-pressed={revealed} aria-label={revealed ? "Hide flashcard answer" : "Reveal flashcard answer"}>
                  <span>{revealed ? "Answer" : "Prompt"}</span>
                  <strong>{revealed ? currentCard.answer : currentCard.prompt}</strong>
                  {revealed && <p>{currentCard.detail}</p>}
                  <small>{revealed ? "Select to see the prompt" : "Think first, then reveal"}</small>
                </button>
                <div className="flashcard-controls">
                  <button className="icon-button" type="button" onClick={() => moveCard(-1)} aria-label="Previous flashcard"><ArrowLeft size={17} /></button>
                  <button className="button button-secondary" type="button" onClick={() => setRevealed((current) => !current)}>{revealed ? "Show prompt" : "Reveal answer"}</button>
                  <button className="icon-button" type="button" onClick={() => moveCard(1)} aria-label="Next flashcard"><ArrowRight size={17} /></button>
                </div>
              </div>
            )}
          </section>
        )}

        {activeTool === "practice" && (
          <section id="study-practice-panel" role="tabpanel" aria-labelledby="study-practice-tab" className="study-tool-panel practice-tool">
            <header className="study-section-intro"><div><strong>Choose how to retrieve</strong><p>Move from recognition to recall, then explain the idea without the lesson open.</p></div></header>
            <div className="practice-tool-list">
              <button type="button" onClick={onOpenChecks} disabled={!quizzes.length}>
                <span><BookOpenCheck size={18} /></span><div><strong>Quiz me</strong><small>{quizzes.length ? `Open ${quizzes.length} lesson ${quizzes.length === 1 ? "check" : "checks"}` : "No checks in this lesson"}</small></div><ArrowRight size={16} />
              </button>
              <button type="button" onClick={() => onOpenTutor(`Ask me to teach back the central idea from “${lessonTitle}” in my own words. Do not explain it first. Ask one question, wait for my answer, then identify one strength and one gap.`)} disabled={!canUseTutor}>
                <span><MessageSquareText size={18} /></span><div><strong>Teach it back</strong><small>{canUseTutor ? "Practice an explanation with the tutor" : "Sign in to use tutor practice"}</small></div><ArrowRight size={16} />
              </button>
              <button type="button" onClick={() => onOpenTutor(`Give me a new, concrete example of “${lessonConcept}”. Then ask me to explain why the example fits.`)} disabled={!canUseTutor}>
                <span><Sparkles size={18} /></span><div><strong>Try a fresh example</strong><small>{canUseTutor ? "Transfer the idea to a new situation" : "Sign in to use tutor practice"}</small></div><ArrowRight size={16} />
              </button>
            </div>
            <section className="mastery-checklist"><strong>Lesson progress</strong><ul><li className="is-done"><Check size={15} /> Read the explanation</li>{experienceAvailable && <li className={experienceComplete ? "is-done" : ""}><Check size={15} /> Save active lesson evidence</li>}{transferAvailable && <li className={transferComplete ? "is-done" : ""}><Check size={15} /> Apply the idea</li>}<li className={lessonComplete ? "is-done" : ""}><Check size={15} /> Complete the retrieval checks</li></ul></section>
          </section>
        )}
      </div>
    </aside>
  );
}
