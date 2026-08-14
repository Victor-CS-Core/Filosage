import { NextResponse } from "next/server";
import { aiClient } from "@/lib/local-ai";
import { zodTextFormat } from "openai/helpers/zod";
import { authorizationResponse, requirePlanCapability } from "@/lib/auth-server";
import { getCourse, getCoursePublishReadiness, getLesson, getStoredDocument, saveLesson } from "@/lib/firebase-server";
import {
  AiQuotaError,
  aiQuotaResponse,
  extractOpenAiUsage,
  finalizeAiUsage,
  reserveAiUsage,
  type AiReservation,
} from "@/lib/ai-usage";
import { summarizeAiUsage, type AiUsageSample } from "@/lib/ai-pricing";
import {
  generateLessonInputSchema,
  lessonGenerationSchema,
  validationMessage,
  type GeneratedLessonData,
} from "@/lib/validation";
import { expectedLessonIds, findCourseLesson } from "@/lib/course-progress";
import type { Course, LessonData } from "@/lib/course-types";
import { AI_SAFETY_POLICY, assertSafeContent, ContentSafetyError } from "@/lib/content-safety";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { openAiSafetyIdentifier } from "@/lib/ai-usage";
import { toLessonDto } from "@/lib/course-dto";
import { curateLessonVisuals } from "@/lib/lesson-visuals";
import {
  curateLessonInteractions,
  deriveLessonInteractions,
  INTERACTION_QUALITY_GATE_VERSION,
  interactionQualityIssues,
} from "@/lib/lesson-interactions";
import {
  canAttemptLessonRepair,
  isLessonGenerationTimeout,
  lessonGenerationAttemptTimeoutMs,
} from "@/lib/lesson-generation-runtime";
import { coursePipelineFeatureFlags, lessonVisualsEnabled } from "@/lib/feature-flags";
import { languagePolicyInstruction } from "@/lib/content-language";
import { lessonQualityIssues, LESSON_QUALITY_GATE_VERSION } from "@/lib/lesson-quality";
import { lessonGenerationGate } from "@/lib/authoring-gate";
import { assignedSourcePack, lessonCitationQualityIssues, sourcePackPromptBlock } from "@/lib/source-safety";
import { safeModelErrorDetails } from "@/lib/model-fallback";
import {
  aiUsageProfileMetadata,
  openAiExecutionProfile,
  type AiExecutionProfile,
} from "@/lib/openai-generation";
import { COURSE_ARTIFACT_PROVENANCE_DEFAULTS } from "@/lib/course-pipeline/contract";
import { canonicalLessonObjectiveId } from "@/lib/course-pipeline/relationships";
import { defaultLabApplicability, LAB_REGISTRY_VERSION } from "@/lib/course-pipeline/labs/registry";
import { accessibleVisualFallbackFromLesson, defaultVisualApplicability, VISUAL_POLICY_VERSION } from "@/lib/course-pipeline/visuals/registry";
import { recordCoursePipelineEvent } from "@/lib/course-pipeline/observability";
import { publicationContentFingerprint } from "@/lib/publication-content";
import { courseUsesPipelineV2 } from "@/lib/course-pipeline/feature-policy";

