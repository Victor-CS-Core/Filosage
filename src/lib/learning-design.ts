import { z } from "zod";

/**
 * This contract is intentionally independent from the source-integrity contract.
 * It describes how learning is planned, not whether a factual claim is grounded.
 */
export const LEARNING_DESIGN_CONTRACT_VERSION = "learning-design-v1.0.0" as const;
export const COURSE_LEARNING_BRIEF_VERSION = "course-learning-brief-v1.0.0" as const;
export const LESSON_DESIGN_PLAN_VERSION = "lesson-design-plan-v1.0.0" as const;

const safeText = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);
const objectiveIdPattern = /^objective-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const sourceIdSchema = z.string().trim().regex(/^source-[a-z0-9-]{1,40}$/);
const furtherReadingIdSchema = z.string().trim().regex(/^reference-[a-f0-9]{16}$/);

function normalizedText(value: string) {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedUnique(values: string[]) {
  return [...new Set(values.map(normalizedText))].sort(compareText);
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function textValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return normalizedText(value);
  }
  return "";
}

function textValues(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map(normalizedText)
    : [];
}

function integerValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isInteger(value)) return value;
  }
  return undefined;
}

export function normalizeObjectiveId(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const legacyModule = normalized.match(/^module-(\d+)$/);
  if (legacyModule) return `objective-m${Number(legacyModule[1])}`;
  const moduleObjective = normalized.match(/^objective-m(\d+)$/);
  if (moduleObjective) return `objective-m${Number(moduleObjective[1])}`;
  const lessonObjective = normalized.match(/^objective-m(\d+)-l(\d+)$/);
  if (lessonObjective) return `objective-m${Number(lessonObjective[1])}-l${Number(lessonObjective[2])}`;
  return objectiveIdPattern.test(normalized) ? normalized : null;
}

export const objectiveReferenceSchema = z.string().trim().min(1).max(100)
  .refine((value) => normalizeObjectiveId(value) !== null, "Use a supported objective identifier.")
  .transform((value) => normalizeObjectiveId(value) as string);

export function normalizeObjectiveIds(values: Iterable<string>) {
  return [...new Set([...values].flatMap((value) => {
    const normalized = normalizeObjectiveId(value);
    return normalized ? [normalized] : [];
  }))];
}

export function capabilityIdForObjective(value: string) {
  const objectiveId = normalizeObjectiveId(value);
  return objectiveId ? `capability-${objectiveId.slice("objective-".length)}` : null;
}

export function objectiveIdForCapability(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^capability-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) return null;
  return normalizeObjectiveId(`objective-${normalized.slice("capability-".length)}`);
}

export const capabilityKindSchema = z.enum(["knowledge", "skill", "mixed"]);

export const capabilityObjectiveSchema = z.object({
  objectiveId: objectiveReferenceSchema,
  capabilityId: z.string().trim().regex(/^capability-[a-z0-9]+(?:-[a-z0-9]+)*$/),
  kind: capabilityKindSchema,
  description: safeText(2, 500),
}).strict().superRefine((value, context) => {
  if (capabilityIdForObjective(value.objectiveId) !== value.capabilityId) {
    context.addIssue({
      code: "custom",
      path: ["capabilityId"],
      message: "The capability identifier must be derived from its canonical objective identifier.",
    });
  }
});

export function normalizeCapabilityObjective(value: {
  objectiveId: string;
  description: string;
  kind?: z.input<typeof capabilityKindSchema>;
}) {
  const objectiveId = normalizeObjectiveId(value.objectiveId);
  if (!objectiveId) return null;
  return capabilityObjectiveSchema.parse({
    objectiveId,
    capabilityId: capabilityIdForObjective(objectiveId),
    kind: value.kind ?? "mixed",
    description: normalizedText(value.description),
  });
}

const uniqueTextArray = (maximum: number, itemMaximum: number) => z.array(safeText(1, itemMaximum)).max(maximum)
  .superRefine((values, context) => {
    const normalized = values.map((value) => normalizedText(value).toLowerCase());
    if (new Set(normalized).size !== normalized.length) {
      context.addIssue({ code: "custom", message: "List entries must be unique." });
    }
  });

export const courseLearningBriefV1Schema = z.object({
  version: z.literal(COURSE_LEARNING_BRIEF_VERSION),
  source: z.enum(["explicit", "compatibility-derived"]),
  topic: safeText(2, 120),
  desiredOutcome: safeText(2, 500),
  applicationContext: safeText(2, 500),
  priorKnowledge: safeText(2, 500),
  proofOfSkill: safeText(2, 500),
  successCriteria: uniqueTextArray(6, 240),
  constraints: uniqueTextArray(8, 240),
  exclusions: uniqueTextArray(8, 240),
  timeBudgetMinutes: z.number().int().min(10).max(10_000),
  language: safeText(2, 80),
}).strict();

export type CourseLearningBriefV1 = z.infer<typeof courseLearningBriefV1Schema>;

