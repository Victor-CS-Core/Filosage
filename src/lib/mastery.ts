import type { Course, CourseModule } from "@/lib/course-types";
import type { BaselineAssessment } from "@/lib/learning-types";

export const BASELINE_LEVELS = ["new", "familiar", "guided", "independent"] as const;
export type BaselineLevel = (typeof BASELINE_LEVELS)[number];

export const EVIDENCE_TYPES = ["lesson", "retrieval", "transfer", "capstone"] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];
export type EvidenceResult = "attempted" | "passed" | "needs_work";
export type MasteryState = "not_started" | "introduced" | "practicing" | "needs_review" | "demonstrated";

export interface DiagnosticItem {
  objectiveId: string;
  moduleIndex: number;
  moduleTitle: string;
  objective: string;
  level: BaselineLevel;
}

export interface LearningOutcomePlan {
  courseId: string;
  courseTopic: string;
  desiredOutcome: string;
  applicationContext: string;
  targetArtifact: string;
  targetDate?: string;
  weeklyMinutes: number;
  diagnostics: DiagnosticItem[];
  recommendedLessonId: string;
  explanation: string;
  createdAt: string;
  updatedAt: string;
  baselineAssessment?: BaselineAssessment;
}

export interface MasteryEvidence {
  id: string;
  courseId: string;
  objectiveId: string;
  type: EvidenceType;
  result: EvidenceResult;
  label: string;
  observedAt: string;
  lessonId?: string;
  lessonTitle?: string;
  confidence?: "low" | "medium" | "high";
  score?: number;
  criterion?: string;
}

export interface ObjectiveMastery {
  objectiveId: string;
  state: MasteryState;
  evidenceCount: number;
  latestEvidenceAt?: string;
}

const MASTERY_STORAGE_VERSION = 1;
const MASTERY_STORAGE_PREFIX = `erudoza-mastery-v${MASTERY_STORAGE_VERSION}:`;

export const BASELINE_LEVEL_LABELS: Record<BaselineLevel, string> = {
  new: "New to me",
  familiar: "I recognize it",
  guided: "I can use it with help",
  independent: "I can use it independently",
};

const BASELINE_SCORES: Record<BaselineLevel, number> = {
  new: 0,
  familiar: 1,
  guided: 2,
  independent: 3,
};

const MASTERY_SCORES: Record<MasteryState, number> = {
  not_started: 0,
  introduced: 1,
  practicing: 2,
  needs_review: 2,
  demonstrated: 3,
};

function objectiveText(courseModule: CourseModule) {
  return courseModule.objective ?? courseModule.description ?? courseModule.title;
}

export function moduleObjectiveId(moduleIndex: number) {
  return `module-${moduleIndex}`;
}

export function buildDiagnostic(course: Course): DiagnosticItem[] {
  return course.modules.map((courseModule, moduleIndex) => ({
    objectiveId: moduleObjectiveId(moduleIndex),
    moduleIndex,
    moduleTitle: courseModule.title,
    objective: objectiveText(courseModule),
    level: "new",
  }));
}

export function recommendedLessonFor(diagnostics: DiagnosticItem[]) {
  const firstGap = diagnostics.find((item) => item.level !== "independent");
  return `${firstGap?.moduleIndex ?? 0}-0`;
}

export function explainPlan(diagnostics: DiagnosticItem[], weeklyMinutes: number) {
  const gaps = diagnostics.filter((item) => item.level !== "independent");
  const independent = diagnostics.length - gaps.length;
  const focus = gaps.slice(0, 2).map((item) => item.moduleTitle).join(" and ");
  const cadence = weeklyMinutes < 90
    ? "one focused lesson and its practice each week"
    : weeklyMinutes < 180
      ? "two focused lessons and their practice each week"
      : "three or more lessons with a separate review session each week";

  if (!gaps.length) {
    return `Your diagnostic reports confidence across every module. Start with the first lesson as a calibration, then move quickly to transfer practice and the capstone. Plan for ${cadence}.`;
  }
  return `Start with ${focus}. ${independent ? `${independent} ${independent === 1 ? "module is" : "modules are"} already familiar, so revisit them only when evidence exposes a gap. ` : ""}Plan for ${cadence}.`;
}

