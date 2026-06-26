import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

interface RouteParams {
  params: Promise<{ courseId: string; lessonId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { courseId, lessonId } = await params;
  try {
    const doc = await adminDb
      .collection("courses")
      .doc(courseId)
      .collection("lessons")
      .doc(lessonId)
      .get();
      
    if (!doc.exists) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    return NextResponse.json(doc.data());
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
