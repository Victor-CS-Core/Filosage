import { z } from "zod";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { authorizationResponse, requireAccount } from "@/lib/auth-server";
import { putStoredDocument } from "@/lib/firebase-server";
import { enforceDurableRateLimit } from "@/lib/request-rate-limit";
import { getCourseRuntimeArtifact, publishedReleaseUnavailableResponse } from "@/lib/course-pipeline/artifact-access";

const feedbackSchema = z.object({
  feedbackId: z.string().trim().regex(/^[A-Za-z0-9_-]{12,100}$/),
  courseId: z.string().trim().min(1).max(200),
  rating: z.number().int().min(1).max(5),
  note: z.string().trim().max(1_000).optional().default(""),
}).strict();

async function feedbackDocumentId(uid: string, courseId: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${uid}:${courseId}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  try {
    const account = await requireAccount(request);
    const limited = await enforceDurableRateLimit(
      request,
      "outcome-feedback",
      5,
      10 * 60_000,
      account.uid,
    );
    if (limited) return limited;
    const parsed = feedbackSchema.safeParse(await readJsonBody(request, 4_096));
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the feedback and try again." }, { status: 400 });
    }
    const course = await getCourseRuntimeArtifact(parsed.data.courseId);
    if (!course) return Response.json({ error: "Course not found." }, { status: 404 });
    if (!course.isPublic && account.uid !== course.authorId && !account.isOwner) {
      return Response.json({ error: "You do not have access to this course." }, { status: 403 });
    }
    const documentId = await feedbackDocumentId(account.uid, parsed.data.courseId);
    await putStoredDocument(`outcomeFeedback/${documentId}`, {
      reporterUid: account.uid,
      courseId: parsed.data.courseId,
      topic: course.topic,
      rating: parsed.data.rating,
      useful: parsed.data.rating >= 4,
      note: parsed.data.note,
      createdAt: new Date().toISOString(),
    });
    return Response.json({ recorded: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return publishedReleaseUnavailableResponse(error)
      ?? apiRequestErrorResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "Your feedback could not be recorded." }, { status: 500 });
  }
}
