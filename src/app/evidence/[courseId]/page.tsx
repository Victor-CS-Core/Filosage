"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Clipboard,
  FileCheck2,
  Gauge,
  LoaderCircle,
  Share2,
  ShieldCheck,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { useMasteryJourney } from "@/components/useMasteryJourney";
import OutcomeUsefulness from "@/components/OutcomeUsefulness";
import type { Course } from "@/lib/course-types";
import type { CourseProgress } from "@/lib/learning-types";
import {
  assessmentPercent,
  baselinePercent,
  deriveObjectiveMastery,
  masteryPercent,
  moduleObjectiveId,
  type MasteryState,
} from "@/lib/mastery";
import { trackProductEvent } from "@/lib/product-analytics";

const STATE_LABELS: Record<MasteryState, string> = {
  not_started: "No observed evidence",
  introduced: "Introduced",
  practicing: "Practicing",
  needs_review: "Needs review",
  demonstrated: "Demonstrated",
};

export default function EvidenceReportPage() {
  const params = useParams<{ courseId: string }>();
  const router = useRouter();
  const courseId = params.courseId;
  const { user } = useAuth();
  const journey = useMasteryJourney(courseId, user);
  const [course, setCourse] = useState<Course | null>(null);
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [nextCourse, setNextCourse] = useState<Course | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const token = user ? await user.getIdToken() : null;
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const courseResponse = await fetch(`/api/courses/${encodeURIComponent(courseId)}`, { headers });
        const courseData = await courseResponse.json() as Course & { error?: string };
        if (!courseResponse.ok) throw new Error(courseData.error || "The course could not be opened.");
        if (cancelled) return;
        setCourse(courseData);
        try {
          const libraryResponse = await fetch("/api/courses?scope=public", { cache: "no-store" });
          if (libraryResponse.ok) {
            const libraryData = await libraryResponse.json() as { courses?: Course[] };
            const candidates = (libraryData.courses ?? []).filter((item) => (
              (item.id ?? item.courseId) !== courseId
            ));
            const recommendation = candidates.sort((left, right) => {
              const leftMatch = left.category && left.category === courseData.category ? 1 : 0;
              const rightMatch = right.category && right.category === courseData.category ? 1 : 0;
              return rightMatch - leftMatch;
            })[0] ?? null;
            if (!cancelled) setNextCourse(recommendation);
          }
        } catch {
          // The evidence report remains useful if catalog recommendations are unavailable.
        }
        if (user) {
          const progressResponse = await fetch(`/api/progress?courseId=${encodeURIComponent(courseId)}`, {
            headers: headers as Record<string, string>,
            cache: "no-store",
          });
          if (progressResponse.ok) {
            const data = await progressResponse.json() as { progress: CourseProgress | null };
            if (!cancelled) setProgress(data.progress);
          }
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "The evidence report could not be opened.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [courseId, user]);

  useEffect(() => {
    if (!course || !journey.ready) return;
    trackProductEvent("evidence_report_viewed", {
      route: "/evidence",
      courseId,
      contentVersion: course.updatedAt,
      oncePerSession: true,
    });
  }, [course, courseId, journey.ready]);

  const objectives = useMemo(
    () => deriveObjectiveMastery(
      course?.modules.map((_, moduleIndex) => moduleObjectiveId(moduleIndex)) ?? [],
      journey.evidence,
    ),
    [course, journey.evidence],
  );
  const observedMastery = masteryPercent(objectives);
  const selfReportedBaseline = journey.plan ? baselinePercent(journey.plan) : null;
  const assessedBaseline = assessmentPercent(journey.plan?.baselineAssessment);
  const assessedFinal = progress?.capstone ? assessmentPercent(progress.capstone) : null;
  const verifiedImprovement = assessedBaseline !== null && assessedFinal !== null
    ? assessedFinal - assessedBaseline
    : null;
  const totalLessons = course?.modules.reduce((sum, courseModule) => sum + courseModule.lessons.length, 0) ?? 0;
  const evidencedLessons = new Set(
    journey.evidence.filter((item) => item.type === "lesson" && item.lessonId).map((item) => item.lessonId),
  ).size;

  const copySummary = async () => {
    if (!course) return;
    setSharing(true);
    const demonstrated = objectives.filter((item) => item.state === "demonstrated").length;
    const courseUrl = new URL(`/course/${encodeURIComponent(course.topic)}`, window.location.origin);
    courseUrl.searchParams.set("id", courseId);
    if (user) {
      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/referrals", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const referral = await response.json() as { code?: string };
          if (referral.code) courseUrl.searchParams.set("ref", referral.code);
        }
      } catch {
        // A clean course link remains shareable if referral attribution is unavailable.
      }
    }
    const summary = [
      `Erudoza evidence report: ${course.topic}`,
      journey.plan ? `Outcome: ${journey.plan.desiredOutcome}` : "",
      `Observed mastery: ${observedMastery}% (${demonstrated} of ${objectives.length} module objectives demonstrated)`,
      assessedBaseline !== null ? `Assessed baseline: ${assessedBaseline}%` : "",
      assessedFinal !== null ? `Final capstone: ${assessedFinal}%` : "",
      verifiedImprovement !== null ? `Verified improvement: ${verifiedImprovement >= 0 ? "+" : ""}${verifiedImprovement} percentage points` : "",
      `Explore the course: ${courseUrl.toString()}`,
    ].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      trackProductEvent("evidence_report_shared", { route: "/evidence", courseId });
      trackProductEvent("referral_link_copied", { route: "/evidence", courseId });
    } finally {
      setSharing(false);
    }
  };

  if (loading || !journey.ready) {
    return <AppShell><div className="center-state"><LoaderCircle className="spin" size={25} /><h1>Building your evidence report</h1></div></AppShell>;
  }
  if (error || !course) {
    return <AppShell><div className="center-state"><FileCheck2 size={26} /><p className="overline">Evidence report</p><h1>This report cannot be opened.</h1><p>{error}</p><button className="button button-secondary" onClick={() => router.push("/library")}>Browse courses</button></div></AppShell>;
  }

  return (
    <AppShell activeTopic={course.topic} activeCourseId={courseId}>
      <div className="evidence-page">
        <header className="evidence-header">
          <button className="text-button" onClick={() => router.push(`/course/${encodeURIComponent(course.topic)}?id=${courseId}`)}><ArrowLeft size={15} /> Course overview</button>
          <div><p className="overline">Evidence report</p><h1>{course.topic}</h1><p>{journey.plan?.desiredOutcome ?? course.outcome ?? course.mission}</p></div>
          <button className="button button-secondary" disabled={sharing} onClick={() => void copySummary()}>{sharing ? <LoaderCircle className="spin" size={16} /> : copied ? <Clipboard size={16} /> : <Share2 size={16} />} {sharing ? "Preparing link" : copied ? "Share summary copied" : "Copy share summary"}</button>
        </header>

        <section className="evidence-metrics" aria-label="Learning evidence summary">
          <article><span><Gauge size={20} /></span><div><small>Starting estimate</small><strong>{selfReportedBaseline === null ? "Pending" : `${selfReportedBaseline}%`}</strong><p>Self-reported diagnostic, used only to choose a route.</p></div></article>
          <article><span><ShieldCheck size={20} /></span><div><small>Observed mastery</small><strong>{observedMastery}%</strong><p>Calculated from completed practice, transfer, and assessed criteria.</p></div></article>
          <article><span><FileCheck2 size={20} /></span><div><small>Verified improvement</small><strong>{verifiedImprovement === null ? "Pending" : `${verifiedImprovement >= 0 ? "+" : ""}${verifiedImprovement} pts`}</strong><p>{verifiedImprovement === null ? "Submit a baseline and final capstone for a comparable measure." : `${assessedBaseline}% baseline to ${assessedFinal}% final.`}</p></div></article>
        </section>

        {!journey.plan && (
          <section className="evidence-empty">
            <TargetIcon />
            <div><h2>Define the outcome first.</h2><p>The course diagnostic creates the baseline and connects every later activity to a concrete goal.</p></div>
            <button className="button button-primary" onClick={() => router.push(`/course/${encodeURIComponent(course.topic)}?id=${courseId}`)}>Create learning plan</button>
          </section>
        )}

        <section className="mastery-ledger" aria-labelledby="mastery-ledger-title">
          <div className="section-heading"><div><p className="overline">Mastery graph v1</p><h2 id="mastery-ledger-title">Evidence by objective</h2></div><p>Self-report never marks an objective as demonstrated. Only transfer or assessed capstone evidence can do that.</p></div>
          <div>
            {course.modules.map((courseModule, moduleIndex) => {
              const objective = objectives[moduleIndex];
              const relevant = journey.evidence.filter((item) => item.objectiveId === objective?.objectiveId);
              return (
                <article className="mastery-objective" key={`${courseModule.title}-${moduleIndex}`}>
                  <span className={`mastery-state is-${objective?.state ?? "not_started"}`}>{objective?.state === "demonstrated" ? <CheckCircle2 size={17} /> : <Circle size={15} />}{STATE_LABELS[objective?.state ?? "not_started"]}</span>
                  <div><small>Module {moduleIndex + 1}</small><h3>{courseModule.title}</h3><p>{courseModule.objective ?? courseModule.description}</p></div>
                  <strong>{relevant.length} {relevant.length === 1 ? "record" : "records"}</strong>
                </article>
              );
            })}
          </div>
        </section>

        <section className="evidence-ledger" aria-labelledby="evidence-ledger-title">
          <div className="section-heading"><div><p className="overline">Evidence ledger</p><h2 id="evidence-ledger-title">What the record actually shows</h2></div><p>Responses are not stored here. The ledger keeps results, confidence, criteria, and timestamps.</p></div>
          {journey.evidence.length ? (
            <ol>{journey.evidence.map((item) => (
              <li key={item.id}>
                <span className={`evidence-result is-${item.result}`}>{item.result === "passed" ? <Check size={14} /> : <Circle size={13} />}</span>
                <div><strong>{item.label}</strong><small>{item.type}{item.lessonTitle ? ` · ${item.lessonTitle}` : ""}{item.confidence ? ` · ${item.confidence} confidence` : ""}</small></div>
                <time dateTime={item.observedAt}>{new Date(item.observedAt).toLocaleDateString()}</time>
              </li>
            ))}</ol>
          ) : (
            <div className="evidence-empty"><FileCheck2 size={20} /><div><h3>No observed evidence yet.</h3><p>Complete the first lesson’s retrieval and transfer activities to begin the ledger.</p></div></div>
          )}
        </section>

        <footer className="evidence-method">
          <strong>How to read this report</strong>
          <p>Starting estimate is self-reported. Observed mastery is a progression signal, not a credential. Verified improvement appears only when the same capstone criteria have been assessed before and after study.</p>
        </footer>
        {totalLessons > 0 && evidencedLessons >= totalLessons && (
          <OutcomeUsefulness
            courseId={courseId}
            getAuthToken={user ? () => user.getIdToken() : undefined}
          />
        )}
        {progress?.capstone?.status === "passed" && (
          <section className="next-outcome-panel" aria-labelledby="next-outcome-title">
            <div>
              <p className="overline">Capability compounding</p>
              <h2 id="next-outcome-title">Choose the next outcome while this evidence is fresh.</h2>
              <p>{nextCourse
                ? `${nextCourse.topic} is the closest published continuation in the current catalog. Start with a new diagnostic so the route reflects what you can already do.`
                : "Use the catalog to choose a related capability, then define a new observable outcome before lesson one."}</p>
            </div>
            <button className="button button-primary" type="button" onClick={() => {
              trackProductEvent("second_outcome_started", { route: "/evidence", courseId });
              if (nextCourse) {
                const nextId = nextCourse.id ?? nextCourse.courseId;
                router.push(`/course/${encodeURIComponent(nextCourse.topic)}?id=${nextId}`);
                return;
              }
              router.push("/library");
            }}>
              {nextCourse ? `Explore ${nextCourse.topic}` : "Choose next outcome"} <ArrowRight size={16} />
            </button>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function TargetIcon() {
  return <span className="evidence-empty-icon"><Gauge size={20} /></span>;
}
