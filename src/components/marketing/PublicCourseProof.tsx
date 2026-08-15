"use client";

import Link from "next/link";
import { ArrowRight, BookOpenCheck, Clock3, Gauge, Layers3, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import CourseBanner from "@/components/CourseBanner";
import type { Course } from "@/lib/course-types";

function courseId(course: Course) {
  return course.id ?? course.courseId;
}

function courseMinutes(course: Course) {
  return course.estimatedMinutes
    ?? course.modules.reduce((total, courseModule) => total + courseModule.lessons.reduce((sum, lesson) => sum + (lesson.estimatedMinutes ?? 12), 0), 0);
}

function timeLabel(minutes: number) {
  if (minutes < 60) return `About ${minutes} min`;
  const hours = Math.max(1, Math.round(minutes / 60));
  return `About ${hours} ${hours === 1 ? "hour" : "hours"}`;
}

export default function PublicCourseProof() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/courses?scope=public", { cache: "no-store" });
      if (!response.ok) throw new Error("Public courses could not be loaded.");
      const data = await response.json() as { courses: Course[] };
      setCourses(data.courses);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const course = useMemo(() => courses.find((candidate) => (
    Boolean(candidate.outcome)
    && Boolean(candidate.artifact?.title || candidate.capstone?.deliverable || candidate.milestone?.deliverable)
  )) ?? courses[0], [courses]);

  if (status === "loading") {
    return (
      <div className="marketing-course-proof is-loading" aria-label="Loading a published course preview" aria-busy="true">
        <div className="marketing-course-cover-skeleton" />
        <div className="marketing-course-outline-skeleton"><span /><span /><span /><span /></div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="marketing-course-proof-state" role="status">
        <RefreshCw size={28} aria-hidden="true" />
        <div><h2>Course previews are temporarily unavailable.</h2><p>The published library is still the source of truth. Try this preview again or open the library directly.</p></div>
        <div className="marketing-course-proof-state-actions">
          <button className="button button-secondary" type="button" onClick={() => void load()}>Try again</button>
          <Link className="button button-primary" href="/library">Open the library <ArrowRight size={16} /></Link>
        </div>
      </div>
    );
  }

  const id = course && courseId(course);
  if (!course || !id) {
    return (
      <div className="marketing-course-proof-state" role="status">
        <BookOpenCheck size={28} aria-hidden="true" />
        <div><h2>Published courses are being prepared.</h2><p>Filosage will show complete outcomes and course structures here as soon as the reviewed catalog is available.</p></div>
        <Link className="button button-secondary" href="/standard">See the teaching standard <ArrowRight size={16} /></Link>
      </div>
    );
  }

  const lessonCount = course.modules.reduce((total, courseModule) => total + courseModule.lessons.length, 0);
  const deliverable = course.artifact?.title
    ?? course.capstone?.deliverable
    ?? course.milestone?.deliverable
    ?? "An applied course artifact";
  const assignedLessonCount = course.modules.reduce((total, courseModule) => (
    total + courseModule.lessons.filter((lesson) => (lesson.sourceIds?.length ?? 0) > 0).length
  ), 0);
  const sourceLabel = assignedLessonCount > 0
    ? `${assignedLessonCount} ${assignedLessonCount === 1 ? "lesson has" : "lessons have"} source assignments`
    : course.sourcePack?.length
      ? `${course.sourcePack.length} course ${course.sourcePack.length === 1 ? "reference" : "references"}`
      : "Source status is visible in the course";
  const href = `/course/${encodeURIComponent(course.topic)}?id=${encodeURIComponent(id)}`;

  return (
    <article className="marketing-course-proof" aria-labelledby="marketing-course-proof-title">
      <div className="marketing-course-cover">
        <CourseBanner course={course} variant="card" eager />
        <div className="marketing-course-cover-copy">
          <small>{course.category ?? "Published course"}</small>
          <h2 id="marketing-course-proof-title">{course.topic}</h2>
          <span>Public course preview</span>
        </div>
      </div>
      <div className="marketing-course-outline">
        <div className="marketing-course-outcome">
          <small>Course outcome</small>
          <p>{course.outcome ?? course.mission ?? `Build a working understanding of ${course.topic}.`}</p>
        </div>
        <ol className="marketing-course-modules" aria-label={`First modules in ${course.topic}`}>
          {course.modules.slice(0, 3).map((courseModule, index) => (
            <li key={`${courseModule.title}-${index}`}>
              <span>M{index + 1}</span>
              <div><strong>{courseModule.title}</strong><small>{courseModule.lessons.length} {courseModule.lessons.length === 1 ? "lesson" : "lessons"}</small></div>
            </li>
          ))}
          <li className="is-evidence"><Sparkles size={17} aria-hidden="true" /><div><strong>{deliverable}</strong><small>Evidence target</small></div></li>
        </ol>
        <dl className="marketing-course-facts">
          <div><dt><Layers3 size={14} aria-hidden="true" /> Structure</dt><dd>{lessonCount} lessons</dd></div>
          <div><dt><Clock3 size={14} aria-hidden="true" /> Time</dt><dd>{timeLabel(courseMinutes(course))}</dd></div>
          <div><dt><Gauge size={14} aria-hidden="true" /> Level</dt><dd>{course.level ?? "Not specified"}</dd></div>
          <div><dt><ShieldCheck size={14} aria-hidden="true" /> Sources</dt><dd>{sourceLabel}</dd></div>
        </dl>
        <Link className="button button-secondary marketing-course-open" href={href}>Inspect course outline <ArrowRight size={16} /></Link>
      </div>
    </article>
  );
}
