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
  Clock3,
  Circle,
  Flag,
  Globe2,
  Layers3,
  ListTree,
  Target,
  TriangleAlert,
  LoaderCircle,
  LockKeyhole,
  Play,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import AppDrawer, { useAppDrawer } from "@/components/AppDrawer";
import AppShell from "@/components/AppShell";
import CourseBanner from "@/components/CourseBanner";
import SpeakButton from "@/components/SpeakButton";
import { useAuth } from "@/components/AuthProvider";
import type { Course } from "@/lib/course-types";
import type { CapstoneAssessment, CourseProgress } from "@/lib/learning-types";
import { getLocalProgress, removeLocalProgress } from "@/lib/learning-progress";
import { removeCourseFromLearnerState } from "@/lib/learner-state";
import { createClientId } from "@/lib/browser-compat";
import { trackProductEvent } from "@/lib/product-analytics";

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
  const [bannerBusy, setBannerBusy] = useState(false);
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);
  const [capstoneAssessment, setCapstoneAssessment] = useState<CapstoneAssessment | null>(null);
  const [capstoneSubmission, setCapstoneSubmission] = useState("");
  const [capstoneBusy, setCapstoneBusy] = useState(false);
  const [capstoneError, setCapstoneError] = useState<string | null>(null);
  const outlineDrawer = useAppDrawer("course-outline");
  const deleteDrawer = useAppDrawer("course-delete-confirmation");

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
    if (!courseId || !course || isOwner) return;
    trackProductEvent("course_started", {
      route: "/course",
      courseId,
      contentVersion: course.updatedAt,
      oncePerSession: true,
    });
  }, [course, courseId, isOwner]);

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
          if (!cancelled) {
            setCompletedLessons(data.progress?.completedLessonIds ?? []);
            setCapstoneAssessment(data.progress?.capstone ?? null);
          }
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
  const misconceptionCount = useMemo(
    () => course?.modules.reduce((sum, module) => sum + module.lessons.filter((lesson) => lesson.misconception).length, 0) ?? 0,
    [course],
  );

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
    if (!user || !course?.canManage || !courseId) return;
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
      removeLocalProgress(courseId);
      removeCourseFromLearnerState(courseId);
      window.dispatchEvent(new Event("erudoza:courses-changed"));
      window.dispatchEvent(new CustomEvent("erudoza:course-deleted", { detail: { courseId } }));
      deleteDrawer.closeDrawer();
      router.push("/");
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : "The course could not be deleted.");
      setUpdating(false);
    }
  };

  const regenerateBanner = async () => {
    if (!user || !course?.canManage || !course.canRegenerateBanner || !courseId) return;
    setBannerBusy(true);
    setActionError(null);
    try {
      const token = await getToken();
      const response = await fetch(`/api/courses/${courseId}/banner`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": createClientId(),
        },
      });
      const data = await response.json() as Course & { error?: string };
      if (!response.ok) throw new Error(data.error || "A new banner could not be generated.");
      setCourse(data);
      window.dispatchEvent(new Event("erudoza:courses-changed"));
    } catch (bannerError) {
      setActionError(bannerError instanceof Error ? bannerError.message : "A new banner could not be generated.");
    } finally {
      setBannerBusy(false);
    }
  };

  const submitCapstone = async () => {
    if (!user || !courseId || capstoneBusy) return;
    setCapstoneBusy(true);
    setCapstoneError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/assess-capstone", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": createClientId(),
        },
        body: JSON.stringify({ courseId, submission: capstoneSubmission }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The capstone could not be assessed.");
      const assessment = data.assessment as CapstoneAssessment;
      setCapstoneAssessment(assessment);
      trackProductEvent("capstone_submitted", {
        route: "/course",
        courseId,
        exclude: isOwner,
      });
      if (assessment.status === "passed") {
        trackProductEvent("criterion_demonstrated", {
          route: "/course",
          courseId,
          exclude: isOwner,
          oncePerSession: true,
        });
      }
    } catch (assessError) {
      setCapstoneError(assessError instanceof Error ? assessError.message : "The capstone could not be assessed.");
    } finally {
      setCapstoneBusy(false);
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

          <CourseBanner course={course} variant="hero" eager />

          <div className="course-hero-grid">
            <div className="course-title-row">
              <p className="overline">{course.category ?? "Course"}</p>
              <div className="course-title-line">
                <h1>{topic}</h1>
                <SpeakButton
                  label="Read the course overview aloud"
                  text={[
                    `${topic}.`,
                    course.mission ?? "",
                    course.outcome ? `Course outcome: ${course.outcome}.` : "",
                    course.capstone ? `Capstone: ${course.capstone.brief}` : "",
                  ].filter(Boolean).join("\n\n")}
                />
              </div>
              <p className="course-mission">{course.mission}</p>
              <dl className="course-facts" aria-label="Course summary">
                <div><dt><Layers3 size={16} /> Modules</dt><dd>{course.modules.length}</dd></div>
                <div><dt><BookOpen size={16} /> Lessons</dt><dd>{totalLessons}</dd></div>
                <div><dt>Starting level</dt><dd>{course.level ?? "Foundations"}</dd></div>
                <div><dt><Clock3 size={16} /> Study time</dt><dd>{courseHours} {courseHours === 1 ? "hour" : "hours"}</dd></div>
                {misconceptionCount > 0 && <div><dt><Target size={16} /> Misconceptions corrected</dt><dd>{misconceptionCount}</dd></div>}
              </dl>
            </div>

            {nextLesson && (
              <aside className="course-resume-card" aria-label={courseComplete ? "Course review" : "Next lesson"}>
                <div className="course-resume-heading">
                  <span>{capstoneAssessment?.status === "passed" ? "Course mastered" : courseComplete ? "Course complete" : validCompletedLessons.length ? "Continue learning" : "Begin here"}</span>
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

          {course.canManage && (
            <div className="course-owner-controls">
              <div className="course-owner-actions">
                {isOwner && (
                  <button className="button button-secondary" onClick={updateVisibility} disabled={updating || bannerBusy}>
                    {updating ? <LoaderCircle className="spin" size={16} /> : course.isPublic ? <LockKeyhole size={16} /> : <Globe2 size={16} />}
                    {course.isPublic ? "Return to private" : "Publish course"}
                  </button>
                )}
                {course.canRegenerateBanner && (
                  <button className="button button-secondary" onClick={() => void regenerateBanner()} disabled={updating || bannerBusy}>
                    {bannerBusy ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
                    {bannerBusy ? "Creating simpler banner…" : "Regenerate banner once"}
                  </button>
                )}
                <button className="button button-quiet" onClick={() => {
                  setActionError(null);
                  deleteDrawer.openDrawer();
                }} disabled={updating || bannerBusy}>
                  <Trash2 size={16} /> Delete course
                </button>
              </div>
              {course.canRegenerateBanner && <p className="owner-action-hint">One curated banner replacement is available for this course. It replaces the current image automatically.</p>}
              {!course.isPublic && isOwner && <p className="owner-action-hint">Generate every lesson before publishing. Open each lesson once to create its full content.</p>}
              {actionError && <p className="form-error" role="alert"><Circle size={14} /> {actionError}</p>}
            </div>
          )}
        </header>

        <section className="curriculum" aria-labelledby="curriculum-title">
          <div className="section-heading">
            <div><p className="overline">Course outline</p><h2 id="curriculum-title">Modules and lessons</h2></div>
            <div className="curriculum-heading-actions">
              <p>{course.modules.length} modules · {totalLessons} lessons. Follow them in order or revisit any concept when you need it.</p>
              <button className="button button-secondary course-outline-trigger" type="button" onClick={outlineDrawer.openDrawer} aria-expanded={outlineDrawer.open}>
                <ListTree size={17} /> Browse outline
              </button>
            </div>
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
                    <ChevronDown size={19} />
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

                {capstoneAssessment?.status === "passed" ? (
                  <div className="capstone-verdict is-passed" role="status">
                    <div className="capstone-verdict-heading"><CheckCircle2 size={19} /><strong>Course mastered</strong><small>Assessed {new Date(capstoneAssessment.assessedAt).toLocaleDateString()}</small></div>
                    <p>{capstoneAssessment.summary}</p>
                    <ul>{capstoneAssessment.criteria.map((criterion) => <li key={criterion.criterion} className="is-met"><Check size={14} /><span><strong>{criterion.criterion}</strong><small>{criterion.feedback}</small></span></li>)}</ul>
                  </div>
                ) : user ? (
                  <div className="capstone-submit">
                    {capstoneAssessment && (
                      <div className="capstone-verdict" role="status">
                        <div className="capstone-verdict-heading"><Circle size={17} /><strong>Not there yet · attempt {capstoneAssessment.attempts}</strong><small>Assessed {new Date(capstoneAssessment.assessedAt).toLocaleDateString()}</small></div>
                        <p>{capstoneAssessment.summary}</p>
                        <ul>{capstoneAssessment.criteria.map((criterion) => <li key={criterion.criterion} className={criterion.met ? "is-met" : ""}>{criterion.met ? <Check size={14} /> : <Circle size={14} />}<span><strong>{criterion.criterion}</strong><small>{criterion.feedback}</small></span></li>)}</ul>
                      </div>
                    )}
                    {courseComplete ? (
                      <>
                        <label htmlFor="capstone-submission">{capstoneAssessment ? "Revise and resubmit your capstone" : "Submit your capstone for assessment"}</label>
                        <p className="capstone-submit-hint">Describe what you built or worked through and how it meets each success criterion. Your submission is assessed against the criteria above. This uses one tutor question.</p>
                        <textarea
                          id="capstone-submission"
                          value={capstoneSubmission}
                          onChange={(event) => setCapstoneSubmission(event.target.value)}
                          rows={6}
                          placeholder="Walk through your deliverable, decision by decision…"
                        />
                        <div className="capstone-submit-actions">
                          <button className="button button-primary" onClick={submitCapstone} disabled={capstoneBusy || capstoneSubmission.trim().length < 120}>
                            {capstoneBusy ? <LoaderCircle className="spin" size={16} /> : <Flag size={16} />}
                            {capstoneBusy ? "Assessing against the criteria…" : "Submit for assessment"}
                          </button>
                          {capstoneSubmission.trim().length > 0 && capstoneSubmission.trim().length < 120 && <small>Add a little more detail so the assessment has something to verify.</small>}
                        </div>
                        {capstoneError && <p className="form-error" role="alert"><Circle size={14} /> {capstoneError}</p>}
                      </>
                    ) : (
                      <p className="capstone-submit-hint">Complete every lesson to unlock capstone assessment. Your work is then assessed against the success criteria above.</p>
                    )}
                  </div>
                ) : (
                  <p className="capstone-submit-hint">Sign in to submit this capstone for assessment when you finish the course. Passing it is how you master the course.</p>
                )}
              </div>
            </section>
          )}
        </section>

        {outlineDrawer.open && (
          <AppDrawer open={outlineDrawer.open} onClose={outlineDrawer.closeDrawer} labelledBy="course-outline-drawer-title" size="medium" mobilePlacement="bottom" className="course-outline-app-drawer">
            <section className="course-outline-drawer">
              <header className="app-drawer-header">
                <div><small>{course.topic}</small><h2 id="course-outline-drawer-title">Course outline</h2><p>{totalLessons} lessons across {course.modules.length} modules.</p></div>
                <button className="icon-button" type="button" onClick={outlineDrawer.closeDrawer} aria-label="Close course outline"><X size={18} /></button>
              </header>
              <div className="app-drawer-body course-outline-scroll">
                {course.modules.map((module, moduleIndex) => (
                  <section className="course-outline-module" key={`${module.title}-drawer`}>
                    <header><span>{String(moduleIndex + 1).padStart(2, "0")}</span><div><h3>{module.title}</h3><p>{module.objective ?? module.description}</p></div></header>
                    <div>
                      {module.lessons.map((lesson, lessonIndex) => {
                        const lessonId = `${moduleIndex}-${lessonIndex}`;
                        const complete = validCompletedLessons.includes(lessonId);
                        return (
                          <button type="button" key={lessonId} onClick={() => {
                            outlineDrawer.closeDrawer();
                            router.push(`/course/${encodeURIComponent(topic)}/lesson/${lessonId}${courseId ? `?id=${courseId}` : ""}`);
                          }}>
                            <span className={`lesson-status ${complete ? "is-complete" : ""}`}>{complete ? <Check size={14} /> : <span>{moduleIndex + 1}.{lessonIndex + 1}</span>}</span>
                            <span><strong>{lesson.title}</strong><small>{lesson.objective ?? lesson.concept}</small></span>
                            <ArrowRight size={16} />
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          </AppDrawer>
        )}

        {deleteDrawer.open && (
          <AppDrawer
            open={deleteDrawer.open}
            onClose={() => {
              if (!updating) deleteDrawer.closeDrawer();
            }}
            labelledBy="course-delete-drawer-title"
            size="compact"
            mobilePlacement="bottom"
            className="course-delete-app-drawer"
          >
            <section className="course-delete-drawer">
              <header className="app-drawer-header">
                <div>
                  <small>Permanent action</small>
                  <h2 id="course-delete-drawer-title">Delete &ldquo;{course.topic}&rdquo;?</h2>
                  <p>This course cannot be recovered after deletion.</p>
                </div>
                <button className="icon-button" type="button" onClick={deleteDrawer.closeDrawer} aria-label="Close deletion confirmation" disabled={updating}>
                  <X size={18} />
                </button>
              </header>
              <div className="app-drawer-body course-delete-body">
                <div className="course-delete-warning">
                  <TriangleAlert size={20} aria-hidden="true" />
                  <div>
                    <strong>Erudoza will permanently delete:</strong>
                    <ul>
                      <li>The course and all generated lessons</li>
                      <li>Every learner&apos;s progress and scheduled reviews for this course</li>
                      <li>Course bookmarks, lesson bookmarks, and linked lesson notes</li>
                    </ul>
                  </div>
                </div>
                <p className="course-delete-library-note">The course banner will disappear from the app. Its reusable source asset may remain in the shared visual library when another course can use it.</p>
                {actionError && <p className="form-error" role="alert"><Circle size={14} /> {actionError}</p>}
              </div>
              <footer className="app-drawer-footer">
                <button className="button button-quiet" type="button" onClick={deleteDrawer.closeDrawer} disabled={updating}>Keep course</button>
                <button className="button button-danger" type="button" onClick={() => void deleteCourse()} disabled={updating}>
                  {updating ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}
                  {updating ? "Deleting course…" : "Permanently delete course"}
                </button>
              </footer>
            </section>
          </AppDrawer>
        )}
      </div>
    </AppShell>
  );
}
