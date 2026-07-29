import { NextResponse } from "next/server";
import { aiClient } from "@/lib/local-ai";
import { zodTextFormat } from "openai/helpers/zod";
import { authorizationResponse, requirePremium } from "@/lib/auth-server";
import { getCourse, getLesson, saveLesson } from "@/lib/firebase-server";
import {
  aiQuotaResponse,
  extractOpenAiUsage,
  finalizeAiUsage,
  reserveAiUsage,
  type AiReservation,
} from "@/lib/ai-usage";
import type { AiUsageSample } from "@/lib/ai-pricing";
import {
  generateLessonInputSchema,
  lessonGenerationSchema,
  validationMessage,
  type GeneratedLessonData,
} from "@/lib/validation";
import { findCourseLesson } from "@/lib/course-progress";
import type { Course, LessonData } from "@/lib/course-types";
import { AI_SAFETY_POLICY, assertSafeContent, ContentSafetyError } from "@/lib/content-safety";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { openAiSafetyIdentifier } from "@/lib/ai-usage";
import { toLessonDto } from "@/lib/course-dto";
import { curateLessonVisuals } from "@/lib/lesson-visuals";
import { lessonVisualsEnabled } from "@/lib/feature-flags";
import { hasCollapsedMarkdownTable } from "@/lib/markdown";
import { inspectGeneratedContent, languagePolicyInstruction } from "@/lib/content-language";

const model = process.env.OPENAI_LESSON_MODEL || "gpt-5.6-luna";
const fallbackModel = process.env.OPENAI_LESSON_FALLBACK_MODEL
  || process.env.OPENAI_COURSE_MODEL
  || process.env.OPENAI_MODEL
  || "gpt-5.6-terra";
const LESSON_PROMPT_VERSION = "2026-07-28-language-integrity";
const LESSON_QUALITY_GATE_VERSION = "didactic-v3";
const lessonVisualsAreEnabled = lessonVisualsEnabled();

const lessonInstructions = `Act as a rigorous teacher and instructional designer. Create one lesson that advances a specific capability within a larger course.

Use the requested lesson mode instead of forcing every lesson into the same pattern. Begin by connecting this lesson to prerequisite knowledge, then state one observable learning objective. Explain the core idea from first principles with one concrete example. Use the supplied misconception to create a useful contrast. Include guided practice with visible reasoning, followed by a transfer task that asks the learner to use the idea in a different situation. End with concise takeaways, not a repeated conclusion.

Write direct, natural prose in accessible Markdown. Use descriptive H2 and H3 headings only and never repeat the lesson title as a heading. Target roughly 900 to 1,300 words. Avoid generic encouragement, promotional language, vague claims, invented citations, repeated conclusions, and filler. Never use em dashes; prefer commas, colons, or separate sentences.

The guided-practice prompt, each guided step, the worked response, the transfer prompt, and the model response support GitHub-flavored Markdown. Use real lists or tables when structure improves scanning. Every table must place its header, separator, and each data row on separate lines. Never compress Markdown table rows into one line or place table syntax directly after prose.

Do not create diagrams, graphs, Mermaid syntax, raw SVG, HTML, or visual-model sections in Markdown. Communicate every relationship clearly in prose and examples.

${lessonVisualsAreEnabled
  ? "Return zero, one, or two candidate strings in visuals. Each string must be compact JSON for one learning aid. The app, not you, determines final placement and selection. Every object needs type, title, and summary. Type-specific fields are: concept-contrast has misconception, accurateView, whyItMatters; process-flow has steps [{title, detail}]; comparison-matrix has columns [left, right] and rows [{criterion, values:[left, right]}]; worked-example-trace has prompt and steps [{title, detail, check}]; prerequisite-map has nodes [{label, detail, role}], where role is foundation, current, or next. Use visuals: [] when no candidate materially improves understanding. Do not include id, placement, version, diagram syntax, SVG, or HTML."
  : "Return visuals: []. The structured visual system is not enabled for this lesson yet."}

Create application-focused quizzes, not trivia. Each answer option needs feedback that explains why that specific choice is correct or incorrect. Vary the correct option positions. Return only the requested structured lesson.

${AI_SAFETY_POLICY}`;

