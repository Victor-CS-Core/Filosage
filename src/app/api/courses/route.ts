import { NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") ?? "public"; // "public" | "mine"

  try {
    if (scope === "public") {
      // Anyone can fetch public courses (no auth required)
      const snap = await adminDb
        .collection("courses")
        .where("isPublic", "==", true)
        .orderBy("updatedAt", "desc")
        .limit(20)
        .get();

      const courses = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      return NextResponse.json({ courses });
    }

    // scope === "mine" — requires auth
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const snap = await adminDb
      .collection("courses")
      .where("authorId", "==", decoded.uid)
      .orderBy("updatedAt", "desc")
      .get();

    const courses = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ courses });
  } catch (error: unknown) {
    console.error("Error in /api/courses:", error);
    const msg = (error as Error)?.message ?? "Failed to fetch courses.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const courseData = await request.json();
    
    // Check if course already exists to avoid duplicates
    const existing = await adminDb.collection("courses")
      .where("authorId", "==", decoded.uid)
      .where("topic", "==", courseData.topic)
      .limit(1)
      .get();
      
    if (!existing.empty) {
      return NextResponse.json({ courseId: existing.docs[0].id });
    }

    const { FieldValue } = await import("firebase-admin/firestore");

    const courseRef = await adminDb.collection("courses").add({
      topic: courseData.topic,
      mission: courseData.mission ?? "",
      modules: courseData.modules ?? [],
      authorId: decoded.uid,
      authorName: decoded.name ?? null,
      authorPhoto: decoded.picture ?? null,
      isPublic: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    
    return NextResponse.json({ courseId: courseRef.id });
  } catch (error) {
    console.error("Error saving course:", error);
    return NextResponse.json({ error: "Failed to save course" }, { status: 500 });
  }
}
