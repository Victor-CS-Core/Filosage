import "server-only";

import type { Course, CourseSource, LessonData } from "@/lib/course-types";
import { curateLessonVisuals } from "@/lib/lesson-visuals";
import { curateLessonInteractions } from "@/lib/lesson-interactions";
import { lessonVisualsEnabled } from "@/lib/feature-flags";
import { normalizeStructuredMarkdown } from "@/lib/markdown";
import { sanitizeGeneratedValue } from "@/lib/content-language";
import { isSafePublicSourceUrl, sourceReviewForCourse } from "@/lib/source-safety";
import { effectiveCourseReviewPolicy } from "@/lib/course-pipeline/review-policy";
import { visualPlanSchema } from "@/lib/course-pipeline/schemas";
import { normalizeSuccessCriteria } from "@/lib/course-criteria";
import { bibliographicReferenceSchema } from "@/lib/bibliographic-references";
import { isServerClassifiedResearchSource } from "@/lib/source-research";
import { buildPublicLearningDesignSummaryV1, learningDesignContractV1Schema, lessonDesignPlanV1Schema } from "@/lib/learning-design";

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
  const successCriteria = normalizeSuccessCriteria(task.successCriteria).map(normalizeStructuredMarkdown);
  const criterionIds = Array.isArray(task.criterionIds)
    ? task.criterionIds.filter((item): item is string => typeof item === "string" && /^criterion-[a-z0-9-]{1,80}$/.test(item))
    : [];
  return prompt && modelResponse && successCriteria.length
    ? { prompt, successCriteria, modelResponse, criterionIds }
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
  const successCriteria = normalizeSuccessCriteria(experience.successCriteria).map(normalizeStructuredMarkdown);

  return brief && artifactPrompt && materials.length && tasks.length && successCriteria.length
    ? { type: "practice-lab", brief, materials, tasks, artifactPrompt, successCriteria }
    : undefined;
}

