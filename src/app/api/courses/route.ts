import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { authorizationResponse, requireOwner } from "@/lib/auth-server";
import { getAdminDb } from "@/lib/firebase-admin";
import { courseOutlineSchema, topicSchema, validationMessage } from "@/lib/validation";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") ?? "public";

  try {
    const db = getAdminDb();
    if (scope === "public") {
      const snap = await db
        .collection("courses")
        .where("isPublic", "==", true)
        .orderBy("updatedAt", "desc")
        .limit(24)
        .get();

      const courses = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      return NextResponse.json(
        { courses },
        { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
      );
    }

    if (scope !== "mine") {
      return NextResponse.json({ error: "Unknown course scope." }, { status: 400 });
    }

    const owner = await requireOwner(request);
    const snap = await db
      .collection("courses")
      .where("authorId", "==", owner.uid)
      .orderBy("updatedAt", "desc")
      .get();

    const courses = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
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

    const db = getAdminDb();
    const existing = await db
      .collection("courses")
      .where("authorId", "==", owner.uid)
      .where("topic", "==", parsedTopic.data)
      .limit(1)
      .get();

    if (!existing.empty) {
      return NextResponse.json({ courseId: existing.docs[0].id });
    }

    const courseRef = await db.collection("courses").add({
      topic: parsedTopic.data,
      ...parsedOutline.data,
      authorId: owner.uid,
      authorName: owner.name ?? owner.email ?? "Teach owner",
      authorPhoto: owner.picture ?? null,
      isPublic: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ courseId: courseRef.id });
  } catch (error: unknown) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error("Course save failed:", error);
    return NextResponse.json({ error: "The course could not be saved." }, { status: 500 });
  }
}
