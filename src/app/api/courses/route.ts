import { NextResponse } from "next/server";
import { authorizationResponse, requireAccount } from "@/lib/auth-server";
import { listOwnerCourses, listPublicCourses } from "@/lib/firebase-server";
import { toCourseDto } from "@/lib/course-dto";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") ?? "public";

  try {
    if (scope === "public") {
      const courses = await listPublicCourses();
      return NextResponse.json(
        { courses: courses.map((course) => toCourseDto(course)) },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (scope !== "mine") {
      return NextResponse.json({ error: "Unknown course scope." }, { status: 400 });
    }

    const account = await requireAccount(request);
    const courses = await listOwnerCourses(account.uid);
    return NextResponse.json({ courses: courses.map((course) => toCourseDto(course, true)) });
  } catch (error: unknown) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error("Course listing failed:", error);
    return NextResponse.json({ error: "Courses are temporarily unavailable." }, { status: 500 });
  }
}
