"use client";

import { useState } from "react";
import { BrainCircuit, CalendarClock, CheckCircle2, CircleDot } from "lucide-react";
import type { CourseProgress, LessonProgress } from "@/lib/learning-types";

function masteryState(lesson: LessonProgress) {
  if (lesson.performanceBand) return lesson.performanceBand;
  return lesson.status === "mastered" ? "secure" : lesson.status === "learned" ? "developing" : "fragile";
}

export default function MasteryPath({ progress }: { progress: CourseProgress[] }) {
  const lessons = progress.flatMap((course) => Object.values(course.lessons).map((lesson) => ({ course, lesson })));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = lessons.find(({ course, lesson }) => `${course.courseId}-${lesson.lessonId}` === selectedKey) ?? lessons[0];

  return <section className="mastery-path" aria-labelledby="mastery-path-title">
    <header className="panel-heading"><div><BrainCircuit size={19} /><span><p className="overline">Concept history</p><h2 id="mastery-path-title">How your understanding is holding up</h2></span></div><span>{lessons.length} concept{lessons.length === 1 ? "" : "s"}</span></header>
    {lessons.length ? <div className="mastery-path-layout">
      <div className="mastery-node-list" aria-label="Concept strength states">
        {lessons.map(({ course, lesson }) => {
          const key = `${course.courseId}-${lesson.lessonId}`;
          const state = masteryState(lesson);
          return <button type="button" key={key} className={`${state} ${selectedKey === key || (!selectedKey && selected?.lesson === lesson) ? "is-selected" : ""}`} onClick={() => setSelectedKey(key)} aria-pressed={selectedKey === key}>
            <span>{state === "secure" ? <CheckCircle2 size={16} /> : <CircleDot size={16} />}</span><strong>{lesson.lessonTitle}</strong><small>{course.topic}</small><em>{state}</em>
          </button>;
        })}
      </div>
      {selected && <aside className="mastery-detail" aria-live="polite"><span className={`mastery-state ${masteryState(selected.lesson)}`}>{masteryState(selected.lesson)}</span><h3>{selected.lesson.lessonTitle}</h3><p>{selected.lesson.status === "mastered" ? "Repeated evidence is holding. Keep the scheduled review to preserve it." : "This concept still benefits from retrieval and another application."}</p><dl><div><dt>Confidence</dt><dd>{selected.lesson.confidence}</dd></div><div><dt>Calibration</dt><dd>{selected.lesson.calibration ?? "collecting evidence"}</dd></div><div><dt><CalendarClock size={14} /> Next review</dt><dd>{new Date(selected.lesson.nextReviewAt).toLocaleDateString("en", { month: "short", day: "numeric" })}</dd></div></dl></aside>}
    </div> : <div className="portfolio-empty"><BrainCircuit size={23} /><div><strong>Your concept history starts with evidence.</strong><p>Complete a lesson and its retrieval checks to see which concepts are secure and which need another pass.</p></div></div>}
  </section>;
}
