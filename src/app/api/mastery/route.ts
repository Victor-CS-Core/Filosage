import { z } from "zod";
import { authorizationResponse, requireAcceptedAccount, requireAccount } from "@/lib/auth-server";
import {
  getStoredDocument,
  listAllStoredDocuments,
  putStoredDocument,
  runStoredDocumentTransaction,
} from "@/lib/document-store";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import {
  BASELINE_LEVELS,
  EVIDENCE_TYPES,
  mergeMasteryEvidence,
  normalizeLearnerReportedMasteryEvidence,
  normalizeStoredMasteryEvidence,
} from "@/lib/mastery";
import { verifiedCapstoneMasteryEvidence } from "@/lib/mastery-server";
import type { CapstoneAssessment } from "@/lib/learning-types";
import { getCourseRuntimeArtifact, publishedReleaseUnavailableResponse } from "@/lib/course-pipeline/artifact-access";
import { objectiveReferenceSchema } from "@/lib/learning-design";

const diagnosticSchema = z.object({
  objectiveId: objectiveReferenceSchema,
  moduleIndex: z.number().int().min(0).max(50),
  moduleTitle: z.string().trim().min(1).max(160),
  objective: z.string().trim().min(1).max(500),
  level: z.enum(BASELINE_LEVELS),
}).strict();

const planSchema = z.object({
  courseId: z.string().trim().min(1).max(200),
  courseTopic: z.string().trim().min(1).max(160),
  desiredOutcome: z.string().trim().min(2).max(500),
  applicationContext: z.string().trim().min(2).max(500),
  targetArtifact: z.string().trim().min(2).max(300),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  weeklyMinutes: z.number().int().min(30).max(1_200),
  diagnostics: z.array(diagnosticSchema).min(1).max(50),
  recommendedLessonId: z.string().regex(/^\d+-\d+$/),
  explanation: z.string().trim().min(1).max(1_000),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: z.enum(["active", "paused"]).optional(),
  pausedAt: z.string().datetime().optional(),
  resumeAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scheduleHistory: z.array(z.object({
    action: z.enum(["created", "rescheduled", "paused", "resumed"]),
    changedAt: z.string().datetime(),
    weeklyMinutes: z.number().int().min(30).max(1_200),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }).strict()).max(50).optional(),
  baselineAssessment: z.unknown().optional(),
}).strict();

const evidenceSchema = z.object({
  id: z.string().trim().regex(/^[A-Za-z0-9_-]{12,100}$/),
  courseId: z.string().trim().min(1).max(200),
  objectiveId: objectiveReferenceSchema,
  type: z.enum(EVIDENCE_TYPES),
  result: z.enum(["attempted", "passed", "needs_work"]),
  label: z.string().trim().min(1).max(300),
  observedAt: z.string().datetime(),
  lessonId: z.string().regex(/^\d+-\d+$/).optional(),
  lessonTitle: z.string().trim().min(1).max(160).optional(),
  authority: z.enum(["learner-reported", "server-verified"]).optional(),
  confidence: z.enum(["low", "medium", "high"]).optional(),
  score: z.number().min(0).max(1).optional(),
  criterion: z.string().trim().min(1).max(300).optional(),
}).strict();

async function assertCourseAccess(
  courseId: string,
  account: { uid: string; isOwner: boolean },
) {
  const course = await getCourseRuntimeArtifact(courseId);
  if (!course) return Response.json({ error: "Course not found." }, { status: 404 });
  if (!course.isPublic && course.authorId !== account.uid && !account.isOwner) {
    return Response.json({ error: "You do not have access to this course." }, { status: 403 });
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const account = await requireAccount(request);
    const courseId = new URL(request.url).searchParams.get("courseId")?.trim();
    if (!courseId || courseId.length > 200) {
      return Response.json({ error: "Choose a valid course." }, { status: 400 });
    }
    const denied = await assertCourseAccess(courseId, account);
    if (denied) return denied;
    const [plan, evidence, progress, course] = await Promise.all([
      getStoredDocument(`users/${account.uid}/learningOutcomes/${courseId}`),
      listAllStoredDocuments(`users/${account.uid}/masteryEvidence`, 500),
      getStoredDocument(`users/${account.uid}/courseProgress/${courseId}`),
      getCourseRuntimeArtifact(courseId),
    ]);
    const storedEvidence = evidence.flatMap((item) => {
      const parsed = evidenceSchema.safeParse(item);
      return parsed.success && parsed.data.courseId === courseId
        ? [normalizeStoredMasteryEvidence(parsed.data)]
        : [];
    });
    const capstoneEvidence = course
      ? verifiedCapstoneMasteryEvidence(
          courseId,
          course,
          progress?.capstone as unknown as CapstoneAssessment | undefined,
        )
      : [];
    const parsedPlan = planSchema.safeParse(plan);
    return Response.json({
      plan: parsedPlan.success ? parsedPlan.data : null,
      evidence: mergeMasteryEvidence([], [...storedEvidence, ...capstoneEvidence]),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return publishedReleaseUnavailableResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "Your evidence could not be loaded." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const account = await requireAcceptedAccount(request);
    const parsed = planSchema.safeParse(await readJsonBody(request, 16_384));
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "Check your learning plan." }, { status: 400 });
    }
    const denied = await assertCourseAccess(parsed.data.courseId, account);
    if (denied) return denied;
    const path = `users/${account.uid}/learningOutcomes/${parsed.data.courseId}`;
    const existing = await getStoredDocument(path);
    const plan = {
      ...parsed.data,
      baselineAssessment: existing?.baselineAssessment,
      updatedAt: new Date().toISOString(),
    };
    await putStoredDocument(path, plan);
    return Response.json({ plan }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return publishedReleaseUnavailableResponse(error)
      ?? apiRequestErrorResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "Your learning plan could not be saved." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const account = await requireAcceptedAccount(request);
    const parsed = evidenceSchema.safeParse(await readJsonBody(request, 8_192));
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the evidence record." }, { status: 400 });
    }
    const denied = await assertCourseAccess(parsed.data.courseId, account);
    if (denied) return denied;
    const path = `users/${account.uid}/masteryEvidence/${parsed.data.id}`;
    const evidence = await runStoredDocumentTransaction([path], (documents) => {
      const existing = evidenceSchema.safeParse(documents[path]);
      if (existing.success && existing.data.courseId !== parsed.data.courseId) {
        throw new MasteryEvidenceConflictError();
      }
      const next = existing.success && existing.data.authority === "server-verified"
        ? normalizeStoredMasteryEvidence(existing.data)
        : normalizeLearnerReportedMasteryEvidence(parsed.data);
      return {
        writes: existing.success && existing.data.authority === "server-verified"
          ? []
          : [{ path, data: { ...next } }],
        result: next,
      };
    });
    return Response.json({ saved: true, evidence }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof MasteryEvidenceConflictError) {
      return Response.json({ error: "That evidence identifier is already in use." }, { status: 409 });
    }
    return publishedReleaseUnavailableResponse(error)
      ?? apiRequestErrorResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "Learning evidence could not be saved." }, { status: 500 });
  }
}

class MasteryEvidenceConflictError extends Error {}
