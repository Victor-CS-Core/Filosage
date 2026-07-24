"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Circle,
  Flag,
  Globe2,
  Layers3,
  Target,
  LoaderCircle,
  LockKeyhole,
  Play,
  Trash2,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import type { Course } from "@/lib/course-types";
import type { CourseProgress } from "@/lib/learning-types";
import { getLocalProgress } from "@/lib/learning-progress";
import { createClientId } from "@/lib/browser-compat";

export default function CourseMap() {
  const params = useParams<{ topic: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const topic = decodeURIComponent(params.topic);
  const requestedCourseId = searchParams.get("id");
  const { user, isOwner, isPro, loading: authLoading } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedModule, setExpandedModule] = useState<number | null>(0);
  const [updating, setUpdating] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);

  const getToken = useCallback(async () => (user ? user.getIdToken() : null), [user]);

  const loadOrGenerate = useCallback(async () => {
    if (!requestedCourseId && authLoading) return;
    setLoading(true);
    setError(null);

    try {
      if (requestedCourseId) {
        const token = await getToken();
        const response = await fetch(`/api/courses/${requestedCourseId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "The course could not be opened.");
        setCourse({ ...data, id: requestedCourseId, courseId: requestedCourseId });
        return;
      }

      if (!isPro) {
        setError("Private course creation is included with Erudoza Pro.");
        return;
      }

      const token = await getToken();
      const response = await fetch("/api/generate-course", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": createClientId(),
        },
        body: JSON.stringify({ topic }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The course could not be generated.");
      const nextCourse = { ...data, topic, id: data.courseId } as Course;
      setCourse(nextCourse);
      if (data.courseId) router.replace(`/course/${encodeURIComponent(topic)}?id=${data.courseId}`);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The course could not be opened.");
    } finally {
      setLoading(false);
    }
  }, [authLoading, requestedCourseId, isPro, getToken, topic, router]);

  useEffect(() => {
    void Promise.resolve().then(loadOrGenerate);
  }, [loadOrGenerate]);

  const courseId = course?.id ?? course?.courseId ?? requestedCourseId;

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
          if (!cancelled) setCompletedLessons(data.progress?.completedLessonIds ?? []);
          return;
        }
      }
      const local = getLocalProgress(courseId, topic);
      if (!cancelled) setCompletedLessons(local?.completedLessonIds ?? []);
    };
    void loadProgress().catch(() => {
      if (!cancelled) setCompletedLessons([]);
    });
    return () => { cancelled = true; };
  }, [courseId, topic, user]);

  useEffect(() => {
    if (!deleteArmed) return;
    const timeout = window.setTimeout(() => setDeleteArmed(false), 5_000);
    return () => window.clearTimeout(timeout);
  }, [deleteArmed]);

  const totalLessons = useMemo(
    () => course?.modules.reduce((sum, module) => sum + module.lessons.length, 0) ?? 0,
    [course],
  );
  const validLessonIds = useMemo(() => new Set(course?.modules.flatMap((module, moduleIndex) => module.lessons.map((_, lessonIndex) => `${moduleIndex}-${lessonIndex}`)) ?? []), [course]);
  const validCompletedLessons = useMemo(
    () => completedLessons.filter((lessonId) => validLessonIds.has(lessonId)),
    [completedLessons, validLessonIds],
  );
  const progress = totalLessons ? Math.min(100, Math.round((validCompletedLessons.length / totalLessons) * 100)) : 0;
  const firstIncompleteLesson = useMemo(() => {
    if (!course) return null;
    for (let moduleIndex = 0; moduleIndex < course.modules.length; moduleIndex += 1) {
      const lessonIndex = course.modules[moduleIndex].lessons.findIndex((_, index) => !validCompletedLessons.includes(`${moduleIndex}-${index}`));
      if (lessonIndex >= 0) return `${moduleIndex}-${lessonIndex}`;
    }
    return null;
  }, [course, validCompletedLessons]);
  const nextLesson = useMemo(() => {
    if (!course || !totalLessons) return null;
    const lessonId = firstIncompleteLesson ?? "0-0";
    const [moduleIndex, lessonIndex] = lessonId.split("-").map(Number);
    const lesson = course.modules[moduleIndex]?.lessons[lessonIndex];
    if (!lesson) return null;
    return { lessonId, lesson, moduleTitle: course.modules[moduleIndex].title };
  }, [course, firstIncompleteLesson, totalLessons]);
  const courseComplete = totalLessons > 0 && validCompletedLessons.length === totalLessons;
  const courseHours = Math.max(1, Math.round((course?.estimatedMinutes ?? totalLessons * 12) / 60));

  const updateVisibility = async () => {
    if (!isOwner || !courseId || !course) return;
    setUpdating(true);
    setActionError(null);
    try {
      const token = await getToken();
      const response = await fetch(`/api/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isPublic: !course.isPublic }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Visibility could not be updated.");
      setCourse({ ...course, isPublic: data.isPublic });
      window.dispatchEvent(new Event("erudoza:courses-changed"));
    } catch (updateError) {
      setActionError(updateError instanceof Error ? updateError.message : "Visibility could not be updated.");
    } finally {
      setUpdating(false);
    }
  };

  const deleteCourse = async () => {
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    if (!isOwner || !courseId) return;
    setUpdating(true);
    setActionError(null);
    try {
      const token = await getToken();
      const response = await fetch(`/api/courses/${courseId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The course could not be deleted.");
      localStorage.removeItem(`erudoza-progress:${courseId}`);
      localStorage.removeItem(`teach-progress:${courseId}`);
      window.dispatchEvent(new Event("erudoza:courses-changed"));
      router.push("/");
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : "The course could not be deleted.");
      setUpdating(false);
      setDeleteArmed(false);
    }
  };

  if (loading || (!requestedCourseId && authLoading)) {
    return (
      <AppShell activeTopic={topic} activeCourseId={requestedCourseId}>
        <div className="center-state course-building-state">
          <span className="loading-orbit"><LoaderCircle size={28} /></span>
          <h1>{requestedCourseId ? "Opening the course" : `Creating ${topic}`}</h1>
          <p>{requestedCourseId ? "Loading the course and your progress…" : "Building your course outline…"}</p>
        </div>
      </AppShell>
    );
  }

  if (error || !course) {
    return (
      <AppShell activeTopic={topic} activeCourseId={requestedCourseId}>
        <div className="center-state error-state">
          <span className="state-icon"><LockKeyhole size={23} /></span>
          <p className="overline">Course unavailable</p>
          <h1>{requestedCourseId ? "This course can’t be opened" : "Private course creation"}</h1>
          <p>{error || "The course could not be found."}</p>
          <div className="state-actions">
            <button className="button button-secondary" onClick={() => router.push("/library")}><ArrowLeft size={16} /> Browse courses</button>
            {isPro && <button className="button button-primary" onClick={loadOrGenerate}>Try again</button>}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell activeTopic={topic} activeCourseId={courseId}>
      <div className="course-page">
        <header className="course-header">
          <div className="course-header-topline">
            <button className="text-button" onClick={() => router.push("/library")}><ArrowLeft size={15} /> Public library</button>
            <div className="course-statuses">
              {course.aiAssisted && <span className="ai-disclosure-badge" data-ai-assisted="true"><Bot size={14} /> AI-assisted course</span>}
              <span className={`status-badge ${course.isPublic ? "status-public" : "status-private"}`}>
                {course.isPublic ? <Globe2 size={14} /> : <LockKeyhole size={14} />}
                {course.isPublic ? "Public course" : "Private draft"}
              </span>
            </div>
          </div>

          <div className="course-hero-grid">
            <div className="course-title-row">
              <p className="overline">{course.category ?? "Course"}</p>
              <h1>{topic}</h1>
              <p className="course-mission">{course.mission}</p>
              <dl className="course-facts" aria-label="Course summary">
                <div><dt><Layers3 size={16} /> Modules</dt><dd>{course.modules.length}</dd></div>
                <div><dt><BookOpen size={16} /> Lessons</dt><dd>{totalLessons}</dd></div>
                <div><dt>Starting level</dt><dd>{course.level ?? "Foundations"}</dd></div>
                <div><dt><Clock3 size={16} /> Study time</dt><dd>{courseHours} {courseHours === 1 ? "hour" : "hours"}</dd></div>
              </dl>
            </div>

            {nextLesson && (
              <aside className="course-resume-card" aria-label={courseComplete ? "Course review" : "Next lesson"}>
                <div className="course-resume-heading">
                  <span>{courseComplete ? "Course complete" : validCompletedLessons.length ? "Continue learning" : "Begin here"}</span>
                  <strong>{progress}%</strong>
                </div>
                <p className="course-resume-module">{courseComplete ? "Review the key ideas" : nextLesson.moduleTitle}</p>
                <h2>{courseComplete ? "Review the course from the start" : nextLesson.lesson.title}</h2>
                <p>{courseComplete ? "Revisit the core ideas and practice before they fade." : nextLesson.lesson.concept}</p>
                <div className="course-resume-progress">
                  <div className="progress-track" role="progressbar" aria-label="Course progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ transform: `scaleX(${progress / 100})` }} /></div>
                  <small>{validCompletedLessons.length} of {totalLessons} lessons complete{user ? " · synced" : " · this device"}</small>
                </div>
                <button className="button course-resume-action" onClick={() => router.push(`/course/${encodeURIComponent(topic)}/lesson/${nextLesson.lessonId}?id=${courseId}`)}>
                  <Play size={16} /> {courseComplete ? "Review course" : validCompletedLessons.length ? "Resume lesson" : "Start course"}
                </button>
              </aside>
            )}
          </div>

          <div className="course-learning-brief">
            <section><span><Target size={19} /></span><div><small>Course outcome</small><strong>{course.outcome ?? course.mission}</strong></div></section>
            <section><span><CheckCircle2 size={19} /></span><div><small>By the end</small><strong>{course.capstone?.deliverable ?? course.modules[course.modules.length - 1]?.description ?? "Knowledge you can explain and apply"}</strong></div></section>
            <section><span><BookOpen size={19} /></span><div><small>Before you begin</small><strong>{course.prerequisites?.length ? course.prerequisites.join(" · ") : "No prior knowledge required"}</strong></div></section>
          </div>

          {isPro && user && course.canManage && (
            <div className="course-owner-controls">
              <div className="course-owner-actions">
                {isOwner && (
                  <button className="button button-secondary" onClick={updateVisibility} disabled={updating}>
                    {updating ? <LoaderCircle className="spin" size={16} /> : course.isPublic ? <LockKeyhole size={16} /> : <Globe2 size={16} />}
                    {course.isPublic ? "Return to private" : "Publish course"}
                  </button>
                )}
                <button className={`button ${deleteArmed ? "button-danger" : "button-quiet"}`} onClick={deleteCourse} disabled={updating}>
                  <Trash2 size={16} /> {deleteArmed ? "Confirm delete" : "Delete course"}
                </button>
              </div>
              {!course.isPublic && isOwner && <p className="owner-action-hint">Generate every lesson before publishing. Open each lesson once to create its full content.</p>}
              {actionError && <p className="form-error" role="alert"><Circle size={14} /> {actionError}</p>}
            </div>
          )}
        </header>

        <section className="curriculum" aria-labelledby="curriculum-title">
          <div className="section-heading">
            <div><p className="overline">Course outline</p><h2 id="curriculum-title">Modules and lessons</h2></div>
            <p>{course.modules.length} modules · {totalLessons} lessons. Follow them in order or revisit any concept when you need it.</p>
          </div>

          <div className="module-list">
            {course.modules.map((module, moduleIndex) => {
              const expanded = expandedModule === moduleIndex;
              const completedInModule = module.lessons.filter((_, lessonIndex) => validCompletedLessons.includes(`${moduleIndex}-${lessonIndex}`)).length;
              const moduleProgress = module.lessons.length ? Math.round((completedInModule / module.lessons.length) * 100) : 0;
              return (
                <article className={`module-section ${expanded ? "is-open" : ""}`} key={`${module.title}-${moduleIndex}`}>
                  <button className="module-trigger" onClick={() => setExpandedModule(expanded ? null : moduleIndex)} aria-expanded={expanded}>
                    <span className="module-sequence"><b>{String(moduleIndex + 1).padStart(2, "0")}</b><small>Module</small></span>
                    <span className="module-title"><h3>{module.title}</h3><small>{module.objective ?? module.description}</small></span>
                    <span className="module-completion"><strong>{completedInModule}/{module.lessons.length}</strong><i><b style={{ transform: `scaleX(${moduleProgress / 100})` }} /></i></span>
                    {expanded ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
                  </button>

                  {expanded && (
                    <div className="lesson-list">
                      {module.lessons.map((lesson, lessonIndex) => {
                        const lessonId = `${moduleIndex}-${lessonIndex}`;
                        const complete = validCompletedLessons.includes(lessonId);
                        return (
                          <button
                            className="lesson-row"
                            key={lessonId}
                            onClick={() => router.push(`/course/${encodeURIComponent(topic)}/lesson/${lessonId}${courseId ? `?id=${courseId}` : ""}`)}
                          >
                            <span className={`lesson-status ${complete ? "is-complete" : ""}`}>{complete ? <Check size={14} /> : <span>{moduleIndex + 1}.{lessonIndex + 1}</span>}</span>
                            <span>
                              <strong>{lesson.title}</strong>
                              <small>{lesson.objective ?? lesson.concept}</small>
                              {lesson.lessonMode && <em>{lesson.lessonMode.replace("-", " ")}</em>}
                            </span>
                            <span className="lesson-duration">{lesson.estimatedMinutes ?? 12} min</span>
                            <ArrowRight size={17} />
                          </button>
                        );
                      })}
                      {module.challenge && (
                        <div className="module-challenge">
                          <Flag size={17} />
                          <div>
                            <small>Module challenge</small>
                            <strong>{module.challenge.title}</strong>
                            <p>{module.challenge.prompt}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {course.capstone && (
            <section className="course-capstone" aria-labelledby="capstone-title">
              <Flag size={20} />
              <div>
                <p className="overline">Course capstone</p>
                <h3 id="capstone-title">{course.capstone.title}</h3>
                <p>{course.capstone.brief}</p>
                <strong>Deliverable: {course.capstone.deliverable}</strong>
                <ul>{course.capstone.successCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
              </div>
            </section>
          )}
        </section>
      </div>
    </AppShell>
  );
}
