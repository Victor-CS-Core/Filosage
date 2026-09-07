import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createPostgresFixture, waitForAdvisoryWaiter } from "./fixture.ts";

test("PostgreSQL durable lesson admission and commit fence competing connections without course credits", { timeout: 30_000 }, async () => {
  const f = await createPostgresFixture();
  const uid = `lesson-operation-pg-${randomUUID()}`;
  const exact = new Set<string>([`accountLifecycles/${uid}`, `courses/${uid}`, `courses/${uid}/lessons/0-0`]);
  let queued: Promise<unknown> | undefined;
  try {
    const ops = await import("../../src/lib/generation-operations.ts");
    const { captureAccountGeneration, runWithAccountGeneration } = await import("../../src/lib/account-lifecycle.ts");
    const { lessonCourseFingerprint, lessonPublicationState } = await import("../../src/lib/course-pipeline/lesson-save.ts");
    const { lessonCommitPaths } = await import("../../src/lib/course-pipeline/lesson-commit.ts");
    const scope = await captureAccountGeneration(uid);
    const owned = <T>(work: () => T) => runWithAccountGeneration(scope, work);
    const account = { uid, isOwner: false, plan: "pro" as const, access: "pro" as const, accountStatus: "active" as const, subscriptionStatus: "active" as const };
    const course = { authorId: uid, isPublic: false, modules: [{ lessons: [{ title: "One" }] }] };
    await owned(() => f.store.putStoredDocument(`courses/${uid}`, course));
    const guard = { scopeVersion: 1 as const, courseFingerprint: lessonCourseFingerprint(course, "0-0"), publicationState: lessonPublicationState(course), invalidateReadiness: true };
    const now = new Date(Date.UTC(10_000 + Math.floor(Math.random() * 100_000), 1, 1));
    const request = { courseId: uid, lessonId: "0-0", regenerate: false };
    const begin = () => owned(() => ops.beginGenerationOperation(account, "postgres-durable-lesson", request, now, { kind: "lesson", lessonGuard: guard }));
    const admissions = await Promise.allSettled([begin(), begin()]);
    assert.equal(admissions.filter((r) => r.status === "fulfilled").length, 1);
    const lease = (admissions.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof begin>>>).value;
    const reservation = ops.lessonOperationReservation(lease);
    const commitGuard = { ...guard, actor: account, reservation, operation: lease, usage: { usageSamples: [] } };
    for (const path of lessonCommitPaths(commitGuard)) exact.add(path);
    await ops.runGenerationProviderCall(lease, { model: "gpt-5.6-luna", input: "fixture-stage" }, async () => ({ id: "fixture-response", usage: { input_tokens: 1, output_tokens: 1 } }));
    const stages = await f.monitor.query<{ path: string }>("SELECT path FROM filosage_documents WHERE collection_id = 'generationStages' AND data->>'operationId' = $1", [lease.operationId]);
    for (const row of stages.rows) exact.add(row.path);
    await f.monitor.query("BEGIN");
    await f.monitor.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`courses/${uid}`]);
    const pid = await f.monitor.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    queued = owned(() => f.store.saveLesson(uid, "0-0", { authorId: uid, content: "Late provider lesson" }, commitGuard));
    const rejected = assert.rejects(queued, /publication/);
    await waitForAdvisoryWaiter(f.monitor, pid.rows[0].pid);
    await f.monitor.query("UPDATE filosage_documents SET data = data || $2::jsonb WHERE path = $1", [`courses/${uid}`, JSON.stringify({ lessonWriteEpoch: randomUUID(), isPublic: false })]);
    await f.monitor.query("COMMIT");
    await rejected;
    assert.equal(await f.store.getLesson(uid, "0-0"), null);
    assert.equal((await ops.getGenerationOperation(uid, lease.operationId))?.status, "running");
    await ops.finishGenerationOperation(lease, { failed: true, reason: "publication_changed" });
    assert.equal((await f.store.getStoredDocument(reservation.periodPath))?.reservedCostMicros, 0);
    assert.equal(await f.store.getStoredDocument(`users/${uid}/courseCredits/current`), null);
  } finally {
    await f.monitor.query("ROLLBACK").catch(() => undefined);
    await queued?.catch(() => undefined);
    await f.monitor.query("DELETE FROM filosage_documents WHERE path = ANY($1::text[])", [[...exact]]);
    await f.close();
  }
});