export function canonicalCourseLearningBriefV1(value: z.input<typeof courseLearningBriefV1Schema>): CourseLearningBriefV1 {
  const parsed = courseLearningBriefV1Schema.parse(value);
  return {
    version: COURSE_LEARNING_BRIEF_VERSION,
    source: parsed.source,
    topic: normalizedText(parsed.topic),
    desiredOutcome: normalizedText(parsed.desiredOutcome),
    applicationContext: normalizedText(parsed.applicationContext),
    priorKnowledge: normalizedText(parsed.priorKnowledge),
    proofOfSkill: normalizedText(parsed.proofOfSkill),
    successCriteria: sortedUnique(parsed.successCriteria),
    constraints: sortedUnique(parsed.constraints),
    exclusions: sortedUnique(parsed.exclusions),
    timeBudgetMinutes: parsed.timeBudgetMinutes,
    language: normalizedText(parsed.language),
  };
}

export function deriveCourseLearningBriefV1(value: unknown): CourseLearningBriefV1 {
  const raw = recordValue(value);
  const existing = courseLearningBriefV1Schema.safeParse(raw.learningDesignBrief ?? raw.courseLearningBrief);
  if (existing.success) return canonicalCourseLearningBriefV1(existing.data);

  const instructional = recordValue(raw.instructionalContext);
  const artifact = recordValue(raw.artifact);
  const scenario = recordValue(raw.scenario);
  const capstone = recordValue(raw.capstone);
  const topic = textValue(raw.topic, "General capability");
  const desiredOutcome = textValue(
    raw.goal,
    instructional.goal,
    raw.outcome,
    raw.mission,
    `Apply a practical capability in ${topic}.`,
  );
  const applicationContext = textValue(
    raw.application,
    instructional.application,
    scenario.context,
    raw.audience,
    `Use ${topic} in a relevant real-world setting.`,
  );
  const prerequisites = textValues(raw.prerequisites);
  const priorKnowledge = textValue(
    raw.background,
    instructional.background,
    prerequisites.length ? prerequisites.join("; ") : undefined,
    "No prior knowledge was recorded.",
  );
  const proofOfSkill = textValue(
    raw.artifactPreference,
    instructional.artifactPreference,
    artifact.description,
    artifact.title,
    capstone.deliverable,
    desiredOutcome,
  );
  const weeklyMinutes = integerValue(raw.weeklyMinutes, instructional.weeklyMinutes);
  const targetWeeks = integerValue(raw.targetWeeks, instructional.targetWeeks);
  const calculatedBudget = weeklyMinutes && targetWeeks ? weeklyMinutes * targetWeeks : undefined;
  const timeBudgetMinutes = Math.max(10, Math.min(10_000,
    calculatedBudget ?? integerValue(raw.estimatedMinutes) ?? 120,
  ));

  return canonicalCourseLearningBriefV1({
    version: COURSE_LEARNING_BRIEF_VERSION,
    source: "compatibility-derived",
    topic,
    desiredOutcome,
    applicationContext,
    priorKnowledge,
    proofOfSkill,
    successCriteria: textValues(capstone.successCriteria),
    constraints: textValues(raw.constraints ?? instructional.constraints),
    exclusions: textValues(raw.exclusions ?? instructional.exclusions),
    timeBudgetMinutes,
    language: textValue(raw.language, "English"),
  });
}

export const lessonScopeBudgetSchema = z.object({
  version: z.literal(LESSON_DESIGN_PLAN_VERSION),
  primaryObjectiveId: objectiveReferenceSchema,
  singleWin: safeText(2, 300),
  estimatedMinutes: z.number().int().min(5).max(45),
  newConceptLimit: z.number().int().min(1).max(3),
  explanationWordLimit: z.number().int().min(150).max(800),
  practiceMinutes: z.number().int().min(3).max(35),
}).strict().superRefine((value, context) => {
  if (value.practiceMinutes >= value.estimatedMinutes) {
    context.addIssue({
      code: "custom",
      path: ["practiceMinutes"],
      message: "Practice time must leave room for explanation and reflection within the lesson estimate.",
    });
  }
});

export const prerequisitePlanSchema = z.object({
  objectiveIds: z.array(objectiveReferenceSchema).max(4),
  connectionStrategy: safeText(12, 500).nullable(),
}).strict().superRefine((value, context) => {
  if (value.objectiveIds.length > 0 && !value.connectionStrategy) {
    context.addIssue({ code: "custom", path: ["connectionStrategy"], message: "Named prerequisites require an activation strategy." });
  }
  if (value.objectiveIds.length === 0 && value.connectionStrategy) {
    context.addIssue({ code: "custom", path: ["connectionStrategy"], message: "A connection strategy requires at least one prerequisite objective." });
  }
  if (new Set(value.objectiveIds).size !== value.objectiveIds.length) {
    context.addIssue({ code: "custom", path: ["objectiveIds"], message: "Prerequisite objective identifiers must be unique." });
  }
});

export const retrievalTargetSchema = z.object({
  objectiveId: objectiveReferenceSchema,
  mode: z.enum(["recall", "discriminate", "apply"]),
  spacing: z.enum(["immediate", "spaced", "interleaved"]),
}).strict();