const lessonInstructions = (lessonVisualsAreEnabled: boolean, lessonLabsAreEnabled: boolean) => `Act as a rigorous teacher and instructional designer. Create one lesson that advances a specific capability within a larger course.

Use the requested lesson mode instead of forcing every lesson into the same pattern. The experience object is the lesson's central activity and its type must exactly match the requested teaching mode. For concept, ask for a prediction before revealing a mental model and misconception correction. For worked-example, expose at least three expert reasoning steps, then fade support. For comparison, use explicit criteria and a difficult boundary case. For case-study, provide an evidence packet, competing interpretations, and a decision prompt. For practice-lab, provide usable materials, ordered tasks, and an artifact with criteria. For synthesis, connect prior concepts and advance the course capstone. Begin by connecting this lesson to prerequisite knowledge, then state one observable learning objective. Explain only what the learner needs in order to do the activity. Include guided practice with visible reasoning, followed by a transfer task that asks the learner to use the idea in a different situation. End with concise takeaways, not a repeated conclusion.

Write direct, natural prose in accessible Markdown. Use descriptive H2 and H3 headings only and never repeat the lesson title as a heading. Target roughly 650 to 1,000 words because the activity, not prose length, should carry the cognitive work. Avoid generic encouragement, promotional language, vague claims, invented citations, repeated conclusions, and filler. Never use em dashes; prefer commas, colons, or separate sentences.

The guided-practice prompt, worked response, transfer prompt, and model response support GitHub-flavored Markdown. Each guided step must be one concise prose paragraph with no heading, list, table, blockquote, code fence, raw HTML, or other block Markdown. Use real lists or tables only in the larger prompt and response fields when structure improves scanning. Every table must place its header, separator, and each data row on separate lines. Never compress Markdown table rows into one line or place table syntax directly after prose.

Do not create diagrams, graphs, Mermaid syntax, raw SVG, HTML, or visual-model sections in Markdown. Communicate every relationship clearly in prose and examples.

${lessonVisualsAreEnabled
  ? "Return zero, one, or two candidate strings in visuals. Each string must be compact JSON for one learning aid. The app, not you, determines final placement and selection. Every object needs type, title, and summary. Type-specific fields are: concept-contrast has misconception, accurateView, whyItMatters; process-flow has steps [{title, detail}]; comparison-matrix has columns [left, right] and rows [{criterion, values:[left, right]}]; worked-example-trace has prompt and steps [{title, detail, check}]; prerequisite-map has nodes [{label, detail, role}], where role is foundation, current, or next. Use visuals: [] when no candidate materially improves understanding. Do not include id, placement, version, diagram syntax, SVG, or HTML."
  : "Return visuals: []. The structured visual system is not enabled for this lesson yet."}

${lessonLabsAreEnabled
  ? `Return zero or one candidate string in interactions. Include one only when an objective-aligned Recognition v2 drill materially improves the lesson; never let this optional enhancement displace the explanation, worked activity, guided practice, transfer task, or checks. When included, use compact JSON with type "recognition", title, summary, and prompt.

Recognition requires targetSkill copied from the observable learning objective, referencePolicy "hidden-until-complete", mastery {minimumFirstAttemptCorrect, retryMissed:true}, and 6 to 10 items. Each item needs stimulus {kind:"text"|"signal", value, accessibleLabel}, exactly four choices [{label, feedback, misconception?}], correctIndex, explanation, and difficulty "foundation"|"contrast"|"transfer". Do not include item IDs. Hide answers until the learner commits. Distractors must be plausible confusions or misconceptions, every choice needs specific explanatory feedback, and the mastery threshold must match the objective when it states a score.

Do not return classification, sequence, scenario, or signal for this field. If a rigorous recognition drill does not fit the objective, return an empty interactions array. Do not duplicate the quizzes. Do not include interaction id, version, HTML, scripts, URLs, or executable content.`
  : "Return interactions: []. The V2 lab registry is not enabled for this lesson."}

Create application-focused quizzes, not trivia. Each answer option needs feedback that explains why that specific choice is correct or incorrect. Vary the correct option positions. Return only the requested structured lesson.

${AI_SAFETY_POLICY}`;

