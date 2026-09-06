import { NextResponse } from "next/server";
import { authorizationResponse, requireAcceptedAccount, withAccountRequest } from "@/lib/auth-server";
import { getGenerationOperation, generationOperationStatus, abandonGenerationOperation, generationOperationTelemetry } from "@/lib/generation-operations";
import { POST as generateCourse } from "@/app/api/generate-course/route";

const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ operationId: string }> };

async function getOperation(request: Request, context: Context) {
  try {
    const account = await requireAcceptedAccount(request);
    const { operationId } = await context.params;
    const operation = await getGenerationOperation(account.uid, operationId);
    if (!operation) return NextResponse.json({ error: "Course operation not found." }, { status: 404, headers });
    return NextResponse.json({ ...generationOperationStatus(operation),
      ...(account.isOwner && request.headers.get("x-filosage-model-evaluation") === "1" ? { evaluation: await generationOperationTelemetry(operation) } : {}),
    }, { headers });
  } catch (error) { return authorizationResponse(error) ?? NextResponse.json({ error: "The course operation could not be read." }, { status: 500, headers }); }
}

async function postOperation(request: Request, context: Context) {
  try {
    const account = await requireAcceptedAccount(request);
    const { operationId } = await context.params;
    const operation = await getGenerationOperation(account.uid, operationId);
    if (!operation) return NextResponse.json({ error: "Course operation not found." }, { status: 404, headers });
    const forwardedHeaders = new Headers(request.headers);
    forwardedHeaders.set("Content-Type", "application/json");
    forwardedHeaders.set("Idempotency-Key", operation.idempotencyKey);
    return generateCourse(new Request(new URL("/api/generate-course", request.url), {
      method: "POST", headers: forwardedHeaders, body: JSON.stringify(operation.request), signal: request.signal,
    }));
  } catch (error) { return authorizationResponse(error) ?? NextResponse.json({ error: "The course operation could not be resumed." }, { status: 500, headers }); }
}

async function deleteOperation(request: Request, context: Context) {
  try {
    const account = await requireAcceptedAccount(request);
    const { operationId } = await context.params;
    const operation = await getGenerationOperation(account.uid, operationId);
    if (!operation) return NextResponse.json({ error: "Course operation not found." }, { status: 404, headers });
    await abandonGenerationOperation(operation);
    return NextResponse.json({ operationId, status: operation.status === "completed" ? "completed" : "failed" }, { headers });
  } catch (error) {
    return authorizationResponse(error) ?? NextResponse.json({ error: error instanceof Error ? error.message : "The operation could not be ended." }, { status: 409, headers });
  }
}

export const GET = withAccountRequest(getOperation);

export const POST = withAccountRequest(postOperation);

export const DELETE = withAccountRequest(deleteOperation);
