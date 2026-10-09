import { z } from "zod";
import { withAccountRequest, authorizationResponse, requireOwner } from "@/lib/auth-server";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import {
  configureSparkBudget,
  readSparkBudgetState,
  sparkBudgetErrorResponse,
} from "@/lib/spark/budget";
import { SPARK_BUDGET_MICROS } from "@/lib/spark/config";
import { sparkFeaturePolicy, sparkPrice, sparkRuntimeLimits } from "@/lib/spark/config";
import { listAllStoredDocuments } from "@/lib/document-store";

const patchSchema = z.object({
  mode: z.enum(["live", "conserve", "practice_only", "halted"]),
  liveAiEnabled: z.boolean(),
  preparationEnabled: z.boolean(),
  concurrencyLimit: z.number().int().min(1).max(16),
  aiCapMicros: z.number().int().min(0).max(SPARK_BUDGET_MICROS.ai),
  categoryCaps: z.object({
    tutoring: z.number().int().nonnegative(),
    preparation: z.number().int().nonnegative(),
    assessment: z.number().int().nonnegative(),
    summary: z.number().int().nonnegative(),
    embedding: z.number().int().nonnegative(),
  }).strict(),
  reason: z.string().trim().min(8).max(500),
}).strict();

async function handleGET(request: Request) {
  try {
    await requireOwner(request);
    const [budget, preparationJobs] = await Promise.all([
      readSparkBudgetState(),
      listAllStoredDocuments("sparkPreparationJobs", 500),
    ]);
    const policy = sparkFeaturePolicy();
    const price = sparkPrice();
    const recentJobs = [...preparationJobs]
      .sort((left, right) => String(right.updatedAt ?? right.createdAt).localeCompare(String(left.updatedAt ?? left.createdAt)))
      .slice(0, 50)
      .map((job) => ({
        id: job.id,
        courseId: job.courseId,
        lessonId: job.lessonId,
        lessonVersion: job.lessonVersion,
        state: job.state,
        attempts: job.attempts,
        errorCode: job.errorCode ?? null,
        updatedAt: job.updatedAt ?? job.createdAt,
      }));
    return Response.json({
      ...budget,
      runtime: {
        ...policy,
        model: price.model,
        provider: price.provider,
        priceVersion: price.version,
        limits: sparkRuntimeLimits(),
      },
      preparation: {
        total: preparationJobs.length,
        ready: preparationJobs.filter((job) => job.state === "ready").length,
        pending: preparationJobs.filter((job) => ["queued", "running"].includes(String(job.state))).length,
        failed: preparationJobs.filter((job) => job.state === "failed").length,
        truncated: preparationJobs.length === 500,
        recent: recentJobs,
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return sparkBudgetErrorResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "Spark budget state is temporarily unavailable." }, { status: 500 });
  }
}

async function handlePATCH(request: Request) {
  try {
    const owner = await requireOwner(request);
    const parsed = patchSchema.safeParse(await readJsonBody(request, 16_384));
    if (!parsed.success) return Response.json({ error: "This Spark budget configuration is not valid." }, { status: 400 });
    const state = await configureSparkBudget({ actorUid: owner.uid, ...parsed.data });
    return Response.json(state, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return sparkBudgetErrorResponse(error)
      ?? apiRequestErrorResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "Spark budget configuration could not be saved." }, { status: 500 });
  }
}

export const GET = withAccountRequest(handleGET);
export const PATCH = withAccountRequest(handlePATCH);