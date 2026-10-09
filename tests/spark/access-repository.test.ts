import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "filosage-spark-repository-"));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
after(() => rmSync(directory, { recursive: true, force: true }));

const { captureAccountGeneration, runWithAccountGeneration } = await import("../../src/lib/account-lifecycle.ts");
const { listAllStoredDocuments, putStoredDocument } = await import("../../src/lib/document-store.ts");
const { requireSparkLessonAccess } = await import("../../src/lib/spark/access.ts");
const { buildSparkPreparation } = await import("../../src/lib/spark/preparation.ts");
const { commitSparkAttempt, createOrResumeSparkSession, requireSparkSession } = await import("../../src/lib/spark/repository.ts");

const author = { uid: "spark-author", isOwner: false as const };
const otherLearner = { uid: "other-learner", isOwner: false as const };
const courseId = "private-spark-course";
const lessonId = "0-0";
let fixtureReady: Promise<void> | null = null;

function prepareFixture() {
  fixtureReady ??= (async () => {
    const generation = await captureAccountGeneration(author.uid);
    await runWithAccountGeneration(generation, async () => {
      await putStoredDocument(`users/${author.uid}`, { uid: author.uid, accountStatus: "active" });
      await putStoredDocument(`courses/${courseId}`, {
        id: courseId,
        courseId,
        authorId: author.uid,
        topic: "Weighted inputs",
        isPublic: false,
        modules: [{ title: "Foundations", lessons: [{ title: "A first neuron", concept: "Weighted inputs", objectiveId: "objective-neuron" }] }],
      });
      await putStoredDocument(`courses/${courseId}/lessons/${lessonId}`, {
        title: "A first neuron",
        content: "A weight scales its input before the bias is added.",
        objectiveIds: ["objective-neuron"],
        quizzes: [{ question: "Which option matches the saved criterion?", options: ["Scale the input", "Delete the input"], correctIndex: 0, explanation: "A weight scales its input." }],
      });
    });
  })();
  return fixtureReady;
}

test("private Spark lesson and session access is denied across users before retrieval", async () => {
  await prepareFixture();
  await assert.rejects(requireSparkLessonAccess(otherLearner, courseId, lessonId), (error: unknown) => (
    error instanceof Error && "code" in error && error.code === "SPARK_COURSE_FORBIDDEN"
  ));
  const context = await requireSparkLessonAccess(author, courseId, lessonId);
  const prepared = buildSparkPreparation(context, "en", "2026-10-09T00:00:00.000Z");
  const generation = await captureAccountGeneration(author.uid);
  const created = await runWithAccountGeneration(generation, () => createOrResumeSparkSession(author, context, prepared.manifest, "en"));
  await assert.rejects(requireSparkSession(otherLearner, created.session.id), (error: unknown) => (
    error instanceof Error && "code" in error && error.code === "SPARK_SESSION_FORBIDDEN"
  ));
});

test("attempts reject stale versions and recover exactly once without duplicating evidence", async () => {
  await prepareFixture();
  const context = await requireSparkLessonAccess(author, courseId, lessonId);
  const prepared = buildSparkPreparation(context, "en", "2026-10-09T00:00:00.000Z");
  const task = prepared.taskRecords[0];
  assert.ok(task);
  const generation = await captureAccountGeneration(author.uid);
  await runWithAccountGeneration(generation, () => putStoredDocument(`sparkTasks/${task.taskVersion}`, { ...task, ownerUid: author.uid }));
  const session = await runWithAccountGeneration(generation, () => createOrResumeSparkSession(author, context, prepared.manifest, "en"));
  const base = {
    requestId: "00000000-0000-4000-8000-000000000001",
    sessionId: session.session.id,
    lessonVersion: context.lessonVersion,
    taskId: task.taskId,
    taskVersion: task.taskVersion,
    answer: { kind: "choice" as const, optionIds: ["option-1"] },
  };
  await assert.rejects(
    runWithAccountGeneration(generation, () => commitSparkAttempt({ account: author, request: { ...base, lessonVersion: "lesson-stale" } })),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "SPARK_STALE_LESSON",
  );
  const first = await runWithAccountGeneration(generation, () => commitSparkAttempt({ account: author, request: base }));
  const repeated = await runWithAccountGeneration(generation, () => commitSparkAttempt({ account: author, request: base }));
  assert.equal(first.grade.verified, true);
  assert.equal(first.recovered, false);
  assert.equal(repeated.recovered, true);
  await assert.rejects(
    runWithAccountGeneration(generation, () => commitSparkAttempt({ account: author, request: { ...base, answer: { kind: "choice", optionIds: ["option-2"] } } })),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "IDEMPOTENCY_CONFLICT",
  );
  const evidence = await listAllStoredDocuments(`users/${author.uid}/masteryEvidence`, 20);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0]?.sparkAttemptId, first.attempt.id);
  assert.equal(evidence[0]?.authority, "server-verified");
});