function evidenceStrength(evidence: MasteryEvidence): number {
  if (evidence.result === "needs_work") return evidence.type === "lesson" ? 1 : 0;
  if (evidence.type === "capstone" && evidence.result === "passed") return 3;
  if (evidence.type === "transfer") return evidence.result === "passed" ? 3 : 2;
  if (evidence.type === "retrieval" && evidence.result === "passed") return 2;
  if (evidence.type === "lesson") return 1;
  return 1;
}

export function deriveObjectiveMastery(
  objectiveIds: string[],
  evidence: MasteryEvidence[],
): ObjectiveMastery[] {
  return objectiveIds.map((objectiveId) => {
    const relevant = evidence
      .filter((item) => item.objectiveId === objectiveId)
      .sort((left, right) => right.observedAt.localeCompare(left.observedAt));
    const strongest = relevant.reduce((score, item) => Math.max(score, evidenceStrength(item)), 0);
    const latestCheck = relevant.find((item) => item.type === "retrieval" || item.type === "capstone");
    const derivedState = (Object.keys(MASTERY_SCORES) as MasteryState[])
      .find((candidate) => MASTERY_SCORES[candidate] === strongest) ?? "not_started";
    const state = latestCheck?.result === "needs_work" && strongest >= 2
      ? "needs_review"
      : derivedState;
    return {
      objectiveId,
      state,
      evidenceCount: relevant.length,
      latestEvidenceAt: relevant[0]?.observedAt,
    };
  });
}

export function baselinePercent(plan: LearningOutcomePlan | null) {
  if (!plan?.diagnostics.length) return 0;
  const total = plan.diagnostics.reduce((sum, item) => sum + BASELINE_SCORES[item.level], 0);
  return Math.round((total / (plan.diagnostics.length * 3)) * 100);
}

export function masteryPercent(objectives: ObjectiveMastery[]) {
  if (!objectives.length) return 0;
  const total = objectives.reduce((sum, item) => sum + MASTERY_SCORES[item.state], 0);
  return Math.round((total / (objectives.length * 3)) * 100);
}

export function assessmentPercent(assessment?: Pick<BaselineAssessment, "criteria"> | null) {
  if (!assessment?.criteria.length) return null;
  return Math.round(
    (assessment.criteria.filter((criterion) => criterion.met).length / assessment.criteria.length) * 100,
  );
}

export function mergeMasteryEvidence(
  current: MasteryEvidence[],
  incoming: MasteryEvidence[],
) {
  const merged = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) merged.set(item.id, item);
  return Array.from(merged.values())
    .sort((left, right) => right.observedAt.localeCompare(left.observedAt))
    .slice(0, 500);
}

interface LocalMasteryJourney {
  plan: LearningOutcomePlan | null;
  evidence: MasteryEvidence[];
}

function storageKey(courseId: string) {
  return `${MASTERY_STORAGE_PREFIX}${courseId}`;
}

export function getLocalMasteryJourney(courseId: string): LocalMasteryJourney {
  if (typeof window === "undefined") return { plan: null, evidence: [] };
  try {
    const saved = localStorage.getItem(storageKey(courseId));
    if (!saved) return { plan: null, evidence: [] };
    const parsed = JSON.parse(saved) as Partial<LocalMasteryJourney>;
    return {
      plan: parsed.plan?.courseId === courseId ? parsed.plan : null,
      evidence: Array.isArray(parsed.evidence)
        ? parsed.evidence.filter((item) => item?.courseId === courseId)
        : [],
    };
  } catch {
    return { plan: null, evidence: [] };
  }
}

export function saveLocalMasteryJourney(
  courseId: string,
  journey: LocalMasteryJourney,
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(courseId), JSON.stringify(journey));
  } catch {
    // Learning remains usable when browser storage is unavailable.
  }
}

export function removeLocalMasteryJourney(courseId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKey(courseId));
  } catch {
    // Cleanup can continue even when browser storage is unavailable.
  }
}