export function toCourseDto(value: Record<string, unknown> | Course, canManage = false): Course {
  const raw = value as Record<string, unknown>;
  const topic = String(raw.topic ?? "");
  const language = typeof raw.language === "string" ? raw.language : "English";
  const safe = sanitizeGeneratedValue(raw, topic, language) as Record<string, unknown>;
  // Language mismatch is a generation/review finding, not a display repair.
  const repairedForDisplay = JSON.stringify(safe) !== JSON.stringify(raw);
  const effectiveManualReviewPolicy = effectiveCourseReviewPolicy(raw as unknown as Parameters<typeof effectiveCourseReviewPolicy>[0]);
  const safeCapstone = safe.capstone && typeof safe.capstone === "object"
    ? safe.capstone as Course["capstone"]
    : undefined;
  const layeredEvidence = typeof raw.sourcePolicyVersion === "string" && raw.sourcePolicyVersion.startsWith("source-integrity-v5.");
  const outlinedLessons = Array.isArray(safe.modules)
    ? (safe.modules as Course["modules"]).flatMap((courseModule) => courseModule.lessons)
    : [];
  const verifiedLessonCount = outlinedLessons.filter((lesson) => lesson.contentBasis === "verified-source").length;
  const modelKnowledgeLessonCount = outlinedLessons.length - verifiedLessonCount;
  const currentResearchSources = Array.isArray(safe.sourcePack)
    ? safe.sourcePack.filter((source): source is CourseSource => Boolean(source)
      && typeof source === "object"
      && isServerClassifiedResearchSource(source as CourseSource))
    : [];
  const authorityFamilyCount = new Set(currentResearchSources.flatMap((source) => source.authorityFamily ? [source.authorityFamily] : [])).size;
  const derivedEvidenceMode = verifiedLessonCount === 0
    ? "model-knowledge" as const
    : modelKnowledgeLessonCount > 0 || currentResearchSources.length < 2 || authorityFamilyCount < 2
      ? "hybrid" as const
      : "fully-grounded" as const;
  const learningDesign = learningDesignContractV1Schema.safeParse(raw.learningDesign);
  const publicLearningDesignSummary = learningDesign.success
    ? buildPublicLearningDesignSummaryV1({
        topic,
        outcome: typeof safe.outcome === "string" ? safe.outcome : undefined,
        mission: typeof safe.mission === "string" ? safe.mission : undefined,
        estimatedMinutes: typeof safe.estimatedMinutes === "number" ? safe.estimatedMinutes : undefined,
        artifact: safe.artifact && typeof safe.artifact === "object" ? safe.artifact as Course["artifact"] : undefined,
        capstone: safeCapstone,
        modules: Array.isArray(safe.modules) ? safe.modules as Course["modules"] : [],
      }, learningDesign.data)
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
    learningDesignSummary: publicLearningDesignSummary,
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
          proofToken: typeof (raw.manualReviewResolution as Record<string, unknown>).proofToken === "string"
            && /^[a-f0-9]{64}$/.test(String((raw.manualReviewResolution as Record<string, unknown>).proofToken))
            ? String((raw.manualReviewResolution as Record<string, unknown>).proofToken) : undefined,
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
          if (layeredEvidence && !isServerClassifiedResearchSource(source as unknown as CourseSource)) return [];
          if (typeof source.id !== "string" || typeof source.label !== "string") return [];
          const kind = ["primary", "official", "licensed", "author-provided"].includes(String(source.kind))
            ? source.kind as NonNullable<Course["sourcePack"]>[number]["kind"]
            : "author-provided";
          const rights = ["link-only", "public-domain", "licensed", "author-owned"].includes(String(source.rights))
            ? source.rights as NonNullable<Course["sourcePack"]>[number]["rights"]
            : "link-only";
          const review = sourceReviewForCourse(raw as unknown as Course, source.id);
          return [{
            id: source.id,
            label: source.label,
            url: typeof source.url === "string" && isSafePublicSourceUrl(source.url) ? source.url : undefined,
            kind,
            rights,
            author: typeof source.author === "string" ? source.author : undefined,
            publisher: typeof source.publisher === "string" ? source.publisher : undefined,
            publicationDate: typeof source.publicationDate === "string" ? source.publicationDate : undefined,
            accessedAt: typeof source.accessedAt === "string" ? source.accessedAt : undefined,
            origin: source.origin === "web-search" || source.origin === "creator" ? source.origin : undefined,
            authorityClass: ["government", "intergovernmental", "standards", "scholarly"].includes(String(source.authorityClass))
              ? source.authorityClass as NonNullable<Course["sourcePack"]>[number]["authorityClass"]
              : undefined,
            evidenceType: ["primary-study", "systematic-review", "official-guidance", "standard", "official-dataset"].includes(String(source.evidenceType))
              ? source.evidenceType as NonNullable<Course["sourcePack"]>[number]["evidenceType"]
              : undefined,
            qualityTier: source.qualityTier === "vetted" ? "vetted" as const : undefined,
            citationVerified: source.citationVerified === true,
            researchPolicyVersion: typeof source.researchPolicyVersion === "string" ? source.researchPolicyVersion : undefined,
            retrievedAt: typeof source.retrievedAt === "string" ? source.retrievedAt : undefined,
            publicationStatus: source.publicationStatus === "released" ? "released" as const : undefined,
            statusCheck: source.statusCheck === "released-no-withdrawal-found" ? "released-no-withdrawal-found" as const : undefined,
            ...review,
          }];
        })
      : undefined,
    furtherReading: Array.isArray(raw.furtherReading)
      ? raw.furtherReading.flatMap((item) => {
          const parsed = bibliographicReferenceSchema.safeParse(item);
          if (!parsed.success) return [];
          const reference = parsed.data;
          return [{
            id: reference.id,
            policyVersion: reference.policyVersion,
            role: reference.role,
            claimEvidence: false as const,
            contentVerified: reference.contentVerified,
            materialType: reference.materialType,
            title: reference.title,
            containerTitle: reference.containerTitle,
            contributors: reference.contributors,
            edition: reference.edition,
            publisher: reference.publisher,
            publicationYear: reference.publicationYear,
            language: reference.language,
            identifiers: reference.identifiers,
            catalogUrl: reference.catalogUrl,
            verificationLabel: "catalog-metadata-verified" as const,
          }];
        })
      : undefined,
    evidenceProfile: safe.evidenceProfile && typeof safe.evidenceProfile === "object"
      ? (() => {
          const profile = safe.evidenceProfile as Record<string, unknown>;
          const researchOutcome = ["complete", "partial", "unavailable"].includes(String(profile.researchOutcome))
            ? profile.researchOutcome as NonNullable<Course["evidenceProfile"]>["researchOutcome"]
            : undefined;
          return researchOutcome
            && [profile.verifiedSourceCount, profile.verifiedLessonCount, profile.modelKnowledgeLessonCount, profile.bibliographicReferenceCount]
              .every((value) => typeof value === "number" && Number.isInteger(value) && value >= 0)
            && typeof profile.generatedAt === "string"
            && typeof profile.provider === "string"
            && typeof profile.model === "string"
            && typeof profile.policyVersion === "string"
            ? {
                mode: derivedEvidenceMode,
                researchOutcome,
                verifiedSourceCount: currentResearchSources.length,
                verifiedLessonCount,
                modelKnowledgeLessonCount,
                bibliographicReferenceCount: Array.isArray(raw.furtherReading)
                  ? raw.furtherReading.filter((item) => bibliographicReferenceSchema.safeParse(item).success).length
                  : 0,
                fallbackReasonCodes: Array.isArray(profile.fallbackReasonCodes)
                  ? profile.fallbackReasonCodes.filter((value): value is string => typeof value === "string" && /^[a-z0-9-]{1,80}$/.test(value))
                  : [],
                coverageWarnings: Array.isArray(profile.coverageWarnings)
                  ? profile.coverageWarnings.filter((value): value is string => typeof value === "string" && value.length <= 400)
                  : [],
                generatedAt: profile.generatedAt,
                provider: profile.provider,
                model: profile.model,
                policyVersion: profile.policyVersion,
              }
            : undefined;
        })()
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

