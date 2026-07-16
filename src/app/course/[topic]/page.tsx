"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Globe2,
  Layers3,
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
  const [expandedModule, setExpandedModule] = useState<number | null>(0);
  const [updating, setUpdating] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);

  const getToken = useCallback(async () => (user ? user.getIdToken() : null), [user]);

  const loadOrGenerate = useCallback(async () => {
    if (authLoading) return;
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
          "Idempotency-Key": crypto.randomUUID(),
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

  const updateVisibility = async () => {
    if (!isOwner || !courseId || !course) return;
    setUpdating(true);
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
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Visibility could not be updated.");
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
      router.push("/");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "The course could not be deleted.");
      setUpdating(false);
      setDeleteArmed(false);
    }
  };

  if (loading || authLoading) {
    return (
      <AppShell activeTopic={topic} activeCourseId={requestedCourseId}>
        <div className="center-state course-building-state">
          <span className="loading-orbit"><LoaderCircle size={28} /></span>
          <h1>{requestedCourseId ? "Opening the learning path" : `Designing ${topic}`}</h1>
          <p>{requestedCourseId ? "Gathering modules and lesson progress…" : "Structuring concepts into a focused progression…"}</p>
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
          <h1>{requestedCourseId ? "This learning path can’t be opened" : "Private course creation"}</h1>
          <p>{error || "The course could not be found."}</p>
          <div className="state-actions">
            <button className="button button-secondary" onClick={() => router.push("/")}><ArrowLeft size={16} /> Return to library</button>
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
            <button className="text-button" onClick={() => router.push("/")}><ArrowLeft size={15} /> Public library</button>
            <span className={`status-badge ${course.isPublic ? "status-public" : "status-private"}`}>
              {course.isPublic ? <Globe2 size={14} /> : <LockKeyhole size={14} />}
              {course.isPublic ? "Public course" : "Private draft"}
            </span>
          </div>

          <div className="course-title-row">
            <div>
              <p className="overline">Learning path</p>
              <h1>{topic}</h1>
              <p className="course-mission">{course.mission}</p>
            </div>
            <div className="course-facts" aria-label="Course summary">
              <span><Layers3 size={17} /><strong>{course.modules.length}</strong> modules</span>
              <span><BookOpen size={17} /><strong>{totalLessons}</strong> lessons</span>
              <span><strong>{course.level ?? "Foundations"}</strong> level</span>
              <span><strong>{Math.max(1, Math.round((course.estimatedMinutes ?? totalLessons * 12) / 60))}</strong> hours</span>
            </div>
          </div>

          {firstIncompleteLesson && (
            <button className="button button-primary course-continue" onClick={() => router.push(`/course/${encodeURIComponent(topic)}/lesson/${firstIncompleteLesson}?id=${courseId}`)}>
              <Play size={16} /> {validCompletedLessons.length ? "Continue course" : "Start first lesson"}
            </button>
          )}

          <div className="progress-strip">
            <div><span>Course progress</span><strong>{progress}%</strong></div>
            <div className="progress-track" role="progressbar" aria-label="Course progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ transform: `scaleX(${progress / 100})` }} /></div>
            <p>{validCompletedLessons.length} of {totalLessons} lessons learned{user ? " and synced" : " on this device"}</p>
          </div>

          {isPro && user && course.authorId === user.uid && (
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
          )}
        </header>

        <section className="curriculum" aria-labelledby="curriculum-title">
          <div className="section-heading">
            <div><p className="overline">Curriculum</p><h2 id="curriculum-title">From foundation to fluency</h2></div>
            <p>Move in order or open the concept you need. Reviews are scheduled after demonstrated understanding.</p>
          </div>

          <div className="module-list">
            {course.modules.map((module, moduleIndex) => {
              const expanded = expandedModule === moduleIndex;
              const completedInModule = module.lessons.filter((_, lessonIndex) => validCompletedLessons.includes(`${moduleIndex}-${lessonIndex}`)).length;
              return (
                <article className={`module-section ${expanded ? "is-open" : ""}`} key={`${module.title}-${moduleIndex}`}>
                  <button className="module-trigger" onClick={() => setExpandedModule(expanded ? null : moduleIndex)} aria-expanded={expanded}>
                    <span className="module-sequence">Module {moduleIndex + 1}</span>
                    <span className="module-title"><strong>{module.title}</strong><small>{module.description}</small></span>
                    <span className="module-completion">{completedInModule}/{module.lessons.length}</span>
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
                            <span className={`lesson-status ${complete ? "is-complete" : ""}`}>{complete ? <Check size={14} /> : <Circle size={9} />}</span>
                            <span><strong>{lesson.title}</strong><small>{lesson.concept}</small></span>
                            <span className="lesson-duration">{lesson.estimatedMinutes ?? 12} min</span>
                            <ArrowRight size={17} />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
