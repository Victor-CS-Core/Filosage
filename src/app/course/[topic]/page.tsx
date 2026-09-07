"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
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
import AccountEntryButton, { openAccountEntry, useAccountEntryMode } from "@/components/AccountEntryButton";
import CourseBanner from "@/components/CourseBanner";
import CourseDisclosure from "@/components/CourseDisclosure";
import CourseJourneyMap from "@/components/CourseJourneyMap";
import OutcomePlanner from "@/components/OutcomePlanner";
import SpeakButton from "@/components/SpeakButton";
import LearnerSourceNotice from "@/components/LearnerSourceNotice";
import { useMasteryJourney } from "@/components/useMasteryJourney";
import { useAuth } from "@/components/AuthProvider";
import type { Course } from "@/lib/course-types";
import type { CapstoneAssessment, CourseProgress } from "@/lib/learning-types";
import type { PublicationAssessment } from "@/lib/publication-assessment";
import type { PublicationLessonFailure } from "@/lib/publication-readiness";
import { clearLocalCourseData } from "@/lib/local-course-data";
import { isCurrentLearnerSession, learnerRequest, learnerSessionSnapshot } from "@/lib/learner-storage";
import { createClientId } from "@/lib/browser-compat";
import { trackProductEvent } from "@/lib/product-analytics";
import { courseLanguageModeFor } from "@/lib/product-events";
import { sourceHostname } from "@/lib/source-safety";
import type { ValidationReport } from "@/lib/course-pipeline/contract";

type PublicationAssessmentState = {
  assessmentHash: string;
  assessment: PublicationAssessment;
};

const PUBLICATION_ASSESSMENT_STORAGE_PREFIX = "filosage:publication-assessment:v1:";

function readStoredPublicationAssessment(courseViewKey: string): PublicationAssessmentState | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.sessionStorage.getItem(`${PUBLICATION_ASSESSMENT_STORAGE_PREFIX}${courseViewKey}`);
    if (!stored) return null;
    const value = JSON.parse(stored) as Partial<PublicationAssessmentState>;
    if (
      typeof value.assessmentHash !== "string"
      || !value.assessment
      || value.assessment.overrideEligible !== true
      || !Array.isArray(value.assessment.overridableIssues)
    ) return null;
    return value as PublicationAssessmentState;
  } catch {
    return null;
  }
}

function storePublicationAssessment(courseViewKey: string, value: PublicationAssessmentState | null) {
  if (typeof window === "undefined") return;
  const storageKey = `${PUBLICATION_ASSESSMENT_STORAGE_PREFIX}${courseViewKey}`;
  try {
    if (value) window.sessionStorage.setItem(storageKey, JSON.stringify(value));
    else window.sessionStorage.removeItem(storageKey);
  } catch {
    // Publishing remains available when browser storage is unavailable.
  }
}