test("PostgreSQL independent durable lesson commits retain one accounting charge and exact replay", { timeout: 30_000 }, async () => {
  const f = await createPostgresFixture();
  const uid = randomUUID();
  const exact = new Set<string>([`accountLifecycles/${uid}`, `courses/${uid}`, `courses/${uid}/lessons/0-0`, `courses/${uid}/lessons/0-1`]);
  try {
    const ops = await import("../../src/lib/generation-operations.ts");
    const { captureAccountGeneration, runWithAccountGeneration } = await import("../../src/lib/account-lifecycle.ts");
    const { lessonCourseFingerprint, lessonPublicationState } = await import("../../src/lib/course-pipeline/lesson-save.ts");
    const { lessonCommitPaths } = await import("../../src/lib/course-pipeline/lesson-commit.ts");
    const scope = await captureAccountGeneration(uid);
    const owned = <T>(work: () => T) => runWithAccountGeneration(scope, work);
    const account = { uid, isOwner: true, plan: "pro" as const, access: "owner" as const, accountStatus: "active" as const, subscriptionStatus: "active" as const };
    const course = { authorId: uid, isPublic: false, modules: [{ lessons: [{ title: "One" }, { title: "Two" }] }] };
    await owned(() => f.store.putStoredDocument(`courses/${uid}`, course));
    const now = new Date(Date.UTC(10_000 + Math.floor(Math.random() * 100_000), 1, 1));
    let dispatches = 0;
    const guards = [];
    for (const lessonId of ["0-0", "0-1"]) {
      const guard = { scopeVersion: 1 as const, courseFingerprint: lessonCourseFingerprint(course, lessonId), publicationState: lessonPublicationState(course), invalidateReadiness: true };
      const lease = await owned(() => ops.beginGenerationOperation(account, `postgres-durable-${lessonId}`, { courseId: uid, lessonId, regenerate: false }, now, { kind: "lesson", lessonGuard: guard }));
      const reservation = ops.lessonOperationReservation(lease);
      const commitGuard = { ...guard, actor: account, reservation, operation: lease, usage: { usageSamples: [] } };
      for (const path of lessonCommitPaths(commitGuard)) exact.add(path);
      const params = { model: "gpt-5.6-luna", input: `fixture-${lessonId}` };
      const provider = async () => { dispatches++; return { id: `response-${lessonId}`, usage: { input_tokens: 4, output_tokens: 4 } }; };
      await ops.runGenerationProviderCall(lease, params, provider);
      await ops.runGenerationProviderCall(lease, params, provider);
      guards.push({ lessonId, lease, reservation, commitGuard });
    }
    const stages = await f.monitor.query<{ path: string }>("SELECT path FROM filosage_documents WHERE collection_id = 'generationStages' AND data->>'operationId' = ANY($1::text[])", [guards.map(({ lease }) => lease.operationId)]);
    for (const row of stages.rows) exact.add(row.path);
    assert.equal(dispatches, 2);
    await Promise.all(guards.map(({ lessonId, commitGuard }) => owned(() => f.store.saveLesson(uid, lessonId, { authorId: uid, content: `Saved ${lessonId}` }, commitGuard))));
    for (const { lessonId, lease, reservation } of guards) {
      assert.equal((await ops.getGenerationOperation(uid, lease.operationId))?.status, "completed");
      await ops.finishGenerationOperation(lease, { failed: true });
      assert.equal((await owned(() => f.store.recoverCommittedLesson(uid, lessonId, reservation))).content, `Saved ${lessonId}`);
      assert.equal((await f.store.getStoredDocument(reservation.requestPath))?.actualCostMicros, (await f.store.getStoredDocument(lease.receiptPath))?.actualCostMicros);
      assert.equal((await f.store.getStoredDocument(reservation.globalPath))?.reservedCostMicros, 0);
    }
    assert.equal((await f.store.getStoredDocument(guards[0].reservation.periodPath))?.requestCount, 2);
    assert.equal((await f.store.getStoredDocument(guards[0].reservation.periodPath))?.reservedCostMicros, 0);
    assert.equal((await f.store.getStoredDocument(guards[0].reservation.userBudgetPath))?.reservedCostMicros, 0);
    assert.equal(await f.store.getStoredDocument(`users/${uid}/courseCredits/current`), null);
  } finally {
    await f.monitor.query("DELETE FROM filosage_documents WHERE path = ANY($1::text[])", [[...exact]]);
    await f.close();
  }
});
