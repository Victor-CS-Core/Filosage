import { NextResponse } from "next/server";
import { authorizationResponse, requireAccount, requirePremium } from "@/lib/auth-server";
import { createCourse, listOwnerCourses, listPublicCourses } from "@/lib/firebase-server";
import { courseOutlineSchema, topicSchema, validationMessage } from "@/lib/validation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") ?? "public";

  try {
    if (scope === "public") {
      const courses = await listPublicCourses();
      return NextResponse.json(
        { courses },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (scope !== "mine") {
      return NextResponse.json({ error: "Unknown course scope." }, { status: 400 });
    }

    const account = await requireAccount(request);
    const courses = await listOwnerCourses(account.uid);
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
    const account = await requirePremium(request);
    const body = await request.json();
    const parsedTopic = topicSchema.safeParse(body.topic);
    const normalizedModules = Array.isArray(body.modules)
      ? body.modules.map((module: Record<string, unknown>) => ({
        ...module,
        lessons: Array.isArray(module.lessons)
          ? module.lessons.map((lesson: Record<string, unknown>) => ({ estimatedMinutes: 12, ...lesson }))
          : module.lessons,
      }))
      : body.modules;
    const parsedOutline = courseOutlineSchema.safeParse({
      mission: body.mission,
      level: body.level ?? "Foundations",
      estimatedMinutes: body.estimatedMinutes ?? 60,
      outcome: body.outcome ?? body.mission,
      prerequisites: body.prerequisites ?? [],
      category: body.category ?? "General",
      modules: normalizedModules,
    });

    if (!parsedTopic.success) {
      return NextResponse.json({ error: validationMessage(parsedTopic.error) }, { status: 400 });
    }
    if (!parsedOutline.success) {
      return NextResponse.json({ error: validationMessage(parsedOutline.error) }, { status: 400 });
    }

    const course = await createCourse({
      topic: parsedTopic.data,
      topicKey: parsedTopic.data.toLowerCase().replace(/\s+/g, " "),
      ...parsedOutline.data,
      authorId: account.uid,
      authorName: account.displayName ?? (account.isOwner ? "Erudoza" : "Erudoza learner"),
      authorPhoto: account.photoURL ?? null,
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