export const retrievalPlanSchema = z.object({
  required: z.boolean(),
  targets: z.array(retrievalTargetSchema).max(3),
}).strict().superRefine((value, context) => {
  if (value.required && value.targets.length === 0) {
    context.addIssue({ code: "custom", path: ["targets"], message: "A required retrieval plan needs at least one earlier objective." });
  }
  const objectiveIds = value.targets.map((target) => target.objectiveId);
  if (new Set(objectiveIds).size !== objectiveIds.length) {
    context.addIssue({ code: "custom", path: ["targets"], message: "Retrieval targets must use distinct objective identifiers." });
  }
});

const assessmentIdSchema = z.string().trim().regex(/^assessment-[a-z0-9-]{1,80}$/);
const criterionIdSchema = z.string().trim().regex(/^criterion-[a-z0-9-]{1,80}$/);
const uniqueIdArray = <T extends z.ZodType<string>>(schema: T, maximum: number, minimum = 0) => z.array(schema)
  .min(minimum)
  .max(maximum)
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", message: "Identifiers must be unique." });
    }
  });

export const misconceptionPlanSchema = z.object({
  id: z.string().trim().regex(/^misconception-[a-z0-9-]{1,80}$/),
  statement: safeText(2, 300),
  correctionTarget: safeText(2, 500),
  assessmentStrategy: z.enum(["diagnostic-distractor", "prediction-check", "worked-correction", "rubric-criterion"]),
  assessmentIds: uniqueIdArray(assessmentIdSchema, 4, 1),
}).strict();

export const feedbackPlanSchema = z.object({
  mode: z.enum(["auto-scored", "rubric-self-check", "ai-rubric"]),
  timing: z.literal("after-commitment"),
  assessmentIds: uniqueIdArray(assessmentIdSchema, 6, 1),
  criterionIds: uniqueIdArray(criterionIdSchema, 6),
  revisionRequiredOnMiss: z.boolean(),
  completionEvidence: z.enum(["attempted", "demonstrated"]),
}).strict().superRefine((value, context) => {
  if (value.mode !== "auto-scored" && value.criterionIds.length === 0) {
    context.addIssue({ code: "custom", path: ["criterionIds"], message: "Rubric feedback requires at least one stable criterion identifier." });
  }
  if (value.mode === "rubric-self-check" && value.completionEvidence === "demonstrated") {
    context.addIssue({
      code: "custom",
      path: ["completionEvidence"],
      message: "Self-check feedback can record an attempt, but cannot independently demonstrate mastery.",
    });
  }
});

export const lessonResourcePlanSchema = z.object({
  status: z.enum(["available", "unavailable"]),
  evidenceSourceIds: uniqueIdArray(sourceIdSchema, 5),
  furtherReadingIds: uniqueIdArray(furtherReadingIdSchema, 5),
  rationale: safeText(2, 400),
}).strict().superRefine((value, context) => {
  const referenceCount = value.evidenceSourceIds.length + value.furtherReadingIds.length;
  if (value.status === "available" && referenceCount === 0) {
    context.addIssue({ code: "custom", path: ["status"], message: "An available resource plan must reference evidence or further reading." });
  }
  if (value.status === "unavailable" && referenceCount > 0) {
    context.addIssue({ code: "custom", path: ["status"], message: "An unavailable resource plan cannot retain resource identifiers." });
  }
});

export const lessonDesignPlanV1Schema = z.object({
  version: z.literal(LESSON_DESIGN_PLAN_VERSION),
  lessonId: z.string().trim().regex(/^\d+-\d+$/),
  scopeBudget: lessonScopeBudgetSchema,
  prerequisites: prerequisitePlanSchema,
  retrieval: retrievalPlanSchema,
  misconception: misconceptionPlanSchema.nullable(),
  feedback: feedbackPlanSchema,
  resources: lessonResourcePlanSchema,
}).strict();

export type CapabilityObjective = z.infer<typeof capabilityObjectiveSchema>;
export type LessonScopeBudget = z.infer<typeof lessonScopeBudgetSchema>;
export type PrerequisitePlan = z.infer<typeof prerequisitePlanSchema>;
export type RetrievalPlan = z.infer<typeof retrievalPlanSchema>;
export type MisconceptionPlan = z.infer<typeof misconceptionPlanSchema>;
export type FeedbackPlan = z.infer<typeof feedbackPlanSchema>;
export type LessonResourcePlan = z.infer<typeof lessonResourcePlanSchema>;
export type LessonDesignPlanV1 = z.infer<typeof lessonDesignPlanV1Schema>;

export const learningDesignContractV1Schema = z.object({
  contractVersion: z.literal(LEARNING_DESIGN_CONTRACT_VERSION),
  brief: courseLearningBriefV1Schema,
  lessonPlans: z.array(lessonDesignPlanV1Schema).max(100),
}).strict().superRefine((value, context) => {
  const lessonIds = value.lessonPlans.map((plan) => plan.lessonId);
  if (new Set(lessonIds).size !== lessonIds.length) {
    context.addIssue({ code: "custom", path: ["lessonPlans"], message: "Lesson design plans must use unique lesson identifiers." });
  }
});

export type LearningDesignContractV1 = z.infer<typeof learningDesignContractV1Schema>;

