import { NextResponse } from "next/server";
import OpenAI from "openai";
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
import {
  generateLessonInputSchema,
  lessonDataSchema,
  validationMessage,
} from "@/lib/validation";
import { findCourseLesson } from "@/lib/course-progress";
import type { Course } from "@/lib/course-types";

const model = process.env.OPENAI_LESSON_MODEL || process.env.OPENAI_MODEL || "gpt-5.6-terra";

export async function POST(request: Request) {
  let reservation: AiReservation | null = null;
  let observedUsage = { inputTokens: 0, outputTokens: 0 };
  let responseId: string | undefined;
  try {
    const account = await requirePremium(request);
    const parsed = generateLessonInputSchema.safeParse(await request.json());
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
    if (saved) return NextResponse.json(saved);
    const topic = course.topic;
    const lessonTitle = canonical.lesson.title;
    const lessonConcept = canonical.lesson.concept;
    const coursePublic = course.isPublic === true;

    reservation = await reserveAiUsage(account, "lesson_generation", request.headers.get("idempotency-key"));
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.parse({
      model,
      instructions:
        "You are a master teacher designing one rigorous, memorable lesson. Build understanding in this order: orient the learner with a concrete question, explain the mental model from first principles, work through one realistic example step by step, identify a common misconception, and end with a short transfer prompt. Write accessible Markdown with descriptive H2 sections and H3 subsections only; never repeat the lesson title as a heading. Prefer precise explanations over filler. Mermaid diagrams must be syntactically valid, simple, legible on a phone, and contain no external links or HTML. Always include a plain-language diagramSummary that communicates every relationship for learners who cannot see the diagram. Quizzes must test recall and application rather than trivia. Distribute correct answers across different option positions; do not consistently place the correct answer first. Return only the requested structured lesson.",
      input: `Course topic: ${topic}\nLesson: ${lessonTitle}\nCore concept: ${lessonConcept}\nCourse outcome: ${course.outcome ?? course.mission}\nModule: ${course.modules[canonical.moduleIndex]?.title ?? "Current module"}`,
      text: {
        format: zodTextFormat(lessonDataSchema, "lesson"),
      },
      max_output_tokens: 6_000,
    });
    responseId = response.id;
    observedUsage = extractOpenAiUsage(response);

    const lesson = response.output_parsed;
    if (!lesson) {
      return NextResponse.json(
        { error: "The lesson could not be structured. Please try again." },
        { status: 502 },
      );
    }

    await saveLesson(courseId, lessonId, {
      ...lesson,
      authorId: account.uid,
      isPublic: coursePublic,
    });

    await finalizeAiUsage(reservation, { ...observedUsage, responseId });
    reservation = null;

    return NextResponse.json(lesson);
  } catch (error: unknown) {
    if (reservation) {
      await finalizeAiUsage(reservation, { ...observedUsage, responseId, failed: true }).catch((usageError) => {
        console.error("Lesson usage finalization failed:", usageError);
      });
    }
    const quotaResponse = aiQuotaResponse(error);
    if (quotaResponse) return quotaResponse;
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;

    console.error("Lesson generation failed:", error);
    return NextResponse.json(
      { error: "Lesson generation is temporarily unavailable." },
      { status: 500 },
    );
  }
}
