"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Bot,
  CheckCircle2,
  Check,
  Clock3,
  Circle,
  Flag,
  Globe2,
  Layers3,
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
import CourseDisclosure from "@/components/CourseDisclosure";
import CourseJourneyMap from "@/components/CourseJourneyMap";
import OutcomePlanner from "@/components/OutcomePlanner";
import SpeakButton from "@/components/SpeakButton";
import { useMasteryJourney } from "@/components/useMasteryJourney";
import { useAuth } from "@/components/AuthProvider";
import type { Course } from "@/lib/course-types";
import type { CapstoneAssessment, CourseProgress } from "@/lib/learning-types";
import type { PublicationLessonFailure } from "@/lib/publication-readiness";
import { clearLocalCourseData } from "@/lib/local-course-data";
import { createClientId } from "@/lib/browser-compat";
import { trackProductEvent } from "@/lib/product-analytics";
import { sourceHostname } from "@/lib/source-safety";

export default function CourseMap() {
  const params = useParams<{ topic: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const topic = decodeURIComponent(params.topic);
  const requestedCourseId = searchParams.get("id");
  const courseViewKey = `${requestedCourseId ?? "new"}:${topic}`;
  const { user, isOwner, isPro, loading: authLoading, signInWithGoogle } = useAuth();
  const [courseRecord, setCourseRecord] = useState<{ key: string; value: Course | null }>({ key: courseViewKey, value: null });
  const course = courseRecord.key === courseViewKey ? courseRecord.value : null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [publishAttested, setPublishAttested] = useState(false);
  const [publicationFailures, setPublicationFailures] = useState<PublicationLessonFailure[]>([]);
  const [regeneratingLessonId, setRegeneratingLessonId] = useState<string | null>(null);
  const [completedLessons, setCompletedLessons] = useState<string[]>([]);
  const [capstoneAssessment, setCapstoneAssessment] = useState<CapstoneAssessment | null>(null);
  const [capstoneSubmission, setCapstoneSubmission] = useState("");
  const [capstoneBusy, setCapstoneBusy] = useState(false);
  const [capstoneError, setCapstoneError] = useState<string | null>(null);
  const [reportingSourceId, setReportingSourceId] = useState<string | null>(null);
  const [sourceReportNote, setSourceReportNote] = useState("");
  const [sourceReportCategory, setSourceReportCategory] = useState<"source" | "copyright" | "safety">("source");
  const [sourceReportBusy, setSourceReportBusy] = useState(false);
  const [sourceReportStatus, setSourceReportStatus] = useState<string | null>(null);
  const deleteDrawer = useAppDrawer("course-delete-confirmation");
  const closeDeleteDrawer = deleteDrawer.closeDrawer;
  const activeCourseViewRef = useRef(courseViewKey);

  const getToken = useCallback(async () => (user ? user.getIdToken() : null), [user]);

  const loadOrGenerate = useCallback(async () => {
    const requestViewKey = courseViewKey;
    const isCurrentView = () => activeCourseViewRef.current === requestViewKey;
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
        if (!isCurrentView()) return;
        if (response.status === 404) clearLocalCourseData(requestedCourseId);
        if (!response.ok) throw new Error(data.error || "The course could not be opened.");
        setCourseRecord({ key: requestViewKey, value: { ...data, id: requestedCourseId, courseId: requestedCourseId } });
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
      if (!isCurrentView()) return;
      if (!response.ok) throw new Error(data.error || "The course could not be generated.");
      const nextCourse = { ...data, topic, id: data.courseId } as Course;
      setCourseRecord({ key: requestViewKey, value: nextCourse });
      if (data.courseId) router.replace(`/course/${encodeURIComponent(topic)}?id=${data.courseId}`);
    } catch (loadError) {
      if (isCurrentView()) setError(loadError instanceof Error ? loadError.message : "The course could not be opened.");
    } finally {
      if (isCurrentView()) setLoading(false);
    }
  }, [authLoading, courseViewKey, requestedCourseId, isPro, getToken, topic, router]);

  useEffect(() => {
    activeCourseViewRef.current = courseViewKey;
    closeDeleteDrawer();
    void Promise.resolve().then(() => {
      if (activeCourseViewRef.current !== courseViewKey) return;
      setLoading(true);
      setError(null);
      setActionError(null);
      setUpdating(false);
      setBannerBusy(false);
      setPublishAttested(false);
      setPublicationFailures([]);
      setRegeneratingLessonId(null);
      setCompletedLessons([]);
      setCapstoneAssessment(null);
      setCapstoneSubmission("");
      setCapstoneBusy(false);
      setCapstoneError(null);
      setReportingSourceId(null);
      setSourceReportNote("");
      setSourceReportCategory("source");
      setSourceReportBusy(false);
      setSourceReportStatus(null);
    });
  }, [closeDeleteDrawer, courseViewKey]);

  useEffect(() => {
    void Promise.resolve().then(loadOrGenerate);
  }, [loadOrGenerate]);

  const courseId = course?.id ?? course?.courseId ?? requestedCourseId;
  const openLesson = useCallback(async (lessonId: string) => {
    if (!courseId) return;
    if (!user) {
      try {
        await signInWithGoogle();
      } catch {
        return;
      }
    }
    router.push(`/course/${encodeURIComponent(topic)}/lesson/${lessonId}?id=${courseId}`);
  }, [courseId, router, signInWithGoogle, topic, user]);
  const masteryJourney = useMasteryJourney(courseId, user);

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
      if (!cancelled) setCompletedLessons([]);
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
  const generatedLessonIds = useMemo(() => new Set(course?.generatedLessonIds ?? []), [course?.generatedLessonIds]);
  const proAuthoringGateActive = Boolean(course?.canManage && !isOwner && !course.isPublic);
  const canOpenLesson = useCallback((lessonId: string) =>
    !proAuthoringGateActive
    || generatedLessonIds.has(lessonId)
    || lessonId === firstIncompleteLesson,
  [firstIncompleteLesson, generatedLessonIds, proAuthoringGateActive]);
  const courseHours = Math.max(1, Math.round((course?.estimatedMinutes ?? totalLessons * 12) / 60));
  const misconceptionCount = useMemo(
    () => course?.modules.reduce((sum, module) => sum + module.lessons.filter((lesson) => lesson.misconception).length, 0) ?? 0,
    [course],
  );

  const updateVisibility = async () => {
    if (!course?.canManage || !courseId) return;
    const operationViewKey = activeCourseViewRef.current;
    const operationCourseId = courseId;
    const isCurrentView = () => activeCourseViewRef.current === operationViewKey;
    setUpdating(true);
    setActionError(null);
    setPublicationFailures([]);
    try {
      const token = await getToken();
      const response = await fetch(`/api/courses/${operationCourseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          isPublic: !course.isPublic,
          attested: !course.isPublic ? publishAttested : undefined,
        }),
      });
      const data = await response.json();
      if (!isCurrentView()) return;
      if (!response.ok) {
        if (Array.isArray(data.invalidLessons)) {
          setPublicationFailures(data.invalidLessons.filter((item: unknown): item is PublicationLessonFailure =>
            Boolean(item)
            && typeof item === "object"
            && typeof (item as PublicationLessonFailure).lessonId === "string"
            && Array.isArray((item as PublicationLessonFailure).issues),
          ));
        }
        throw new Error(data.error || "Visibility could not be updated.");
      }
      setCourseRecord({ key: operationViewKey, value: { ...course, isPublic: data.isPublic } });
      setPublishAttested(false);
      window.dispatchEvent(new Event("erudoza:courses-changed"));
    } catch (updateError) {
      if (isCurrentView()) setActionError(updateError instanceof Error ? updateError.message : "Visibility could not be updated.");
    } finally {
      if (isCurrentView()) setUpdating(false);
    }
  };

  const reportSource = async (event: React.FormEvent, sourceId: string) => {
    event.preventDefault();
    if (!user || !courseId || sourceReportBusy) return;
    setSourceReportBusy(true);
    setSourceReportStatus(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/content-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ courseId, sourceId, category: sourceReportCategory, note: sourceReportNote.trim() }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "The source report could not be sent.");
      setSourceReportStatus("Source report received for owner review.");
      setReportingSourceId(null);
      setSourceReportNote("");
      setSourceReportCategory("source");
    } catch (reportError) {
      setSourceReportStatus(reportError instanceof Error ? reportError.message : "The source report could not be sent.");
    } finally {
      setSourceReportBusy(false);
    }
  };

  const regenerateLesson = async (lessonId: string) => {
    if (!user || !course?.canManage || !courseId || course.isPublic) return;
    const operationViewKey = activeCourseViewRef.current;
    const operationCourseId = courseId;
    const isCurrentView = () => activeCourseViewRef.current === operationViewKey;
    setRegeneratingLessonId(lessonId);
    setActionError(null);
    try {
      const token = await getToken();
      const response = await fetch("/api/generate-lesson", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": createClientId(),
        },
        body: JSON.stringify({ courseId: operationCourseId, lessonId, regenerate: true }),
      });
      const data = await response.json() as { error?: string };
      if (!isCurrentView()) return;
      if (!response.ok) throw new Error(data.error || "The lesson could not be regenerated.");
      setPublicationFailures((current) => current.filter((failure) => failure.lessonId !== lessonId));
    } catch (regenerationError) {
      if (isCurrentView()) setActionError(regenerationError instanceof Error ? regenerationError.message : "The lesson could not be regenerated.");
    } finally {
      if (isCurrentView()) setRegeneratingLessonId(null);
    }
  };

  const deleteCourse = async () => {
    if (!user || !course?.canManage || !courseId) return;
    const operationViewKey = activeCourseViewRef.current;
    const operationCourseId = courseId;
    const isCurrentView = () => activeCourseViewRef.current === operationViewKey;
    setUpdating(true);
    setActionError(null);
    try {
      const token = await getToken();
      const response = await fetch(`/api/courses/${operationCourseId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!isCurrentView()) return;
      if (!response.ok) throw new Error(data.error || "The course could not be deleted.");
      clearLocalCourseData(operationCourseId);
      deleteDrawer.closeDrawer();
      router.push("/");
    } catch (deleteError) {
      if (isCurrentView()) {
        setActionError(deleteError instanceof Error ? deleteError.message : "The course could not be deleted.");
        setUpdating(false);
      }
    }
  };

  const regenerateBanner = async () => {
    if (!user || !course?.canManage || !course.canRegenerateBanner || !courseId) return;
    const operationViewKey = activeCourseViewRef.current;
    const operationCourseId = courseId;
    const isCurrentView = () => activeCourseViewRef.current === operationViewKey;
    setBannerBusy(true);
    setActionError(null);
    try {
      const token = await getToken();
      const response = await fetch(`/api/courses/${operationCourseId}/banner`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": createClientId(),
        },
      });
      const data = await response.json() as Course & { error?: string };
      if (!isCurrentView()) return;
      if (!response.ok) throw new Error(data.error || "A new banner could not be generated.");
      setCourseRecord({ key: operationViewKey, value: data });
      window.dispatchEvent(new Event("erudoza:courses-changed"));
    } catch (bannerError) {
      if (isCurrentView()) setActionError(bannerError instanceof Error ? bannerError.message : "A new banner could not be generated.");
    } finally {
      if (isCurrentView()) setBannerBusy(false);
    }
  };

  const submitCapstone = async () => {
    if (!user || !courseId || capstoneBusy) return;
    const operationViewKey = activeCourseViewRef.current;
    const operationCourseId = courseId;
    const isCurrentView = () => activeCourseViewRef.current === operationViewKey;
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
        body: JSON.stringify({ courseId: operationCourseId, submission: capstoneSubmission }),
      });
      const data = await response.json();
      if (!isCurrentView()) return;
      if (!response.ok) throw new Error(data.error || "The capstone could not be assessed.");
      const assessment = data.assessment as CapstoneAssessment;
      setCapstoneAssessment(assessment);
      trackProductEvent("capstone_submitted", {
        route: "/course",
        courseId,
        exclude: isOwner,
        score: assessment.criteria.length
          ? Math.round((assessment.criteria.filter((criterion) => criterion.met).length / assessment.criteria.length) * 100)
          : 0,
      });
      if (assessment.status === "passed") {
        if (course) {
          const observedAt = assessment.assessedAt;
          await masteryJourney.addEvidence(course.modules.map((courseModule, moduleIndex) => ({
            id: createClientId(),
            courseId,
            objectiveId: `module-${moduleIndex}`,
            type: "capstone" as const,
            result: "passed" as const,
            label: `Capstone demonstrated: ${courseModule.objective ?? courseModule.title}`,
            observedAt,
            criterion: course.capstone?.title,
          })));
        }
        trackProductEvent("criterion_demonstrated", {
          route: "/course",
          courseId,
          exclude: isOwner,
          oncePerSession: true,
        });
      }
      assessment.criteria.filter((criterion) => criterion.met).forEach((criterion, criterionIndex) => {
        trackProductEvent("capstone_criterion_passed", {
          route: "/course",
          courseId,
          objectiveId: `criterion-${criterionIndex}`,
          exclude: isOwner,
        });
      });
    } catch (assessError) {
      if (isCurrentView()) setCapstoneError(assessError instanceof Error ? assessError.message : "The capstone could not be assessed.");
    } finally {
      if (isCurrentView()) setCapstoneBusy(false);
    }
  };

  if ((loading && !course) || (!requestedCourseId && authLoading)) {
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
                <button className="button course-resume-action" onClick={() => void openLesson(nextLesson.lessonId)}>
                  {user ? <Play size={16} /> : <LockKeyhole size={16} />}
                  {user ? (courseComplete ? "Review course" : validCompletedLessons.length ? "Resume lesson" : "Start course") : "Create an account to begin"}
                </button>
                {!user && <small className="course-access-note">The full outline is public. A free account unlocks lesson content and saved progress.</small>}
              </aside>
            )}
          </div>

          <div className="course-learning-brief">
            <section><span><Target size={19} /></span><div><small>Course outcome</small><strong>{course.outcome ?? course.mission}</strong></div></section>
            <section><span><CheckCircle2 size={19} /></span><div><small>By the end</small><strong>{course.capstone?.deliverable ?? course.modules[course.modules.length - 1]?.description ?? "Knowledge you can explain and apply"}</strong></div></section>
            <section><span><BookOpen size={19} /></span><div><small>Before you begin</small><strong>{course.prerequisites?.length ? course.prerequisites.join(" · ") : "No prior knowledge required"}</strong></div></section>
          </div>

          {(course.artifact || course.scenario || course.modules[0]?.lessons[0]?.activityPreview) && (
            <CourseDisclosure
              className="course-apprenticeship"
              description="Each module adds evidence to the final artifact, so progress is visible in what you can produce, not only what you have read."
              eyebrow="What you will make"
              headingId="course-apprenticeship-title"
              title="The course advances one piece of meaningful work."
            >
              <div className="course-apprenticeship-grid">
                {course.artifact && <article className="artifact-preview"><span><Flag size={18} /> Final artifact</span><h3>{course.artifact.title}</h3><p>{course.artifact.description}</p><small>Format: {course.artifact.format}</small></article>}
                {course.scenario && <article><span><Layers3 size={18} /> Scenario spine</span><h3>{course.scenario.title}</h3><p>{course.scenario.context}</p><small>Why it matters: {course.scenario.stakes}</small></article>}
                {course.modules[0]?.lessons[0]?.activityPreview && <article><span><Target size={18} /> First active move</span><h3>{course.modules[0].lessons[0].title}</h3><p>{course.modules[0].lessons[0].activityPreview}</p><small>{course.modules[0].lessons[0].artifactContribution}</small></article>}
              </div>
              {course.sourcePack?.length ? <div className="course-source-strip">
                <strong>Author-provided references</strong>
                <p>These links were supplied by the course author. A listed URL is not proof that Erudoza retrieved or verified its contents. Lessons identify references they actually used.</p>
                <ul>{course.sourcePack.map((source) => <li key={source.id}>
                  <div>{source.url ? <a href={source.url} target="_blank" rel="nofollow ugc noreferrer" aria-label={`${source.label}, opens ${sourceHostname(source.url)} in a new tab`}>{source.label}</a> : <span>{source.label}</span>}<small>{source.url ? `${sourceHostname(source.url)} · ` : ""}{source.kind.replace("-", " ")} · {source.rights.replace("-", " ")}</small></div>
                  {user && <button className="text-button" type="button" onClick={() => { setReportingSourceId(source.id); setSourceReportNote(""); setSourceReportCategory("source"); setSourceReportStatus(null); }}><Flag size={13} /> Report source</button>}
                  {reportingSourceId === source.id && <form className="source-report-form" onSubmit={(event) => void reportSource(event, source.id)}>
                    <label htmlFor={`source-report-category-${source.id}`}>Issue type</label>
                    <select id={`source-report-category-${source.id}`} value={sourceReportCategory} onChange={(event) => setSourceReportCategory(event.target.value as typeof sourceReportCategory)}><option value="source">Misleading or weak source</option><option value="copyright">Copyright or usage-right concern</option><option value="safety">Unsafe destination or content</option></select>
                    <label htmlFor={`source-report-${source.id}`}>What should the owner review?</label>
                    <textarea id={`source-report-${source.id}`} rows={2} maxLength={1_000} value={sourceReportNote} onChange={(event) => setSourceReportNote(event.target.value)} placeholder="For example: misleading destination, weak evidence, or rights concern." />
                    <div><button className="button button-quiet button-small" type="button" onClick={() => setReportingSourceId(null)}>Cancel</button><button className="button button-secondary button-small" type="submit" disabled={sourceReportBusy}>{sourceReportBusy ? <LoaderCircle className="spin" size={14} /> : <Flag size={14} />} Send report</button></div>
                  </form>}
                </li>)}</ul>
                {sourceReportStatus && <small role="status">{sourceReportStatus}</small>}
              </div> : null}
            </CourseDisclosure>
          )}

          {course.canManage && (
            <CourseDisclosure
              className="course-owner-controls"
              description="Publication review, banner refresh, and course management stay separate from the learner journey."
              eyebrow="Creator tools"
              headingId="course-owner-controls-title"
              title="Course studio"
            >
              {!course.isPublic && (
                <label className="publication-attestation">
                  <input
                    type="checkbox"
                    checked={publishAttested}
                    onChange={(event) => setPublishAttested(event.target.checked)}
                  />
                  <span>I reviewed every lesson, reference link, factual claim, and usage right, and confirm this course is ready for public learners.</span>
                </label>
              )}
              <div className="course-owner-actions">
                <button
                  className="button button-secondary"
                  onClick={updateVisibility}
                  disabled={updating || bannerBusy || (!course.isPublic && !publishAttested)}
                >
                    {updating ? <LoaderCircle className="spin" size={16} /> : course.isPublic ? <LockKeyhole size={16} /> : <Globe2 size={16} />}
                    {updating && !course.isPublic ? "Reviewing for publication…" : course.isPublic ? "Unpublish course" : "Review and publish"}
                </button>
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
              {!course.isPublic && <p className="owner-action-hint">{isOwner
                ? "Every lesson must be generated. Automated safety, language, and teaching-quality checks run again before publication."
                : "Complete each lesson’s activities to unlock generation of the next lesson. Publication runs a fresh safety, language, and teaching-quality review."}</p>}
               {course.isPublic && <p className="owner-action-hint">Published content passed automated safety and quality review. AI-generated factual claims are not independently verified.</p>}
               {publicationFailures.length > 0 && (
                 <section className="publication-failures" aria-labelledby="publication-failures-title">
                   <div>
                     <TriangleAlert size={18} aria-hidden="true" />
                     <div>
                       <h2 id="publication-failures-title">Publication review needs attention</h2>
                       <p>Regenerate the listed lessons, then review and publish again. The current lesson stays available unless a replacement passes the teaching standard.</p>
                     </div>
                   </div>
                   <ul>
                     {publicationFailures.map((failure) => {
                       const [moduleIndex, lessonIndex] = failure.lessonId.split("-").map(Number);
                       const lesson = course.modules[moduleIndex]?.lessons[lessonIndex];
                       const regenerating = regeneratingLessonId === failure.lessonId;
                       return (
                         <li key={failure.lessonId}>
                           <div>
                             <strong>{lesson?.title ?? `Lesson ${failure.lessonId}`}</strong>
                             <ul>{failure.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
                           </div>
                           <button
                             className="button button-secondary"
                             onClick={() => void regenerateLesson(failure.lessonId)}
                             disabled={updating || bannerBusy || regeneratingLessonId !== null}
                           >
                             {regenerating ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
                             {regenerating ? "Regenerating…" : "Regenerate lesson"}
                           </button>
                         </li>
                       );
                     })}
                   </ul>
                 </section>
               )}
               {actionError && <p className="form-error" role="alert"><Circle size={14} /> {actionError}</p>}
            </CourseDisclosure>
          )}
        </header>

        {user && courseId && masteryJourney.ready && (
          <OutcomePlanner
            key={courseId}
            course={course}
            courseId={courseId}
            topic={topic}
            user={user}
            plan={masteryJourney.plan}
            syncStatus={masteryJourney.syncStatus}
            onSave={masteryJourney.savePlan}
            onBaseline={masteryJourney.applyBaselineAssessment}
          />
        )}

        <CourseJourneyMap course={course} completedLessonIds={validCompletedLessons} canOpenLesson={canOpenLesson} onOpenLesson={(lessonId) => void openLesson(lessonId)} />

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
                    {capstoneAssessment.history && capstoneAssessment.history.length > 1 && (
                      <details className="capstone-history">
                        <summary>View revision history ({capstoneAssessment.history.length} attempts)</summary>
                        <ol>{capstoneAssessment.history.map((revision) => <li key={`${revision.attempt}-${revision.assessedAt}`}><span>Attempt {revision.attempt}</span><strong>{revision.status === "passed" ? "Passed" : "Needs revision"}</strong><small>{new Date(revision.assessedAt).toLocaleDateString()} · {revision.summary}</small></li>)}</ol>
                      </details>
                    )}
                  </div>
                ) : user ? (
                  <div className="capstone-submit">
                    {capstoneAssessment && (
                      <div className="capstone-verdict" role="status">
                        <div className="capstone-verdict-heading"><Circle size={17} /><strong>Not there yet · attempt {capstoneAssessment.attempts}</strong><small>Assessed {new Date(capstoneAssessment.assessedAt).toLocaleDateString()}</small></div>
                        <p>{capstoneAssessment.summary}</p>
                        <ul>{capstoneAssessment.criteria.map((criterion) => <li key={criterion.criterion} className={criterion.met ? "is-met" : ""}>{criterion.met ? <Check size={14} /> : <Circle size={14} />}<span><strong>{criterion.criterion}</strong><small>{criterion.feedback}</small></span></li>)}</ul>
                        {capstoneAssessment.history && capstoneAssessment.history.length > 1 && (
                          <details className="capstone-history">
                            <summary>Compare {capstoneAssessment.history.length} attempts</summary>
                            <ol>{capstoneAssessment.history.map((revision) => <li key={`${revision.attempt}-${revision.assessedAt}`}><span>Attempt {revision.attempt}</span><strong>{revision.status === "passed" ? "Passed" : "Needs revision"}</strong><small>{new Date(revision.assessedAt).toLocaleDateString()} · {revision.summary}</small></li>)}</ol>
                          </details>
                        )}
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
                  <p className="capstone-submit-hint">Create a free account to open lessons, save progress, and submit this capstone for assessment.</p>
                )}
              </div>
            </section>
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
                      <li>Outcome plans, mastery evidence, feedback, and open content reports</li>
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
