import { authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import {
  activityDocumentId,
  issueActivityReceipt,
  type ActivityReceiptClaims,
} from "@/lib/activity-receipts";
import { runStoredDocumentTransaction } from "@/lib/document-store";
import type { Course, LessonData } from "@/lib/course-types";
import { z } from "zod";
import { enforceDurableRateLimit } from "@/lib/request-rate-limit";
import {
  getCourseRuntimeArtifact,
  getLessonRuntimeArtifact,
  publishedReleaseUnavailableResponse,
} from "@/lib/course-pipeline/artifact-access";
import { publicationContentHash } from "@/lib/publication-content";
import { safeModelErrorDetails } from "@/lib/model-fallback";

const activityAttemptSchema = z.object({
  courseId: z.string().trim().min(1).max(200),
  lessonId: z.string().regex(/^\d+-\d+$/),
  progressOperationId: z.string().trim().regex(/^[A-Za-z0-9_-]{12,200}$/),
  quizIndex: z.number().int().min(0).max(20),
  selectedOption: z.string().trim().min(1).max(1_000),
}).strict();

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : 0;
}

export async function POST(request: Request) {
  try {
    const account = await requireAcceptedAccount(request);
    const limited = await enforceDurableRateLimit(request, "lesson-activity", 60, 60_000, account.uid);
    if (limited) return limited;
    const parsed = activityAttemptSchema.safeParse(await readJsonBody(request, 4_096));
    if (!parsed.success) {
      return Response.json({ error: "This activity attempt is not valid." }, { status: 400 });
    }

    const { courseId, lessonId, progressOperationId, quizIndex, selectedOption } = parsed.data;
    const course = await getCourseRuntimeArtifact(courseId) as Course | null;
    if (!course) return Response.json({ error: "Course not found." }, { status: 404 });
    if (!course.isPublic && course.authorId !== account.uid && !account.isOwner) {
      return Response.json({ error: "You do not have access to this course." }, { status: 403 });
    }
    const lesson = await getLessonRuntimeArtifact(courseId, lessonId, course) as LessonData | null;
    const quiz = lesson?.quizzes?.[quizIndex];
    if (!lesson || !quiz) return Response.json({ error: "Activity not found." }, { status: 404 });

    const correct = quiz.options[quiz.correctIndex] === selectedOption;
    const artifactHash = await publicationContentHash(quiz);
    const documentId = await activityDocumentId(courseId, lessonId, progressOperationId, quizIndex, artifactHash);
    const path = `users/${account.uid}/lessonActivity/${documentId}`;
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
            progressOperationId,
            quizIndex,
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
      const claims: ActivityReceiptClaims = {
        version: 3,
        uid: account.uid,
        courseId,
        lessonId,
        progressOperationId,
        quizIndex,
        artifactHash,
        attempts: result.attempts,
        firstAttemptCorrect: result.firstAttemptCorrect,
        issuedAt: now,
      };
      receipt = await issueActivityReceipt(claims);
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
    const releaseError = publishedReleaseUnavailableResponse(error);
    if (releaseError) return releaseError;
    console.error(JSON.stringify({ event: "lesson_activity_verification_failed", ...safeModelErrorDetails(error) }));
    return Response.json({ error: "This activity could not be verified. Try again." }, { status: 500 });
  }
}