export function canonicalLessonDesignPlanV1(value: z.input<typeof lessonDesignPlanV1Schema>): LessonDesignPlanV1 {
  const parsed = lessonDesignPlanV1Schema.parse(value);
  const sortedTargets = [...parsed.retrieval.targets].sort((left, right) =>
    compareText(left.objectiveId, right.objectiveId)
      || compareText(left.mode, right.mode)
      || compareText(left.spacing, right.spacing));
  return {
    version: LESSON_DESIGN_PLAN_VERSION,
    lessonId: parsed.lessonId,
    scopeBudget: {
      version: LESSON_DESIGN_PLAN_VERSION,
      primaryObjectiveId: parsed.scopeBudget.primaryObjectiveId,
      singleWin: normalizedText(parsed.scopeBudget.singleWin),
      estimatedMinutes: parsed.scopeBudget.estimatedMinutes,
      newConceptLimit: parsed.scopeBudget.newConceptLimit,
      explanationWordLimit: parsed.scopeBudget.explanationWordLimit,
      practiceMinutes: parsed.scopeBudget.practiceMinutes,
    },
    prerequisites: {
      objectiveIds: [...parsed.prerequisites.objectiveIds].sort(compareText),
      connectionStrategy: parsed.prerequisites.connectionStrategy
        ? normalizedText(parsed.prerequisites.connectionStrategy)
        : null,
    },
    retrieval: { required: parsed.retrieval.required, targets: sortedTargets },
    misconception: parsed.misconception ? {
      id: parsed.misconception.id,
      statement: normalizedText(parsed.misconception.statement),
      correctionTarget: normalizedText(parsed.misconception.correctionTarget),
      assessmentStrategy: parsed.misconception.assessmentStrategy,
      assessmentIds: [...parsed.misconception.assessmentIds].sort(compareText),
    } : null,
    feedback: {
      mode: parsed.feedback.mode,
      timing: "after-commitment",
      assessmentIds: [...parsed.feedback.assessmentIds].sort(compareText),
      criterionIds: [...parsed.feedback.criterionIds].sort(compareText),
      revisionRequiredOnMiss: parsed.feedback.revisionRequiredOnMiss,
      completionEvidence: parsed.feedback.completionEvidence,
    },
    resources: {
      status: parsed.resources.status,
      evidenceSourceIds: [...parsed.resources.evidenceSourceIds].sort(compareText),
      furtherReadingIds: [...parsed.resources.furtherReadingIds].sort(compareText),
      rationale: normalizedText(parsed.resources.rationale),
    },
  };
}

export type LearningDesignIssueSeverity = "blocker" | "error" | "warning";
export type LearningDesignIssueCode =
  | "LD_SCHEMA_001"
  | "LD_BRIEF_001"
  | "LD_BRIEF_002"
  | "LD_SCOPE_001"
  | "LD_OBJECTIVE_001"
  | "LD_PREREQUISITE_001"
  | "LD_RETRIEVAL_001"
  | "LD_MISCONCEPTION_001"
  | "LD_FEEDBACK_001"
  | "LD_RESOURCE_001"
  | "LD_OUTPUT_001"
  | "LD_OUTPUT_002"
  | "LD_REPLAN_001";

export interface LearningDesignIssue {
  code: LearningDesignIssueCode;
  severity: LearningDesignIssueSeverity;
  path: string;
  message: string;
}

const genericOutcome = /^(?:understand|learn|explore|know|be familiar with|gain awareness of)\b/i;

function schemaIssues(error: z.ZodError, prefix: string): LearningDesignIssue[] {
  return error.issues.map((issue) => ({
    code: "LD_SCHEMA_001",
    severity: "blocker",
    path: [prefix, ...issue.path.map(String)].filter(Boolean).join("."),
    message: issue.message,
  }));
}

export function courseLearningBriefIssues(value: unknown): LearningDesignIssue[] {
  const parsed = courseLearningBriefV1Schema.safeParse(value);
  if (!parsed.success) return schemaIssues(parsed.error, "brief");
  const issues: LearningDesignIssue[] = [];
  if (genericOutcome.test(parsed.data.desiredOutcome)) {
    issues.push({
      code: "LD_BRIEF_001",
      severity: parsed.data.source === "explicit" ? "error" : "warning",
      path: "brief.desiredOutcome",
      message: "The desired outcome should name an observable capability, not only exposure or understanding.",
    });
  }
  if (normalizedText(parsed.data.desiredOutcome).toLowerCase()
    === normalizedText(parsed.data.proofOfSkill).toLowerCase()) {
    issues.push({
      code: "LD_BRIEF_002",
      severity: "warning",
      path: "brief.proofOfSkill",
      message: "Proof of skill should name inspectable evidence rather than repeat the desired outcome.",
    });
  }
  return issues;
}

export function lessonScopeBudgetIssues(value: unknown): LearningDesignIssue[] {
  const parsed = lessonScopeBudgetSchema.safeParse(value);
  if (!parsed.success) return schemaIssues(parsed.error, "scopeBudget");
  if (!genericOutcome.test(parsed.data.singleWin)) return [];
  return [{
    code: "LD_SCOPE_001",
    severity: "error",
    path: "scopeBudget.singleWin",
    message: "The lesson's single win must describe something observable the learner will do or produce.",
  }];
}

