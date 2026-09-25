import { NextResponse } from "next/server";
import { authorizationResponse, requireAcceptedAccount, withAccountRequest } from "@/lib/auth-server";
import { getGenerationOperation, generationOperationStatus, abandonGenerationOperation, reconcileGenerationOperation } from "@/lib/generation-operations";
import { readEvaluationBudgetEvidence, runWithEvaluationRequest } from "@/lib/evaluation-budget";
import { EvaluationBudgetError, evaluationBudgetErrorFrom } from "@/lib/evaluation-errors";
import { POST as generateLesson } from "@/app/api/generate-lesson/route";
import { POST as generateCourse } from "@/app/api/generate-course/route";

const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ operationId: string }> };

async function getOperation(request: Request, context: Context) {
  try {
    const account = await requireAcceptedAccount(request);
    const { operationId } = await context.params;
    let operation = await getGenerationOperation(account.uid, operationId);
    if (!operation) return NextResponse.json({ error: "Generation operation not found." }, { status: 404, headers });
    // Lazily settle orphaned operations (e.g. a server that died mid-call):
    // expired leases are released, reservations restored, and late usage
    // reconciled, so a stuck operation cannot brick its key or lock forever.
    const reconciled = await reconcileGenerationOperation(operation, true).catch(() => null);
    if (reconciled && reconciled.action !== "none") {
      operation = await getGenerationOperation(account.uid, operationId) ?? operation;
    }
    if (request.headers.has("x-filosage-model-evaluation")) {
      if (!account.isOwner) throw new EvaluationBudgetError("EVALUATION_OWNER_REQUIRED");
      return await runWithEvaluationRequest(request.headers, async () => NextResponse.json({ ...generationOperationStatus(operation), evaluation: await readEvaluationBudgetEvidence(operationId) }, { headers }));
    }
    return NextResponse.json(generationOperationStatus(operation), { headers });
  } catch (error) { const budget = evaluationBudgetErrorFrom(error); return authorizationResponse(error) ?? NextResponse.json({ error: budget?.message ?? "The generation operation could not be read.", code: budget?.code }, { status: budget?.status ?? 500, headers }); }
}

async function postOperation(request: Request, context: Context) {
  try {
    const account = await requireAcceptedAccount(request);
    const { operationId } = await context.params;
    const operation = await getGenerationOperation(account.uid, operationId);
    if (!operation) return NextResponse.json({ error: "Generation operation not found." }, { status: 404, headers });
    const forwardedHeaders = new Headers(request.headers);
    forwardedHeaders.set("Content-Type", "application/json");
    forwardedHeaders.set("Idempotency-Key", operation.idempotencyKey);
    const generate = operation.kind === "lesson" ? generateLesson : generateCourse;
    return generate(new Request(new URL(operation.kind === "lesson" ? "/api/generate-lesson" : "/api/generate-course", request.url), {
      method: "POST", headers: forwardedHeaders, body: JSON.stringify(operation.request), signal: request.signal,
    }));
  } catch (error) { return authorizationResponse(error) ?? NextResponse.json({ error: "The generation operation could not be resumed." }, { status: 500, headers }); }
}

async function deleteOperation(request: Request, context: Context) {
  try {
    const account = await requireAcceptedAccount(request);
    const { operationId } = await context.params;
    const operation = await getGenerationOperation(account.uid, operationId);
    if (!operation) return NextResponse.json({ error: "Generation operation not found." }, { status: 404, headers });
    await abandonGenerationOperation(operation);
    return NextResponse.json({ operationId, status: operation.status === "completed" ? "completed" : "failed" }, { headers });
  } catch (error) {
    return authorizationResponse(error) ?? NextResponse.json({ error: error instanceof Error ? error.message : "The operation could not be ended." }, { status: 409, headers });
  }
}

export const GET = withAccountRequest(getOperation);

export const POST = withAccountRequest(postOperation);

export const DELETE = withAccountRequest(deleteOperation);
