"use client";

import { useId, useMemo, useState } from "react";
import { ArrowRight, Check, ChevronDown, Flag, LockKeyhole, Route } from "lucide-react";
import type { Course } from "@/lib/course-types";

export default function CourseJourneyMap({
  course,
  completedLessonIds,
  canOpenLesson,
  onOpenLesson,
}: {
  course: Course;
  completedLessonIds: string[];
  canOpenLesson: (lessonId: string) => boolean;
  onOpenLesson: (lessonId: string) => void;
}) {
  const completed = useMemo(() => new Set(completedLessonIds), [completedLessonIds]);
  const currentModule = Math.max(0, course.modules.findIndex((courseModule, moduleIndex) => courseModule.lessons.some((_, lessonIndex) => !completed.has(`${moduleIndex}-${lessonIndex}`))));
  const [expanded, setExpanded] = useState(-1);
  const panelIdPrefix = useId();

  return <section className="course-journey-map" aria-labelledby="course-journey-title">
    <header>
      <div><p className="overline">Course path</p><h2 id="course-journey-title">See what each stage produces</h2><p>Follow the course as a connected build. Each stage shows the work or challenge it contributes to the course.</p></div>
      <Route size={24} />
    </header>
    <ol className="journey-stage-list">
      {course.modules.map((courseModule, moduleIndex) => {
        const completedCount = courseModule.lessons.filter((_, lessonIndex) => completed.has(`${moduleIndex}-${lessonIndex}`)).length;
        const isComplete = courseModule.lessons.length > 0 && completedCount === courseModule.lessons.length;
        const isCurrent = !isComplete && moduleIndex === currentModule;
        const isExpanded = expanded === moduleIndex;
        const progress = courseModule.lessons.length ? Math.round((completedCount / courseModule.lessons.length) * 100) : 0;
        const panelId = `${panelIdPrefix}-stage-${moduleIndex}`;
        return <li className={`${isComplete ? "is-complete" : ""} ${isCurrent ? "is-current" : ""}`} key={`${courseModule.title}-${moduleIndex}`}>
          <span className="journey-connector" aria-hidden="true"><i style={{ transform: `scaleY(${progress / 100})` }} /></span>
          <button className="journey-stage-trigger" type="button" onClick={() => setExpanded(isExpanded ? -1 : moduleIndex)} aria-expanded={isExpanded} aria-controls={panelId}>
            <span className="journey-stage-node">{isComplete ? <Check size={16} /> : moduleIndex + 1}</span>
            <span className="journey-stage-copy"><small>{isComplete ? "Stage complete" : isCurrent ? "Current stage" : `Stage ${moduleIndex + 1}`}</small><strong>{courseModule.title}</strong><em>{courseModule.milestone?.title ?? courseModule.challenge?.title ?? courseModule.objective}</em></span>
            <span className="journey-stage-progress"><b>{completedCount}/{courseModule.lessons.length}</b><i><span style={{ transform: `scaleX(${progress / 100})` }} /></i></span>
            <ChevronDown size={18} />
          </button>
          <div id={panelId} className={`journey-stage-reveal ${isExpanded ? "is-open" : ""}`} aria-hidden={!isExpanded} inert={!isExpanded}>
            <div className="journey-stage-reveal-inner">
              <div className="journey-stage-detail">
                <div className="journey-stage-outcome"><Flag size={17} /><div className="journey-stage-outcome-copy"><small>{courseModule.milestone ? "Evidence produced" : "Stage challenge"}</small><strong>{courseModule.milestone?.deliverable ?? courseModule.challenge?.prompt ?? courseModule.description}</strong>{courseModule.milestone?.evidence && <p>{courseModule.milestone.evidence}</p>}{courseModule.milestone && courseModule.challenge && <div className="journey-stage-challenge"><small>Stage challenge</small><strong>{courseModule.challenge.title}</strong><p>{courseModule.challenge.prompt}</p></div>}</div></div>
                <div className="journey-lesson-links">
                  {courseModule.lessons.map((lesson, lessonIndex) => {
                    const lessonId = `${moduleIndex}-${lessonIndex}`;
                    const unlocked = canOpenLesson(lessonId);
                    const done = completed.has(lessonId);
                    return <button type="button" key={lessonId} onClick={() => unlocked && onOpenLesson(lessonId)} disabled={!unlocked}><span>{done ? <Check size={14} /> : `${moduleIndex + 1}.${lessonIndex + 1}`}</span><strong>{lesson.title}</strong>{unlocked ? <ArrowRight size={15} /> : <LockKeyhole size={14} />}</button>;
                  })}
                </div>
              </div>
            </div>
          </div>
        </li>;
      })}
    </ol>
  </section>;
}
