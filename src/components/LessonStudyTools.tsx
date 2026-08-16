"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  Brain,
  CheckCircle2,
  Circle,
  Layers3,
  Lightbulb,
  MessageSquareText,
  NotebookPen,
  Sparkles,
  X,
} from "lucide-react";
import FlashcardStudio from "@/components/flashcards/FlashcardStudio";
import { useAuth } from "@/components/AuthProvider";
import type { Quiz } from "@/lib/course-types";

type StudyTool = "notes" | "flashcards" | "practice";

interface LessonStudyToolsProps {
  lessonKey: string;
  courseId: string;
  courseTopic: string;
  lessonId: string;
  moduleIndex: number;
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

export default function LessonStudyTools({
  courseId,
  courseTopic,
  lessonId,
  moduleIndex,
  lessonTitle,
  lessonConcept,
  quizzes,
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
  const { account } = useAuth();
  const [activeTool, setActiveTool] = useState<StudyTool>("notes");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const flashcardDecksEnabled = account?.capabilities?.flashcardDecksEnabled === true;
  const tools = flashcardDecksEnabled
    ? TOOLS
    : TOOLS.filter((tool) => tool.id !== "flashcards");
  const visibleTool = activeTool === "flashcards" && !flashcardDecksEnabled ? "notes" : activeTool;

  const handleToolKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tools.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tools.length) % tools.length;
    setActiveTool(tools[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <aside className="lesson-study-panel" id="lesson-study-panel">
      <header className="study-panel-heading">
        <span className="study-panel-mark"><BookOpenCheck size={19} /></span>
        <div><strong id="study-tools-title">Study workspace</strong><small>Tools grounded in this lesson</small></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close study tools"><X size={18} /></button>
      </header>

      <div className="study-tool-tabs" role="tablist" aria-label="Study tools">
        {tools.map((tool, index) => {
          const Icon = tool.icon;
          const selected = visibleTool === tool.id;
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
              onClick={() => setActiveTool(tool.id)}
              onKeyDown={(event) => handleToolKeyDown(event, index)}
            >
              <Icon size={16} />
              <span>{tool.label}</span>
            </button>
          );
        })}
      </div>

      <div className="study-tool-body">
        {visibleTool === "notes" && (
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

        {visibleTool === "flashcards" && flashcardDecksEnabled && (
          <section id="study-flashcards-panel" role="tabpanel" aria-labelledby="study-flashcards-tab" className="study-tool-panel flashcard-tool">
            <FlashcardStudio lessonContext={{ courseId, courseTopic, lessonId, moduleIndex }} />
          </section>
        )}

        {visibleTool === "practice" && (
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
