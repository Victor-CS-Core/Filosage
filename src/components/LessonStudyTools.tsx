"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { BookOpenCheck, Layers3, Lightbulb, NotebookPen, X } from "lucide-react";
import FlashcardStudio from "@/components/flashcards/FlashcardStudio";
import { useAuth } from "@/components/AuthProvider";

type StudyTool = "notes" | "flashcards";

interface LessonStudyToolsProps {
  courseId: string;
  courseTopic: string;
  lessonId: string;
  moduleIndex: number;
  lessonConcept: string;
  noteDraft: string;
  onNoteChange: (value: string) => void;
  noteStatus: string;
  noteStatusIsError: boolean;
  onClose: () => void;
}

const TOOLS: Array<{ id: StudyTool; label: string; icon: typeof NotebookPen }> = [
  { id: "notes", label: "Notes", icon: NotebookPen },
  { id: "flashcards", label: "Flashcards", icon: Layers3 },
];

export default function LessonStudyTools({
  courseId,
  courseTopic,
  lessonId,
  moduleIndex,
  lessonConcept,
  noteDraft,
  onNoteChange,
  noteStatus,
  noteStatusIsError,
  onClose,
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

      <div className="study-tool-tabs" style={{ gridTemplateColumns: `repeat(${tools.length}, minmax(0, 1fr))` }} role="tablist" aria-label="Study tools">
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


      </div>
    </aside>
  );
}