export interface LessonDesignValidationContext {
  knownObjectiveIds: Iterable<string>;
  objectiveOrder?: Iterable<string>;
  knownSourceIds?: Iterable<string>;
  knownFurtherReadingIds?: Iterable<string>;
}

export function lessonDesignPlanIssues(
  value: unknown,
  context: LessonDesignValidationContext,
): LearningDesignIssue[] {
  const parsed = lessonDesignPlanV1Schema.safeParse(value);
  if (!parsed.success) return schemaIssues(parsed.error, "lessonPlan");
  const plan = parsed.data;
  const issues = lessonScopeBudgetIssues(plan.scopeBudget);
  const knownObjectives = new Set(normalizeObjectiveIds(context.knownObjectiveIds));
  const objectiveOrder = new Map(normalizeObjectiveIds(context.objectiveOrder ?? context.knownObjectiveIds)
    .map((objectiveId, index) => [objectiveId, index]));
  const primaryObjectiveId = plan.scopeBudget.primaryObjectiveId;
  const primaryOrder = objectiveOrder.get(primaryObjectiveId);

  if (!knownObjectives.has(primaryObjectiveId)) {
    issues.push({
      code: "LD_OBJECTIVE_001",
      severity: "blocker",
      path: "lessonPlan.scopeBudget.primaryObjectiveId",
      message: `The primary objective ${primaryObjectiveId} is not part of the course objective graph.`,
    });
  }

  const inspectEarlierObjectives = (
    objectiveIds: string[],
    code: "LD_PREREQUISITE_001" | "LD_RETRIEVAL_001",
    path: string,
    noun: string,
  ) => {
    for (const objectiveId of objectiveIds) {
      if (!knownObjectives.has(objectiveId)) {
        issues.push({ code, severity: "blocker", path, message: `The ${noun} ${objectiveId} is not part of the course objective graph.` });
      } else if (objectiveId === primaryObjectiveId) {
        issues.push({ code, severity: "blocker", path, message: `The primary objective cannot also be its own ${noun}.` });
      } else if (primaryOrder !== undefined
        && objectiveOrder.has(objectiveId)
        && (objectiveOrder.get(objectiveId) as number) >= primaryOrder) {
        issues.push({ code, severity: "blocker", path, message: `The ${noun} ${objectiveId} must precede the lesson's primary objective.` });
      }
    }
  };

  inspectEarlierObjectives(
    plan.prerequisites.objectiveIds,
    "LD_PREREQUISITE_001",
    "lessonPlan.prerequisites.objectiveIds",
    "prerequisite objective",
  );
  inspectEarlierObjectives(
    plan.retrieval.targets.map((target) => target.objectiveId),
    "LD_RETRIEVAL_001",
    "lessonPlan.retrieval.targets",
    "retrieval objective",
  );

  if (plan.misconception) {
    const feedbackAssessments = new Set(plan.feedback.assessmentIds);
    const missingFeedback = plan.misconception.assessmentIds.filter((assessmentId) => !feedbackAssessments.has(assessmentId));
    if (missingFeedback.length) {
      issues.push({
        code: "LD_MISCONCEPTION_001",
        severity: "blocker",
        path: "lessonPlan.misconception.assessmentIds",
        message: `Misconception checks must participate in the feedback plan: ${missingFeedback.join(", ")}.`,
      });
    }
  }

  if (plan.feedback.completionEvidence === "demonstrated"
    && plan.feedback.mode === "auto-scored"
    && !plan.feedback.revisionRequiredOnMiss) {
    issues.push({
      code: "LD_FEEDBACK_001",
      severity: "error",
      path: "lessonPlan.feedback.revisionRequiredOnMiss",
      message: "Auto-scored mastery evidence must require correction or retry after a missed response.",
    });
  }

  const knownSources = context.knownSourceIds ? new Set(context.knownSourceIds) : null;
  const unknownSources = knownSources
    ? plan.resources.evidenceSourceIds.filter((sourceId) => !knownSources.has(sourceId))
    : [];
  const knownReading = context.knownFurtherReadingIds ? new Set(context.knownFurtherReadingIds) : null;
  const unknownReading = knownReading
    ? plan.resources.furtherReadingIds.filter((referenceId) => !knownReading.has(referenceId))
    : [];
  if (unknownSources.length || unknownReading.length) {
    issues.push({
      code: "LD_RESOURCE_001",
      severity: "blocker",
      path: "lessonPlan.resources",
      message: `The resource plan contains unknown identifiers: ${[...unknownSources, ...unknownReading].join(", ")}.`,
    });
  }

  return issues;
}

export function canonicalLearningDesignData(value: {
  brief: z.input<typeof courseLearningBriefV1Schema>;
  lessonPlans: Array<z.input<typeof lessonDesignPlanV1Schema>>;
}): LearningDesignContractV1 {
  return learningDesignContractV1Schema.parse({
    contractVersion: LEARNING_DESIGN_CONTRACT_VERSION,
    brief: canonicalCourseLearningBriefV1(value.brief),
    lessonPlans: value.lessonPlans
      .map(canonicalLessonDesignPlanV1)
      .sort((left, right) => {
        const leftCoordinates = left.lessonId.split("-").map(Number);
        const rightCoordinates = right.lessonId.split("-").map(Number);
        return leftCoordinates[0] - rightCoordinates[0] || leftCoordinates[1] - rightCoordinates[1];
      }),
  });
}

