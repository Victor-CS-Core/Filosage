import "server-only";

import type { Course, LessonData } from "@/lib/course-types";
import { curateLessonVisuals } from "@/lib/lesson-visuals";
import { curateLessonInteractions } from "@/lib/lesson-interactions";
import { lessonVisualsEnabled } from "@/lib/feature-flags";
import { normalizeStructuredMarkdown } from "@/lib/markdown";
import { inspectGeneratedContent, sanitizeGeneratedValue } from "@/lib/content-language";
import { isSafePublicSourceUrl } from "@/lib/source-safety";
import { effectiveCourseReviewPolicy } from "@/lib/course-pipeline/review-policy";
import { visualPlanSchema } from "@/lib/course-pipeline/schemas";
import { normalizeSuccessCriteria } from "@/lib/course-criteria";

function structuredText(value: unknown) {
  return typeof value === "string" ? normalizeStructuredMarkdown(value) : "";
}

function guidedPracticeDto(value: unknown): LessonData["guidedPractice"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const practice = value as Record<string, unknown>;
  const prompt = structuredText(practice.prompt);
  const modelAnswer = structuredText(practice.modelAnswer);
  const steps = Array.isArray(practice.steps)
    ? practice.steps.filter((item): item is string => typeof item === "string").map(normalizeStructuredMarkdown)
    : [];
  return prompt && modelAnswer && steps.length ? { prompt, steps, modelAnswer } : undefined;
}

function transferTaskDto(value: unknown): LessonData["transferTask"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const task = value as Record<string, unknown>;
  const prompt = structuredText(task.prompt);
  const modelResponse = structuredText(task.modelResponse);
  const successCriteria = Array.isArray(task.successCriteria)
    ? task.successCriteria.filter((item): item is string => typeof item === "string")
    : [];
  return prompt && modelResponse && successCriteria.length
    ? { prompt, successCriteria, modelResponse }
    : undefined;
}

const RESERVED_EXPERIENCE_TASKS = new Set(["artifactprompt", "successcriteria"]);

function lessonExperienceDto(value: unknown): LessonData["experience"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const experience = value as Record<string, unknown>;
  if (experience.type !== "practice-lab") return experience as LessonData["experience"];

  const brief = structuredText(experience.brief);
  const artifactPrompt = structuredText(experience.artifactPrompt);
  const materials = Array.isArray(experience.materials)
    ? experience.materials.filter((item): item is string => typeof item === "string").map(normalizeStructuredMarkdown)
    : [];
  const tasks = Array.isArray(experience.tasks)
    ? experience.tasks
        .filter((item): item is string => typeof item === "string")
        .map(normalizeStructuredMarkdown)
        .filter((item) => !RESERVED_EXPERIENCE_TASKS.has(item.trim().toLowerCase().replace(/[^a-z]/g, "")))
    : [];
  const successCriteria = Array.isArray(experience.successCriteria)
    ? experience.successCriteria.filter((item): item is string => typeof item === "string").map(normalizeStructuredMarkdown)
    : [];

  return brief && artifactPrompt && materials.length && tasks.length && successCriteria.length
    ? { type: "practice-lab", brief, materials, tasks, artifactPrompt, successCriteria }
    : undefined;
}

