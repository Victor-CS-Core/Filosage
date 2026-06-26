import { NextResponse } from "next/server";
import OpenAI from "openai";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy_key",
});

export async function POST(request: Request) {
  try {
    const { topic } = await request.json();

    if (!topic) {
      return NextResponse.json({ error: "Topic is required" }, { status: 400 });
    }

    // ── Authenticate the user (optional — guests can still generate) ──
    let uid: string | null = null;
    let displayName: string | null = null;
    let photoURL: string | null = null;

    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const idToken = authHeader.slice(7);
        const decoded = await adminAuth.verifyIdToken(idToken);
        uid = decoded.uid;
        displayName = decoded.name ?? null;
        photoURL = decoded.picture ?? null;
      } catch {
        // Token invalid — treat as guest
      }
    }

    // ── Check if course already exists for this user ─────────────────
    if (uid) {
      const existingQuery = await adminDb
        .collection("courses")
        .where("authorId", "==", uid)
        .where("topic", "==", topic)
        .limit(1)
        .get();

      if (!existingQuery.empty) {
        const doc = existingQuery.docs[0];
        const existingData = doc.data();
        return NextResponse.json({
          mission: existingData.mission,
          modules: existingData.modules,
          courseId: doc.id
        });
      }
    }

    // ── Generate course from OpenAI ────────────────────────────────
    const systemPrompt = `
You are an expert teacher AI. The user wants to learn about: "${topic}".
Your task is to generate a course outline based on the "Zone of Proximal Development".
The course should be structured in modules, and each module should contain lessons.
Keep the lessons tightly scoped.

Return ONLY a JSON object in the following format:
{
  "mission": "A brief sentence on why learning this is valuable.",
  "modules": [
    {
      "title": "Module Name",
      "description": "Module description",
      "lessons": [
        {
          "title": "Lesson Title",
          "concept": "The core concept to be taught"
        }
      ]
    }
  ]
}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Create a course outline for: ${topic}` },
      ],
      temperature: 0.7,
    });

    const data = JSON.parse(response.choices[0].message.content || "{}");

    // ── Save to Firestore if user is authenticated ─────────────────
    let courseId: string | null = null;

    if (uid) {
      const courseRef = await adminDb.collection("courses").add({
        topic,
        mission: data.mission ?? "",
        modules: data.modules ?? [],
        authorId: uid,
        authorName: displayName,
        authorPhoto: photoURL,
        isPublic: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      courseId = courseRef.id;
    }

    return NextResponse.json({ ...data, courseId });
  } catch (error: unknown) {
    console.error("Error generating course:", error);
    const msg =
      (error as { error?: { message?: string }; message?: string })?.error?.message ??
      (error as Error)?.message ??
      "Failed to generate course outline.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