type PlannedLessonLike = {
  title: string;
  concept: string;
  objective?: string;
  objectiveId?: string;
  estimatedMinutes?: number;
  lessonMode?: "concept" | "worked-example" | "comparison" | "case-study" | "practice-lab" | "synthesis";
  practiceType?: "explain" | "classify" | "calculate" | "decide" | "create" | "debug";
  buildsOn?: string[];
  misconception?: string;
  sourceIds?: string[];
  contentBasis?: "verified-source" | "model-knowledge";
};

type PlannedCourseLike = {
  topic: string;
  outcome?: string;
  mission?: string;
  estimatedMinutes?: number;
  language?: string;
  artifact?: { title?: string; description?: string; format?: string };
  scenario?: { context?: string };
  capstone?: { deliverable?: string; successCriteria?: string[] };
  prerequisites?: string[];
  instructionalContext?: Record<string, unknown>;
  modules: Array<{ lessons: PlannedLessonLike[] }>;
};

export function buildPublicLearningDesignSummaryV1(
  course: PlannedCourseLike,
  contract: LearningDesignContractV1,
) {
  const publicLessonById = new Map<string, PlannedLessonLike>(course.modules.flatMap((courseModule, moduleIndex) =>
    courseModule.lessons.map((lesson, lessonIndex) => [`${moduleIndex}-${lessonIndex}`, lesson] as const)));
  const publicOutcome = textValue(
    course.outcome,
    course.mission,
    `Apply ${course.topic} in a practical outcome.`,
  );
  const proofOfSkill = textValue(
    course.artifact?.description,
    course.artifact?.title,
    course.capstone?.deliverable,
    `Apply ${course.topic} in a practical task.`,
  );
  return {
    contractVersion: contract.contractVersion,
    desiredOutcome: publicOutcome,
    proofOfSkill,
    successCriteria: [...new Set((course.capstone?.successCriteria ?? []).map(normalizedText).filter(Boolean))],
    timeBudgetMinutes: Number.isFinite(course.estimatedMinutes)
      ? Math.max(5, Math.min(10080, Math.round(course.estimatedMinutes as number)))
      : contract.lessonPlans.reduce((total, plan) => total + plan.scopeBudget.estimatedMinutes, 0),
    lessonWins: contract.lessonPlans.flatMap((plan) => {
      const lesson = publicLessonById.get(plan.lessonId);
      if (!lesson) return [];
      return [{
        lessonId: plan.lessonId,
        objectiveId: plan.scopeBudget.primaryObjectiveId,
        singleWin: textValue(lesson.objective, lesson.concept),
        estimatedMinutes: plan.scopeBudget.estimatedMinutes,
      }];
    }),
  };
}

function boundedLessonMinutes(value: number | undefined, mode: PlannedLessonLike["lessonMode"]) {
  const defaultMinutes = mode === "practice-lab" || mode === "synthesis" ? 24 : 15;
  const maximumMinutes = mode === "practice-lab" || mode === "synthesis" ? 45 : 30;
  return Math.max(5, Math.min(maximumMinutes, value ?? defaultMinutes));
}

function lessonAssessmentId(objectiveId: string, suffix: string) {
  return `assessment-${objectiveId.slice("objective-".length)}-${suffix}`;
}

function lessonCriterionId(objectiveId: string) {
  return `criterion-${objectiveId.slice("objective-".length)}-transfer`;
}

function feedbackModeFor(practiceType: PlannedLessonLike["practiceType"]) {
  return practiceType === "classify" || practiceType === "calculate"
    ? "auto-scored" as const
    : "rubric-self-check" as const;
}

/**
 * Builds the contract deterministically after course relationship IDs exist.
 * This adds no provider call and never changes source classification.
 */
