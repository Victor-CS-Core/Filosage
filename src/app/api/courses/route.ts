import { NextResponse } from "next/server";
import { authorizationResponse, requireOwner } from "@/lib/auth-server";
import {
  createCourse,
  findOwnerCourse,
  listOwnerCourses,
  listPublicCourses,
} from "@/lib/firebase-server";
import { courseOutlineSchema, topicSchema, validationMessage } from "@/lib/validation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") ?? "public";

  try {
    if (scope === "public") {
      const courses = await listPublicCourses();
      return NextResponse.json(
        { courses },
        { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
      );
    }

    if (scope !== "mine") {
      return NextResponse.json({ error: "Unknown course scope." }, { status: 400 });
    }

    const owner = await requireOwner(request);
    const courses = await listOwnerCourses(owner.uid);
    return NextResponse.json({ courses });
  } catch (error: unknown) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error("Course listing failed:", error);
    return NextResponse.json({ error: "Courses are temporarily unavailable." }, { status: 500 });
  }
}
export async function POST(request: Request) {
  try {
    const owner = await requireOwner(request);
    const body = await request.json();
    const parsedTopic = topicSchema.safeParse(body.topic);
    const parsedOutline = courseOutlineSchema.safeParse({
      mission: body.mission,
      modules: body.modules,
    });

    if (!parsedTopic.success) {
      return NextResponse.json({ error: validationMessage(parsedTopic.error) }, { status: 400 });
    }
    if (!parsedOutline.success) {
      return NextResponse.json({ error: validationMessage(parsedOutline.error) }, { status: 400 });
    }

    const existing = await findOwnerCourse(owner.uid, parsedTopic.data);
    if (existing) {
      return NextResponse.json({ courseId: existing.id });
    }

    const course = await createCourse({
      topic: parsedTopic.data,
      ...parsedOutline.data,
      authorId: owner.uid,
      authorName: owner.name ?? owner.email ?? "Teach owner",
      authorPhoto: owner.picture ?? null,
      isPublic: false,
    });

    return NextResponse.json({ courseId: course.id });
  } catch (error: unknown) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error("Course save failed:", error);
    return NextResponse.json({ error: "The course could not be saved." }, { status: 500 });
  }
}
