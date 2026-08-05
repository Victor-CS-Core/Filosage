import { z } from "zod";
import { authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { getCourse, getLesson, runStoredDocumentTransaction } from "@/lib/firebase-server";
import { deriveLessonInteractions } from "@/lib/lesson-interactions";
import {
  interactionDocumentId,
  issueInteractionReceipt,
  type InteractionReceiptClaims,
} from "@/lib/interaction-receipts";
import { enforceBestEffortRateLimit } from "@/lib/request-rate-limit";
import type { Course, LessonData } from "@/lib/course-types";

const attemptSchema = z.object({
  courseId: z.string().trim().min(1).max(200),
  lessonId: z.string().regex(/^\d+-\d+$/),
  interactionId: z.string().trim().regex(/^interaction-[a-z0-9-]+$/).max(90),
  itemId: z.string().trim().regex(/^item-[a-z0-9-]+$/).max(90),
  selectedIndex: z.number().int().min(0).max(3),
}).strict();

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : 0;
}

export async function POST(request: Request) {
  const limited = enforceBestEffortRateLimit(request, "lesson-interaction", 80);
  if (limited) return limited;
  try {
    const account = await requireAcceptedAccount(request);
    const parsed = attemptSchema.safeParse(await readJsonBody(request, 4_096));
    if (!parsed.success) return Response.json({ error: "This lab attempt is not valid." }, { status: 400 });

    const { courseId, lessonId, interactionId, itemId, selectedIndex } = parsed.data;
    const course = await getCourse(courseId) as Course | null;
    if (!course) return Response.json({ error: "Course not found." }, { status: 404 });
    if (!course.isPublic && course.authorId !== account.uid && !account.isOwner) {
      return Response.json({ error: "You do not have access to this course." }, { status: 403 });
    }
    const lesson = await getLesson(courseId, lessonId) as LessonData | null;
    const matchedInteraction = lesson
      ? deriveLessonInteractions(lesson).find((candidate) => candidate.id === interactionId)
      : null;
    const interaction = matchedInteraction?.type === "recognition" ? matchedInteraction : null;
    const item = interaction?.items.find((candidate) => candidate.id === itemId);
    if (!lesson || !interaction || !item) return Response.json({ error: "Practice item not found." }, { status: 404 });

    const correct = selectedIndex === item.correctIndex;
    const documentId = await interactionDocumentId(courseId, lessonId, interactionId, itemId);
    const path = `users/${account.uid}/lessonInteraction/${documentId}`;
    const now = Date.now();
    const result = await runStoredDocumentTransaction([path], (documents) => {
      const previous = documents[path];
      const attempts = Math.min(20, numberValue(previous?.attempts) + 1);
      const firstAttemptCorrect = previous?.firstAttemptCorrect === true || (attempts === 1 && correct);
      return {
        writes: [{
          path,
          data: {
            courseId,
            lessonId,
            interactionId,
            itemId,
            attempts,
            firstAttemptCorrect,
            mastered: previous?.mastered === true || correct,
            lastAttemptAt: new Date(now).toISOString(),
          },
        }],
        result: { attempts, firstAttemptCorrect },
      };
    });

    let receipt: string | undefined;
    if (correct) {
      const claims: InteractionReceiptClaims = {
        version: 1,
        uid: account.uid,
        courseId,
        lessonId,
        interactionId,
        itemId,
        attempts: result.attempts,
        firstAttemptCorrect: result.firstAttemptCorrect,
        issuedAt: now,
      };
      receipt = await issueInteractionReceipt(claims);
    }
    return Response.json(
      { correct, attempts: result.attempts, firstAttemptCorrect: result.firstAttemptCorrect, receipt },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    const requestError = apiRequestErrorResponse(error);
    if (requestError) return requestError;
    console.error("Lesson interaction verification failed:", error);
    return Response.json({ error: "This practice response could not be verified. Try again." }, { status: 500 });
  }
}
