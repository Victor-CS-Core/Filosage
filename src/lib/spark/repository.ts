import "server-only";

import { createHash } from "node:crypto";
import type { ServerAccount } from "@/lib/account-server";
import {
  getStoredDocument,
  listStoredDocumentsByField,
  runStoredDocumentTransaction,
  type StoredDocument,
} from "@/lib/document-store";
import type { SparkAttemptRequest, SparkManifest, SparkStage, SparkTurnResponse } from "@/lib/spark/contracts";
import { gradeSparkAnswer, sparkTaskRecordSchema } from "@/lib/spark/registry";
import type { SparkLessonContext } from "@/lib/spark/access";

const RAW_TURN_RETENTION_DAYS = 30;

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function dateValue(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : "";
}

export interface SparkSessionRecord extends Record<string, unknown> {
  id: string;
  ownerUid: string;
  courseId: string;
  lessonId: string;
  lessonVersion: string;
  locale: string;
  stage: SparkStage;
  manifestId: string;
  contextSummary: string;
  summaryVersion: number;
  createdAt: string;
  updatedAt: string;
}

export class SparkRepositoryError extends Error {
  constructor(
    public readonly status: 403 | 404 | 409 | 422,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function sessionPath(sessionId: string) {
  return `sparkSessions/${sessionId}`;
}

function sessionRecord(value: StoredDocument | null): SparkSessionRecord | null {
  if (!value || typeof value.ownerUid !== "string" || typeof value.courseId !== "string"
    || typeof value.lessonId !== "string" || typeof value.lessonVersion !== "string") return null;
  return value as unknown as SparkSessionRecord;
}

export async function createOrResumeSparkSession(
  account: Pick<ServerAccount, "uid">,
  context: SparkLessonContext,
  manifest: SparkManifest,
  locale: string,
) {
  const id = `session-${hash(`${account.uid}:${context.courseId}:${context.lessonId}:${context.lessonVersion}:${locale}`).slice(0, 24)}`;
  const path = sessionPath(id);
  const now = new Date().toISOString();
  return runStoredDocumentTransaction([path], (documents) => {
    const existing = sessionRecord(documents[path]);
    if (existing) {
      if (existing.ownerUid !== account.uid || existing.lessonVersion !== context.lessonVersion) {
        throw new SparkRepositoryError(409, "SPARK_SESSION_CONFLICT", "This Spark session belongs to a different lesson.");
      }
      return { writes: [], result: { session: existing, resumed: true } };
    }
    const session: SparkSessionRecord = {
      id,
      ownerUid: account.uid,
      courseId: context.courseId,
      lessonId: context.lessonId,
      lessonVersion: context.lessonVersion,
      locale,
      stage: manifest.stage,
      manifestId: manifest.id,
      contextSummary: "",
      summaryVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    return { writes: [{ path, data: session }], result: { session, resumed: false } };
  });
}

export async function requireSparkSession(account: Pick<ServerAccount, "uid" | "isOwner">, sessionId: string) {
  const session = sessionRecord(await getStoredDocument(sessionPath(sessionId)));
  if (!session) throw new SparkRepositoryError(404, "SPARK_SESSION_NOT_FOUND", "Spark session not found.");
  if (session.ownerUid !== account.uid && !account.isOwner) {
    throw new SparkRepositoryError(403, "SPARK_SESSION_FORBIDDEN", "You do not have access to this Spark session.");
  }
  return session;
}

export async function readSparkSessionPage(
  account: Pick<ServerAccount, "uid" | "isOwner">,
  sessionId: string,
  options: { limit: number; after?: string },
) {
  const session = await requireSparkSession(account, sessionId);
  const records = await listStoredDocumentsByField("sparkTurns", "sessionId", sessionId, 500);
  const ordered = records
    .filter((record) => record.ownerUid === session.ownerUid)
    .sort((left, right) => dateValue(left.createdAt).localeCompare(dateValue(right.createdAt)) || left.id.localeCompare(right.id));
  const start = options.after ? Math.max(0, ordered.findIndex((record) => record.id === options.after) + 1) : 0;
  const page = ordered.slice(start, start + options.limit + 1);
  return {
    session,
    turns: page.slice(0, options.limit),
    nextCursor: page.length > options.limit ? page[options.limit - 1]?.id ?? null : null,
  };
}

export async function appendSparkTurn(input: {
  session: SparkSessionRecord;
  requestId: string;
  action: string;
  message: string;
  response: SparkTurnResponse;
  sourceIds: string[];
  usageReservationId?: string;
}) {
  const id = `turn-${hash(`${input.session.ownerUid}:${input.requestId}`).slice(0, 24)}`;
  const path = `sparkTurns/${id}`;
  const parentPath = sessionPath(input.session.id);
  const now = new Date();
  const fingerprint = hash(JSON.stringify({
    sessionId: input.session.id,
    action: input.action,
    message: input.message,
    lessonVersion: input.response.lessonVersion,
  }));
  return runStoredDocumentTransaction([parentPath, path], (documents) => {
    const parent = sessionRecord(documents[parentPath]);
    if (!parent || parent.ownerUid !== input.session.ownerUid) {
      throw new SparkRepositoryError(409, "SPARK_SESSION_CHANGED", "The Spark session changed before this turn was saved.");
    }
    const existing = documents[path];
    if (existing) {
      if (existing.ownerUid !== input.session.ownerUid || existing.payloadHash !== fingerprint) {
        throw new SparkRepositoryError(409, "IDEMPOTENCY_CONFLICT", "This Spark request ID belongs to a different turn.");
      }
      return { writes: [], result: existing };
    }
    const turn = {
      id,
      ownerUid: input.session.ownerUid,
      courseId: input.session.courseId,
      lessonId: input.session.lessonId,
      lessonVersion: input.session.lessonVersion,
      sessionId: input.session.id,
      requestId: input.requestId,
      payloadHash: fingerprint,
      user: { action: input.action, message: input.message },
      assistant: input.response,
      responseStatus: input.response.availability,
      sourceIds: input.sourceIds,
      usageReservationId: input.usageReservationId ?? null,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + RAW_TURN_RETENTION_DAYS * 86_400_000).toISOString(),
    };
    return {
      writes: [
        { path, data: turn },
        { path: parentPath, data: { ...parent, stage: input.response.stage, updatedAt: now.toISOString() } },
      ],
      result: turn,
    };
  });
}

export async function readSparkTurnByRequest(ownerUid: string, requestId: string) {
  const id = `turn-${hash(`${ownerUid}:${requestId}`).slice(0, 24)}`;
  const turn = await getStoredDocument(`sparkTurns/${id}`);
  return turn?.ownerUid === ownerUid && turn.requestId === requestId ? turn : null;
}

function attemptPath(uid: string, requestId: string) {
  return `sparkAttempts/attempt-${hash(`${uid}:${requestId}`).slice(0, 24)}`;
}

export async function commitSparkAttempt(input: {
  account: Pick<ServerAccount, "uid" | "isOwner">;
  request: SparkAttemptRequest;
  revisesAttemptId?: string;
}) {
  const session = await requireSparkSession(input.account, input.request.sessionId);
  if (session.lessonVersion !== input.request.lessonVersion) {
    throw new SparkRepositoryError(409, "SPARK_STALE_LESSON", "This attempt belongs to an earlier lesson version.");
  }
  const path = attemptPath(input.account.uid, input.request.requestId);
  const taskPath = `sparkTasks/${input.request.taskVersion}`;
  const revisionPath = input.revisesAttemptId ? `sparkAttempts/${input.revisesAttemptId}` : null;
  const taskValue = await getStoredDocument(taskPath);
  const task = sparkTaskRecordSchema.safeParse(taskValue);
  if (!task.success || task.data.courseId !== session.courseId || task.data.lessonId !== session.lessonId
    || task.data.lessonVersion !== session.lessonVersion || task.data.taskId !== input.request.taskId) {
    throw new SparkRepositoryError(422, "SPARK_TASK_INVALID", "This Spark task is not valid for the current lesson.");
  }
  const grade = gradeSparkAnswer(task.data, input.request.answer);
  const evidenceId = `spark-${hash(`${path}:${task.data.objectiveIds[0]}`).slice(0, 24)}`;
  const evidencePath = `users/${input.account.uid}/masteryEvidence/${evidenceId}`;
  const parentPath = sessionPath(session.id);
  const paths = [path, taskPath, parentPath, evidencePath, ...(revisionPath ? [revisionPath] : [])];
  const payloadHash = hash(JSON.stringify({
    sessionId: session.id,
    lessonVersion: input.request.lessonVersion,
    taskId: input.request.taskId,
    taskVersion: input.request.taskVersion,
    answer: input.request.answer,
    revisesAttemptId: input.revisesAttemptId ?? null,
  }));
  return runStoredDocumentTransaction(paths, (documents) => {
    const existing = documents[path];
    if (existing) {
      if (existing.ownerUid !== input.account.uid || existing.payloadHash !== payloadHash) {
        throw new SparkRepositoryError(409, "IDEMPOTENCY_CONFLICT", "This attempt request ID belongs to another answer.");
      }
      return { writes: [], result: { attempt: existing, grade, recovered: true } };
    }
    if (revisionPath) {
      const prior = documents[revisionPath];
      if (!prior || prior.ownerUid !== input.account.uid || prior.taskVersion !== input.request.taskVersion) {
        throw new SparkRepositoryError(422, "SPARK_REVISION_INVALID", "The original Spark attempt cannot be revised with this task.");
      }
    }
    const now = new Date().toISOString();
    const attemptId = path.split("/")[1];
    const attempt = {
      id: attemptId,
      ownerUid: input.account.uid,
      courseId: session.courseId,
      lessonId: session.lessonId,
      lessonVersion: session.lessonVersion,
      sessionId: session.id,
      requestId: input.request.requestId,
      payloadHash,
      taskId: task.data.taskId,
      taskVersion: task.data.taskVersion,
      committedAnswer: input.request.answer,
      rubricVersion: task.data.kind === "text" ? task.data.rubricVersion : null,
      gradingMethod: grade.gradingMethod,
      result: grade.state,
      verified: grade.verified,
      feedback: grade.feedback,
      revisesAttemptId: input.revisesAttemptId ?? null,
      createdAt: now,
    };
    const evidence = grade.gradingMethod === "deterministic" ? {
      id: evidenceId,
      courseId: session.courseId,
      objectiveId: task.data.objectiveIds[0],
      type: session.stage === "transfer" ? "transfer" : "lesson",
      result: grade.verified ? "passed" : "needs_work",
      label: grade.verified ? "Spark criterion demonstrated" : "Spark criterion needs revision",
      observedAt: now,
      lessonId: session.lessonId,
      authority: "server-verified",
      score: grade.verified ? 1 : 0,
      criterion: task.data.taskId,
      sparkAttemptId: attemptId,
      lessonVersion: session.lessonVersion,
    } : null;
    const nextStage: SparkStage = grade.state === "demonstrated"
      ? "transfer"
      : grade.state === "needs_revision" ? "feedback" : session.stage;
    return {
      writes: [
        { path, data: attempt },
        ...(evidence ? [{ path: evidencePath, data: evidence }] : []),
        { path: parentPath, data: { ...session, stage: nextStage, updatedAt: now } },
      ],
      result: { attempt, grade, recovered: false },
    };
  });
}

export function sparkRepositoryErrorResponse(error: unknown) {
  if (!(error instanceof SparkRepositoryError)) return null;
  return Response.json(
    { error: error.message, code: error.code },
    { status: error.status, headers: { "Cache-Control": "private, no-store" } },
  );
}