export function toCourseDto(value: Record<string, unknown> | Course, canManage = false, canGenerateBanner = canManage): Course {
  const raw = value as Record<string, unknown>;
  const topic = String(raw.topic ?? "");
  const language = typeof raw.language === "string" ? raw.language : "English";
  const repairedForDisplay = inspectGeneratedContent(raw, topic, language).length > 0;
  const safe = sanitizeGeneratedValue(raw, topic, language) as Record<string, unknown>;
  const effectiveManualReviewPolicy = effectiveCourseReviewPolicy(raw as unknown as Parameters<typeof effectiveCourseReviewPolicy>[0]);
  const safeCapstone = safe.capstone && typeof safe.capstone === "object"
    ? safe.capstone as Course["capstone"]
    : undefined;
  return {
    id: typeof safe.id === "string" ? safe.id : undefined,
    courseId: typeof safe.id === "string" ? safe.id : undefined,
    topic,
    mission: typeof safe.mission === "string" ? safe.mission : undefined,
    modules: Array.isArray(safe.modules) ? safe.modules as Course["modules"] : [],
    objectives: Array.isArray(safe.objectives)
      ? safe.objectives.filter((item): item is NonNullable<Course["objectives"]>[number] => {
          if (!item || typeof item !== "object") return false;
          const objective = item as Record<string, unknown>;
          return typeof objective.id === "string"
            && typeof objective.description === "string"
            && ["course", "module", "lesson"].includes(String(objective.level))
            && typeof objective.required === "boolean";
        })
      : undefined,
    authorName: typeof safe.authorName === "string" ? safe.authorName : undefined,
    isPublic: raw.isPublic === true,
    level: raw.level as Course["level"],
    estimatedMinutes: typeof raw.estimatedMinutes === "number" ? raw.estimatedMinutes : undefined,
    outcome: typeof safe.outcome === "string" ? safe.outcome : undefined,
    prerequisites: Array.isArray(safe.prerequisites) ? safe.prerequisites.filter((item): item is string => typeof item === "string") : undefined,
    category: typeof safe.category === "string" ? safe.category : undefined,
    audience: typeof safe.audience === "string" ? safe.audience : undefined,
    language,
    pipelineStage: canManage && ["draft", "planning", "generating", "enriching", "validating", "needs_repair", "repairing", "ready_to_publish", "publishing", "published", "manual_review", "failed"].includes(String(raw.pipelineStage ?? ""))
      ? raw.pipelineStage as Course["pipelineStage"]
      : undefined,
    pipelineStageUpdatedAt: canManage && typeof raw.pipelineStageUpdatedAt === "string" ? raw.pipelineStageUpdatedAt : undefined,
    publishedReleaseId: canManage && typeof raw.publishedReleaseId === "string" ? raw.publishedReleaseId : undefined,
    freshnessRequired: raw.freshnessRequired === true,
    manualReviewPolicy: canManage ? effectiveManualReviewPolicy : undefined,
    manualReviewResolution: canManage
      && raw.manualReviewResolution
      && typeof raw.manualReviewResolution === "object"
      && ["approved", "rejected"].includes(String((raw.manualReviewResolution as Record<string, unknown>).status))
      && typeof (raw.manualReviewResolution as Record<string, unknown>).snapshotHash === "string"
      && typeof (raw.manualReviewResolution as Record<string, unknown>).contractVersion === "string"
      && typeof (raw.manualReviewResolution as Record<string, unknown>).reason === "string"
      && typeof (raw.manualReviewResolution as Record<string, unknown>).reviewedAt === "string"
      && typeof (raw.manualReviewResolution as Record<string, unknown>).reviewId === "string"
      ? {
          status: (raw.manualReviewResolution as Record<string, unknown>).status as "approved" | "rejected",
          snapshotHash: String((raw.manualReviewResolution as Record<string, unknown>).snapshotHash),
          contractVersion: String((raw.manualReviewResolution as Record<string, unknown>).contractVersion),
          reason: String((raw.manualReviewResolution as Record<string, unknown>).reason),
          reviewedAt: String((raw.manualReviewResolution as Record<string, unknown>).reviewedAt),
          reviewId: String((raw.manualReviewResolution as Record<string, unknown>).reviewId),
          verifiedSourceIds: Array.isArray((raw.manualReviewResolution as Record<string, unknown>).verifiedSourceIds)
            ? ((raw.manualReviewResolution as Record<string, unknown>).verifiedSourceIds as unknown[]).map(String)
            : undefined,
        }
      : undefined,
    artifact: safe.artifact && typeof safe.artifact === "object"
      ? safe.artifact as Course["artifact"]
      : undefined,
    scenario: safe.scenario && typeof safe.scenario === "object"
      ? safe.scenario as Course["scenario"]
      : undefined,
    sourcePack: Array.isArray(safe.sourcePack)
      ? safe.sourcePack.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const source = item as Record<string, unknown>;
          if (typeof source.id !== "string" || typeof source.label !== "string") return [];
          const kind = ["primary", "official", "licensed", "author-provided"].includes(String(source.kind))
            ? source.kind as NonNullable<Course["sourcePack"]>[number]["kind"]
            : "author-provided";
          const rights = ["link-only", "public-domain", "licensed", "author-owned"].includes(String(source.rights))
            ? source.rights as NonNullable<Course["sourcePack"]>[number]["rights"]
            : "link-only";
          return [{
            id: source.id,
            label: source.label,
            url: typeof source.url === "string" && isSafePublicSourceUrl(source.url) ? source.url : undefined,
            kind,
            rights,
          }];
        })
      : undefined,
    banner: raw.banner
      && typeof raw.banner === "object"
      && typeof (raw.banner as Record<string, unknown>).assetId === "string"
      && /^[a-f0-9]{32}$/.test(String((raw.banner as Record<string, unknown>).assetId))
      && (raw.banner as Record<string, unknown>).version === 1
      ? {
          assetId: String((raw.banner as Record<string, unknown>).assetId),
          version: 1,
          generatedAt: typeof (raw.banner as Record<string, unknown>).generatedAt === "string"
            ? String((raw.banner as Record<string, unknown>).generatedAt)
            : undefined,
        }
      : undefined,
    canRegenerateBanner: canManage ? canGenerateBanner : undefined,
    generatedLessonIds: canManage && Array.isArray(raw.generatedLessonIds)
      ? raw.generatedLessonIds.map(String)
      : undefined,
    moderationStatus: canManage && (raw.moderationStatus === "approved" || raw.moderationStatus === "quarantined")
      ? raw.moderationStatus
      : undefined,
    publicationReview: raw.publicationReview
      && typeof raw.publicationReview === "object"
      && ["approved", "owner_override"].includes(String((raw.publicationReview as Record<string, unknown>).status))
      ? {
          status: (raw.publicationReview as Record<string, unknown>).status as "approved" | "owner_override",
          reviewedAt: typeof (raw.publicationReview as Record<string, unknown>).reviewedAt === "string"
            ? String((raw.publicationReview as Record<string, unknown>).reviewedAt)
            : undefined,
          moderationModel: typeof (raw.publicationReview as Record<string, unknown>).moderationModel === "string"
            ? String((raw.publicationReview as Record<string, unknown>).moderationModel)
            : undefined,
          reviewVersion: typeof (raw.publicationReview as Record<string, unknown>).reviewVersion === "string"
            ? String((raw.publicationReview as Record<string, unknown>).reviewVersion)
            : undefined,
          safetyReviewBasis: typeof (raw.publicationReview as Record<string, unknown>).safetyReviewBasis === "string"
            ? String((raw.publicationReview as Record<string, unknown>).safetyReviewBasis)
            : undefined,
          factualReviewStatus: (raw.publicationReview as Record<string, unknown>).factualReviewStatus === "unverified"
            ? "unverified"
            : undefined,
        }
      : undefined,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    schemaVersion: typeof raw.schemaVersion === "number" ? raw.schemaVersion : undefined,
    capstone: safeCapstone
      ? { ...safeCapstone, successCriteria: normalizeSuccessCriteria(safeCapstone.successCriteria) }
      : undefined,
    aiAssisted: raw.aiAssisted === true
      || (typeof raw.id === "string" && !raw.id.startsWith("catalog-")),
    canManage,
    contentIntegrity: repairedForDisplay ? { repairedForDisplay: true } : undefined,
  };
}