export default function CourseMap() {
  const params = useParams<{ topic: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const topic = decodeURIComponent(params.topic);
  const requestedCourseId = searchParams.get("id");
  const courseResourceKey = `${requestedCourseId ?? "new"}:${topic}`;
  const { user, isOwner, canCreateCourses, canPublishCourses, account, loading: authLoading } = useAuth();
  const accountId = user?.uid ?? null;
  const session = useMemo(() => learnerSessionSnapshot(accountId), [accountId]);
  const assessmentStorageKey = `${accountId ?? "guest"}:${courseResourceKey}`;
  const courseViewKey = `${session.revision}:${assessmentStorageKey}`;
  const entryMode = useAccountEntryMode();
  const [courseRecord, setCourseRecord] = useState<{ key: string; value: Course | null }>({ key: courseViewKey, value: null });
  const course = courseRecord.key === courseViewKey ? courseRecord.value : null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [publicationFailures, setPublicationFailures] = useState<PublicationLessonFailure[]>([]);
  const [publicationAssessment, setPublicationAssessment] = useState<PublicationAssessmentState | null>(null);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);
  const [validationProofToken, setValidationProofToken] = useState<string | null>(null);
  const [validationBusy, setValidationBusy] = useState(false);
  const [repairProgress, setRepairProgress] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [manualReviewReason, setManualReviewReason] = useState("");
  const [manualReviewSourceIds, setManualReviewSourceIds] = useState<string[]>([]);
  const [manualReviewBusy, setManualReviewBusy] = useState<"approved" | "rejected" | null>(null);
  const [lastTargetedRepairId, setLastTargetedRepairId] = useState<string | null>(null);
  const [targetedRepairBusy, setTargetedRepairBusy] = useState<"apply" | "undo" | null>(null);
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
  const overrideDrawer = useAppDrawer("course-publication-override");
  const closeDeleteDrawer = deleteDrawer.closeDrawer;
  const closeOverrideDrawer = overrideDrawer.closeDrawer;
  const activeCourseViewRef = useRef(courseViewKey);
  const repairRequestKeysRef = useRef(new Map<string, string>());
  const publicationRequestKeysRef = useRef(new Map<string, string>());
  const overrideRequestKeysRef = useRef(new Map<string, string>());
  const manualReviewRequestKeysRef = useRef(new Map<string, string>());

  const request = useCallback(async (input: string, init: RequestInit = {}) => {
    if (!isCurrentLearnerSession(session)) throw new Error("Your learning session changed. Sign in again to continue.");
    if (user) return learnerRequest(user, input, init);
    return fetch(input, { ...init, signal: session.signal });
  }, [session, user]);

  const loadOrGenerate = useCallback(async () => {
    const requestViewKey = courseViewKey;
    const isCurrentView = () => isCurrentLearnerSession(session) && activeCourseViewRef.current === requestViewKey;
    if (!requestedCourseId && authLoading) return;
    setLoading(true);
    setError(null);

    try {
      if (requestedCourseId) {
        const response = await request(`/api/courses/${requestedCourseId}`);
        const data = await response.json();
        if (!isCurrentView()) return;
        if (response.status === 404) clearLocalCourseData(requestedCourseId, user?.uid ?? null);
        if (!response.ok) throw new Error(data.error || "The course could not be opened.");
        setCourseRecord({ key: requestViewKey, value: { ...data, id: requestedCourseId, courseId: requestedCourseId } });
        return;
      }

      setError("This course link is incomplete. Return to the course studio to review all three steps before creating a private course.");
    } catch (loadError) {
      if (isCurrentView()) setError(loadError instanceof Error ? loadError.message : "The course could not be opened.");
    } finally {
      if (isCurrentView()) setLoading(false);
    }
  }, [authLoading, courseViewKey, requestedCourseId, request, session, user]);

  useEffect(() => {
    activeCourseViewRef.current = courseViewKey;
    repairRequestKeysRef.current.clear();
    publicationRequestKeysRef.current.clear();
    overrideRequestKeysRef.current.clear();
    manualReviewRequestKeysRef.current.clear();
    closeDeleteDrawer();
    closeOverrideDrawer();
    void Promise.resolve().then(() => {
      if (!isCurrentLearnerSession(session) || activeCourseViewRef.current !== courseViewKey) return;
      setLoading(true);
      setError(null);
      setActionError(null);
      setUpdating(false);
      setPublicationFailures([]);
      setPublicationAssessment(accountId ? readStoredPublicationAssessment(assessmentStorageKey) : null);
      setValidationReport(null);
      setValidationProofToken(null);
      setValidationBusy(false);
      setRepairProgress(null);
      setOverrideReason("");
      setOverrideConfirmed(false);
      setOverrideBusy(false);
      setManualReviewReason("");
      setManualReviewSourceIds([]);
      setManualReviewBusy(null);
      setLastTargetedRepairId(null);
      setTargetedRepairBusy(null);
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
    return () => { activeCourseViewRef.current = ""; };
  }, [closeDeleteDrawer, closeOverrideDrawer, courseViewKey, assessmentStorageKey, accountId, session]);

  useEffect(() => {
    void Promise.resolve().then(loadOrGenerate);
  }, [loadOrGenerate]);

  const courseId = course?.id ?? course?.courseId ?? requestedCourseId;
  const currentManualReview = validationProofToken
    && course?.manualReviewResolution?.proofToken === validationProofToken
    && course.manualReviewResolution.snapshotHash === validationReport?.snapshotHash
    ? course.manualReviewResolution : null;
  const manualDecisionAvailable = validationReport?.requiresManualReview === true
    && validationReport.issues.every((issue) => issue.repairability === "manual");
  const openLesson = useCallback(async (lessonId: string) => {
    if (!courseId || !isCurrentLearnerSession(session)) return;
    const requestViewKey = courseViewKey;
    if (!user) {
      openAccountEntry();
      return;
    }
    if (!isOwner) {
      await Promise.race([
        trackProductEvent("course_started", {
          route: "/course",
          courseId,
          contentVersion: course?.updatedAt,
          courseLanguageMode: courseLanguageModeFor(course?.language),
          oncePerSession: true,
        }),
        new Promise<void>((resolve) => window.setTimeout(resolve, 750)),
      ]);
    }
    if (!isCurrentLearnerSession(session) || activeCourseViewRef.current !== requestViewKey) return;
    window.location.assign(`/course/${encodeURIComponent(topic)}/lesson/${lessonId}?id=${encodeURIComponent(courseId)}`);
  }, [course?.language, course?.updatedAt, courseId, courseViewKey, isOwner, session, topic, user]);
  const masteryJourney = useMasteryJourney(courseId, user);

  useEffect(() => {
    if (!courseId || !course || isOwner) return;
    trackProductEvent("course_discovered", {
      route: "/course",
      courseId,
      contentVersion: course.updatedAt,
      courseLanguageMode: courseLanguageModeFor(course.language),
      oncePerSession: true,
    });
  }, [course, courseId, isOwner]);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    const loadProgress = async () => {
      if (user) {
        const response = await request(`/api/progress?courseId=${encodeURIComponent(courseId)}`, {
          cache: "no-store",
        });
        if (response.ok) {
          const data = await response.json() as { progress: CourseProgress | null };
          if (!cancelled && isCurrentLearnerSession(session)) {
            setCompletedLessons(data.progress?.completedLessonIds ?? []);
            setCapstoneAssessment(data.progress?.capstone ?? null);
          }
          return;
        }
      }
      if (!cancelled && isCurrentLearnerSession(session)) setCompletedLessons([]);
    };
    void loadProgress().catch(() => {
      if (!cancelled && isCurrentLearnerSession(session)) setCompletedLessons([]);
    });
    return () => { cancelled = true; };
  }, [courseId, request, session, topic, user]);

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
  const plannedSourceIds = useMemo(() => new Set(
    course?.modules.flatMap((courseModule) => courseModule.lessons.flatMap((lesson) => lesson.sourceIds ?? [])) ?? [],
  ), [course]);
  const reviewableSources = useMemo(() => (course?.sourcePack ?? []).filter((source) =>
    Boolean(source.url)
    && (plannedSourceIds.has(source.id) || source.kind === "primary" || source.kind === "official"),
  ), [course?.sourcePack, plannedSourceIds]);
  const displayedEvidenceSources = course?.evidenceProfile
    ? (course.sourcePack ?? []).filter((source) => plannedSourceIds.has(source.id)
      && source.origin === "web-search"
      && source.citationVerified === true)
    : course?.sourcePack ?? [];
  const hasApprenticeship = Boolean(course
    && (course.artifact || course.scenario || course.modules[0]?.lessons[0]?.activityPreview));
  const hasCourseEvidence = Boolean(course
    && (course.evidenceProfile || course.sourcePack?.length || course.furtherReading?.length));
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
    if (!user || !course?.canManage || !courseId) return;
    const operationViewKey = activeCourseViewRef.current;
    const operationCourseId = courseId;
    const isCurrentView = () => isCurrentLearnerSession(session) && activeCourseViewRef.current === operationViewKey;
    setUpdating(true);
    setActionError(null);
    setPublicationFailures([]);
    setValidationReport(null);
    setValidationProofToken(null);
    try {
      const targetVisibility = !course.isPublic;
      const publicationKey = `${operationCourseId}:${targetVisibility ? "publish" : "unpublish"}`;
      const idempotencyKey = publicationRequestKeysRef.current.get(publicationKey) ?? createClientId();
      publicationRequestKeysRef.current.set(publicationKey, idempotencyKey);
      const response = await request(`/api/courses/${operationCourseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          isPublic: targetVisibility,
        }),
      });
      const data = await response.json();
      if (!isCurrentView()) return;
      if (!response.ok) {
        if (data.validationReport && typeof data.validationReport === "object") {
          setValidationReport(data.validationReport as ValidationReport);
        }
        if (Array.isArray(data.invalidLessons)) {
          setPublicationFailures(data.invalidLessons.filter((item: unknown): item is PublicationLessonFailure =>
            Boolean(item)
            && typeof item === "object"
            && typeof (item as PublicationLessonFailure).lessonId === "string"
            && Array.isArray((item as PublicationLessonFailure).issues),
          ));
        }
        if (
          isOwner
          && data.overrideEligible === true
          && typeof data.assessmentHash === "string"
          && data.assessment
          && typeof data.assessment === "object"
        ) {
          const nextAssessment = {
            assessmentHash: data.assessmentHash,
            assessment: data.assessment as PublicationAssessment,
          };
          setPublicationAssessment(nextAssessment);
          storePublicationAssessment(assessmentStorageKey, nextAssessment);
        } else {
          setPublicationAssessment(null);
          storePublicationAssessment(assessmentStorageKey, null);
        }
        throw new Error(data.error || "Visibility could not be updated.");
      }
      setCourseRecord({ key: operationViewKey, value: { ...course, isPublic: data.isPublic } });
      publicationRequestKeysRef.current.delete(publicationKey);
      setPublicationAssessment(null);
      setValidationReport(null);
      setRepairProgress(null);
      storePublicationAssessment(assessmentStorageKey, null);
      window.dispatchEvent(new Event("filosage:courses-changed"));
    } catch (updateError) {
      if (isCurrentView()) setActionError(updateError instanceof Error ? updateError.message : "Visibility could not be updated.");
    } finally {
      if (isCurrentView()) setUpdating(false);
    }
  };

  const reportSource = async (event: React.FormEvent, sourceId: string) => {
    event.preventDefault();
    if (!user || !courseId || sourceReportBusy) return;
    const operationViewKey = activeCourseViewRef.current;
    const isCurrentView = () => isCurrentLearnerSession(session) && activeCourseViewRef.current === operationViewKey;
    setSourceReportBusy(true);
    setSourceReportStatus(null);
    try {
      const response = await request("/api/content-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, sourceId, category: sourceReportCategory, note: sourceReportNote.trim() }),
      });
      const data = await response.json() as { error?: string };
      if (!isCurrentView()) return;
      if (!response.ok) throw new Error(data.error || "The source report could not be sent.");
      setSourceReportStatus("Source report received for owner review.");
      setReportingSourceId(null);
      setSourceReportNote("");
      setSourceReportCategory("source");
    } catch (reportError) {
      if (isCurrentView()) setSourceReportStatus(reportError instanceof Error ? reportError.message : "The source report could not be sent.");
    } finally {
      if (isCurrentView()) setSourceReportBusy(false);
    }
  };

  const publishWithOwnerOverride = async () => {
    if (!user || !courseId || !isOwner || !publicationAssessment || overrideBusy) return;
    const operationViewKey = activeCourseViewRef.current;
    setOverrideBusy(true);
    setActionError(null);
    try {
      const overrideKey = `${courseId}:${publicationAssessment.assessmentHash}`;
      const requestKey = overrideRequestKeysRef.current.get(overrideKey) ?? createClientId();
      overrideRequestKeysRef.current.set(overrideKey, requestKey);
      const response = await request(`/api/admin/courses/${courseId}/publication-override`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey },
        body: JSON.stringify({
          reason: overrideReason.trim(),
          assessmentHash: publicationAssessment.assessmentHash,
          confirmation: overrideConfirmed ? "PUBLISH WITH QUALITY OVERRIDE" : "",
        }),
      });
      const data = await response.json() as {
        error?: string;
        isPublic?: boolean;
        overrideEligible?: boolean;
        assessmentHash?: string;
        assessment?: PublicationAssessment;
      };
      if (!isCurrentLearnerSession(session) || activeCourseViewRef.current !== operationViewKey) return;
      if (!response.ok) {
        if (
          data.overrideEligible === true
          && typeof data.assessmentHash === "string"
          && data.assessment?.overrideEligible === true
        ) {
          const nextAssessment = { assessmentHash: data.assessmentHash, assessment: data.assessment };
          setPublicationAssessment(nextAssessment);
          storePublicationAssessment(assessmentStorageKey, nextAssessment);
        }
        throw new Error(data.error || "The publication override could not be completed.");
      }
      overrideRequestKeysRef.current.delete(overrideKey);
      setCourseRecord({
        key: operationViewKey,
        value: course ? {
          ...course,
          isPublic: true,
          publicationReview: { status: "owner_override" },
        } : course,
      });
      setPublicationFailures([]);
      setPublicationAssessment(null);
      storePublicationAssessment(assessmentStorageKey, null);
      setOverrideReason("");
      setOverrideConfirmed(false);
      overrideDrawer.closeDrawer();
      window.dispatchEvent(new Event("filosage:courses-changed"));
    } catch (overrideError) {
      if (isCurrentLearnerSession(session) && activeCourseViewRef.current === operationViewKey) {
        setActionError(overrideError instanceof Error ? overrideError.message : "The publication override could not be completed.");
      }
    } finally {
      if (isCurrentLearnerSession(session) && activeCourseViewRef.current === operationViewKey) setOverrideBusy(false);
    }
  };

  const validateCurrentDraft = async () => {
    if (!user || !course?.canManage || !courseId || course.isPublic || validationBusy) return;
    const operationViewKey = activeCourseViewRef.current;
    setValidationBusy(true);
    setValidationProofToken(null);
    setValidationReport(null);
    setManualReviewReason("");
    setManualReviewSourceIds([]);
    setActionError(null);
    try {
      const response = await request(`/api/courses/${courseId}/validation`);
      const data = await response.json() as { error?: string; validationReport?: ValidationReport; proofToken?: string };
      if (!isCurrentLearnerSession(session) || activeCourseViewRef.current !== operationViewKey) return;
      if (!response.ok) throw new Error(data.error || "The draft could not be validated. Try again.");
      if (!data.validationReport || !data.proofToken || !/^[a-f0-9]{64}$/.test(data.proofToken)) {
        throw new Error("Validation did not return a reviewable proof. Validate the draft again.");
      }
      setValidationReport(data.validationReport);
      setValidationProofToken(data.proofToken);
      setRepairProgress("Validation completed. Review the current findings before making a publication decision.");
    } catch (validationError) {
      if (isCurrentLearnerSession(session) && activeCourseViewRef.current === operationViewKey) {
        setActionError(validationError instanceof Error ? validationError.message : "The draft could not be validated.");
      }
    } finally {
      if (isCurrentLearnerSession(session) && activeCourseViewRef.current === operationViewKey) setValidationBusy(false);
    }
  };

  const resolveManualReview = async (decision: "approved" | "rejected") => {
    if (!user || !courseId || !isOwner || !validationReport || !manualDecisionAvailable || !validationProofToken || manualReviewBusy) return;
    if (manualReviewReason.trim().length < 20) {
      setActionError("Explain the manual-review decision in at least 20 characters.");
      return;
    }
    const highStakesEvidenceRequired = (course?.manualReviewPolicy?.reasonCodes ?? []).some((code) =>
      ["medical", "legal", "financial", "physical_safety", "freshness"].includes(code),
    );
    const everyPlannedSourceVerified = [...plannedSourceIds].every((sourceId) => manualReviewSourceIds.includes(sourceId));
    const authoritativeEvidenceSelected = reviewableSources.some((source) =>
      (source.kind === "primary" || source.kind === "official") && manualReviewSourceIds.includes(source.id),
    );
    if (decision === "approved" && !everyPlannedSourceVerified) {
      setActionError("Personally verify every source assigned to a lesson before approving this snapshot.");
      return;
    }
    if (decision === "approved" && highStakesEvidenceRequired && !authoritativeEvidenceSelected) {
      setActionError("Select at least one primary or official course source that you personally verified.");
      return;
    }
    const operationViewKey = activeCourseViewRef.current;
    const requestScope = `${courseId}:${validationReport.snapshotHash}:${validationProofToken}:${decision}`;
    const requestKey = manualReviewRequestKeysRef.current.get(requestScope) ?? createClientId();
    manualReviewRequestKeysRef.current.set(requestScope, requestKey);
    setManualReviewBusy(decision);
    setActionError(null);
    try {
      const response = await request(`/api/admin/courses/${courseId}/manual-review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": requestKey,
        },
        body: JSON.stringify({
          decision,
          reason: manualReviewReason.trim(),
          snapshotHash: validationReport.snapshotHash,
          proofToken: validationProofToken,
          contractVersion: validationReport.contractVersion,
          verifiedSourceIds: manualReviewSourceIds,
          confirmation: decision === "approved" ? "APPROVE MANUAL REVIEW" : "REJECT MANUAL REVIEW",
        }),
      });
      const data = await response.json() as {
        error?: string;
        code?: string;
        manualReviewResolution?: NonNullable<Course["manualReviewResolution"]>;
        validationReport?: ValidationReport;
      };
      if (!isCurrentLearnerSession(session) || activeCourseViewRef.current !== operationViewKey) return;
      if (!response.ok) {
        if (data.code === "STALE_PUBLICATION_PROOF" || data.code === "STALE_VALIDATION_SNAPSHOT" || data.validationReport) {
          setValidationProofToken(null);
          setValidationReport(null);
          setManualReviewReason("");
          setManualReviewSourceIds([]);
          manualReviewRequestKeysRef.current.delete(requestScope);
        }
        throw new Error(data.error || "The manual-review decision could not be saved.");
      }
      manualReviewRequestKeysRef.current.delete(requestScope);
      if (data.manualReviewResolution) {
        setCourseRecord({
          key: operationViewKey,
          value: course ? { ...course, manualReviewResolution: data.manualReviewResolution } : course,
        });
      }
      setRepairProgress(decision === "approved"
        ? "Manual review approved for this exact snapshot. Publish the course when ready."
        : "Manual review rejected this snapshot. Keep the draft private and revise the flagged content.");
    } catch (manualReviewError) {
      if (isCurrentLearnerSession(session) && activeCourseViewRef.current === operationViewKey) {
        setActionError(manualReviewError instanceof Error ? manualReviewError.message : "The manual-review decision could not be saved.");
      }
    } finally {
      if (isCurrentLearnerSession(session) && activeCourseViewRef.current === operationViewKey) setManualReviewBusy(null);
    }
  };

  const runTargetedRepair = async (action: "apply" | "undo") => {
    if (!user || !courseId || !validationReport || targetedRepairBusy) return;
    if (action === "undo" && !lastTargetedRepairId) return;
    const operationViewKey = activeCourseViewRef.current;
    const requestScope = action === "apply"
      ? `v2-repair:${courseId}:${validationReport.snapshotHash}`
      : `v2-repair-undo:${courseId}:${lastTargetedRepairId}:${validationReport.snapshotHash}`;
    const requestKey = repairRequestKeysRef.current.get(requestScope) ?? createClientId();
    repairRequestKeysRef.current.set(requestScope, requestKey);
    setTargetedRepairBusy(action);
    setValidationProofToken(null);
    setActionError(null);
    try {
      const response = await request(`/api/courses/${courseId}/repair`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": requestKey,
        },
        body: JSON.stringify(action === "apply" ? {
          action,
          snapshotHash: validationReport.snapshotHash,
          contractVersion: validationReport.contractVersion,
          issueCodes: validationReport.issues.filter((issue) => issue.repairability === "automatic").map((issue) => issue.code),
        } : {
          action,
          snapshotHash: validationReport.snapshotHash,
          contractVersion: validationReport.contractVersion,
          repairId: lastTargetedRepairId,
        }),
      });
      const data = await response.json() as {
        error?: string;
        code?: string;
        repairId?: string;
        validationReport?: ValidationReport;
        undoAvailable?: boolean;
      };
      if (!isCurrentLearnerSession(session) || activeCourseViewRef.current !== operationViewKey) return;
      if (!response.ok) {
        if (data.validationReport) setValidationReport(data.validationReport);
        throw new Error(data.error || "The targeted repair could not be completed.");
      }
      repairRequestKeysRef.current.delete(requestScope);
      if (data.validationReport) setValidationReport(data.validationReport);
      if (action === "apply") {
        setLastTargetedRepairId(data.undoAvailable && data.repairId ? data.repairId : null);
        setRepairProgress("Safe fix applied and the complete course was revalidated.");
      } else {
        setLastTargetedRepairId(null);
        setRepairProgress("Safe fix undone without overwriting newer edits.");
      }
    } catch (repairError) {
      if (isCurrentLearnerSession(session) && activeCourseViewRef.current === operationViewKey) {
        setActionError(repairError instanceof Error ? repairError.message : "The targeted repair could not be completed.");
      }
    } finally {
      if (isCurrentLearnerSession(session) && activeCourseViewRef.current === operationViewKey) setTargetedRepairBusy(null);
    }
  };

  const deleteCourse = async () => {
    if (!user || !course?.canManage || !courseId) return;
    const operationViewKey = activeCourseViewRef.current;
    const operationCourseId = courseId;
    const isCurrentView = () => isCurrentLearnerSession(session) && activeCourseViewRef.current === operationViewKey;
    setUpdating(true);
    setActionError(null);
    try {
      const response = await request(`/api/courses/${operationCourseId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!isCurrentView()) return;
      if (!response.ok) throw new Error(data.error || "The course could not be deleted.");
      clearLocalCourseData(operationCourseId, user?.uid ?? null);
      deleteDrawer.closeDrawer();
      router.push("/");
    } catch (deleteError) {
      if (isCurrentView()) {
        setActionError(deleteError instanceof Error ? deleteError.message : "The course could not be deleted.");
        setUpdating(false);
      }
    }
  };

  const submitCapstone = async () => {
    if (!user || !courseId || capstoneBusy) return;
    const operationViewKey = activeCourseViewRef.current;
    const operationCourseId = courseId;
    const isCurrentView = () => isCurrentLearnerSession(session) && activeCourseViewRef.current === operationViewKey;
    setCapstoneBusy(true);
    setCapstoneError(null);
    try {
      const response = await request("/api/assess-capstone", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
            objectiveId: courseModule.objectiveId ?? `objective-m${moduleIndex}`,
            type: "capstone" as const,
            result: "passed" as const,
            label: `Capstone demonstrated: ${courseModule.objective ?? courseModule.title}`,
            observedAt,
            criterion: course.capstone?.title,
          })));
        }
        if (!isCurrentView()) return;
        trackProductEvent("criterion_demonstrated", {
          route: "/course",
          courseId,
          exclude: isOwner,
          oncePerSession: true,
        });
      }
      assessment.criteria.filter((criterion) => criterion.met).forEach((_criterion, criterionIndex) => {
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
          <h1>{requestedCourseId ? "Opening the course" : "Opening the course studio"}</h1>
          <p>{requestedCourseId ? "Loading the course and your progress…" : "Checking the course link…"}</p>
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
          <h1>{requestedCourseId ? "This course can’t be opened" : "Review the course brief first"}</h1>
          <p>{error || "The course could not be found."}</p>
          <div className="state-actions">
            <Link className="button button-secondary" href="/library"><ArrowLeft size={16} /> Browse courses</Link>
            {canCreateCourses && <Link className="button button-primary" href="/create">Open course studio</Link>}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell activeTopic={topic} activeCourseId={courseId} activeCourse={course}>
      <div className="course-page">
        <header className="course-header">
          <div className="course-header-topline">
            <Link className="text-button" href="/library"><ArrowLeft size={15} /> Public library</Link>
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
                {misconceptionCount > 0 && <div><dt><Target size={16} /> Named misconceptions</dt><dd>{misconceptionCount}</dd></div>}
              </dl>
            </div>

            {nextLesson && (
              <aside className="course-resume-card" aria-label={courseComplete ? "Course review" : "Next lesson"}>
                <div className="course-resume-heading">
                  <span>{capstoneAssessment?.status === "passed" ? "Capstone passed" : courseComplete ? "Lessons finished" : validCompletedLessons.length ? "Continue learning" : "Begin here"}</span>
                  <strong>{progress}%</strong>
                </div>
                <p className="course-resume-module">{courseComplete ? "Review the key ideas" : nextLesson.moduleTitle}</p>
                <h2>{courseComplete ? "Review the course from the start" : nextLesson.lesson.title}</h2>
                <p>{courseComplete ? "Revisit the core ideas and practice before they fade." : nextLesson.lesson.concept}</p>
                <div className="course-resume-progress">
                  <div className="progress-track" role="progressbar" aria-label="Course progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ transform: `scaleX(${progress / 100})` }} /></div>
                  <small>{validCompletedLessons.length} of {totalLessons} lessons complete{user ? " · synced" : " · this device"}</small>
                </div>
                {user ? (
                  <button className="button course-resume-action" onClick={() => void openLesson(nextLesson.lessonId)}>
                    <Play size={16} />
                    {courseComplete ? "Review course" : validCompletedLessons.length ? "Resume lesson" : "Start course"}
                  </button>
                ) : (
                  <AccountEntryButton
                    className="button course-resume-action"
                    createLabel="Create an account to begin"
                    signInLabel="Sign in to begin"
                    unavailableLabel="Sign-in unavailable"
                    icon={LockKeyhole}
                  />
                )}
                {!user && <small className="course-access-note">{entryMode === "create"
                  ? "The full outline is public. A free account opens lesson content and saves your progress."
                  : entryMode === "sign-in"
                    ? "The full outline is public. Sign in to your existing account to open lesson content and sync your progress."
                    : "The full outline remains public while lesson sign-in is unavailable."}</small>}
              </aside>
            )}
          </div>

          <div className="course-learning-brief">
            <section><span><Target size={19} /></span><div><small>Course outcome</small><strong>{course.outcome ?? course.mission}</strong></div></section>
            <section><span><CheckCircle2 size={19} /></span><div><small>By the end</small><strong>{course.capstone?.deliverable ?? course.modules[course.modules.length - 1]?.description ?? "Knowledge you can explain and apply"}</strong></div></section>
            <section><span><BookOpen size={19} /></span><div><small>Before you begin</small><strong>{course.prerequisites?.length ? course.prerequisites.join(" · ") : "No prior knowledge required"}</strong></div></section>
          </div>

          {course.learningDesignSummary && (
            <CourseDisclosure
              className="course-apprenticeship course-capability-plan"
              description="The course is bounded by one observable outcome, one inspectable proof of skill, and one focused win per lesson inside the Filosage Capability Cycle."
              eyebrow="Capability Cycle"
              headingId="course-capability-plan-title"
              title="See how every lesson moves this capability forward."
            >
              <div className="course-apprenticeship-grid">
                <article><span><Target size={18} /> Outcome</span><h3>{course.learningDesignSummary.desiredOutcome}</h3><small>The sequence stays anchored to this capability.</small></article>
                <article><span><Flag size={18} /> Proof of skill</span><h3>{course.learningDesignSummary.proofOfSkill}</h3><small>Completion is tied to visible work, not exposure alone.</small></article>
                <article><span><Clock3 size={18} /> Focus budget</span><h3>{course.learningDesignSummary.lessonWins.length} focused lesson {course.learningDesignSummary.lessonWins.length === 1 ? "win" : "wins"}</h3><small>About {course.learningDesignSummary.timeBudgetMinutes} minutes across the planned learning path.</small></article>
              </div>
              <p className="method-standard-link"><Link className="text-button" href="/standard">Read the Capability Cycle standard <ArrowRight size={14} /></Link></p>
            </CourseDisclosure>
          )}

          {(hasApprenticeship || hasCourseEvidence) && (
            <CourseDisclosure
              className="course-apprenticeship"
              description={hasApprenticeship
                ? "Each module adds evidence to the final artifact, so progress is visible in what you can produce, not only what you have read."
                : "Source and reading-list status stays visible without implying that every reference verified a lesson claim."}
              eyebrow={hasApprenticeship ? "What you will make" : "Course evidence"}
              headingId="course-apprenticeship-title"
              title={hasApprenticeship
                ? "The course advances one piece of meaningful work."
                : "See how this course classifies its references."}
            >
              {hasApprenticeship && <div className="course-apprenticeship-grid">
                {course.artifact && <article className="artifact-preview"><span><Flag size={18} /> Final artifact</span><h3>{course.artifact.title}</h3><p>{course.artifact.description}</p><small>Format: {course.artifact.format}</small></article>}
                {course.scenario && <article><span><Layers3 size={18} /> Scenario spine</span><h3>{course.scenario.title}</h3><p>{course.scenario.context}</p><small>Why it matters: {course.scenario.stakes}</small></article>}
                {course.modules[0]?.lessons[0]?.activityPreview && <article><span><Target size={18} /> First active move</span><h3>{course.modules[0].lessons[0].title}</h3><p>{course.modules[0].lessons[0].activityPreview}</p><small>{course.modules[0].lessons[0].artifactContribution}</small></article>}
              </div>}
              {hasCourseEvidence ? <div className="course-source-strip">
                <div className="course-evidence-heading">
                  <strong>Course evidence</strong>
                  {course.evidenceProfile && <span data-mode={course.evidenceProfile.mode}>{course.evidenceProfile.mode === "fully-grounded"
                    ? "Source-backed"
                    : course.evidenceProfile.mode === "hybrid"
                      ? "Mixed evidence"
                      : "Model knowledge"}</span>}
                </div>
                <p>{course.evidenceProfile?.mode === "fully-grounded"
                  ? "Every planned lesson is tied to automatically researched evidence. Lesson citations identify the exact supported sentence and open the original source."
                  : course.evidenceProfile?.mode === "hybrid"
                    ? `${course.evidenceProfile.verifiedLessonCount} lessons use automatically verified sources and ${course.evidenceProfile.modelKnowledgeLessonCount} use clearly labeled AI general knowledge where suitable evidence was not available.`
                    : course.evidenceProfile?.mode === "model-knowledge"
                      ? "Automatic research did not provide suitable claim-level evidence for this outline. Filosage still created the course from AI general knowledge without inventing citations; verify consequential details with current authoritative guidance before acting."
                      : course.sourcePack?.every((source) => source.origin === "web-search" && source.citationVerified)
                        ? "Filosage found these deep links during automatic research and retained only API-cited sources from its vetted authority registry."
                        : "This legacy course includes author-supplied references. Treat them as reading suggestions unless a lesson records automatic grounding."}</p>
                {displayedEvidenceSources.length ? <div className="course-reference-group">
                  <h4>{course.evidenceProfile ? "Verified sources used by lessons" : "Course references"}</h4>
                  <ul>{displayedEvidenceSources.map((source) => <li key={source.id}>
                  <div>{source.url ? <a href={source.url} target="_blank" rel="nofollow ugc noreferrer" aria-label={`${source.label}, opens ${sourceHostname(source.url)} in a new tab`}>{source.label}</a> : <span>{source.label}</span>}<small>{source.author ? `${source.author} · ` : ""}{source.publisher ? `${source.publisher} · ` : ""}{source.publicationDate ? `${source.publicationDate} · ` : ""}{source.url ? `${sourceHostname(source.url)} · ` : ""}{source.authorityClass?.replace("-", " ") ?? source.kind.replace("-", " ")} · {source.citationVerified ? "API-cited research" : "legacy source"} · {source.rights.replace("-", " ")}</small></div>
                  {user && <button className="text-button" type="button" onClick={() => { setReportingSourceId(source.id); setSourceReportNote(""); setSourceReportCategory("source"); setSourceReportStatus(null); }}><Flag size={13} /> Report source</button>}
                  {reportingSourceId === source.id && <form className="source-report-form" onSubmit={(event) => void reportSource(event, source.id)}>
                    <label htmlFor={`source-report-category-${source.id}`}>Issue type</label>
                    <select id={`source-report-category-${source.id}`} value={sourceReportCategory} onChange={(event) => setSourceReportCategory(event.target.value as typeof sourceReportCategory)}><option value="source">Misleading or weak source</option><option value="copyright">Copyright or usage-right concern</option><option value="safety">Unsafe destination or content</option></select>
                    <label htmlFor={`source-report-${source.id}`}>What should the owner review?</label>
                    <textarea id={`source-report-${source.id}`} rows={2} maxLength={1_000} value={sourceReportNote} onChange={(event) => setSourceReportNote(event.target.value)} placeholder="For example: misleading destination, weak evidence, or rights concern." />
                    <div><button className="button button-quiet button-small" type="button" onClick={() => setReportingSourceId(null)}>Cancel</button><button className="button button-secondary button-small" type="submit" disabled={sourceReportBusy}>{sourceReportBusy ? <LoaderCircle className="spin" size={14} /> : <Flag size={14} />} Send report</button></div>
                  </form>}
                  </li>)}</ul>
                </div> : null}
                {course.furtherReading?.length ? <div className="course-reference-group">
                  <h4>Further study</h4>
                  <p>These works were matched to library or catalog metadata. They are optional reading, not proof that the AI inspected the full text or used the work to support a lesson claim.</p>
                  <ul>{course.furtherReading.map((reference) => {
                    const contributor = reference.contributors.map((item) => item.name).join(", ");
                    const details = [contributor, reference.edition, reference.publisher, reference.publicationYear].filter(Boolean).join(" · ");
                    return <li key={reference.id}><div>{reference.catalogUrl
                      ? <a href={reference.catalogUrl} target="_blank" rel="nofollow ugc noreferrer" aria-label={`${reference.title}, opens its catalog record in a new tab`}>{reference.title}</a>
                      : <span>{reference.title}</span>}<small>{details || "Metadata-verified bibliographic record"} · further reading</small></div></li>;
                  })}</ul>
                </div> : null}
                {sourceReportStatus && <small role="status">{sourceReportStatus}</small>}
              </div> : null}
            </CourseDisclosure>
          )}

          {course.canManage && (
            <CourseDisclosure
              key={publicationFailures.length > 0 || publicationAssessment || validationReport || repairProgress || course.publicationReview?.status === "owner_override" ? "publication-attention" : "course-studio"}
              className="course-owner-controls"
              defaultOpen={Boolean(publicationFailures.length > 0 || publicationAssessment || validationReport || repairProgress || course.publicationReview?.status === "owner_override")}
              description="Publishing and course management stay separate from the learner experience."
              eyebrow="Creator tools"
              headingId="course-owner-controls-title"
              title="Course studio"
            >
              <div className="course-owner-actions">
                {!course.isPublic && <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => void validateCurrentDraft()}
                  disabled={validationBusy || updating || manualReviewBusy !== null || targetedRepairBusy !== null}
                >
                  {validationBusy ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />}
                  {validationBusy ? "Validating…" : "Validate draft"}
                </button>}
                <button
                  className="button button-secondary"
                  onClick={updateVisibility}
                  disabled={updating || validationBusy || manualReviewBusy !== null || targetedRepairBusy !== null}
                >
                    {updating ? <LoaderCircle className="spin" size={16} /> : course.isPublic ? <LockKeyhole size={16} /> : <Globe2 size={16} />}
                    {updating && !course.isPublic ? "Publishing…" : course.isPublic ? "Unpublish course" : "Publish course"}
                </button>
                <button className="button button-quiet" onClick={() => {
                  setActionError(null);
                  deleteDrawer.openDrawer();
                }} disabled={updating}>
                  <Trash2 size={16} /> Delete course
                </button>
              </div>
              {!course.isPublic && <p className="owner-action-hint">Complete every lesson, validate the draft, and resolve its review findings before publishing. Existing safety evidence is reused when it still matches this version.</p>}
              {!course.isPublic && course.aiAssisted !== true && isOwner && !publicationAssessment && (
                <p className="owner-action-hint">If review finds only teaching or language warnings, an owner-only quality override will appear here. Safety and structure failures cannot be bypassed.</p>
              )}
               {course.isPublic && <p className="owner-action-hint">{course.publicationReview?.status === "owner_override"
                 ? "Published with an audited owner quality override after the non-bypassable safety and structure checks passed. AI-generated factual claims are not independently verified."
                 : "Published content passed automated safety and quality review. AI-generated factual claims are not independently verified."}</p>}
               {!course.isPublic && (publicationFailures.length > 0 || publicationAssessment || validationReport || repairProgress) && (
                 <section className="publication-failures" aria-labelledby="publication-failures-title">
                   <div>
                     <TriangleAlert size={18} aria-hidden="true" />
                     <div>
                       <h2 id="publication-failures-title">Publication review needs attention</h2>
                       <p>{validationReport
                         ? validationReport.requiresManualReview
                           ? "This exact course version needs a human decision before it can be published."
                           : "Review each precise blocker below. Warnings are optional improvements and do not silently prevent publication."
                         : publicationFailures.length > 0
                         ? "Open each affected lesson and address the precise issue. Filosage will not replace complete lessons or author edits automatically."
                         : publicationAssessment
                           ? "The course has quality warnings that require correction or an explicit owner decision."
                           : "The replacement lessons passed the automatic publication preflight. Review them before publishing."}</p>
                       {repairProgress && <small className="publication-repair-status" role="status" aria-live="polite">{repairProgress}</small>}
                     </div>
                   </div>
                    {validationReport && (
                      <div className="publication-contract-report" role="region" aria-label="Course quality contract report">
                        <div className="publication-contract-summary" role="status" aria-live="polite">
                          <strong>{currentManualReview?.status === "approved" || validationReport.publishable ? "Ready to publish" : manualDecisionAvailable ? "Manual review" : "Not ready"}</strong>
                          {course.pipelineStage && <span>Pipeline state: {course.pipelineStage.replaceAll("_", " ")}</span>}
                          <span>Contract {validationReport.contractVersion} · validated {new Date(validationReport.validatedAt).toLocaleString()}</span>
                        </div>
                        {validationReport.issues.length > 0 && <ul>
                          {validationReport.issues.map((issue) => (
                            <li key={`${issue.code}:${issue.path}`}>
                              <div>
                                <strong>{issue.code}</strong>
                                <span>{issue.path}</span>
                                <p>{issue.message}</p>
                                {issue.suggestedAction && <small>{issue.suggestedAction}</small>}
                              </div>
                            </li>
                          ))}
                        </ul>}
                        {validationReport.issues.some((issue) => issue.repairability === "automatic") && (
                          <div className="publication-contract-actions">
                            <button className="button button-secondary" type="button" onClick={() => void runTargetedRepair("apply")} disabled={targetedRepairBusy !== null}>
                              {targetedRepairBusy === "apply" ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
                              Apply safe fixes
                            </button>
                            <small>Only allowlisted optional blocks are removed, or an accessible fallback is derived from existing lesson text. Author text and edits stay unchanged.</small>
                          </div>
                        )}
                        {lastTargetedRepairId && (
                          <div className="publication-contract-actions">
                            <button className="button button-quiet" type="button" onClick={() => void runTargetedRepair("undo")} disabled={targetedRepairBusy !== null}>
                              {targetedRepairBusy === "undo" ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
                              Undo last safe fix
                            </button>
                          </div>
                        )}
                        {validationReport.warnings.length > 0 && (
                          <details>
                            <summary>{validationReport.warnings.length} optional improvement{validationReport.warnings.length === 1 ? "" : "s"}</summary>
                            <ul>{validationReport.warnings.map((warning) => <li key={`${warning.code}:${warning.path}`}><strong>{warning.code}</strong> · {warning.path}: {warning.message}</li>)}</ul>
                          </details>
                        )}
                        {manualDecisionAvailable && (
                          <div className="publication-manual-review">
                            <strong>Human decision required for this snapshot</strong>
                            {currentManualReview ? (
                              <p>
                                Decision: <strong>{currentManualReview.status}</strong> on {new Date(currentManualReview.reviewedAt).toLocaleString()}.
                                {currentManualReview.status === "approved" ? " The exact snapshot may proceed through the normal safety and publication preflight." : " Revise and revalidate before requesting another decision."}
                              </p>
                            ) : <p>An owner must inspect the evidence and record a reason. Approval never bypasses structural, security, or safety blockers.</p>}
                            {!validationProofToken && <p>Choose Validate draft to obtain the current evidence before recording a decision.</p>}
                            {isOwner && currentManualReview?.status !== "approved" && (
                              <>
                                <label htmlFor="course-manual-review-reason">Manual-review reason</label>
                                {reviewableSources.length > 0 && (
                                  <fieldset className="publication-manual-review-sources">
                                    <legend>Sources personally verified for this snapshot</legend>
                                    {reviewableSources.length > 0
                                      ? reviewableSources.map((source) => (
                                          <label key={source.id}>
                                            <input
                                              type="checkbox"
                                              name="manualReviewSource"
                                              value={source.id}
                                              checked={manualReviewSourceIds.includes(source.id)}
                                              onChange={(event) => setManualReviewSourceIds((current) => event.target.checked
                                                ? [...new Set([...current, source.id])]
                                                : current.filter((sourceId) => sourceId !== source.id))}
                                              disabled={manualReviewBusy !== null}
                                            />
                                            <span>{source.label} ({source.kind}){plannedSourceIds.has(source.id) ? " · assigned to lessons" : ""}</span>
                                            <a href={source.url} target="_blank" rel="noreferrer">Open source</a>
                                          </label>
                                        ))
                                      : null}
                                  </fieldset>
                                )}
                                <textarea
                                  id="course-manual-review-reason"
                                  name="manualReviewReason"
                                  rows={3}
                                  value={manualReviewReason}
                                  onChange={(event) => setManualReviewReason(event.target.value)}
                                  maxLength={1_000}
                                  disabled={manualReviewBusy !== null}
                                />
                                <div className="publication-manual-review-actions">
                                  <button className="button button-secondary" type="button" onClick={() => void resolveManualReview("rejected")} disabled={!validationProofToken || validationBusy || manualReviewBusy !== null || manualReviewReason.trim().length < 20}>
                                    {manualReviewBusy === "rejected" ? <LoaderCircle className="spin" size={15} /> : <X size={15} />}
                                    Reject snapshot
                                  </button>
                                  <button className="button button-primary" type="button" onClick={() => void resolveManualReview("approved")} disabled={!validationProofToken || validationBusy || manualReviewBusy !== null || manualReviewReason.trim().length < 20}>
                                    {manualReviewBusy === "approved" ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}
                                    Approve exact snapshot
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                     {!validationReport && publicationFailures.length > 0 && <ul>
                     {publicationFailures.map((failure) => {
                       const [moduleIndex, lessonIndex] = failure.lessonId.split("-").map(Number);
                       const lesson = course.modules[moduleIndex]?.lessons[lessonIndex];
                       return (
                         <li key={failure.lessonId}>
                           <div>
                             <strong>{lesson?.title ?? `Lesson ${failure.lessonId}`}</strong>
                             <ul>{failure.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
                           </div>
                           <Link className="button button-secondary" href={`/course/${encodeURIComponent(topic)}/lesson/${failure.lessonId}?id=${courseId}`}>
                             Open affected lesson
                           </Link>
                         </li>
                       );
                     })}
                    </ul>}
                    {isOwner && publicationFailures.some((failure) => failure.overridable) && !publicationAssessment && (
                      <p className="publication-override-guidance">After reviewing or repairing these lessons, publish again to determine whether the remaining warnings qualify for an owner override.</p>
                    )}
                    {isOwner && publicationAssessment?.assessment.overrideEligible && (
                     <div className="publication-override-offer">
                       <div>
                          <strong>Owner-only quality override</strong>
                         <p>This can accept the listed teaching or language warnings. It cannot bypass safety review, missing lessons, invalid lesson structure, unsafe source links, or quarantine.</p>
                       </div>
                       <button
                          className="button button-secondary"
                         type="button"
                         onClick={() => {
                           setActionError(null);
                           setOverrideReason("");
                           setOverrideConfirmed(false);
                           overrideDrawer.openDrawer();
                         }}
                         disabled={updating || overrideBusy}
                       >
                         Review owner override
                       </button>
                     </div>
                   )}
                 </section>
               )}
               {actionError && <p className="form-error" role="alert"><Circle size={14} /> {actionError}</p>}
            </CourseDisclosure>
          )}
        </header>

        {user && <LearnerSourceNotice label="Learning evidence" status={masteryJourney.loadStatus} error={masteryJourney.loadError} retry={masteryJourney.retry} />}
        {user && courseId && masteryJourney.ready && (masteryJourney.loadStatus === "loaded" || masteryJourney.loadStatus === "empty" || masteryJourney.plan) && (
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
                    <div className="capstone-verdict-heading"><CheckCircle2 size={19} /><strong>Capstone passed</strong><small>Assessed {new Date(capstoneAssessment.assessedAt).toLocaleDateString()}</small></div>
                    <p>{capstoneAssessment.summary}</p>
                    <ul>{capstoneAssessment.criteria.map((criterion) => <li key={criterion.criterion} className="is-met"><Check size={14} /><span><strong>{criterion.criterion}</strong><small>{criterion.feedback}</small></span></li>)}</ul>
                    {account?.capabilities?.advancedCapstoneAnalysis && capstoneAssessment.history && capstoneAssessment.history.length > 1 && (
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
                        {account?.capabilities?.advancedCapstoneAnalysis && capstoneAssessment.history && capstoneAssessment.history.length > 1 && (
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
                      <p className="capstone-submit-hint">Complete every lesson before submitting the capstone. Your work is then assessed against the success criteria above.</p>
                    )}
                  </div>
                ) : (
                  <p className="capstone-submit-hint">{entryMode === "create"
                    ? "Create a free account to open lessons, save progress, and submit this capstone for assessment."
                    : entryMode === "sign-in"
                      ? "Sign in to your existing account to open lessons, save progress, and submit this capstone for assessment."
                      : "Account sign-in is unavailable right now. You can still inspect this public course outline."}</p>
                )}
              </div>
            </section>
        )}

        <AppDrawer
            open={overrideDrawer.open}
            onClose={() => {
              if (!overrideBusy) overrideDrawer.closeDrawer();
            }}
            labelledBy="course-override-drawer-title"
            size="medium"
            mobilePlacement="bottom"
            className="course-override-app-drawer"
          >
            <section className="course-override-drawer">
              <header className="app-drawer-header">
                <div>
                  <small>Owner-only publication control</small>
                  <h2 id="course-override-drawer-title">Publish with quality warnings?</h2>
                  <p>This decision is recorded with the exact reviewed content and gate versions.</p>
                </div>
                <button className="icon-button" type="button" onClick={overrideDrawer.closeDrawer} aria-label="Close publication override" disabled={overrideBusy}>
                  <X size={18} />
                </button>
              </header>
              <div className="app-drawer-body course-override-body">
                <div className="course-override-boundary">
                  <TriangleAlert size={20} aria-hidden="true" />
                  <div>
                    <strong>Quality only, never safety or structure</strong>
                    <p>The server runs the safety check again. Missing lessons, invalid schemas, unsafe source links, quarantine, and changed content still block publication.</p>
                  </div>
                </div>
                {publicationAssessment && (
                  <div className="course-override-issues">
                    <strong>Warnings being accepted</strong>
                    <ul>{publicationAssessment.assessment.overridableIssues.map((issue) => (
                      <li key={issue.code}>{issue.message}</li>
                    ))}</ul>
                  </div>
                )}
                <label htmlFor="course-override-reason">Reason for overriding these warnings</label>
                <textarea
                  id="course-override-reason"
                  rows={4}
                  minLength={20}
                  maxLength={500}
                  value={overrideReason}
                  onChange={(event) => setOverrideReason(event.target.value)}
                  placeholder="Explain why publication is appropriate despite the listed quality warnings."
                  disabled={overrideBusy}
                />
                <small>{overrideReason.trim().length}/500 characters. A recent sign-in is required.</small>
                <label className="publication-attestation course-override-confirmation">
                  <input
                    type="checkbox"
                    checked={overrideConfirmed}
                    onChange={(event) => setOverrideConfirmed(event.target.checked)}
                    disabled={overrideBusy}
                  />
                  <span>I confirm that I reviewed the warnings and intentionally accept responsibility for publishing this exact course version.</span>
                </label>
                {actionError && <p className="form-error" role="alert"><Circle size={14} /> {actionError}</p>}
              </div>
              <footer className="app-drawer-footer">
                <button className="button button-quiet" type="button" onClick={overrideDrawer.closeDrawer} disabled={overrideBusy}>Cancel</button>
                {(course.isPublic || canPublishCourses) && <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => void publishWithOwnerOverride()}
                  disabled={overrideBusy || !overrideConfirmed || overrideReason.trim().length < 20}
                >
                  {overrideBusy ? <LoaderCircle className="spin" size={16} /> : <Globe2 size={16} />}
                  {overrideBusy ? "Running protected review…" : "Publish this exact version"}
                </button>}
              </footer>
            </section>
        </AppDrawer>

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
                    <strong>Filosage will permanently delete:</strong>
                    <ul>
                      <li>The course and all generated lessons</li>
                      <li>Every learner&apos;s progress and scheduled reviews for this course</li>
                      <li>Course bookmarks, lesson bookmarks, and linked lesson notes</li>
                      <li>Outcome plans, learning evidence, feedback, and open content reports</li>
                    </ul>
                  </div>
                </div>
                <p className="course-delete-library-note">The course banner will disappear from the app. Its reusable source asset may remain in the shared visual library when another course can use it.</p>
                {actionError && <p className="form-error" role="alert"><Circle size={14} /> {actionError}</p>}
              </div>
              {!course.isPublic && !canPublishCourses && <p className="owner-action-hint">This private course remains available to you. Publishing to the public library is included with Filosage Pro. <Link href="/pricing">Compare plans</Link>.</p>}
              <footer className="app-drawer-footer">
                <button className="button button-quiet" type="button" onClick={deleteDrawer.closeDrawer} disabled={updating}>Keep course</button>
                <button className="button button-danger" type="button" onClick={() => void deleteCourse()} disabled={updating}>
                  {updating ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}
                  {updating ? "Deleting course…" : "Permanently delete course"}
                </button>
              </footer>
            </section>
        </AppDrawer>
      </div>
    </AppShell>
  );
}
