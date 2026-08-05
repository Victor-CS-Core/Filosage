import { NextResponse } from "next/server";
import { aiClient } from "@/lib/local-ai";
import { zodTextFormat } from "openai/helpers/zod";
import { authorizationResponse, requirePremium } from "@/lib/auth-server";
import { getCourse, getCoursePublishReadiness, getLesson, getStoredDocument, saveLesson } from "@/lib/firebase-server";
import {
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
} from "@/lib/lesson-interactions";
import { lessonVisualsEnabled } from "@/lib/feature-flags";
import { languagePolicyInstruction } from "@/lib/content-language";
import { lessonQualityIssues, LESSON_QUALITY_GATE_VERSION } from "@/lib/lesson-quality";
import { lessonGenerationGate } from "@/lib/authoring-gate";
import { sourcePackPromptBlock } from "@/lib/source-safety";
import { safeModelErrorDetails } from "@/lib/model-fallback";
import {
  aiUsageProfileMetadata,
  openAiExecutionProfile,
  type AiExecutionProfile,
} from "@/lib/openai-generation";

const lessonInstructions = (lessonVisualsAreEnabled: boolean) => `Act as a rigorous teacher and instructional designer. Create one lesson that advances a specific capability within a larger course.

Use the requested lesson mode instead of forcing every lesson into the same pattern. The experience object is the lesson's central activity and its type must exactly match the requested teaching mode. For concept, ask for a prediction before revealing a mental model and misconception correction. For worked-example, expose at least three expert reasoning steps, then fade support. For comparison, use explicit criteria and a difficult boundary case. For case-study, provide an evidence packet, competing interpretations, and a decision prompt. For practice-lab, provide usable materials, ordered tasks, and an artifact with criteria. For synthesis, connect prior concepts and advance the course capstone. Begin by connecting this lesson to prerequisite knowledge, then state one observable learning objective. Explain only what the learner needs in order to do the activity. Include guided practice with visible reasoning, followed by a transfer task that asks the learner to use the idea in a different situation. End with concise takeaways, not a repeated conclusion.

Write direct, natural prose in accessible Markdown. Use descriptive H2 and H3 headings only and never repeat the lesson title as a heading. Target roughly 650 to 1,000 words because the activity, not prose length, should carry the cognitive work. Avoid generic encouragement, promotional language, vague claims, invented citations, repeated conclusions, and filler. Never use em dashes; prefer commas, colons, or separate sentences.

The guided-practice prompt, worked response, transfer prompt, and model response support GitHub-flavored Markdown. Each guided step must be one concise prose paragraph with no heading, list, table, blockquote, code fence, raw HTML, or other block Markdown. Use real lists or tables only in the larger prompt and response fields when structure improves scanning. Every table must place its header, separator, and each data row on separate lines. Never compress Markdown table rows into one line or place table syntax directly after prose.

Do not create diagrams, graphs, Mermaid syntax, raw SVG, HTML, or visual-model sections in Markdown. Communicate every relationship clearly in prose and examples.

${lessonVisualsAreEnabled
  ? "Return zero, one, or two candidate strings in visuals. Each string must be compact JSON for one learning aid. The app, not you, determines final placement and selection. Every object needs type, title, and summary. Type-specific fields are: concept-contrast has misconception, accurateView, whyItMatters; process-flow has steps [{title, detail}]; comparison-matrix has columns [left, right] and rows [{criterion, values:[left, right]}]; worked-example-trace has prompt and steps [{title, detail, check}]; prerequisite-map has nodes [{label, detail, role}], where role is foundation, current, or next. Use visuals: [] when no candidate materially improves understanding. Do not include id, placement, version, diagram syntax, SVG, or HTML."
  : "Return visuals: []. The structured visual system is not enabled for this lesson yet."}

Return exactly one candidate string in interactions. The string must be compact JSON for an objective-aligned Recognition v2 practice lab, not a decorative interaction. Use type "recognition" and include title, summary, and prompt. This practice layer trains discriminations that support the lesson's observable objective; the central experience and transfer task carry the larger authentic performance.

Recognition requires targetSkill copied from the observable learning objective, referencePolicy "hidden-until-complete", mastery {minimumFirstAttemptCorrect, retryMissed:true}, and 6 to 16 items. Each item needs stimulus {kind:"text"|"signal", value, accessibleLabel}, exactly four choices [{label, feedback, misconception?}], correctIndex, explanation, and difficulty "foundation"|"contrast"|"transfer". Do not include item IDs. Hide answers until the learner commits. Distractors must be plausible confusions or misconceptions, every choice needs specific explanatory feedback, and the mastery threshold must match the objective when it states a score.

Do not return classification, sequence, scenario, or signal for this field. Do not duplicate the quizzes. Do not include interaction id, version, HTML, scripts, URLs, or executable content.

Create application-focused quizzes, not trivia. Each answer option needs feedback that explains why that specific choice is correct or incorrect. Vary the correct option positions. Return only the requested structured lesson.

${AI_SAFETY_POLICY}`;

