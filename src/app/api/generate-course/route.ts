import { NextResponse } from "next/server";
import { aiClient } from "@/lib/local-ai";
import { zodTextFormat } from "openai/helpers/zod";
import { authorizationResponse, requirePlanCapability } from "@/lib/auth-server";
import { createCourse, getCourse, updateCourseBanner } from "@/lib/firebase-server";
import {
  AiQuotaError,
  aiQuotaResponse,
  extractOpenAiUsage,
  finalizeAiUsage,
  reserveAiUsage,
  type AiReservation,
} from "@/lib/ai-usage";
import { toCourseDto } from "@/lib/course-dto";
import {
  courseOutlineSchema,
  courseRequestSchema,
  validationMessage,
} from "@/lib/validation";
import { AI_SAFETY_POLICY, assertSafeContent, ContentSafetyError } from "@/lib/content-safety";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { openAiSafetyIdentifier } from "@/lib/ai-usage";
import { createOrReuseCourseBanner } from "@/lib/course-banners";
import { summarizeAiUsage, type AiUsageSample } from "@/lib/ai-pricing";
import { inspectGeneratedContent, languagePolicyInstruction } from "@/lib/content-language";
import { courseQualityIssues, COURSE_QUALITY_GATE_VERSION } from "@/lib/course-quality";
import { outlineSourceAssignmentIssues, sourcePackPromptBlock } from "@/lib/source-safety";
import {
  aiUsageProfileMetadata,
  openAiExecutionProfile,
  type AiExecutionProfile,
} from "@/lib/openai-generation";
import { safeModelErrorDetails } from "@/lib/model-fallback";
import {
  completeCourseCapacityReservation,
  courseCapacityClaimId,
  CourseCapacityError,
  releaseCourseCapacityReservation,
  reserveCourseCapacity,
  type CourseCapacityReservation,
} from "@/lib/membership-access";
import { COURSE_ARTIFACT_PROVENANCE_DEFAULTS } from "@/lib/course-pipeline/contract";
import { courseReviewPolicyForBrief } from "@/lib/course-pipeline/review-policy";
import { coursePipelineFeatureFlags } from "@/lib/feature-flags";
import { withCourseObjectiveRelationships } from "@/lib/course-pipeline/relationships";
import { recordCoursePipelineEvent } from "@/lib/course-pipeline/observability";

