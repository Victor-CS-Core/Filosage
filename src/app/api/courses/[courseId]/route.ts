import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { authorizationResponse, requireOwner } from "@/lib/auth-server";
import { getAdminDb } from "@/lib/firebase-admin";

interface RouteParams {
  params: Promise<{ courseId: string }>;
}
export async function GET(request: Request, { params }: RouteParams) {
  const { courseId } = await params;
  try {
    const doc = await getAdminDb().collection("courses").doc(courseId).get();
    if (!doc.exists) return NextResponse.json({ error: "Course not found." }, { status: 404 });

    const data = doc.data()!;
    if (!data.isPublic) {
      const owner = await requireOwner(request);
      if (owner.uid !== data.authorId) {
        return NextResponse.json({ error: "You do not have access to this course." }, { status: 403 });
      }
    }

    return NextResponse.json(
      { courseId: doc.id, ...data },
      data.isPublic
        ? { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
        : undefined,
    );
  } catch (error: unknown) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error("Course fetch failed:", error);
    return NextResponse.json({ error: "The course is temporarily unavailable." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { courseId } = await params;
  try {
    const owner = await requireOwner(request);
    const courseRef = getAdminDb().collection("courses").doc(courseId);
    const courseDoc = await courseRef.get();
    if (!courseDoc.exists) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    if (courseDoc.data()?.authorId !== owner.uid) {
      return NextResponse.json({ error: "You do not own this course." }, { status: 403 });
    }

    const body = await request.json();
    if (typeof body.isPublic !== "boolean") {
      return NextResponse.json({ error: "Visibility must be true or false." }, { status: 400 });
    }

    const batch = getAdminDb().batch();
    batch.update(courseRef, {
      isPublic: body.isPublic,
      updatedAt: FieldValue.serverTimestamp(),
    });
    const lessons = await courseRef.collection("lessons").get();
    lessons.docs.forEach((lesson) => batch.update(lesson.ref, { isPublic: body.isPublic }));
    await batch.commit();

    return NextResponse.json({ success: true, isPublic: body.isPublic });
  } catch (error: unknown) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error("Course visibility update failed:", error);
    return NextResponse.json({ error: "Visibility could not be updated." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const { courseId } = await params;
  try {
    const owner = await requireOwner(request);
    const db = getAdminDb();
    const courseRef = db.collection("courses").doc(courseId);
    const courseDoc = await courseRef.get();
    if (!courseDoc.exists) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    if (courseDoc.data()?.authorId !== owner.uid) {
      return NextResponse.json({ error: "You do not own this course." }, { status: 403 });
    }

    const batch = db.batch();
    const lessons = await courseRef.collection("lessons").get();
    lessons.docs.forEach((lesson) => batch.delete(lesson.ref));
    batch.delete(courseRef);
    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error("Course deletion failed:", error);
    return NextResponse.json({ error: "The course could not be deleted." }, { status: 500 });
  }
}