export async function POST(request: Request) {
  const standardProfile = openAiExecutionProfile("lesson.standard");
  const fallbackProfile = openAiExecutionProfile("lesson.fallback");
  const recoveryProfile = openAiExecutionProfile("lesson.recovery");
  const lessonVisualsAreEnabled = lessonVisualsEnabled();
  let reservation: AiReservation | null = null;
  const usageSamples: AiUsageSample[] = [];
  let responseId: string | undefined;
  try {
    const account = await requirePremium(request);
    const parsed = generateLessonInputSchema.safeParse(await readJsonBody(request, 2_048));
    if (!parsed.success) {
      return NextResponse.json(
        { error: validationMessage(parsed.error) },
        { status: 400 },
      );
    }

    const { courseId, lessonId, regenerate } = parsed.data;
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
    if (saved && !regenerate) return NextResponse.json(toLessonDto(saved, course.aiAssisted === true, course.topic));
    if (saved && course.isPublic) {
      return NextResponse.json(
        { error: "Unpublish this course before regenerating a lesson." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
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

    reservation = await reserveAiUsage(account, "lesson_generation", request.headers.get("idempotency-key"));
    const client = aiClient();
    await assertSafeContent(
      client,
      [topic, lessonTitle, lessonConcept, course.outcome ?? course.mission ?? ""].join("\n"),
      { uid: account.uid, feature: "lesson_generation", stage: "input" },
    );
    const safetyIdentifier = await openAiSafetyIdentifier(account.uid);
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
      sourcePackPromptBlock(course.sourcePack ?? [], "No source pack is available. Return sourceReferences: [] and do not invent citations."),
      course.capstone
        ? `Course capstone: ${course.capstone.brief} Deliverable: ${course.capstone.deliverable}`
        : "",
      instructionalContext?.goal ? `Learner goal: ${instructionalContext.goal}` : "",
      instructionalContext?.application ? `Intended application: ${instructionalContext.application}` : "",
      instructionalContext?.background ? `Learner background: ${instructionalContext.background}` : "",
    ].filter(Boolean).join("\n");
    const namedBuildsOn = canonical.lesson.buildsOn?.filter((item) => item.trim()) ?? [];
    const visualContext = {
      lessonMode: canonical.lesson.lessonMode,
      buildsOn: namedBuildsOn.length ? namedBuildsOn : (previousLesson ? [previousLesson.title] : []),
      misconception: canonical.lesson.misconception,
    };

    let selectedSourceIds: string[] = [];
    const prepareLesson = (generated: GeneratedLessonData | null): LessonData | null => {
      if (!generated) return null;
      const { visuals, interactions, sourceReferences, ...lesson } = generated;
      selectedSourceIds = sourceReferences;
      const prepared: LessonData = {
        ...lesson,
        visuals: lessonVisualsAreEnabled ? curateLessonVisuals(visuals, visualContext) : [],
        interactions: curateLessonInteractions(interactions),
      };
      return { ...prepared, interactions: deriveLessonInteractions(prepared) };
    };

    const generate = (profile: AiExecutionProfile, repairIssues: string[] = []) => client.responses.parse({
      model: profile.model,
      store: false,
      instructions: `${lessonInstructions(lessonVisualsAreEnabled)}\n\n${languagePolicyInstruction(topic)}`,
      input: repairIssues.length
        ? `${lessonContext}\n\nThe previous draft failed the quality gate. Correct every issue:\n- ${repairIssues.join("\n- ")}`
        : lessonContext,
      text: {
        format: zodTextFormat(lessonGenerationSchema, "lesson"),
        verbosity: profile.textVerbosity,
      },
      reasoning: { effort: profile.reasoningEffort },
      prompt_cache_key: profile.promptCacheKey,
      max_output_tokens: 6_000,
      safety_identifier: safetyIdentifier,
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
      try {
        activeProfile = fallbackProfile;
        primaryResponse = await generateAndRecord(fallbackProfile, ["The standard generation attempt failed before producing a usable lesson."]);
      } catch (fallbackError) {
        console.warn(JSON.stringify({
          event: "lesson_fallback_model_failed",
          model: fallbackProfile.model,
          recoveryModel: recoveryProfile.model,
          ...safeModelErrorDetails(fallbackError),
        }));
        activeProfile = recoveryProfile;
        primaryResponse = await generateAndRecord(recoveryProfile, ["The standard and fallback generation attempts failed before producing a usable lesson."]);
      }
    }
    let lesson = prepareLesson(primaryResponse.output_parsed as GeneratedLessonData | null);
    let qualityIssues = lessonQualityIssues(lesson, topic, expectedMode, { requireInteractionV2: true });

    if (qualityIssues.length && activeProfile.id === standardProfile.id) {
      try {
        activeProfile = fallbackProfile;
        const fallbackResponse = await generateAndRecord(fallbackProfile, qualityIssues);
        lesson = prepareLesson(fallbackResponse.output_parsed as GeneratedLessonData | null);
      } catch (error) {
        console.warn(JSON.stringify({
          event: "lesson_quality_repair_failed",
          model: fallbackProfile.model,
          recoveryModel: recoveryProfile.model,
          ...safeModelErrorDetails(error),
        }));
      }
      qualityIssues = lessonQualityIssues(lesson, topic, expectedMode, { requireInteractionV2: true });
    }

    if (qualityIssues.length && !activeProfile.recovery) {
      activeProfile = recoveryProfile;
      const recoveryResponse = await generateAndRecord(recoveryProfile, qualityIssues);
      lesson = prepareLesson(recoveryResponse.output_parsed as GeneratedLessonData | null);
      qualityIssues = lessonQualityIssues(lesson, topic, expectedMode, { requireInteractionV2: true });
    }

    if (!lesson || qualityIssues.length) {
      await finalizeAiUsage(reservation, { usageSamples, responseId, failed: true });
      reservation = null;
      return NextResponse.json(
        { error: "The lesson did not meet Erudoza's teaching-quality standard. Please try again." },
        { status: 502 },
      );
    }
    await assertSafeContent(client, JSON.stringify(lesson), {
      uid: account.uid,
      feature: "lesson_generation",
      stage: "output",
    });

    const sourceReferences = (course.sourcePack ?? [])
      .filter((source) => selectedSourceIds.includes(source.id))
      .map((source) => ({ label: source.label, url: source.url }));
    const generationMetadata = {
      generatedAt: new Date().toISOString(),
      promptVersion: activeProfile.promptVersion,
      qualityGateVersion: LESSON_QUALITY_GATE_VERSION,
      interactionQualityGateVersion: INTERACTION_QUALITY_GATE_VERSION,
      sourceReferences,
    };
    await saveLesson(courseId, lessonId, {
      ...lesson,
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
    });

    await finalizeAiUsage(reservation, { usageSamples, responseId });
    reservation = null;

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
    }, true, topic);
    return NextResponse.json({
      ...lessonDto,
      publicationReadiness,
      evaluation: account.isOwner && request.headers.get("x-erudoza-model-evaluation") === "1"
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
    if (reservation) {
      await finalizeAiUsage(reservation, {
        usageSamples,
        model: standardProfile.model,
        responseId,
        failed: true,
        ...aiUsageProfileMetadata(standardProfile),
      }).catch((usageError) => {
        console.error("Lesson usage finalization failed:", usageError);
      });
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
      recoveryModel: recoveryProfile.model,
      ...safeModelErrorDetails(error),
    }));
    return NextResponse.json(
      { error: "Lesson generation is temporarily unavailable." },
      { status: 500 },
    );
  }
}
