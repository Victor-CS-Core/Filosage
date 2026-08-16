import "server-only";

import { buildAdvancedCapstoneAnalysis, type AdvancedCapstoneAnalysis } from "@/lib/capstone-analysis";
import { getCourseRuntimeArtifact } from "@/lib/course-pipeline/artifact-access";
import type { Course } from "@/lib/course-types";
import { getStoredDocument, listAllStoredDocuments } from "@/lib/firebase-server";
import type { CapstoneAssessment, CourseProgress } from "@/lib/learning-types";
import {
  assessmentPercent,
  deriveObjectiveMastery,
  masteryPercent,
  mergeMasteryEvidence,
  moduleObjectiveId,
  type LearningOutcomePlan,
  type MasteryEvidence,
} from "@/lib/mastery";

export interface EvidenceReportV1 {
  version: 1;
  generatedAt: string;
  course: {
    id: string;
    topic: string;
    outcome: string;
  };
  learningGoal: {
    desiredOutcome?: string;
    applicationContext?: string;
    targetArtifact?: string;
  };
  summary: {
    completedLessons: number;
    totalLessons: number;
    observedMasteryPercent: number;
    assessedBaselinePercent: number | null;
    assessedFinalPercent: number | null;
    verifiedImprovementPoints: number | null;
  };
  objectives: Array<{
    objectiveId: string;
    title: string;
    objective: string;
    state: "not_started" | "introduced" | "practicing" | "needs_review" | "demonstrated";
    evidenceCount: number;
    latestEvidenceAt?: string;
  }>;
  evidence: Array<{
    type: MasteryEvidence["type"];
    result: MasteryEvidence["result"];
    label: string;
    observedAt: string;
    authority: "learner-reported" | "server-verified";
    confidence?: "low" | "medium" | "high";
    criterion?: string;
  }>;
  capstone: {
    status: CapstoneAssessment["status"];
    summary: string;
    assessedAt: string;
    attempts: number;
    criteria: CapstoneAssessment["criteria"];
  } | null;
  advancedCapstoneAnalysis: AdvancedCapstoneAnalysis | null;
  methodology: string[];
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function progressValue(value: Record<string, unknown> | null): CourseProgress | null {
  if (!value) return null;
  const completedLessonIds = Array.isArray(value.completedLessonIds) ? value.completedLessonIds.map(String) : [];
  return {
    courseId: stringValue(value.courseId, stringValue(value.id)),
    topic: stringValue(value.topic),
    lastLessonId: stringValue(value.lastLessonId),
    lastLessonTitle: stringValue(value.lastLessonTitle),
    completedLessonIds,
    lessons: value.lessons && typeof value.lessons === "object" ? value.lessons as CourseProgress["lessons"] : {},
    lastActivityAt: stringValue(value.lastActivityAt),
    startedAt: stringValue(value.startedAt),
    capstone: value.capstone && typeof value.capstone === "object" ? value.capstone as CapstoneAssessment : undefined,
  };
}

function planValue(value: Record<string, unknown> | null, courseId: string): LearningOutcomePlan | null {
  if (!value || stringValue(value.courseId) !== courseId || !Array.isArray(value.diagnostics)) return null;
  return value as unknown as LearningOutcomePlan;
}

function evidenceValue(value: Record<string, unknown>, courseId: string): MasteryEvidence | null {
  if (stringValue(value.courseId) !== courseId
    || !stringValue(value.id)
    || !stringValue(value.objectiveId)
    || !["lesson", "retrieval", "transfer", "capstone"].includes(String(value.type))
    || !["attempted", "passed", "needs_work"].includes(String(value.result))
    || !stringValue(value.label)
    || !stringValue(value.observedAt)) return null;
  return value as unknown as MasteryEvidence;
}

export async function buildEvidenceReport(
  uid: string,
  courseId: string,
  options: { includeAdvancedCapstoneAnalysis: boolean },
): Promise<{ course: Course; report: EvidenceReportV1 } | null> {
  const course = await getCourseRuntimeArtifact(courseId) as Course | null;
  if (!course) return null;
  const [storedProgress, storedPlan, storedEvidence] = await Promise.all([
    getStoredDocument(`users/${uid}/courseProgress/${courseId}`),
    getStoredDocument(`users/${uid}/learningOutcomes/${courseId}`),
    listAllStoredDocuments(`users/${uid}/masteryEvidence`, 500),
  ]);
  const progress = progressValue(storedProgress);
  const plan = planValue(storedPlan, courseId);
  const evidence = mergeMasteryEvidence([], storedEvidence.flatMap((item) => {
    const parsed = evidenceValue(item, courseId);
    return parsed ? [parsed] : [];
  }));
  const objectiveStates = deriveObjectiveMastery(
    course.modules.map((_, moduleIndex) => moduleObjectiveId(moduleIndex)),
    evidence,
  );
  const assessedBaselinePercent = assessmentPercent(plan?.baselineAssessment);
  const assessedFinalPercent = assessmentPercent(progress?.capstone);
  const capstone = progress?.capstone ? {
    status: progress.capstone.status,
    summary: stringValue(progress.capstone.summary),
    assessedAt: stringValue(progress.capstone.assessedAt),
    attempts: Math.max(1, Number(progress.capstone.attempts) || 1),
    criteria: Array.isArray(progress.capstone.criteria) ? progress.capstone.criteria.map((item) => ({
      criterion: stringValue(item.criterion),
      met: item.met === true,
      feedback: stringValue(item.feedback),
    })) : [],
  } : null;
  const report: EvidenceReportV1 = {
    version: 1,
    generatedAt: new Date().toISOString(),
    course: {
      id: courseId,
      topic: stringValue(course.topic, "Untitled course"),
      outcome: stringValue(course.outcome, stringValue(course.mission)),
    },
    learningGoal: {
      ...(plan?.desiredOutcome ? { desiredOutcome: stringValue(plan.desiredOutcome) } : {}),
      ...(plan?.applicationContext ? { applicationContext: stringValue(plan.applicationContext) } : {}),
      ...(plan?.targetArtifact ? { targetArtifact: stringValue(plan.targetArtifact) } : {}),
    },
    summary: {
      completedLessons: new Set(progress?.completedLessonIds ?? []).size,
      totalLessons: course.modules.reduce((sum, courseModule) => sum + courseModule.lessons.length, 0),
      observedMasteryPercent: masteryPercent(objectiveStates),
      assessedBaselinePercent,
      assessedFinalPercent,
      verifiedImprovementPoints: assessedBaselinePercent !== null && assessedFinalPercent !== null
        ? assessedFinalPercent - assessedBaselinePercent
        : null,
    },
    objectives: course.modules.map((courseModule, index) => ({
      objectiveId: objectiveStates[index]?.objectiveId ?? moduleObjectiveId(index),
      title: stringValue(courseModule.title, `Module ${index + 1}`),
      objective: stringValue(courseModule.objective, stringValue(courseModule.description)),
      state: objectiveStates[index]?.state ?? "not_started",
      evidenceCount: objectiveStates[index]?.evidenceCount ?? 0,
      ...(objectiveStates[index]?.latestEvidenceAt ? { latestEvidenceAt: objectiveStates[index].latestEvidenceAt } : {}),
    })),
    evidence: evidence.map((item) => ({
      type: item.type,
      result: item.result,
      label: stringValue(item.label),
      observedAt: stringValue(item.observedAt),
      authority: "learner-reported",
      ...(item.confidence ? { confidence: item.confidence } : {}),
      ...(item.criterion ? { criterion: stringValue(item.criterion) } : {}),
    })),
    capstone,
    advancedCapstoneAnalysis: options.includeAdvancedCapstoneAnalysis && progress?.capstone
      ? buildAdvancedCapstoneAnalysis(progress.capstone, course.capstone?.successCriteria ?? [])
      : null,
    methodology: [
      "Self-reported diagnostics describe a starting estimate and never count as demonstrated mastery.",
      "Observed mastery is a progression signal derived from saved learning evidence, not an accredited credential.",
      "Verified improvement appears only when comparable baseline and final assessment criteria are available.",
    ],
  };
  return { course, report };
}

export function evidenceReportHasMeaningfulEvidence(report: EvidenceReportV1) {
  return report.summary.completedLessons > 0
    || report.evidence.some((item) => item.authority === "server-verified")
    || Boolean(report.capstone);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function percent(value: number | null) {
  return value === null ? "Pending" : `${value}%`;
}

export function renderEvidenceReportHtml(report: EvidenceReportV1) {
  const objectiveRows = report.objectives.map((objective) => `<tr><th scope="row">${escapeHtml(objective.title)}</th><td>${escapeHtml(objective.objective)}</td><td>${escapeHtml(objective.state.replaceAll("_", " "))}</td><td>${objective.evidenceCount}</td></tr>`).join("");
  const evidenceRows = report.evidence.map((item) => `<li><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.type)} · ${escapeHtml(item.result)} · ${escapeHtml(item.authority)}</span><time datetime="${escapeHtml(item.observedAt)}">${escapeHtml(item.observedAt.slice(0, 10))}</time></li>`).join("");
  const capstoneCriteria = report.capstone?.criteria.map((criterion) => `<li><strong>${criterion.met ? "Met" : "Not met"}: ${escapeHtml(criterion.criterion)}</strong><p>${escapeHtml(criterion.feedback)}</p></li>`).join("") ?? "";
  const priorities = report.advancedCapstoneAnalysis?.nextRevisionPriorities.map((criterion) => `<li>${escapeHtml(criterion)}</li>`).join("") ?? "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(report.course.topic)} · Filosage evidence report</title>
<style>:root{color-scheme:light;font-family:Georgia,"Times New Roman",serif;color:#17332d;background:#f6f2e9}*{box-sizing:border-box}body{margin:0}.report{max-width:880px;margin:0 auto;padding:64px 48px}.overline{font:700 12px/1.4 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#557069}h1{font-size:44px;line-height:1.08;margin:.2em 0}h2{margin-top:40px}p,li,td,th{line-height:1.55}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#cbd4cf;border:1px solid #cbd4cf;margin:28px 0}.metrics div{background:#fff;padding:18px}.metrics strong{display:block;font-size:26px}.metrics span{font:600 12px system-ui,sans-serif;color:#557069}table{width:100%;border-collapse:collapse;background:#fff}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #dce2de;padding:12px}th{font-weight:700}.ledger{padding:0;list-style:none}.ledger li{display:grid;grid-template-columns:1fr auto;gap:4px 18px;border-bottom:1px solid #dce2de;padding:12px 0}.ledger span{font:500 12px system-ui,sans-serif;color:#557069}.method{border-top:2px solid #17332d;margin-top:42px;padding-top:18px}.method li{margin:.5em 0}@media(max-width:680px){.report{padding:36px 20px}.metrics{grid-template-columns:1fr}h1{font-size:34px}.ledger li{grid-template-columns:1fr}}@media print{body{background:#fff}.report{max-width:none;padding:0}.metrics,table{break-inside:avoid}a{color:inherit}}</style></head>
<body><main class="report"><p class="overline">Filosage · Evidence report v${report.version}</p><h1>${escapeHtml(report.course.topic)}</h1><p>${escapeHtml(report.learningGoal.desiredOutcome ?? report.course.outcome)}</p><p><small>Generated ${escapeHtml(report.generatedAt.slice(0, 10))}</small></p>
<section class="metrics" aria-label="Evidence summary"><div><span>Course progress</span><strong>${report.summary.completedLessons}/${report.summary.totalLessons}</strong></div><div><span>Observed objective evidence</span><strong>${report.summary.observedMasteryPercent}%</strong></div><div><span>Verified improvement</span><strong>${report.summary.verifiedImprovementPoints === null ? "Pending" : `${report.summary.verifiedImprovementPoints >= 0 ? "+" : ""}${report.summary.verifiedImprovementPoints} pts`}</strong><small>${percent(report.summary.assessedBaselinePercent)} to ${percent(report.summary.assessedFinalPercent)}</small></div></section>
<section><h2>Evidence by objective</h2><table><thead><tr><th>Module</th><th>Objective</th><th>State</th><th>Records</th></tr></thead><tbody>${objectiveRows}</tbody></table></section>
${report.capstone ? `<section><h2>Latest capstone assessment</h2><p><strong>${report.capstone.status === "passed" ? "Passed" : "Needs revision"}</strong> · ${escapeHtml(report.capstone.assessedAt.slice(0, 10))}</p><p>${escapeHtml(report.capstone.summary)}</p><ol>${capstoneCriteria}</ol></section>` : ""}
${priorities ? `<section><h2>Next revision priorities</h2><ol>${priorities}</ol></section>` : ""}
<section><h2>Evidence ledger</h2>${evidenceRows ? `<ol class="ledger">${evidenceRows}</ol>` : "<p>No observed evidence has been recorded.</p>"}</section>
<footer class="method"><h2>How to read this report</h2><ul>${report.methodology.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></footer></main></body></html>`;
}