export function buildLearningDesignContractV1(
  course: PlannedCourseLike,
  explicitBrief?: CourseLearningBriefV1,
): LearningDesignContractV1 {
  const titleToObjective = new Map<string, string>();
  const previousObjectives: string[] = [];
  const lessonPlans: LessonDesignPlanV1[] = [];

  for (const [moduleIndex, courseModule] of course.modules.entries()) {
    for (const [lessonIndex, lesson] of courseModule.lessons.entries()) {
      const lessonId = `${moduleIndex}-${lessonIndex}`;
      const objectiveId = normalizeObjectiveId(lesson.objectiveId ?? `objective-m${moduleIndex}-l${lessonIndex}`)
        ?? `objective-m${moduleIndex}-l${lessonIndex}`;
      const namedPrerequisites = (lesson.buildsOn ?? []).flatMap((title) => {
        const matched = titleToObjective.get(normalizedText(title).toLowerCase());
        return matched ? [matched] : [];
      });
      const prerequisiteObjectiveIds = normalizeObjectiveIds(namedPrerequisites);
      const retrievalObjectiveId = prerequisiteObjectiveIds.at(-1) ?? previousObjectives.at(-1);
      const estimatedMinutes = boundedLessonMinutes(lesson.estimatedMinutes, lesson.lessonMode);
      const feedbackMode = feedbackModeFor(lesson.practiceType);
      const centralAssessmentId = lessonAssessmentId(objectiveId, "practice");
      const assessmentIds = [centralAssessmentId];
      const evidenceSourceIds = lesson.contentBasis === "verified-source" ? sortedUnique(lesson.sourceIds ?? []) : [];

      lessonPlans.push(canonicalLessonDesignPlanV1({
        version: LESSON_DESIGN_PLAN_VERSION,
        lessonId,
        scopeBudget: {
          version: LESSON_DESIGN_PLAN_VERSION,
          primaryObjectiveId: objectiveId,
          singleWin: textValue(lesson.objective, lesson.concept, `Apply ${lesson.title}.`),
          estimatedMinutes,
          newConceptLimit: lesson.lessonMode === "synthesis" ? 3 : lesson.lessonMode === "practice-lab" ? 1 : 2,
          explanationWordLimit: lesson.contentBasis === "verified-source"
            ? 650
            : Math.max(300, Math.min(700, estimatedMinutes * 32)),
          practiceMinutes: Math.max(3, Math.min(estimatedMinutes - 2, Math.round(estimatedMinutes * 0.55))),
        },
        prerequisites: {
          objectiveIds: prerequisiteObjectiveIds,
          connectionStrategy: prerequisiteObjectiveIds.length
            ? `Retrieve the capability from ${lesson.buildsOn?.join(" and ")} before beginning the new practice.`
            : null,
        },
        retrieval: {
          required: Boolean(retrievalObjectiveId),
          targets: retrievalObjectiveId ? [{
            objectiveId: retrievalObjectiveId,
            mode: lesson.practiceType === "classify" ? "discriminate" : "recall",
            spacing: prerequisiteObjectiveIds.length ? "interleaved" : "spaced",
          }] : [],
        },
        misconception: lesson.misconception ? {
          id: `misconception-${objectiveId.slice("objective-".length)}`,
          statement: lesson.misconception,
          correctionTarget: `Correct the named misconception while demonstrating: ${textValue(lesson.objective, lesson.concept)}.`,
          assessmentStrategy: lesson.lessonMode === "concept"
            ? "prediction-check"
            : lesson.lessonMode === "worked-example"
              ? "worked-correction"
              : "diagnostic-distractor",
          assessmentIds: [centralAssessmentId],
        } : null,
        feedback: {
          mode: feedbackMode,
          timing: "after-commitment",
          assessmentIds,
          criterionIds: feedbackMode === "auto-scored" ? [] : [lessonCriterionId(objectiveId)],
          revisionRequiredOnMiss: true,
          completionEvidence: feedbackMode === "auto-scored" ? "demonstrated" : "attempted",
        },
        resources: {
          status: evidenceSourceIds.length ? "available" : "unavailable",
          evidenceSourceIds,
          furtherReadingIds: [],
          rationale: evidenceSourceIds.length
            ? "Use only the verified evidence assigned to this lesson; optional course reading remains separate from claim support."
            : "No lesson-specific verified resource is required; course creation and learning continue with disclosed model knowledge.",
        },
      }));

      titleToObjective.set(normalizedText(lesson.title).toLowerCase(), objectiveId);
      previousObjectives.push(objectiveId);
    }
  }

  return canonicalLearningDesignData({
    brief: explicitBrief ?? deriveCourseLearningBriefV1(course),
    lessonPlans,
  });
}

export function learningDesignContractIssues(
  value: unknown,
  context: Omit<LessonDesignValidationContext, "knownObjectiveIds" | "objectiveOrder"> & {
    knownObjectiveIds: Iterable<string>;
    objectiveOrder?: Iterable<string>;
  },
) {
  const parsed = learningDesignContractV1Schema.safeParse(value);
  if (!parsed.success) return schemaIssues(parsed.error, "learningDesign");
  return [
    ...courseLearningBriefIssues(parsed.data.brief),
    ...parsed.data.lessonPlans.flatMap((plan) => lessonDesignPlanIssues(plan, context)
      .map((issue) => ({ ...issue, path: `learningDesign.lessonPlans.${plan.lessonId}.${issue.path}` }))),
  ];
}

export class LearningDesignReplanRequiredError extends Error {
  readonly code = "LEARNING_DESIGN_REPLAN_REQUIRED";
  readonly status = 422;
  readonly recovery = "Revise the goal, constraints or available source material in Course Studio, then deliberately submit a new course request. This blocked request will not automatically regenerate or consume another course credit.";

  constructor(readonly issues: LearningDesignIssue[]) {
    super("The learning plan has unresolved blockers. No course was saved from this plan.");
    this.name = "LearningDesignReplanRequiredError";
  }
}

export function assertLearningDesignReady(value: unknown, context: LessonDesignValidationContext) {
  const blockers = learningDesignContractIssues(value, context)
    .filter((issue) => issue.severity === "blocker" || issue.severity === "error");
  if (blockers.length) throw new LearningDesignReplanRequiredError(blockers);
}

