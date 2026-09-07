import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, mock } from "node:test";
import { createPostgresFixture, waitForAdvisoryWaiter } from "./fixture.ts";
import type { ServerAccount } from "../../src/lib/account-server.ts";

for (const owner of [false, true]) for (const v2 of [false, true]) {
  test(`PostgreSQL owner=${owner} V2=${v2}: queued saves preserve publication, edits, ownership and atomic accounting`, { timeout: 30_000 }, async () => {
    const f = await createPostgresFixture();
    const uid = `lesson-pg-${randomUUID()}`;
    const exact = new Set<string>([`accountLifecycles/${uid}`]);
    const flags = ["COURSE_PIPELINE_V2", "COURSE_PIPELINE_V2_OWNER_ONLY", "COURSE_PIPELINE_V2_COHORT_PERCENT", "COURSE_VALIDATION_V2", "COURSE_REPAIR_V2"] as const;
    const original = Object.fromEntries(flags.map((key) => [key, process.env[key]]));
    Object.assign(process.env, { COURSE_PIPELINE_V2: "true", COURSE_PIPELINE_V2_OWNER_ONLY: "false", COURSE_PIPELINE_V2_COHORT_PERCENT: "100", COURSE_VALIDATION_V2: "true", COURSE_REPAIR_V2: "true" });
    let queued: Promise<unknown> | undefined;
    try {
      const { captureAccountGeneration, runWithAccountGeneration } = await import("../../src/lib/account-lifecycle.ts");
      const { reserveAiUsage, finalizeAiUsage } = await import("../../src/lib/ai-usage.ts");
      const { lessonCourseFingerprint, lessonPublicationState } = await import("../../src/lib/course-pipeline/lesson-save.ts");
      const { lessonCommitPaths } = await import("../../src/lib/course-pipeline/lesson-commit.ts");
      const scope = await captureAccountGeneration(uid);
      const owned = <T>(work: () => T) => runWithAccountGeneration(scope, work);
      const account: ServerAccount = { uid, plan: "pro", isOwner: owner, access: owner ? "owner" : "pro", accountStatus: "active", subscriptionStatus: "active" };
      // A unique far-future accounting month keeps cleanup away from other tests' shared pool shards.
      const future = Date.UTC(10_000 + Math.floor(Math.random() * 100_000), 1, 1);
      let sequence = 0;
      async function setup() {
        const id = `${uid}-${++sequence}`;
        const path = `courses/${id}`;
        const course = { authorId: uid, isPublic: false, ...(v2 ? { courseSchemaVersion: 5 } : {}), modules: [{ title: "Module", lessons: [{ title: "A", contentBasis: "verified-source", sourceIds: ["s"] }, { title: "B", contentBasis: "verified-source", sourceIds: ["s"] }] }], sourcePolicyVersion: "source-integrity-v5.0.0", sourcePack: [], sourceGroundingEvaluatorVersion: "v1" };
        await owned(() => f.store.putStoredDocument(path, course));
        exact.add(path); exact.add(`${path}/lessons/0-0`); exact.add(`${path}/lessons/0-1`);
        async function reserve(lessonId = "0-0", suffix = "first") {
          mock.timers.enable({ apis: ["Date"], now: future + sequence * 120_000 });
          try { return await owned(() => reserveAiUsage(account, "lesson_generation", `${id}-${lessonId}-${suffix}`, `${id}:${lessonId}:generate`, { resourceKey: `${id}:${lessonId}` })); }
          finally { mock.timers.reset(); }
        }
        const reservation = await reserve();
        const stored = (await f.store.getCourse(id))!;
        const guard = { scopeVersion: 1 as const, actor: { uid, isOwner: owner }, reservation, courseFingerprint: lessonCourseFingerprint(stored, "0-0"), publicationState: lessonPublicationState(stored), invalidateReadiness: true, usage: { usageSamples: [{ model: "gpt-5.6-luna", inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1 }] } };
        for (const p of lessonCommitPaths(guard)) exact.add(p);
        const data = { authorId: uid, content: "Committed result" };
        return { id, path, course: stored, guard, reserve, reservation, data, save: () => owned(() => f.store.saveLesson(id, "0-0", data, guard)) };
      }
      async function blockedSave(s: Awaited<ReturnType<typeof setup>>, change: () => Promise<unknown>, pattern: RegExp) {
        await f.monitor.query("BEGIN");
        await f.monitor.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [s.path]);
        const pid = await f.monitor.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
        queued = s.save();
        const rejection = assert.rejects(queued, pattern);
        await waitForAdvisoryWaiter(f.monitor, pid.rows[0].pid);
        await change();
        await f.monitor.query("COMMIT");
        await rejection;
        assert.equal((await f.store.getStoredDocument(s.reservation.requestPath))?.status, "reserved");
        await owned(() => finalizeAiUsage(s.reservation, { usageSamples: s.guard.usage.usageSamples, failed: true }));
      }
      for (const race of ["publish", "ABA", "edit", "attempt", "expired", "pause"] as const) {
        const s = await setup();
        if (race === "pause" && !v2) { await s.save(); continue; }
        await blockedSave(s, async () => {
          if (race === "edit") await f.monitor.query("INSERT INTO filosage_documents(path, collection_id, collection_path, document_id, data) VALUES ($1, 'lessons', $3, '0-0', $2::jsonb)", [`${s.path}/lessons/0-0`, JSON.stringify({ content: "Winning edit" }), `${s.path}/lessons`]);
          else if (race === "attempt" || race === "expired") await f.monitor.query("UPDATE filosage_documents SET data = data || $2::jsonb WHERE path = $1", [s.reservation.requestPath, JSON.stringify(race === "attempt" ? { attemptToken: "newer-owner" } : { leaseUntil: "2000-01-01T00:00:00Z" })]);
          else if (race === "pause") process.env.COURSE_PIPELINE_V2 = "false";
          else await f.monitor.query("UPDATE filosage_documents SET data = data || $2::jsonb WHERE path = $1", [s.path, JSON.stringify({ isPublic: race === "publish", lessonWriteEpoch: randomUUID() })]);
        }, /publish|publication|another request|attempt|expired|paused/i);
        process.env.COURSE_PIPELINE_V2 = "true";
        assert.equal((await f.store.getLesson(s.id, "0-0"))?.content ?? null, race === "edit" ? "Winning edit" : null);
      }
      const s = await setup();
      const second = await s.reserve("0-1");
      const otherGuard = { ...s.guard, reservation: second, courseFingerprint: lessonCourseFingerprint(s.course, "0-1") };
      for (const p of lessonCommitPaths(otherGuard)) exact.add(p);
      const data = { ...s.data, contentBasis: "model-knowledge", claimSupportEvaluatorStatus: "not_applicable", citations: [], sourceReferences: [] };
      const results = await Promise.all([
        owned(() => f.store.saveLessonWithEvidenceDowngrade(s.id, "0-0", data, { ...s.guard, actorId: uid, ownerOverride: owner })),
        owned(() => f.store.saveLessonWithEvidenceDowngrade(s.id, "0-1", data, { ...otherGuard, actorId: uid, ownerOverride: owner })),
      ]);
      assert.equal(results.length, 2);
      assert.equal(((await f.store.getCourse(s.id))!.evidenceProfile as { modelKnowledgeLessonCount: number }).modelKnowledgeLessonCount, 2);
      await owned(() => finalizeAiUsage(s.reservation, { failed: true }));
      assert.equal((await owned(() => f.store.recoverCommittedLesson(s.id, "0-0", s.reservation))).content, s.data.content);
      assert.equal((await f.store.getStoredDocument(s.reservation.requestPath))?.status, "completed");
      const competing = await setup();
      const winners = await Promise.allSettled([competing.save(), competing.save()]);
      assert.equal(winners.filter((r) => r.status === "fulfilled").length, 1);
      const repair = await setup();
      await owned(() => finalizeAiUsage(repair.reservation, { usageSamples: repair.guard.usage.usageSamples, failed: true }));
      const { publicationContentFingerprint } = await import("../../src/lib/publication-content.ts");
      const originalLesson = { content: "Repair author content", interactions: [{ id: "invalid-fixture-lab" }] };
      await owned(() => f.store.putStoredDocument(`${repair.path}/lessons/0-0`, originalLesson));
      const metadata = { repairId: randomUUID(), idempotencyKey: `repair-${repair.id}`, actorUid: uid, baseSnapshotHash: "a".repeat(64), contractVersion: "fixture", appliedAt: new Date().toISOString(), requestedIssueCodes: ["CQ_LAB_001"], attemptLimit: 2 };
      exact.add(`courseRepairs/${metadata.repairId}`);
      const repairGuard = { actor: { uid, isOwner: owner }, publicationState: lessonPublicationState(repair.course) };
      const apply = () => owned(() => f.store.applyDeterministicCourseRepair(repair.id, ["0-0"], { courseFingerprint: publicationContentFingerprint(repair.course), lessonFingerprints: { "0-0": publicationContentFingerprint(originalLesson) } }, [{ issueCode: "CQ_LAB_001", targetPath: 'lessons["0-0"].interactions[0]', operation: "remove", rationale: "Remove fixture lab" }], metadata, repairGuard));
      if (!v2) await assert.rejects(apply(), /paused/);
      else {
        await apply();
        assert.deepEqual((await f.store.getLesson(repair.id, "0-0"))?.interactions, []);
        const undo = () => owned(() => f.store.undoDeterministicCourseRepair(repair.id, ["0-0"], metadata.repairId, `undo-${repair.id}`, uid, new Date().toISOString(), repairGuard));
        const repaired = (await f.store.getLesson(repair.id, "0-0"))!;
        await f.monitor.query("BEGIN");
        await f.monitor.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [repair.path]);
        const repairPid = await f.monitor.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
        queued = undo();
        const undoRejected = assert.rejects(queued, /newer edits/);
        await waitForAdvisoryWaiter(f.monitor, repairPid.rows[0].pid);
        await f.monitor.query("UPDATE filosage_documents SET data = data || '{\"content\":\"New author edit\"}'::jsonb WHERE path = $1", [`${repair.path}/lessons/0-0`]);
        await f.monitor.query("COMMIT");
        await undoRejected;
        assert.equal((await f.store.getLesson(repair.id, "0-0"))?.content, "New author edit");
        await owned(() => f.store.putStoredDocument(`${repair.path}/lessons/0-0`, repaired));
        await undo();
        await undo();
        assert.deepEqual((await f.store.getLesson(repair.id, "0-0"))?.interactions, originalLesson.interactions);
      }
      const deletion = await setup();
      await f.monitor.query("BEGIN");
      await f.monitor.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`accountLifecycles/${uid}`]);
      const pid = await f.monitor.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      queued = deletion.save();
      const rejected = assert.rejects(queued, /account|generation/i);
      await waitForAdvisoryWaiter(f.monitor, pid.rows[0].pid);
      await f.monitor.query("UPDATE filosage_documents SET data = data || '{\"state\":\"deleting\"}'::jsonb WHERE path = $1", [`accountLifecycles/${uid}`]);
      await f.monitor.query("COMMIT");
      await rejected;
      assert.equal(await f.store.getLesson(deletion.id, "0-0"), null);
    } finally {
      mock.timers.reset();
      await f.monitor.query("ROLLBACK").catch(() => undefined);
      await queued?.catch(() => undefined);
      await f.monitor.query("DELETE FROM filosage_documents WHERE path = ANY($1::text[])", [[...exact]]);
      await f.close();
      for (const key of flags) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
    }
  });
}