export async function POST(request: Request) {
  let pipelineFlags = coursePipelineFeatureFlags();
  let pipelineV2Active = false;
  let profileOptions = { coursePipelineV2: pipelineV2Active };
  let standardProfile = openAiExecutionProfile("lesson.standard", undefined, profileOptions);
  let fallbackProfile = openAiExecutionProfile("lesson.fallback", undefined, profileOptions);
  let legacyVisualsAreEnabled: boolean;
  let reservation: AiReservation | null = null;
  const usageSamples: AiUsageSample[] = [];
  let responseId: string | undefined;
  const generationStartedAt = Date.now();
  let requestedCourseId: string | undefined;
  let requestedLessonId: string | undefined;
  let pipelineCorrelationId: string | undefined;
  let pipelineActorHash: string | undefined;
  try {
    const account = await requirePlanCapability(request, "generate_lesson");
    pipelineFlags = coursePipelineFeatureFlags(account);
    profileOptions = { coursePipelineV2: pipelineV2Active };
    standardProfile = openAiExecutionProfile("lesson.standard", undefined, profileOptions);
    fallbackProfile = openAiExecutionProfile("lesson.fallback", undefined, profileOptions);
    legacyVisualsAreEnabled = lessonVisualsEnabled(account);
    const parsed = generateLessonInputSchema.safeParse(await readJsonBody(request, 2_048));
    if (!parsed.success) {
      return NextResponse.json(
        { error: validationMessage(parsed.error) },
        { status: 400 },
      );
    }

    const { courseId, lessonId, regenerate } = parsed.data;
    requestedCourseId = courseId;
    requestedLessonId = lessonId;
    const course = await getCourse(courseId) as Course | null;
    if (!course) {
      return NextResponse.json({ error: "Course not found." }, { status: 404 });
    }
    if (course.authorId !== account.uid && !account.isOwner) {
      return NextResponse.json({ error: "You do not own this course." }, { status: 403 });
    }
    const canonical = findCourseLesson(course, lessonId);
    if (!canonical) {
      return NextResponse.json({ error: "This lesson is not part of the course." }, { status: 400 });
    }
    const saved = await getLesson(courseId, lessonId);
    if (saved && !regenerate) {
      return NextResponse.json(toLessonDto(saved, course.aiAssisted === true, course.topic, course.language ?? "English", course));
    }
    if (courseUsesPipelineV2(course as unknown as Record<string, unknown>) && !pipelineFlags.pipelineV2) {
      return NextResponse.json(
        { error: "Course Pipeline V2 is paused. This draft was preserved and cannot be changed by the legacy generator.", code: "COURSE_PIPELINE_V2_PAUSED" },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    pipelineV2Active = pipelineFlags.pipelineV2
      && courseUsesPipelineV2(course as unknown as Record<string, unknown>);
    profileOptions = { coursePipelineV2: pipelineV2Active };
    standardProfile = openAiExecutionProfile("lesson.standard", undefined, profileOptions);
    fallbackProfile = openAiExecutionProfile("lesson.fallback", undefined, profileOptions);
    pipelineCorrelationId = course.pipelineCorrelationId ?? courseId;
    if (saved && course.isPublic) {
      return NextResponse.json(
        { error: "Unpublish this course before regenerating a lesson." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    const objectiveId = canonical.lesson.objectiveId
      ?? canonicalLessonObjectiveId(canonical.moduleIndex, canonical.lessonIndex);
    const labPlan = pipelineV2Active && pipelineFlags.labsV2
      ? { ...defaultLabApplicability(canonical.lesson.objective ?? canonical.lesson.concept, `${course.topic} ${canonical.lesson.concept}`), objectiveIds: [objectiveId], registryVersion: LAB_REGISTRY_VERSION }
      : undefined;
    const visualPlan = pipelineV2Active && pipelineFlags.visualsV2
      ? { ...defaultVisualApplicability(canonical.lesson.objective ?? canonical.lesson.concept, `${course.topic} ${canonical.lesson.concept}`), objectiveIds: [objectiveId], policyVersion: VISUAL_POLICY_VERSION }
      : undefined;
    const lessonLabsAreEnabled = pipelineV2Active
      ? Boolean(labPlan && labPlan.applicability !== "not_applicable")
      : true;
    const lessonVisualsAreEnabled = pipelineV2Active
      ? Boolean(legacyVisualsAreEnabled && visualPlan && visualPlan.applicability !== "not_useful" && visualPlan.applicability !== "decorative_only")
      : legacyVisualsAreEnabled;
    const topic = course.topic;
    const lessonTitle = canonical.lesson.title;
    const lessonConcept = canonical.lesson.concept;
    const expectedMode = canonical.lesson.lessonMode ?? "concept";
    const coursePublic = course.isPublic === true;
    const currentModule = course.modules[canonical.moduleIndex];
    const flattenedLessons = course.modules.flatMap((courseModule, moduleIndex) =>
      courseModule.lessons.map((lesson, lessonIndex) => ({
        ...lesson,
        id: `${moduleIndex}-${lessonIndex}`,
        moduleTitle: courseModule.title,
      })),
    );
    const currentPosition = flattenedLessons.findIndex((lesson) => lesson.id === lessonId);
    const previousLesson = currentPosition > 0 ? flattenedLessons[currentPosition - 1] : null;
    const nextLesson = currentPosition >= 0 && currentPosition < flattenedLessons.length - 1
      ? flattenedLessons[currentPosition + 1]
      : null;
    if (!account.isOwner && currentPosition > 0) {
      const progress = await getStoredDocument(`users/${account.uid}/courseProgress/${courseId}`);
      const completedLessonIds = new Set(
        Array.isArray(progress?.completedLessonIds) ? progress.completedLessonIds.map(String) : [],
      );
      const gate = lessonGenerationGate(course, lessonId, completedLessonIds, account.isOwner);
      if (!gate.allowed) {
        const prerequisite = flattenedLessons.find((lesson) => lesson.id === gate.requiredLessonId);
        return NextResponse.json(
          {
            error: `Complete ${prerequisite?.title ?? "the previous lesson"} and its activities before generating this lesson.`,
            code: "PREVIOUS_LESSON_INCOMPLETE",
            requiredLessonId: gate.requiredLessonId,
          },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }
    }
    const instructionalContext = (course as Course & {
      instructionalContext?: { goal?: string; application?: string; background?: string };
    }).instructionalContext;

    reservation = await reserveAiUsage(
      account,
      "lesson_generation",
      request.headers.get("idempotency-key"),
      `${courseId}:${lessonId}:${regenerate ? "regenerate" : "generate"}`,
      { allowCompletedReplay: true },
    );
    if (reservation.recovered) {
      if (!saved) {
        reservation = null;
        return NextResponse.json(
          { error: "The original request completed, but its saved lesson could not be reopened.", code: "IDEMPOTENCY_RESULT_MISSING" },
          { status: 409, headers: { "Cache-Control": "private, no-store" } },
        );
      }
      reservation = null;
      return NextResponse.json({
        ...toLessonDto(saved, course.aiAssisted === true, course.topic, course.language ?? "English", course),
        recovered: true,
      });
    }
    const client = aiClient();
    await assertSafeContent(
      client,
      [topic, lessonTitle, lessonConcept, course.outcome ?? course.mission ?? ""].join("\n"),
      { uid: account.uid, feature: "lesson_generation", stage: "input" },
    );
    const safetyIdentifier = await openAiSafetyIdentifier(account.uid);
    pipelineActorHash = safetyIdentifier;
    if (pipelineV2Active) {
      await recordCoursePipelineEvent({
        event: "course_stage_started",
        correlationId: pipelineCorrelationId,
        courseId,
        actorHash: safetyIdentifier,
        stage: "generating",
        outcome: `lesson:${lessonId}`,
        promptVersion: standardProfile.promptVersion,
        model: standardProfile.model,
        featureFlags: pipelineFlags,
      });
    }
    const assignedSources = assignedSourcePack(course.sourcePack ?? [], canonical.lesson.sourceIds);
    const lessonContext = [
      `Course topic: ${topic}`,
      `Course outcome: ${course.outcome ?? course.mission}`,
      `Module: ${currentModule?.title ?? "Current module"}`,
      `Module objective: ${currentModule?.objective ?? currentModule?.description ?? "Not specified"}`,
      `Lesson: ${lessonTitle}`,
      `Core concept: ${lessonConcept}`,
      `Observable objective: ${canonical.lesson.objective ?? lessonConcept}`,
      `Teaching mode: ${canonical.lesson.lessonMode ?? "concept"}`,
      `Activity preview: ${canonical.lesson.activityPreview ?? "Create a concrete mode-specific activity."}`,
      `Artifact contribution: ${canonical.lesson.artifactContribution ?? course.artifact?.description ?? course.capstone?.deliverable ?? "A useful piece of demonstrated work."}`,
      `Builds on: ${canonical.lesson.buildsOn?.join(", ") || previousLesson?.title || "No named prerequisite lesson"}`,
      `Misconception to correct: ${canonical.lesson.misconception ?? "Identify the most consequential misconception for this concept."}`,
      `Practice type: ${canonical.lesson.practiceType ?? "explain"}`,
      `Mastery criterion: ${canonical.lesson.masteryCriteria ?? "Explain and apply the concept accurately."}`,
      previousLesson
        ? `Previous lesson: ${previousLesson.title}: ${previousLesson.objective ?? previousLesson.concept}`
        : "Previous lesson: This is the opening lesson.",
      nextLesson
        ? `Next lesson: ${nextLesson.title}: ${nextLesson.objective ?? nextLesson.concept}`
        : "Next lesson: This is the final lesson.",
      currentModule?.challenge
        ? `Module challenge: ${currentModule.challenge.prompt} Success means: ${currentModule.challenge.successCriteria.join("; ")}`
        : "",
      currentModule?.milestone
        ? `Module milestone: ${currentModule.milestone.deliverable}. Evidence: ${currentModule.milestone.evidence}`
        : "",
      course.scenario
        ? `Course scenario: ${course.scenario.title}. ${course.scenario.context} Stakes: ${course.scenario.stakes}`
        : "",
      course.artifact
        ? `Course artifact: ${course.artifact.title}, ${course.artifact.format}. ${course.artifact.description}`
        : "",
      sourcePackPromptBlock(assignedSources, "No source is assigned to this lesson. Return citations: [] and do not invent citations."),
      assignedSources.length
        ? "Return a structured citation only for a concise factual statement directly supported by an assigned source's evidence note. The citation claim must be an exact statement already present in the declared lesson section. Use only assigned source IDs, add a short source locator when known, and never quote or reproduce source passages."
        : "Do not make the lesson source-backed. Return citations: [].",
      course.capstone
        ? `Course capstone: ${course.capstone.brief} Deliverable: ${course.capstone.deliverable}`
        : "",
      instructionalContext?.goal ? `Learner goal: ${instructionalContext.goal}` : "",
      instructionalContext?.application ? `Intended application: ${instructionalContext.application}` : "",
      instructionalContext?.background ? `Learner background: ${instructionalContext.background}` : "",
      labPlan ? `Lab applicability: ${labPlan.applicability}. Rationale: ${labPlan.rationale}` : "",
      visualPlan ? `Instructional visual applicability: ${visualPlan.applicability}. Rationale: ${visualPlan.rationale}` : "",
    ].filter(Boolean).join("\n");
    const namedBuildsOn = canonical.lesson.buildsOn?.filter((item) => item.trim()) ?? [];
    const visualContext = {
      lessonMode: canonical.lesson.lessonMode,
      buildsOn: namedBuildsOn.length ? namedBuildsOn : (previousLesson ? [previousLesson.title] : []),
      misconception: canonical.lesson.misconception,
    };

    let generatedCitations: GeneratedLessonData["citations"] = [];
    const prepareLesson = (generated: GeneratedLessonData | null): LessonData | null => {
      if (!generated) return null;
      const { visuals, interactions, citations, ...lesson } = generated;
      generatedCitations = citations;
      const preparedVisuals = lessonVisualsAreEnabled
        ? curateLessonVisuals(visuals, visualContext).map((visual) => ({ ...visual, objectiveIds: [objectiveId] }))
        : [];
      const preparedInteractions = lessonLabsAreEnabled
        ? curateLessonInteractions(interactions).map((interaction) => ({ ...interaction, objectiveIds: [objectiveId] }))
        : [];
      const prepared: LessonData = {
        ...lesson,
        visuals: preparedVisuals,
        interactions: preparedInteractions,
      };
      return pipelineV2Active
        ? prepared
        : { ...prepared, interactions: deriveLessonInteractions(prepared) };
    };

    const generate = (profile: AiExecutionProfile, repairIssues: string[] = []) => client.responses.parse({
      model: profile.model,
      store: false,
      instructions: `${lessonInstructions(lessonVisualsAreEnabled, lessonLabsAreEnabled)}\n\n${languagePolicyInstruction(topic, String((course as Course & { language?: string }).language ?? "English"))}`,
      input: repairIssues.length
        ? `${lessonContext}\n\nThe previous draft failed the quality gate. Correct every issue:\n- ${repairIssues.join("\n- ")}`
        : lessonContext,
      text: {
        format: zodTextFormat(lessonGenerationSchema, "lesson"),
        verbosity: profile.textVerbosity,
      },
      reasoning: { effort: profile.reasoningEffort },
      prompt_cache_key: profile.promptCacheKey,
      max_output_tokens: 5_000,
      safety_identifier: safetyIdentifier,
    }, {
      maxRetries: 0,
      timeout: lessonGenerationAttemptTimeoutMs(generationStartedAt),
    });

    const generateAndRecord = async (profile: AiExecutionProfile, repairIssues: string[] = []) => {
      const generated = await generate(profile, repairIssues);
      responseId = generated.id;
      usageSamples.push({
        model: profile.model,
        ...extractOpenAiUsage(generated),
        responseId,
        ...aiUsageProfileMetadata(profile),
      });
      return generated;
    };

    let activeProfile = standardProfile;
    let primaryResponse;
    try {
      primaryResponse = await generateAndRecord(standardProfile);
    } catch (primaryError) {
      console.warn(JSON.stringify({
        event: "lesson_primary_model_failed",
        model: standardProfile.model,
        fallbackModel: fallbackProfile.model,
        ...safeModelErrorDetails(primaryError),
      }));
      if (!canAttemptLessonRepair(generationStartedAt)) throw primaryError;
      try {
        activeProfile = fallbackProfile;
        primaryResponse = await generateAndRecord(fallbackProfile, ["The standard generation attempt failed before producing a usable lesson."]);
      } catch (fallbackError) {
        console.warn(JSON.stringify({
          event: "lesson_fallback_model_failed",
          model: fallbackProfile.model,
          ...safeModelErrorDetails(fallbackError),
        }));
        throw fallbackError;
      }
    }
    let lesson = prepareLesson(primaryResponse.output_parsed as GeneratedLessonData | null);
    const instructionLanguage = String(course.language ?? "English");
    const generationQualityIssues = (candidate: LessonData | null) => [
      ...lessonQualityIssues(candidate, topic, expectedMode, { instructionLanguage }),
      ...lessonCitationQualityIssues(generatedCitations, assignedSources, candidate ?? {}),
    ];
    let qualityIssues = generationQualityIssues(lesson);

    if (qualityIssues.length && activeProfile.id === standardProfile.id && canAttemptLessonRepair(generationStartedAt)) {
      try {
        activeProfile = fallbackProfile;
        const fallbackResponse = await generateAndRecord(fallbackProfile, qualityIssues);
        lesson = prepareLesson(fallbackResponse.output_parsed as GeneratedLessonData | null);
      } catch (error) {
        console.warn(JSON.stringify({
          event: "lesson_quality_repair_failed",
          model: fallbackProfile.model,
          ...safeModelErrorDetails(error),
        }));
      }
      qualityIssues = generationQualityIssues(lesson);
    }

    if (!lesson || qualityIssues.length) {
      console.warn(JSON.stringify({
        event: "lesson_quality_gate_rejected",
        actorHash: safetyIdentifier,
        profile: activeProfile.id,
        model: activeProfile.model,
        courseId,
        lessonId,
        issues: qualityIssues,
      }));
      if (pipelineV2Active) {
        await recordCoursePipelineEvent({
          event: "course_stage_failed",
          correlationId: pipelineCorrelationId ?? courseId,
          courseId,
          actorHash: safetyIdentifier,
          stage: "generating",
          outcome: "lesson_quality_rejected",
          promptVersion: activeProfile.promptVersion,
          model: activeProfile.model,
          featureFlags: pipelineFlags,
        });
      }
      await finalizeAiUsage(reservation, { usageSamples, responseId, failed: true });
      reservation = null;
      return NextResponse.json(
        { error: "The lesson did not meet Filosage's teaching-quality standard. Please try again." },
        { status: 502 },
      );
    }
    const interactionIssues = interactionQualityIssues(lesson, true);
    if (interactionIssues.length) {
      console.warn(JSON.stringify({
        event: "lesson_optional_interaction_omitted",
        issueCount: interactionIssues.length,
        model: activeProfile.model,
      }));
      lesson = { ...lesson, interactions: [] };
    }
    await assertSafeContent(client, JSON.stringify(lesson), {
      uid: account.uid,
      feature: "lesson_generation",
      stage: "output",
    });

    const citedSourceIds = new Set(generatedCitations.map((citation) => citation.sourceId));
    const sourceReferences = assignedSources
      .filter((source) => citedSourceIds.has(source.id))
      .map((source) => ({
        id: source.id,
        label: source.label,
        url: source.url,
        author: source.author,
        publisher: source.publisher,
        publicationDate: source.publicationDate,
        accessedAt: source.accessedAt,
        kind: source.kind,
        rights: source.rights,
      }));
    const citations = generatedCitations.map((citation, index) => ({
      id: `citation-${index + 1}`,
      sourceId: citation.sourceId,
      claim: citation.claim,
      section: citation.section,
      locator: citation.locator ?? undefined,
      objectiveIds: [objectiveId],
    }));
    const generationMetadata = {
      generatedAt: new Date().toISOString(),
      promptVersion: activeProfile.promptVersion,
      qualityGateVersion: LESSON_QUALITY_GATE_VERSION,
      interactionQualityGateVersion: INTERACTION_QUALITY_GATE_VERSION,
      ...(pipelineV2Active ? {
        qualityContractVersion: COURSE_ARTIFACT_PROVENANCE_DEFAULTS.qualityContractVersion,
        generationPromptVersion: activeProfile.promptVersion,
        repairPromptVersion: COURSE_ARTIFACT_PROVENANCE_DEFAULTS.repairPromptVersion,
        repairPromptStatus: "not_executed",
        semanticEvaluatorVersion: COURSE_ARTIFACT_PROVENANCE_DEFAULTS.semanticEvaluatorVersion,
        semanticEvaluatorStatus: "not_executed",
        generationProvider: "openai",
        labRegistryVersion: pipelineFlags.labsV2 ? COURSE_ARTIFACT_PROVENANCE_DEFAULTS.labRegistryVersion : undefined,
        visualPolicyVersion: pipelineFlags.visualsV2 ? COURSE_ARTIFACT_PROVENANCE_DEFAULTS.visualPolicyVersion : undefined,
        sourcePolicyVersion: COURSE_ARTIFACT_PROVENANCE_DEFAULTS.sourcePolicyVersion,
      } : {}),
      sourceReferences,
      citations,
    };
    const visualPlanWithFallback = visualPlan as (typeof visualPlan & {
      accessibleFallback?: { kind: "text" | "table"; content: string };
    });
    const persistedVisualPlan = visualPlanWithFallback?.applicability === "essential"
      && (lesson.visuals?.length ?? 0) === 0
      && !visualPlanWithFallback.accessibleFallback
      ? {
          ...visualPlanWithFallback,
          accessibleFallback: accessibleVisualFallbackFromLesson({ ...lesson, visualPlan: visualPlanWithFallback }),
        }
      : visualPlanWithFallback;
    await saveLesson(courseId, lessonId, {
      ...lesson,
      ...(pipelineV2Active ? {
        lessonKind: canonical.lesson.lessonKind ?? "substantive",
        objectiveIds: [objectiveId],
        guidedPractice: { ...lesson.guidedPractice, objectiveIds: [objectiveId] },
        transferTask: { ...lesson.transferTask, objectiveIds: [objectiveId] },
        quizzes: lesson.quizzes.map((quiz) => ({ ...quiz, objectiveIds: [objectiveId] })),
        labPlan,
        visualPlan: persistedVisualPlan,
      } : {}),
      authorId: account.uid,
      aiAssisted: true,
      isPublic: coursePublic,
      schemaVersion: 5,
      generationModel: activeProfile.model,
      generationProfile: activeProfile.id,
      reasoningEffort: activeProfile.reasoningEffort,
      promptCacheKey: activeProfile.promptCacheKey,
      fallbackUsed: usageSamples.length > 1 || activeProfile.id !== standardProfile.id,
      ...generationMetadata,
    }, pipelineV2Active ? {
      courseFingerprint: publicationContentFingerprint(course),
      lessonFingerprint: saved ? publicationContentFingerprint(saved) : undefined,
      invalidateReadiness: true,
    } : undefined);

    await finalizeAiUsage(reservation, { usageSamples, responseId, resultId: `${courseId}:${lessonId}` });
    reservation = null;
    if (pipelineV2Active) {
      await recordCoursePipelineEvent({
        event: "course_stage_completed",
        correlationId: pipelineCorrelationId,
        courseId,
        actorHash: safetyIdentifier,
        stage: "generating",
        outcome: `lesson:${lessonId}`,
        promptVersion: activeProfile.promptVersion,
        model: activeProfile.model,
        retryCount: Math.max(0, usageSamples.length - 1),
        featureFlags: pipelineFlags,
      });
    }

    const publicationLessonIds = expectedLessonIds(course);
    const shouldRunPublicationPreflight = regenerate
      || publicationLessonIds.at(-1) === lessonId;
    let publicationReadiness;
    if (shouldRunPublicationPreflight) {
      try {
        publicationReadiness = await getCoursePublishReadiness(
          courseId,
          publicationLessonIds,
          topic,
          Object.fromEntries(course.modules.flatMap((courseModule, moduleIndex) =>
            courseModule.lessons.map((courseLesson, lessonIndex) => [
              `${moduleIndex}-${lessonIndex}`,
              courseLesson.lessonMode,
            ]),
          )),
          instructionLanguage,
        );
      } catch (preflightError) {
        console.error(JSON.stringify({
          event: "lesson_publication_preflight_failed",
          courseId,
          lessonId,
          errorName: preflightError instanceof Error ? preflightError.name : "UnknownError",
        }));
      }
    }

    const lessonDto = toLessonDto({
      ...lesson,
      aiAssisted: true,
      schemaVersion: 5,
      generationModel: activeProfile.model,
      ...generationMetadata,
    }, true, topic, instructionLanguage, course);
    return NextResponse.json({
      ...lessonDto,
      publicationReadiness,
      evaluation: account.isOwner && request.headers.get("x-filosage-model-evaluation") === "1"
        ? {
            profile: activeProfile.id,
            model: activeProfile.model,
            promptVersion: activeProfile.promptVersion,
            recoveryUsed: activeProfile.recovery,
            attempts: usageSamples.length,
            usage: summarizeAiUsage(usageSamples),
          }
        : undefined,
    });
  } catch (error: unknown) {
    if (pipelineV2Active && pipelineCorrelationId) {
      await recordCoursePipelineEvent({
        event: "course_stage_failed",
        correlationId: pipelineCorrelationId,
        courseId: requestedCourseId,
        actorHash: pipelineActorHash,
        stage: "generating",
        outcome: error instanceof ContentSafetyError ? "safety_rejected" : "technical_failure",
        featureFlags: pipelineFlags,
      });
    }
    if (reservation) {
      await finalizeAiUsage(reservation, {
        usageSamples,
        model: standardProfile.model,
        responseId,
        failed: true,
        ...aiUsageProfileMetadata(standardProfile),
      }).catch((usageError) => {
        console.error(JSON.stringify({ event: "lesson_usage_finalization_failed", ...safeModelErrorDetails(usageError) }));
      });
    }
    if (
      error instanceof AiQuotaError
      && error.code === "DUPLICATE_REQUEST"
      && error.details.requestStatus === "completed"
      && requestedCourseId
      && requestedLessonId
    ) {
      const [savedLesson, savedCourse] = await Promise.all([
        getLesson(requestedCourseId, requestedLessonId),
        getCourse(requestedCourseId) as Promise<Course | null>,
      ]);
      if (savedLesson && savedCourse) {
        const lessonIds = expectedLessonIds(savedCourse);
        const publicationReadiness = await getCoursePublishReadiness(
          requestedCourseId,
          lessonIds,
          savedCourse.topic,
          Object.fromEntries(savedCourse.modules.flatMap((courseModule, moduleIndex) =>
            courseModule.lessons.map((courseLesson, lessonIndex) => [`${moduleIndex}-${lessonIndex}`, courseLesson.lessonMode]),
          )),
          savedCourse.language ?? "English",
        );
        return NextResponse.json({
          ...toLessonDto(savedLesson, savedCourse.aiAssisted === true, savedCourse.topic, savedCourse.language ?? "English", savedCourse),
          publicationReadiness,
          recovered: true,
        });
      }
    }
    if (isLessonGenerationTimeout(error)) {
      return NextResponse.json(
        {
          error: "Lesson generation took longer than expected. Your request was released safely; try again in a moment.",
          code: "GENERATION_TIMEOUT",
        },
        { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5" } },
      );
    }
    const quotaResponse = aiQuotaResponse(error);
    if (quotaResponse) return quotaResponse;
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
      event: "lesson_generation_failed",
      standardModel: standardProfile.model,
      fallbackModel: fallbackProfile.model,
      ...safeModelErrorDetails(error),
    }));
    return NextResponse.json(
      { error: "Lesson generation is temporarily unavailable." },
      { status: 500 },
    );
  }
}
