import { NextResponse } from "next/server";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { authorizationResponse, requirePremium } from "@/lib/auth-server";
import { createCourse, findOwnerCourse } from "@/lib/firebase-server";
import {
  aiQuotaResponse,
  extractOpenAiUsage,
  finalizeAiUsage,
  reserveAiUsage,
  type AiReservation,
} from "@/lib/ai-usage";
import {
  courseOutlineSchema,
  topicSchema,
  validationMessage,
} from "@/lib/validation";

const model = process.env.OPENAI_MODEL || "gpt-5.6";

export async function POST(request: Request) {
  let reservation: AiReservation | null = null;
  let observedUsage = { inputTokens: 0, outputTokens: 0 };
  let responseId: string | undefined;
  try {
    const account = await requirePremium(request);
    const body = await request.json();
    const parsedTopic = topicSchema.safeParse(body.topic);
    if (!parsedTopic.success) {
      return NextResponse.json(
        { error: validationMessage(parsedTopic.error) },
        { status: 400 },
      );
    }

    const topic = parsedTopic.data;
    const existing = await findOwnerCourse(account.uid, topic);
    if (existing) {
      return NextResponse.json({ ...existing, courseId: existing.id });
    }

    reservation = await reserveAiUsage(account, "course_outline", request.headers.get("idempotency-key"));
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.parse({
      model,
      instructions:
        "You are a master curriculum designer. Build a focused learning path using progressive difficulty, retrieval practice, and the Zone of Proximal Development. Include a realistic level, total learning time, concrete outcome, prerequisites, category, and an estimated time for every lesson. Keep each lesson tightly scoped and free of filler. Return the requested structured course only.",
      input: `Create a complete but efficient course outline for: ${topic}`,
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

    console.error("Course generation failed:", error);
    return NextResponse.json(
      { error: "Course generation is temporarily unavailable." },
      { status: 500 },
    );
  }
}
