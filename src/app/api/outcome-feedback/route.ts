import { z } from "zod";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { authorizationResponse, requireAccount } from "@/lib/auth-server";
import { getCourse, putStoredDocument } from "@/lib/firebase-server";
import { enforceBestEffortRateLimit } from "@/lib/request-rate-limit";

const feedbackSchema = z.object({
  feedbackId: z.string().trim().regex(/^[A-Za-z0-9_-]{12,100}$/),
  courseId: z.string().trim().min(1).max(200),
  rating: z.number().int().min(1).max(5),
  note: z.string().trim().max(1_000).optional().default(""),
}).strict();

export async function POST(request: Request) {
  const limited = enforceBestEffortRateLimit(request, "outcome-feedback", 5, 10 * 60_000);
  if (limited) return limited;
  try {
    const parsed = feedbackSchema.safeParse(await readJsonBody(request, 4_096));
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the feedback and try again." }, { status: 400 });
    }
    const course = await getCourse(parsed.data.courseId);
    if (!course) return Response.json({ error: "Course not found." }, { status: 404 });
    if (!course.isPublic) {
      const account = await requireAccount(request);
      if (account.uid !== course.authorId && !account.isOwner) {
        return Response.json({ error: "You do not have access to this course." }, { status: 403 });
      }
    }
    await putStoredDocument(`outcomeFeedback/${parsed.data.feedbackId}`, {
      courseId: parsed.data.courseId,
      topic: course.topic,
      rating: parsed.data.rating,
      useful: parsed.data.rating >= 4,
      note: parsed.data.note,
      createdAt: new Date().toISOString(),
    });
    return Response.json({ recorded: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "Your feedback could not be recorded." }, { status: 500 });
  }
}
