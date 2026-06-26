import { NextResponse } from "next/server";
import OpenAI from "openai";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy",
});

export async function POST(req: Request) {
  try {
    const { topic, lessonTitle, lessonConcept, courseId, lessonId } = await req.json();

    if (!topic || !lessonTitle || !lessonConcept) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // ── Authenticate (optional) ────────────────────────────────────
    let uid: string | null = null;
    let isPublic = false;

    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
        uid = decoded.uid;
      } catch {
        // treat as guest
      }
    }

    // If we have a courseId, get the course's isPublic and authorId
    let courseAuthorId: string | null = null;
    if (courseId) {
      const courseSnap = await adminDb.collection("courses").doc(courseId).get();
      if (courseSnap.exists) {
        const cData = courseSnap.data()!;
        isPublic = cData.isPublic ?? false;
        courseAuthorId = cData.authorId ?? null;
      }

      // Check if lesson already exists in database to prevent duplicate generation
      if (lessonId) {
        const existingLesson = await adminDb
          .collection("courses")
          .doc(courseId)
          .collection("lessons")
          .doc(lessonId)
          .get();
        if (existingLesson.exists) {
          return NextResponse.json(existingLesson.data());
        }
      }
    }

    // ── Generate lesson from OpenAI ────────────────────────────────
    const systemPrompt = `You are a master teacher and pedagogical expert. Your goal is to teach the user the concept of "${lessonConcept}" which is part of the lesson "${lessonTitle}" in the broader topic of "${topic}".

Your pedagogy is based on the Zone of Proximal Development, concise delivery, and retrieval practice.
You must output ONLY a raw JSON object matching the following structure:
{
  "content": "The educational reading material formatted in Markdown. Keep it concise, engaging, and focused solely on the concept. Avoid overwhelming the user. Provide highly relevant analogies.",
  "diagram": "A Mermaid.js diagram string (e.g., 'graph TD; A-->B;') that visually explains the core concept. If a diagram is not applicable, provide an empty string.",
  "quizzes": [
    {
      "question": "A multiple-choice question to test retrieval practice on the content.",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "A short explanation of why the answer is correct."
    }
  ]
}

Provide exactly 2 to 3 quizzes.
Do not wrap your response in markdown code blocks. Return strictly the JSON object.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate the lesson reading material for "${lessonTitle}".` },
      ],
      temperature: 0.7,
    });

    const data = JSON.parse(response.choices[0].message?.content || "{}");

    // ── Save to Firestore subcollection with denormalized fields ───
    const isAuthor = courseAuthorId ? uid === courseAuthorId : true; // If no courseAuthorId, it's local only anyway, but just in case.
    if (uid && courseId && lessonId && isAuthor) {
      await adminDb
        .collection("courses")
        .doc(courseId)
        .collection("lessons")
        .doc(lessonId)
        .set({
          ...data,
          authorId: uid,     // denormalized — avoids get() in Security Rules
          isPublic,          // denormalized — avoids get() in Security Rules
          createdAt: FieldValue.serverTimestamp(),
        });
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("Error generating lesson:", error);
    const msg =
      (error as { error?: { message?: string }; message?: string })?.error?.message ??
      (error as Error)?.message ??
      "Failed to generate lesson.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
