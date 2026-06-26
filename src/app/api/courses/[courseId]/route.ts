import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

interface RouteParams {
  params: Promise<{ courseId: string }>;
}

// ── GET: fetch a single course ─────────────────────────────────────────
export async function GET(request: Request, { params }: RouteParams) {
  const { courseId } = await params;
  try {
    const doc = await adminDb.collection("courses").doc(courseId).get();
    if (!doc.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data = doc.data()!;

    // Check access: public or owner
    if (!data.isPublic) {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
      if (decoded.uid !== data.authorId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    return NextResponse.json({ courseId: doc.id, ...data });
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// ── PATCH: toggle isPublic ─────────────────────────────────────────────
export async function PATCH(request: Request, { params }: RouteParams) {
  const { courseId } = await params;
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));

    const courseRef = adminDb.collection("courses").doc(courseId);
    const courseDoc = await courseRef.get();
    if (!courseDoc.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (courseDoc.data()?.authorId !== decoded.uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { isPublic } = await request.json();
    const batch = adminDb.batch();

    // Update the course document
    batch.update(courseRef, { isPublic, updatedAt: FieldValue.serverTimestamp() });

    // Batch-update all lesson subcollection docs (denormalization sync)
    const lessonsSnap = await courseRef.collection("lessons").get();
    lessonsSnap.docs.forEach((lessonDoc) => {
      batch.update(lessonDoc.ref, { isPublic });
    });

    await batch.commit();
    return NextResponse.json({ success: true, isPublic });
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

// ── DELETE: remove a course and all its lessons ────────────────────────
export async function DELETE(request: Request, { params }: RouteParams) {
  const { courseId } = await params;
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));

    const courseRef = adminDb.collection("courses").doc(courseId);
    const courseDoc = await courseRef.get();
    if (!courseDoc.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (courseDoc.data()?.authorId !== decoded.uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const batch = adminDb.batch();
    const lessonsSnap = await courseRef.collection("lessons").get();
    lessonsSnap.docs.forEach((doc) => batch.delete(doc.ref));
    batch.delete(courseRef);
    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
