import { NextResponse } from "next/server";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { authorizationResponse, requireOwner } from "@/lib/auth-server";
import { createCourse, findOwnerCourse } from "@/lib/firebase-server";
import {
  courseOutlineSchema,
  topicSchema,
  validationMessage,
} from "@/lib/validation";

const model = process.env.OPENAI_MODEL || "gpt-5.6";

export async function POST(request: Request) {
  try {
    const owner = await requireOwner(request);
    const body = await request.json();
    const parsedTopic = topicSchema.safeParse(body.topic);
    if (!parsedTopic.success) {
      return NextResponse.json(
        { error: validationMessage(parsedTopic.error) },
        { status: 400 },
      );
    }

    const topic = parsedTopic.data;
    const existing = await findOwnerCourse(owner.uid, topic);
    if (existing) {
      return NextResponse.json({ ...existing, courseId: existing.id });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.parse({
      model,
      instructions:
        "You are a master curriculum designer. Build focused learning paths using progressive difficulty, retrieval practice, and the Zone of Proximal Development. Keep every lesson tightly scoped, practical, and free of filler. Return the requested structured course only.",
      input: `Create a complete course outline for: ${topic}`,
      text: {
        format: zodTextFormat(courseOutlineSchema, "course_outline"),
      },
      max_output_tokens: 8_000,
    });

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
      authorId: owner.uid,
      authorName: owner.name ?? owner.email ?? "Teach owner",
      authorPhoto: owner.picture ?? null,
      isPublic: false,
    });

    return NextResponse.json({ ...outline, courseId: course.id, isPublic: false });
  } catch (error: unknown) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;

    console.error("Course generation failed:", error);
    return NextResponse.json(
      { error: "Course generation is temporarily unavailable." },
      { status: 500 },
    );
  }
}