function lessonQualityIssues(lesson: LessonData | null, topic: string) {
  if (!lesson) return ["No structured lesson was returned."];
  const issues: string[] = [];
  if (lesson.content.trim().length < 1_500) issues.push("The explanation is too shallow.");
  if (!lesson.learningObjective?.trim()) issues.push("The observable learning objective is missing.");
  if (!lesson.connection?.trim()) issues.push("The curricular connection is missing.");
  if ((lesson.keyTakeaways?.length ?? 0) < 3) issues.push("At least three concrete takeaways are required.");
  if ((lesson.guidedPractice?.steps.length ?? 0) < 2) issues.push("Guided practice needs at least two reasoning steps.");
  const structuredPractice = [
    lesson.guidedPractice?.prompt,
    ...(lesson.guidedPractice?.steps ?? []),
    lesson.guidedPractice?.modelAnswer,
    lesson.transferTask?.prompt,
    lesson.transferTask?.modelResponse,
  ].filter((item): item is string => Boolean(item));
  if (structuredPractice.some(hasCollapsedMarkdownTable)) {
    issues.push("Markdown tables in practice fields need a line break before the table and between every row.");
  }
  if ((lesson.transferTask?.successCriteria.length ?? 0) < 2) issues.push("The transfer task needs measurable success criteria.");
  if (/```(?:mermaid|dot|graphviz)\b|^\s*(?:flowchart|graph)\s+(?:TB|TD|BT|RL|LR)\b/im.test(lesson.content)) {
    issues.push("Remove all diagram and graph syntax; teach the relationships in prose.");
  }
  if (lesson.quizzes.length < 2) issues.push("At least two application-focused checks are required.");
  if (lesson.quizzes.some((quiz) => quiz.options.length !== 4 || quiz.optionFeedback?.length !== 4)) {
    issues.push("Every quiz option needs corresponding feedback.");
  }
  issues.push(...inspectGeneratedContent(lesson, topic).map((issue) =>
    `${issue.path} ${issue.reason}.`,
  ));
  return issues;
}

export async function POST(request: Request) {
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

    const { courseId, lessonId } = parsed.data;
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
    if (saved) return NextResponse.json(toLessonDto(saved, course.aiAssisted === true, course.topic));
    const topic = course.topic;
    const lessonTitle = canonical.lesson.title;
    const lessonConcept = canonical.lesson.concept;
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

    const prepareLesson = (generated: GeneratedLessonData | null): LessonData | null => generated
      ? { ...generated, visuals: lessonVisualsAreEnabled ? curateLessonVisuals(generated.visuals, visualContext) : [] }
      : null;

    const generate = (selectedModel: string, repairIssues: string[] = []) => client.responses.parse({
      model: selectedModel,
      store: false,
      instructions: `${lessonInstructions}\n\n${languagePolicyInstruction(topic)}`,
      input: repairIssues.length
        ? `${lessonContext}\n\nThe previous draft failed the quality gate. Correct every issue:\n- ${repairIssues.join("\n- ")}`
        : lessonContext,
      text: {
        format: zodTextFormat(lessonGenerationSchema, "lesson"),
      },
      max_output_tokens: 4_000,
      safety_identifier: safetyIdentifier,
    });

    const primaryResponse = await generate(model);
    responseId = primaryResponse.id;
    usageSamples.push({ model, ...extractOpenAiUsage(primaryResponse), responseId });
    let lesson = prepareLesson(primaryResponse.output_parsed as GeneratedLessonData | null);
    let qualityIssues = lessonQualityIssues(lesson, topic);
    let usedFallback = false;

    if (qualityIssues.length && fallbackModel !== model) {
      const fallbackResponse = await generate(fallbackModel, qualityIssues);
      responseId = fallbackResponse.id;
      usageSamples.push({ model: fallbackModel, ...extractOpenAiUsage(fallbackResponse), responseId });
      lesson = prepareLesson(fallbackResponse.output_parsed as GeneratedLessonData | null);
      qualityIssues = lessonQualityIssues(lesson, topic);
      usedFallback = true;
    }

    if (!lesson || qualityIssues.length) {
      await finalizeAiUsage(reservation, { usageSamples, model, responseId, failed: true });
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

    const generationMetadata = {
      generatedAt: new Date().toISOString(),
      promptVersion: LESSON_PROMPT_VERSION,
      qualityGateVersion: LESSON_QUALITY_GATE_VERSION,
      sourceReferences: [],
    };
    await saveLesson(courseId, lessonId, {
      ...lesson,
      authorId: account.uid,
      aiAssisted: true,
      isPublic: coursePublic,
      schemaVersion: 3,
      generationModel: usedFallback ? fallbackModel : model,
      fallbackUsed: usedFallback,
      ...generationMetadata,
    });

    await finalizeAiUsage(reservation, { usageSamples, responseId });
    reservation = null;

    return NextResponse.json(toLessonDto({
      ...lesson,
      aiAssisted: true,
      schemaVersion: 3,
      generationModel: usedFallback ? fallbackModel : model,
      ...generationMetadata,
    }, true, topic));
  } catch (error: unknown) {
    if (reservation) {
      await finalizeAiUsage(reservation, { usageSamples, model, responseId, failed: true }).catch((usageError) => {
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

    console.error("Lesson generation failed:", error);
    return NextResponse.json(
      { error: "Lesson generation is temporarily unavailable." },
      { status: 500 },
    );
  }
}
