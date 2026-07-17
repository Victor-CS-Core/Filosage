import { NextResponse } from "next/server";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { authorizationResponse, requirePremium } from "@/lib/auth-server";
import { createCourse } from "@/lib/firebase-server";
import {
  aiQuotaResponse,
  extractOpenAiUsage,
  finalizeAiUsage,
  reserveAiUsage,
  type AiReservation,
} from "@/lib/ai-usage";
import {
  courseOutlineSchema,
  courseRequestSchema,
  validationMessage,
} from "@/lib/validation";
import { assertSafeContent, ContentSafetyError } from "@/lib/content-safety";

const model = process.env.OPENAI_COURSE_MODEL || process.env.OPENAI_MODEL || "gpt-5.6-terra";

export async function POST(request: Request) {
  let reservation: AiReservation | null = null;
  let observedUsage = { inputTokens: 0, outputTokens: 0 };
  let responseId: string | undefined;
  try {
    const account = await requirePremium(request);
    const body = await request.json();
    const parsedRequest = courseRequestSchema.safeParse(body);
    if (!parsedRequest.success) {
      return NextResponse.json(
        { error: validationMessage(parsedRequest.error) },
        { status: 400 },
      );
    }

    const { topic, goal, application, background, level, weeklyMinutes, targetWeeks, courseStyle } = parsedRequest.data;
    const studyBudget = (weeklyMinutes ?? 120) * targetWeeks;
    const approach = courseStyle === "Concept-first"
      ? "Prioritize precise mental models and connected explanations before applied practice."
      : courseStyle === "Project-led"
        ? "Organize the sequence around a concrete applied result while preserving prerequisite order."
        : "Balance mental models, worked examples, retrieval, and application throughout the path.";
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    await assertSafeContent(client, [topic, goal, application, background].filter(Boolean).join("\n"));
    reservation = await reserveAiUsage(account, "course_outline", request.headers.get("idempotency-key"));
    const response = await client.responses.parse({
      model,
      instructions:
        "You are a master curriculum designer. Build a focused learning path using progressive difficulty, retrieval practice, and the Zone of Proximal Development. Include a realistic level, total learning time, concrete outcome, prerequisites, category, and an estimated time for every lesson. Keep each lesson tightly scoped, independently valuable, and free of filler. Return the requested structured course only.",
      input: [
        `Create a complete but efficient course outline for: ${topic}`,
        goal ? `Learner's observable goal: ${goal}` : "",
        application ? `Where the learner will apply it: ${application}` : "",
        background ? `Current background: ${background}` : "",
        level ? `Requested starting level: ${level}` : "",
        `Target plan: ${targetWeeks} weeks at ${weeklyMinutes ?? 120} minutes per week, approximately ${studyBudget} minutes total. Keep the estimated course time close to this budget rather than padding the outline.`,
        `Teaching approach: ${courseStyle}. ${approach}`,
        "Sequence prerequisite concepts before dependent concepts. Adapt examples and practice to the learner's intended application. Make every lesson earn its place and end with an observable capability.",
      ].filter(Boolean).join("\n"),
      text: {
        format: zodTextFormat(courseOutlineSchema, "course_outline"),
      },
      max_output_tokens: 4_000,
    });
    responseId = response.id;
    observedUsage = extractOpenAiUsage(response);

    const outline = response.output_parsed;
    if (!outline) {
      return NextResponse.json(
        { error: "The course could not be structured. Please try again." },
        { status: 502 },
      );
    }
    await assertSafeContent(client, JSON.stringify(outline));

    const course = await createCourse({
      topic,
      ...outline,
      topicKey: topic.toLowerCase().replace(/\s+/g, " "),
      authorId: account.uid,
      authorName: account.displayName ?? (account.isOwner ? "Erudoza" : "Erudoza learner"),
      authorPhoto: account.photoURL ?? null,
      isPublic: false,
    });

    await finalizeAiUsage(reservation, { ...observedUsage, responseId });
    reservation = null;

    return NextResponse.json({ ...outline, courseId: course.id, isPublic: false });
  } catch (error: unknown) {
    if (reservation) {
      await finalizeAiUsage(reservation, { ...observedUsage, responseId, failed: true }).catch((usageError) => {
        console.error("Course usage finalization failed:", usageError);
      });
    }
    const quotaResponse = aiQuotaResponse(error);
    if (quotaResponse) return quotaResponse;
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof ContentSafetyError) {
      return NextResponse.json({ error: error.message, code: "CONTENT_NOT_ALLOWED" }, { status: 422 });
    }

    console.error("Course generation failed:", error);
    return NextResponse.json(
      { error: "Course generation is temporarily unavailable." },
      { status: 500 },
    );
  }
}