export async function POST(request: Request) {
  let pipelineFlags = coursePipelineFeatureFlags();
  let profileOptions = { coursePipelineV2: pipelineFlags.pipelineV2 };
  let standardProfile = openAiExecutionProfile("course.standard", undefined, profileOptions);
  let repairProfile: AiExecutionProfile;
  let recoveryProfile: AiExecutionProfile;
  let reservation: AiReservation | null = null;
  let bannerReservation: AiReservation | null = null;
  let observedUsage = { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
  let observedUsageSamples: AiUsageSample[] | null = null;
  let responseId: string | undefined;
  let capacityReservation: CourseCapacityReservation | null = null;
  let pipelineCorrelationId: string | undefined;
  let pipelineActorHash: string | undefined;
  try {
    const account = await requirePlanCapability(request, "create_course");
    pipelineFlags = coursePipelineFeatureFlags(account);
    profileOptions = { coursePipelineV2: pipelineFlags.pipelineV2 };
    standardProfile = openAiExecutionProfile("course.standard", undefined, profileOptions);
    repairProfile = openAiExecutionProfile("course.repair", undefined, profileOptions);
    recoveryProfile = openAiExecutionProfile("course.recovery", undefined, profileOptions);
    const body = await readJsonBody(request, 16_384);
    const parsedRequest = courseRequestSchema.safeParse(body);
    if (!parsedRequest.success) {
      return NextResponse.json(
        { error: validationMessage(parsedRequest.error) },
        { status: 400 },
      );
    }

    const {
      topic, goal, application, background, level, weeklyMinutes, targetWeeks, courseStyle,
      artifactPreference, scenarioPreference, sourcePack: requestedSourcePack,
      language, freshnessRequired,
    } = parsedRequest.data;
    const accessedAt = new Date().toISOString().slice(0, 10);
    const sourcePack = requestedSourcePack.map((source) => ({
      ...source,
      accessedAt: source.url ? accessedAt : undefined,
    }));
    const studyBudget = (weeklyMinutes ?? 120) * targetWeeks;
    const approach = courseStyle === "Concept-first"
      ? "Prioritize precise conceptual foundations and connected explanations before applied practice."
      : courseStyle === "Project-led"
        ? "Organize the sequence around a concrete applied result while preserving prerequisite order."
        : "Balance clear explanations, worked examples, retrieval, and application throughout the course.";
    const client = aiClient();
    const safetyIdentifier = await openAiSafetyIdentifier(account.uid);
    pipelineActorHash = safetyIdentifier;
    const idempotencyKey = request.headers.get("idempotency-key");
    if (idempotencyKey && idempotencyKey.length >= 12 && idempotencyKey.length <= 200) {
      capacityReservation = await reserveCourseCapacity(
        account,
        await courseCapacityClaimId(account.uid, idempotencyKey),
      );
    }
    reservation = await reserveAiUsage(
      account,
      "course_outline",
      idempotencyKey,
      await courseCapacityClaimId(account.uid, JSON.stringify(parsedRequest.data)),
      { allowCompletedReplay: true },
    );
    pipelineCorrelationId = reservation.requestId;
    if (pipelineFlags.pipelineV2) {
      await recordCoursePipelineEvent({
        event: "course_pipeline_started",
        correlationId: pipelineCorrelationId,
        courseId: reservation.requestId,
        actorHash: safetyIdentifier,
        stage: "planning",
        outcome: "started",
        promptVersion: standardProfile.promptVersion,
        model: standardProfile.model,
        featureFlags: pipelineFlags,
      });
    }
    const recoveredCourse = await getCourse(reservation.requestId);
    if (recoveredCourse && recoveredCourse.authorId === account.uid) {
      await completeCourseCapacityReservation(capacityReservation, recoveredCourse.id);
      await finalizeAiUsage(reservation, {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        model: standardProfile.model,
        ...aiUsageProfileMetadata(standardProfile),
        resultId: recoveredCourse.id,
      });
      reservation = null;
      return NextResponse.json({
        ...toCourseDto(recoveredCourse, true),
        courseId: recoveredCourse.id,
        recovered: true,
      });
    }
    if (reservation.recovered) {
      await releaseCourseCapacityReservation(capacityReservation);
      capacityReservation = null;
      reservation = null;
      return NextResponse.json(
        { error: "The original request completed, but its saved course could not be reopened.", code: "IDEMPOTENCY_RESULT_MISSING" },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    await assertSafeContent(
      client,
      [topic, goal, application, background, artifactPreference, scenarioPreference, ...sourcePack.flatMap((source) => [source.label, source.note ?? "", source.url ?? ""])].filter(Boolean).join("\n"),
      { uid: account.uid, feature: "course_outline", stage: "input" },
    );
    const outlineInput = [
        `Create a complete but efficient course outline for: ${topic}`,
        goal ? `Learner's observable goal: ${goal}` : "",
        application ? `Where the learner will apply it: ${application}` : "",
        background ? `Current background: ${background}` : "",
        level ? `Requested starting level: ${level}` : "",
        `Target plan: ${targetWeeks} weeks at ${weeklyMinutes ?? 120} minutes per week, approximately ${studyBudget} minutes total. Keep the estimated course time close to this budget rather than padding the outline.`,
        `Teaching approach: ${courseStyle}. ${approach}`,
        `Course language: ${language}. Use other languages only when the learning objective explicitly requires them.`,
        freshnessRequired ? "Freshness is required. Clearly date current claims and rely only on the supplied evidence; do not invent current facts." : "",
        artifactPreference ? `Preferred real-world artifact: ${artifactPreference}` : "Choose one concrete professional artifact that can demonstrate the course outcome.",
        scenarioPreference ? `Scenario spine: ${scenarioPreference}` : "Choose one realistic scenario that can develop across modules without inventing factual claims.",
        sourcePackPromptBlock(sourcePack, "No source pack was provided. Do not invent citations or imply external verification."),
        sourcePack.length
          ? "For each lesson, return sourceIds containing only supplied source IDs with safe HTTPS links that directly support that lesson. Use an empty array when no supplied source supports it. Never assign a source from its title or URL alone; its supplied note must support the planned use."
          : "Return sourceIds: [] for every lesson.",
        "Use concept and worked-example lessons early, guided practice in the middle, and case, lab, or synthesis work when the learner has enough prerequisite knowledge.",
        "Module challenges and the capstone must be assessable from their success criteria. Adapt examples and practice to the learner's intended application.",
      ].filter(Boolean).join("\n");
    const generateOutline = (profile: AiExecutionProfile, repairIssues: string[] = []) => client.responses.parse({
      model: profile.model,
      store: false,
      instructions:
        `Act as an instructional designer. Build a guided apprenticeship, not a collection of standalone articles. Start with a concrete artifact and one realistic scenario spine. Every module must produce an inspectable milestone that advances that artifact, and every lesson must state the activity the learner will perform and its contribution to the artifact. Sequence prerequisite knowledge explicitly. Give every module one observable objective and an applied challenge. Give every lesson one observable objective, the lesson titles it builds on, a specific misconception to correct, a suitable teaching mode, an appropriate practice type, and a clear mastery criterion. Vary lesson modes intentionally so the course does not repeat one template. End with a capstone that directly demonstrates the course outcome. Include the intended audience, a realistic level, total learning time, prerequisites, category, and estimated time for every lesson. Richness must come from prediction, explanation, classification, comparison, decision, creation, critique, or defense, not longer prose. Keep lessons tightly scoped and free of filler. Use plain, specific instructional language without promotional claims, motivational slogans, vague abstractions, invented citations, or repetitive phrasing. Use the term course, not learning path. Return the requested structured course only.\n\n${languagePolicyInstruction(topic, language)}\n\n${AI_SAFETY_POLICY}`,
      input: repairIssues.length
        ? `${outlineInput}\n\nThe previous draft failed the content-integrity gate. Produce a clean replacement and correct every issue:\n- ${repairIssues.join("\n- ")}`
        : outlineInput,
      reasoning: { effort: profile.reasoningEffort },
      text: {
        format: zodTextFormat(courseOutlineSchema, "course_outline"),
        verbosity: profile.textVerbosity,
      },
      prompt_cache_key: profile.promptCacheKey,
      max_output_tokens: 7_000,
      safety_identifier: safetyIdentifier,
    });
    const outlineUsageSamples: AiUsageSample[] = [];
    const generateAndRecord = async (profile: AiExecutionProfile, repairIssues: string[] = []) => {
      const generated = await generateOutline(profile, repairIssues);
      responseId = generated.id;
      observedUsage = extractOpenAiUsage(generated);
      outlineUsageSamples.push({
        model: profile.model,
        ...observedUsage,
        responseId,
        ...aiUsageProfileMetadata(profile),
      });
      return generated;
    };

    let activeProfile = standardProfile;
    let response;
    try {
      response = await generateAndRecord(standardProfile);
    } catch (standardError) {
      console.warn(JSON.stringify({
        event: "course_standard_model_failed",
        model: standardProfile.model,
        repairModel: repairProfile.model,
        ...safeModelErrorDetails(standardError),
      }));
      try {
        activeProfile = repairProfile;
        response = await generateAndRecord(repairProfile, ["The standard generation attempt failed before producing a usable course."]);
      } catch (repairError) {
        console.warn(JSON.stringify({
          event: "course_repair_model_failed",
          model: repairProfile.model,
          recoveryModel: recoveryProfile.model,
          ...safeModelErrorDetails(repairError),
        }));
        activeProfile = recoveryProfile;
        response = await generateAndRecord(recoveryProfile, ["The standard and repair generation attempts failed before producing a usable course."]);
      }
    }

    let outline = response.output_parsed;
    let integrityIssues = outline ? inspectGeneratedContent(outline, topic, language) : [];
    let outlineQualityIssues = outline ? [
      ...courseQualityIssues(outline),
      ...outlineSourceAssignmentIssues(outline, sourcePack),
    ] : [];
    let repairIssues = outline
      ? [
        ...integrityIssues.map((issue) => `${issue.path} ${issue.reason}`),
        ...outlineQualityIssues,
      ]
      : ["The previous response did not return a structured course outline."];
    if (repairIssues.length && !activeProfile.recovery) {
      try {
        activeProfile = repairProfile;
        response = await generateAndRecord(repairProfile, repairIssues);
      } catch (error) {
        console.warn(JSON.stringify({
          event: "course_quality_repair_failed",
          model: repairProfile.model,
          recoveryModel: recoveryProfile.model,
          ...safeModelErrorDetails(error),
        }));
      }
      outline = response.output_parsed;
      integrityIssues = outline ? inspectGeneratedContent(outline, topic, language) : [];
      outlineQualityIssues = outline ? [
        ...courseQualityIssues(outline),
        ...outlineSourceAssignmentIssues(outline, sourcePack),
      ] : [];
      repairIssues = outline
        ? [
            ...integrityIssues.map((issue) => `${issue.path} ${issue.reason}`),
            ...outlineQualityIssues,
          ]
        : ["The quality-repair response did not return a structured course outline."];
    }
    if (repairIssues.length && !activeProfile.recovery) {
      activeProfile = recoveryProfile;
      response = await generateAndRecord(recoveryProfile, repairIssues);
      outline = response.output_parsed;
      integrityIssues = outline ? inspectGeneratedContent(outline, topic, language) : [];
      outlineQualityIssues = outline ? [
        ...courseQualityIssues(outline),
        ...outlineSourceAssignmentIssues(outline, sourcePack),
      ] : [];
      repairIssues = outline
        ? [
            ...integrityIssues.map((issue) => `${issue.path} ${issue.reason}`),
            ...outlineQualityIssues,
          ]
        : ["The Sol recovery response did not return a structured course outline."];
    }
    observedUsageSamples = outlineUsageSamples;

    if (!outline) {
      if (pipelineFlags.pipelineV2 && pipelineCorrelationId) {
        await recordCoursePipelineEvent({
          event: "course_stage_failed",
          correlationId: pipelineCorrelationId,
          courseId: pipelineCorrelationId,
          actorHash: safetyIdentifier,
          stage: "planning",
          outcome: "unparseable_output",
          promptVersion: activeProfile.promptVersion,
          model: activeProfile.model,
          featureFlags: pipelineFlags,
        });
      }
      await finalizeAiUsage(reservation, { usageSamples: outlineUsageSamples, responseId, failed: true });
      reservation = null;
      await releaseCourseCapacityReservation(capacityReservation);
      capacityReservation = null;
      return NextResponse.json(
        { error: "The course could not be structured. Please try again." },
        { status: 502 },
      );
    }
    if (integrityIssues.length || outlineQualityIssues.length) {
      console.warn(JSON.stringify({
        event: "course_quality_gate_rejected",
        actorHash: safetyIdentifier,
        profile: activeProfile.id,
        model: activeProfile.model,
        issues: repairIssues,
      }));
      if (pipelineFlags.pipelineV2 && pipelineCorrelationId) {
        await recordCoursePipelineEvent({
          event: "course_stage_failed",
          correlationId: pipelineCorrelationId,
          courseId: pipelineCorrelationId,
          actorHash: safetyIdentifier,
          stage: "planning",
          outcome: "quality_rejected",
          promptVersion: activeProfile.promptVersion,
          model: activeProfile.model,
          featureFlags: pipelineFlags,
        });
      }
      await finalizeAiUsage(reservation, { usageSamples: outlineUsageSamples, responseId, failed: true });
      reservation = null;
      await releaseCourseCapacityReservation(capacityReservation);
      capacityReservation = null;
      return NextResponse.json(
        {
          error: "The course did not meet Filosage's sequencing and content-quality standard and was not saved. Please try again.",
          evaluation: account.isOwner && request.headers.get("x-filosage-model-evaluation") === "1"
            ? { profile: activeProfile.id, model: activeProfile.model, promptVersion: activeProfile.promptVersion, issues: repairIssues }
            : undefined,
        },
        { status: 502 },
      );
    }
    await assertSafeContent(client, JSON.stringify(outline), {
      uid: account.uid,
      feature: "course_outline",
      stage: "output",
    });

    const persistedOutline = pipelineFlags.pipelineV2 ? withCourseObjectiveRelationships(outline) : outline;
    const course = await createCourse({
      topic,
      ...persistedOutline,
      topicKey: topic.toLowerCase().replace(/\s+/g, " "),
      language,
      freshnessRequired,
      schemaVersion: 4,
      ...(pipelineFlags.pipelineV2 ? {
        pipelineCorrelationId,
        pipelineStage: "generating",
        pipelineStageUpdatedAt: new Date().toISOString(),
        courseSchemaVersion: COURSE_ARTIFACT_PROVENANCE_DEFAULTS.courseSchemaVersion,
        qualityContractVersion: COURSE_ARTIFACT_PROVENANCE_DEFAULTS.qualityContractVersion,
        generationPromptVersion: standardProfile.promptVersion,
        repairPromptVersion: COURSE_ARTIFACT_PROVENANCE_DEFAULTS.repairPromptVersion,
        repairPromptStatus: "not_executed",
        semanticEvaluatorVersion: COURSE_ARTIFACT_PROVENANCE_DEFAULTS.semanticEvaluatorVersion,
        semanticEvaluatorStatus: "not_executed",
        generationProvider: "openai",
        labRegistryVersion: pipelineFlags.labsV2 ? COURSE_ARTIFACT_PROVENANCE_DEFAULTS.labRegistryVersion : undefined,
        visualPolicyVersion: pipelineFlags.visualsV2 ? COURSE_ARTIFACT_PROVENANCE_DEFAULTS.visualPolicyVersion : undefined,
        sourcePolicyVersion: COURSE_ARTIFACT_PROVENANCE_DEFAULTS.sourcePolicyVersion,
        manualReviewPolicy: courseReviewPolicyForBrief(
          topic,
          goal,
          application,
          outline.category,
          freshnessRequired ? "current regulation guidance requirement" : undefined,
        ),
      } : {}),
      courseQualityGateVersion: COURSE_QUALITY_GATE_VERSION,
      sourcePack,
      instructionalContext: {
        goal,
        application,
        background,
        artifactPreference,
        scenarioPreference,
      },
      authorId: account.uid,
      authorName: account.displayName ?? (account.isOwner ? "Filosage" : "Filosage learner"),
      authorPhoto: account.photoURL ?? null,
      isPublic: false,
      aiAssisted: true,
      generationModel: activeProfile.model,
      generationProfile: activeProfile.id,
      promptVersion: activeProfile.promptVersion,
      fallbackUsed: outlineUsageSamples.length > 1,
    }, reservation.requestId);
    await completeCourseCapacityReservation(capacityReservation, course.id);

    let attachedBanner: { assetId: string; version: 1; generatedAt?: string } | undefined;
    try {
      bannerReservation = await reserveAiUsage(account, "course_banner", idempotencyKey);
      const bannerResult = await createOrReuseCourseBanner(client, {
        topic,
        category: outline.category,
        outcome: outline.outcome,
        mission: outline.mission,
        safetyIdentifier,
      });
      attachedBanner = bannerResult?.banner;
      if (attachedBanner) {
        await updateCourseBanner(course.id, {
          ...attachedBanner,
          generatedAt: attachedBanner.generatedAt ?? new Date().toISOString(),
        });
      }
      await finalizeAiUsage(bannerReservation, {
        usageSamples: bannerResult?.generated ? [{
          model: bannerResult.model,
          inputTokens: 0,
          cachedInputTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 0,
          fixedCostMicros: bannerResult.costMicros,
        }] : [],
        resultId: course.id,
      });
      bannerReservation = null;
    } catch (bannerError) {
      if (bannerReservation) {
        await finalizeAiUsage(bannerReservation, { failed: true }).catch(() => undefined);
        bannerReservation = null;
      }
      attachedBanner = undefined;
      console.error(JSON.stringify({ event: "initial_course_banner_generation_failed", ...safeModelErrorDetails(bannerError) }));
    }

    observedUsageSamples = outlineUsageSamples;
    await finalizeAiUsage(reservation, { usageSamples: outlineUsageSamples, resultId: course.id });
    reservation = null;

    if (pipelineFlags.pipelineV2) {
      await recordCoursePipelineEvent({
        event: "course_stage_completed",
        correlationId: pipelineCorrelationId ?? course.id,
        courseId: course.id,
        actorHash: safetyIdentifier,
        stage: "planning",
        outcome: "course_created",
        promptVersion: activeProfile.promptVersion,
        model: activeProfile.model,
        retryCount: Math.max(0, outlineUsageSamples.length - 1),
        featureFlags: pipelineFlags,
      });
    }

    return NextResponse.json({
      ...outline,
      courseId: course.id,
      isPublic: false,
      aiAssisted: true,
      banner: attachedBanner,
      evaluation: account.isOwner && request.headers.get("x-filosage-model-evaluation") === "1"
        ? {
            profile: activeProfile.id,
            model: activeProfile.model,
            promptVersion: activeProfile.promptVersion,
            recoveryUsed: activeProfile.recovery,
            attempts: outlineUsageSamples.length,
            usage: summarizeAiUsage(outlineUsageSamples),
          }
        : undefined,
    });
  } catch (error: unknown) {
    if (pipelineFlags.pipelineV2 && pipelineCorrelationId) {
      await recordCoursePipelineEvent({
        event: "course_stage_failed",
        correlationId: pipelineCorrelationId,
        courseId: pipelineCorrelationId,
        actorHash: pipelineActorHash,
        stage: "planning",
        outcome: error instanceof ContentSafetyError ? "safety_rejected" : "technical_failure",
        featureFlags: pipelineFlags,
      });
    }
    if (bannerReservation) {
      await finalizeAiUsage(bannerReservation, { failed: true }).catch((usageError) => {
        console.error(JSON.stringify({ event: "course_banner_usage_finalization_failed", ...safeModelErrorDetails(usageError) }));
      });
    }
    await releaseCourseCapacityReservation(capacityReservation).catch((capacityError) => {
      console.error(JSON.stringify({ event: "course_capacity_release_failed", ...safeModelErrorDetails(capacityError) }));
    });
    if (reservation) {
      await finalizeAiUsage(
        reservation,
        observedUsageSamples
          ? { usageSamples: observedUsageSamples, responseId, failed: true }
          : {
              ...observedUsage,
              model: standardProfile.model,
              responseId,
              failed: true,
              ...aiUsageProfileMetadata(standardProfile),
            },
      ).catch((usageError) => {
        console.error(JSON.stringify({ event: "course_usage_finalization_failed", ...safeModelErrorDetails(usageError) }));
      });
    }
    if (error instanceof AiQuotaError
      && error.code === "DUPLICATE_REQUEST"
      && error.details.requestStatus === "completed"
      && typeof error.details.resultId === "string") {
      const course = await getCourse(error.details.resultId);
      if (course) {
        return NextResponse.json({
          ...toCourseDto(course, true),
          courseId: course.id,
          recovered: true,
        });
      }
    }
    const quotaResponse = aiQuotaResponse(error);
    if (quotaResponse) return quotaResponse;
    if (error instanceof CourseCapacityError) {
      return NextResponse.json(
        { error: error.message, code: error.code, limit: error.limit, owned: error.owned },
        { status: error.status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    const requestResponse = apiRequestErrorResponse(error);
    if (requestResponse) return requestResponse;
    if (error instanceof ContentSafetyError) {
      return NextResponse.json(
        { error: error.message, code: "CONTENT_NOT_ALLOWED", retryAt: error.retryAt },
        { status: 422 },
      );
    }

    console.error(JSON.stringify({
      event: "course_generation_failed",
      ...safeModelErrorDetails(error),
    }));
    return NextResponse.json(
      { error: "Course generation is temporarily unavailable." },
      { status: 500 },
    );
  }
}