export function toLessonDto(
  value: Record<string, unknown>,
  courseAiAssisted = false,
  topic = "",
  instructionLanguage = "English",
  sourceReviewCourse?: Course,
): LessonData {
  const safeValue = sanitizeGeneratedValue(value, topic, instructionLanguage) as Record<string, unknown>;
  value = safeValue;
  const visualPlan = visualPlanSchema.safeParse(value.visualPlan);
  const lessonDesign = lessonDesignPlanV1Schema.safeParse(value.lessonDesign);
  const modelKnowledgeLesson = value.contentBasis === "model-knowledge"
    && typeof value.sourcePolicyVersion === "string"
    && value.sourcePolicyVersion.startsWith("source-integrity-v5.");
  const rawSources = !modelKnowledgeLesson && Array.isArray(value.sourceReferences)
    ? value.sourceReferences.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
  const sourceIds = new Set(rawSources.flatMap((item) => typeof item.id === "string" ? [item.id] : []));
  const citations = !modelKnowledgeLesson && Array.isArray(value.citations)
    ? value.citations.flatMap((item, index) => {
        if (!item || typeof item !== "object") return [];
        const citation = item as Record<string, unknown>;
        if (typeof citation.sourceId !== "string"
          || !sourceIds.has(citation.sourceId)
          || typeof citation.claim !== "string"
          || !["learning_objective", "connection", "content", "key_takeaway", "experience", "guided_practice", "transfer_task", "visual", "interaction", "quiz", "quiz_explanation"].includes(String(citation.section))) {
          return [];
        }
        return [{
          id: typeof citation.id === "string" ? citation.id : `citation-${index + 1}`,
          sourceId: citation.sourceId,
          claim: normalizeStructuredMarkdown(citation.claim),
          section: citation.section as NonNullable<LessonData["citations"]>[number]["section"],
          locator: typeof citation.locator === "string" ? normalizeStructuredMarkdown(citation.locator) : undefined,
          objectiveIds: Array.isArray(citation.objectiveIds) ? citation.objectiveIds.map(String) : undefined,
          supportStatus: citation.supportStatus === "supported" ? "supported" as const : undefined,
          supportEvaluatorVersion: typeof citation.supportEvaluatorVersion === "string" ? citation.supportEvaluatorVersion : undefined,
          supportedAt: typeof citation.supportedAt === "string" ? citation.supportedAt : undefined,
          ...sourceReviewForCourse(sourceReviewCourse, citation.sourceId),
        }];
      })
    : [];
  return {
    content: String(value.content ?? ""),
    quizzes: Array.isArray(value.quizzes) ? value.quizzes as LessonData["quizzes"] : [],
    contentBasis: value.contentBasis === "verified-source" || value.contentBasis === "model-knowledge"
      ? value.contentBasis
      : undefined,
    lessonKind: ["substantive", "introduction", "review", "glossary", "reference", "capstone"].includes(String(value.lessonKind ?? ""))
      ? value.lessonKind as LessonData["lessonKind"]
      : undefined,
    learningObjective: typeof value.learningObjective === "string" ? value.learningObjective : undefined,
    objectiveIds: Array.isArray(value.objectiveIds) ? value.objectiveIds.map(String) : undefined,
    lessonDesign: lessonDesign.success ? lessonDesign.data : undefined,
    connection: typeof value.connection === "string" ? value.connection : undefined,
    keyTakeaways: Array.isArray(value.keyTakeaways)
      ? value.keyTakeaways.filter((item): item is string => typeof item === "string")
      : undefined,
    experience: lessonExperienceDto(value.experience),
    visuals: lessonVisualsEnabled() || typeof value.visualPolicyVersion === "string" ? curateLessonVisuals(value.visuals) : [],
    visualPlan: visualPlan.success ? visualPlan.data : undefined,
    interactions: curateLessonInteractions(value.interactions),
    citations,
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
      learningDesignContractVersion: typeof value.learningDesignContractVersion === "string"
        ? value.learningDesignContractVersion
        : undefined,
      contentBasis: value.contentBasis === "verified-source" || value.contentBasis === "model-knowledge"
        ? value.contentBasis
        : undefined,
      claimSupportEvaluatorVersion: typeof value.claimSupportEvaluatorVersion === "string" ? value.claimSupportEvaluatorVersion : undefined,
      claimSupportEvaluatorStatus: ["executed", "not_executed", "not_applicable"].includes(String(value.claimSupportEvaluatorStatus))
        ? value.claimSupportEvaluatorStatus as NonNullable<LessonData["provenance"]>["claimSupportEvaluatorStatus"]
        : undefined,
      sources: rawSources.flatMap((item) => {
        if (typeof item.label !== "string") return [];
        const sourceId = typeof item.id === "string" ? item.id : undefined;
        return [{
          id: sourceId,
          label: item.label,
          url: typeof item.url === "string" && isSafePublicSourceUrl(item.url) ? item.url : undefined,
          author: typeof item.author === "string" ? item.author : undefined,
          publisher: typeof item.publisher === "string" ? item.publisher : undefined,
          publicationDate: typeof item.publicationDate === "string" ? item.publicationDate : undefined,
          accessedAt: typeof item.accessedAt === "string" ? item.accessedAt : undefined,
          kind: ["primary", "official", "licensed", "author-provided"].includes(String(item.kind))
            ? item.kind as NonNullable<LessonData["provenance"]>["sources"][number]["kind"]
            : undefined,
          rights: ["link-only", "public-domain", "licensed", "author-owned"].includes(String(item.rights))
            ? item.rights as NonNullable<LessonData["provenance"]>["sources"][number]["rights"]
            : undefined,
          origin: item.origin === "web-search" || item.origin === "creator" ? item.origin : undefined,
          authorityClass: ["government", "intergovernmental", "standards", "scholarly"].includes(String(item.authorityClass))
            ? item.authorityClass as NonNullable<LessonData["provenance"]>["sources"][number]["authorityClass"]
            : undefined,
          evidenceType: ["primary-study", "systematic-review", "official-guidance", "standard", "official-dataset"].includes(String(item.evidenceType))
            ? item.evidenceType as NonNullable<LessonData["provenance"]>["sources"][number]["evidenceType"]
            : undefined,
          qualityTier: item.qualityTier === "vetted" ? "vetted" as const : undefined,
          citationVerified: item.citationVerified === true,
          researchPolicyVersion: typeof item.researchPolicyVersion === "string" ? item.researchPolicyVersion : undefined,
          retrievedAt: typeof item.retrievedAt === "string" ? item.retrievedAt : undefined,
          publicationStatus: item.publicationStatus === "released" ? "released" as const : undefined,
          statusCheck: item.statusCheck === "released-no-withdrawal-found" ? "released-no-withdrawal-found" as const : undefined,
          ...(sourceId ? sourceReviewForCourse(sourceReviewCourse, sourceId) : { reviewStatus: "unreviewed" as const }),
        }];
      }),
      citations,
    },
  };
}