function proseWordCount(value: string) {
  return value.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

function promptTokenSimilarity(left: string, right: string) {
  const leftTokens = new Set(left.match(/[\p{L}\p{N}]+/gu) ?? []);
  const rightTokens = new Set(right.match(/[\p{L}\p{N}]+/gu) ?? []);
  if (leftTokens.size < 5 || rightTokens.size < 5) return 0;
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return shared / Math.max(leftTokens.size, rightTokens.size);
}

export function lessonDesignOutputIssues(
  lesson: {
    learningObjective?: string;
    content?: string;
    guidedPractice?: { prompt?: string };
    transferTask?: { prompt?: string; successCriteria?: string[]; criterionIds?: string[] };
    quizzes?: Array<{ assessmentId?: string }>;
    experience?: { type?: string };
  } | null,
  plan: LessonDesignPlanV1,
  options: { preservePlannedObjective?: boolean } = {},
): LearningDesignIssue[] {
  if (!lesson) return [{
    code: "LD_OUTPUT_001",
    severity: "blocker",
    path: "lesson",
    message: "No lesson was returned for its learning-design plan.",
  }];
  const issues: LearningDesignIssue[] = [];
  if (options.preservePlannedObjective
    && normalizedText(lesson.learningObjective ?? "").toLowerCase().replace(/[.!。]+$/u, "")
      !== normalizedText(plan.scopeBudget.singleWin).toLowerCase().replace(/[.!。]+$/u, "")) {
    issues.push({
      code: "LD_REPLAN_001",
      severity: "blocker",
      path: "lesson.learningObjective",
      message: "The planned objective changed. Restore the saved single-win objective, or explicitly replan the linked practice, quizzes, criteria and capstone before generating this lesson. Evidence limits never authorize a silently narrower capability.",
    });
  }
  if (!lesson.learningObjective?.trim() || genericOutcome.test(lesson.learningObjective)) {
    issues.push({
      code: "LD_OUTPUT_001",
      severity: "error",
      path: "lesson.learningObjective",
      message: "The generated lesson must preserve one observable learner capability.",
    });
  }
  const wordCount = proseWordCount(lesson.content ?? "");
  if (wordCount > Math.ceil(plan.scopeBudget.explanationWordLimit * 1.15)) {
    issues.push({
      code: "LD_OUTPUT_001",
      severity: "error",
      path: "lesson.content",
      message: `The explanation uses ${wordCount} words and exceeds the lesson's ${plan.scopeBudget.explanationWordLimit}-word scope budget.`,
    });
  }
  const guidedPrompt = normalizedText(lesson.guidedPractice?.prompt ?? "").toLowerCase();
  const transferPrompt = normalizedText(lesson.transferTask?.prompt ?? "").toLowerCase();
  if (guidedPrompt && transferPrompt
    && (guidedPrompt === transferPrompt || promptTokenSimilarity(guidedPrompt, transferPrompt) >= 0.85)) {
    issues.push({
      code: "LD_OUTPUT_002",
      severity: "error",
      path: "lesson.transferTask.prompt",
      message: "Guided practice and transfer must cooperate without repeating the same assignment.",
    });
  }
  if (plan.misconception?.assessmentStrategy === "prediction-check" && lesson.experience?.type !== "concept") {
    issues.push({
      code: "LD_OUTPUT_002",
      severity: "blocker",
      path: "lesson.experience",
      message: "The planned misconception prediction check requires the concept experience.",
    });
  }
  if (plan.feedback.mode !== "auto-scored" && !(lesson.transferTask?.successCriteria?.length)) {
    issues.push({
      code: "LD_OUTPUT_002",
      severity: "blocker",
      path: "lesson.transferTask.successCriteria",
      message: "Open practice needs explicit criteria for feedback and revision.",
    });
  }
  const boundAssessmentIds = (lesson.quizzes ?? []).flatMap((quiz) => quiz.assessmentId ? [quiz.assessmentId] : []);
  const plannedAssessmentIds = plan.feedback.assessmentIds;
  if (new Set(boundAssessmentIds).size !== boundAssessmentIds.length
    || boundAssessmentIds.length !== plannedAssessmentIds.length
    || plannedAssessmentIds.some((assessmentId) => !boundAssessmentIds.includes(assessmentId))) {
    issues.push({
      code: "LD_FEEDBACK_001",
      severity: "blocker",
      path: "lesson.quizzes.assessmentId",
      message: "Every planned assessment must bind exactly once to a saved quiz.",
    });
  }
  const boundCriterionIds = lesson.transferTask?.criterionIds ?? [];
  const plannedCriterionIds = plan.feedback.criterionIds;
  if (new Set(boundCriterionIds).size !== boundCriterionIds.length
    || boundCriterionIds.length !== plannedCriterionIds.length
    || plannedCriterionIds.some((criterionId) => !boundCriterionIds.includes(criterionId))) {
    issues.push({
      code: "LD_FEEDBACK_001",
      severity: "blocker",
      path: "lesson.transferTask.criterionIds",
      message: "Every planned feedback criterion must bind exactly once to the saved transfer rubric.",
    });
  }
  return issues;
}