export function toLessonDto(value: Record<string, unknown>, courseAiAssisted = false, topic = "", instructionLanguage = "English"): LessonData {
  const safeValue = sanitizeGeneratedValue(value, topic, instructionLanguage) as Record<string, unknown>;
  value = safeValue;
  const visualPlan = visualPlanSchema.safeParse(value.visualPlan);
  const rawSources = Array.isArray(value.sourceReferences)
    ? value.sourceReferences.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
  return {
    content: String(value.content ?? ""),
    quizzes: Array.isArray(value.quizzes) ? value.quizzes as LessonData["quizzes"] : [],
    lessonKind: ["substantive", "introduction", "review", "glossary", "reference", "capstone"].includes(String(value.lessonKind ?? ""))
      ? value.lessonKind as LessonData["lessonKind"]
      : undefined,
    learningObjective: typeof value.learningObjective === "string" ? value.learningObjective : undefined,
    objectiveIds: Array.isArray(value.objectiveIds) ? value.objectiveIds.map(String) : undefined,
    connection: typeof value.connection === "string" ? value.connection : undefined,
    keyTakeaways: Array.isArray(value.keyTakeaways)
      ? value.keyTakeaways.filter((item): item is string => typeof item === "string")
      : undefined,
    experience: lessonExperienceDto(value.experience),
    visuals: lessonVisualsEnabled() || typeof value.visualPolicyVersion === "string" ? curateLessonVisuals(value.visuals) : [],
    visualPlan: visualPlan.success ? visualPlan.data : undefined,
    interactions: curateLessonInteractions(value.interactions),
    guidedPractice: guidedPracticeDto(value.guidedPractice),
    transferTask: transferTaskDto(value.transferTask),
    aiAssisted: value.aiAssisted === true || courseAiAssisted,
    provenance: {
      contentVersion: `lesson-v${typeof value.schemaVersion === "number" ? value.schemaVersion : 1}`,
      generatedAt: typeof value.generatedAt === "string"
        ? value.generatedAt
        : typeof value.createdAt === "string"
          ? value.createdAt
          : undefined,
      generationModel: typeof value.generationModel === "string" ? value.generationModel : undefined,
      promptVersion: typeof value.promptVersion === "string" ? value.promptVersion : undefined,
      qualityGateVersion: typeof value.qualityGateVersion === "string" ? value.qualityGateVersion : undefined,
      interactionQualityGateVersion: typeof value.interactionQualityGateVersion === "string" ? value.interactionQualityGateVersion : undefined,
      qualityContractVersion: typeof value.qualityContractVersion === "string" ? value.qualityContractVersion : undefined,
      repairPromptVersion: typeof value.repairPromptVersion === "string" ? value.repairPromptVersion : undefined,
      repairPromptStatus: value.repairPromptStatus === "executed" || value.repairPromptStatus === "not_executed" ? value.repairPromptStatus : undefined,
      semanticEvaluatorVersion: typeof value.semanticEvaluatorVersion === "string" ? value.semanticEvaluatorVersion : undefined,
      semanticEvaluatorStatus: value.semanticEvaluatorStatus === "executed" || value.semanticEvaluatorStatus === "not_executed" ? value.semanticEvaluatorStatus : undefined,
      generationProvider: typeof value.generationProvider === "string" ? value.generationProvider : undefined,
      labRegistryVersion: typeof value.labRegistryVersion === "string" ? value.labRegistryVersion : undefined,
      visualPolicyVersion: typeof value.visualPolicyVersion === "string" ? value.visualPolicyVersion : undefined,
      sourcePolicyVersion: typeof value.sourcePolicyVersion === "string" ? value.sourcePolicyVersion : undefined,
      sources: rawSources.flatMap((item) => {
        if (typeof item.label !== "string") return [];
        return [{
          label: item.label,
          url: typeof item.url === "string" && isSafePublicSourceUrl(item.url) ? item.url : undefined,
        }];
      }),
    },
  };
}
