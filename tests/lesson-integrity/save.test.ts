import assert from "node:assert/strict";
import { after, test, mock } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import * as store from "../../src/lib/document-store.ts";
import { captureAccountGeneration, runWithAccountGeneration } from "../../src/lib/account-lifecycle.ts";
import { reserveAiUsage, finalizeAiUsage } from "../../src/lib/ai-usage.ts";
import { publicationContentFingerprint } from "../../src/lib/publication-content.ts";
import { lessonCourseFingerprint, lessonPublicationState } from "../../src/lib/course-pipeline/lesson-save.ts";
import type { ServerAccount } from "../../src/lib/account-server.ts";
const directory = mkdtempSync(join(tmpdir(), "lesson-integrity-"));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
after(() => rmSync(directory, { recursive: true, force: true }));
let sequence = 0;
async function fixture() {
  const id = `lesson-integrity-${++sequence}`;
  const actor: ServerAccount = { uid: id, isOwner: true, access: "owner", plan: "pro", accountStatus: "active", subscriptionStatus: "active" };
  const scope = await captureAccountGeneration(id);
  const owned = <T>(work: () => T) => runWithAccountGeneration(scope, work);
  const course = { authorId: id, topic: "Evidence", isPublic: false, modules: [{ title: "One", lessons: [{ title: "A" }, { title: "B" }] }] };
  await owned(() => store.putStoredDocument(`courses/${id}`, course));
  const reservation = await owned(() => reserveAiUsage(actor, "lesson_generation", `${id}-request`, `${id}:0-0:generate`));
  const guard = { courseFingerprint: publicationContentFingerprint(await store.getCourse(id)), invalidateReadiness: true,
    publicationState: lessonPublicationState(course),
    actor: { uid: id, isOwner: true }, reservation,
    usage: { usageSamples: [{ model: "gpt-5.6-luna", inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1, responseId: "resp_fixture" }] },
  };
  const data = { authorId: id, aiAssisted: true, content: "Synthetic lesson result" };
  return { id, actor, scope, owned, course, reservation, guard, data };
}
test("legacy saves cannot change a course after publication", async () => {
  const f = await fixture();
  await f.owned(() => store.updateCourseVisibility(f.id, true));
  await assert.rejects(f.owned(() => store.saveLesson(f.id, "0-0", f.data)), /guard|publish/i);
  assert.equal(await store.getLesson(f.id, "0-0"), null);
});
test("publication then unpublication invalidates a previously captured save", async () => {
  const f = await fixture();
  await f.owned(() => store.updateCourseVisibility(f.id, true));
  await f.owned(() => store.updateCourseVisibility(f.id, false));
  await assert.rejects(f.owned(() => store.saveLesson(f.id, "0-0", f.data, f.guard)), /publication|changed/i);
  assert.equal(await store.getLesson(f.id, "0-0"), null);
});
test("expired attempt cannot commit despite a still-active account generation", async () => {
  const f = await fixture();
  const request = await store.getStoredDocument(f.reservation.requestPath);
  mock.timers.enable({ apis: ["Date"], now: Date.parse(String(request!.leaseUntil)) + 1 });
  try { await assert.rejects(f.owned(() => store.saveLesson(f.id, "0-0", f.data, f.guard)), /attempt|lease|expired/i); }
  finally { mock.timers.reset(); }
  assert.equal(await store.getLesson(f.id, "0-0"), null);
});
test("lesson and successful result receipt commit together before usage finalization", async () => {
  const f = await fixture();
  await f.owned(() => store.saveLesson(f.id, "0-0", f.data, f.guard));
  assert.equal((await store.getStoredDocument(f.reservation.requestPath))?.status, "completed");
  await f.owned(() => finalizeAiUsage(f.reservation, { failed: true }));
  assert.equal((await store.getStoredDocument(f.reservation.requestPath))?.status, "completed");
  assert.equal((await store.getStoredDocument(f.reservation.periodPath))?.requestCount, 1);
});
test("independent lesson reservations share budgets without serializing their resource locks", async () => {
  const f = await fixture();
  await f.owned(() => finalizeAiUsage(f.reservation, { usageSamples: f.guard.usage.usageSamples, failed: true }));
  const first = await f.owned(() => reserveAiUsage(f.actor, "lesson_generation", `${f.id}-first`, `${f.id}:0-0:generate`, { resourceKey: `${f.id}:0-0` }));
  const second = await f.owned(() => reserveAiUsage(f.actor, "lesson_generation", `${f.id}-second`, `${f.id}:0-1:generate`, { resourceKey: `${f.id}:0-1` }));
  assert.equal(first.periodPath, second.periodPath);
  assert.equal(first.userBudgetPath, second.userBudgetPath);
  assert.notEqual(first.lockKey, second.lockKey);
  await assert.rejects(f.owned(() => reserveAiUsage(f.actor, "lesson_generation", `${f.id}-duplicate`, `${f.id}:0-1:generate`, { resourceKey: `${f.id}:0-1` })), /in progress/);
  await f.owned(() => store.saveLesson(f.id, "0-0", f.data, { ...f.guard, reservation: first }));
  await f.owned(() => finalizeAiUsage(first, { usageSamples: f.guard.usage.usageSamples, failed: false }));
  await f.owned(() => store.saveLesson(f.id, "0-1", f.data, { ...f.guard, reservation: second }));
  assert.equal((await store.getStoredDocument(first.periodPath))?.requestCount, 2);
  assert.equal((await store.getStoredDocument(first.userBudgetPath))?.reservedCostMicros, 0);
});
test("committed replay verifies its original result instead of returning a newer edit", async () => {
  const f = await fixture();
  await f.owned(() => store.saveLesson(f.id, "0-0", f.data, f.guard));
  const replay = await f.owned(() => store.recoverCommittedLesson(f.id, "0-0", f.reservation));
  assert.equal(replay.content, "Synthetic lesson result");
  await f.owned(() => store.putStoredDocument(`courses/${f.id}/lessons/0-0`, { ...replay, content: "Newer author edit" }));
  await assert.rejects(f.owned(() => store.recoverCommittedLesson(f.id, "0-0", f.reservation)), /changed|superseded/i);
  assert.equal((await store.getLesson(f.id, "0-0"))?.content, "Newer author edit");
});
test("an independent evidence downgrade cannot invalidate the other lesson's unchanged curriculum", async () => {
  const f = await fixture();
  await f.owned(() => finalizeAiUsage(f.reservation, { usageSamples: f.guard.usage.usageSamples, failed: true }));
  const course = { ...f.course, sourcePolicyVersion: "source-integrity-v5.0.0", sourcePack: [], sourceGroundingEvaluatorVersion: "v1",
    modules: [{ title: "One", lessons: [{ title: "A", contentBasis: "verified-source", sourceIds: ["s"] }, { title: "B", contentBasis: "verified-source", sourceIds: ["s"] }] }] };
  await f.owned(() => store.putStoredDocument(`courses/${f.id}`, course));
  const stored = await store.getCourse(f.id);
  const first = await f.owned(() => reserveAiUsage(f.actor, "lesson_generation", `${f.id}-down`, `${f.id}:0-0:generate`, { resourceKey: `${f.id}:0-0` }));
  const second = await f.owned(() => reserveAiUsage(f.actor, "lesson_generation", `${f.id}-other`, `${f.id}:0-1:generate`, { resourceKey: `${f.id}:0-1` }));
  const captured = (lessonId: string) => ({ ...f.guard, scopeVersion: 1 as const, courseFingerprint: lessonCourseFingerprint(stored!, lessonId) });
  const data = { ...f.data, contentBasis: "model-knowledge", claimSupportEvaluatorStatus: "not_applicable", citations: [], sourceReferences: [] };
  await f.owned(() => store.saveLessonWithEvidenceDowngrade(f.id, "0-0", data, { ...captured("0-0"), reservation: first, actorId: f.actor.uid, ownerOverride: true }));
  await f.owned(() => store.saveLessonWithEvidenceDowngrade(f.id, "0-1", data, { ...captured("0-1"), reservation: second, actorId: f.actor.uid, ownerOverride: true }));
  assert.equal((await store.getLesson(f.id, "0-0"))?.contentBasis, "model-knowledge");
  assert.equal((await store.getLesson(f.id, "0-1"))?.contentBasis, "model-knowledge");
  const final = await store.getCourse(f.id);
  assert.equal((final!.evidenceProfile as { modelKnowledgeLessonCount: number }).modelKnowledgeLessonCount, 2);
});
for (const owner of [false, true]) for (const v2 of [false, true]) {
  test(`owner=${owner} V2=${v2}: newer edits and current publication pause are checked at commit`, async () => {
    const f = await fixture();
    const actor = { uid: f.actor.uid, isOwner: owner };
    const names = ["COURSE_PIPELINE_V2", "COURSE_PIPELINE_V2_OWNER_ONLY", "COURSE_PIPELINE_V2_COHORT_PERCENT"] as const;
    const previous = Object.fromEntries(names.map((key) => [key, process.env[key]]));
    Object.assign(process.env, { COURSE_PIPELINE_V2: "true", COURSE_PIPELINE_V2_OWNER_ONLY: "false", COURSE_PIPELINE_V2_COHORT_PERCENT: "100" });
    try {
      const course = { ...f.course, ...(v2 ? { courseSchemaVersion: 5 } : {}) };
      await f.owned(() => store.putStoredDocument(`courses/${f.id}`, course));
      const guard = { ...f.guard, actor, courseFingerprint: publicationContentFingerprint(await store.getCourse(f.id)) };
      await f.owned(() => store.putStoredDocument(`courses/${f.id}/lessons/0-0`, { ...f.data, content: "Winning edit" }));
      await assert.rejects(f.owned(() => store.saveLesson(f.id, "0-0", f.data, guard)), /another request/);
      assert.equal((await store.getLesson(f.id, "0-0"))?.content, "Winning edit");
      const replacement = { ...guard, lessonFingerprint: publicationContentFingerprint(await store.getLesson(f.id, "0-0")) };
      process.env.COURSE_PIPELINE_V2 = "false";
      if (v2) await assert.rejects(f.owned(() => store.saveLesson(f.id, "0-0", f.data, replacement)), (error: unknown) => (error as { code?: string }).code === "COURSE_PIPELINE_V2_PAUSED");
      else await f.owned(() => store.saveLesson(f.id, "0-0", f.data, replacement));
      assert.equal((await store.getLesson(f.id, "0-0"))?.content, v2 ? "Winning edit" : "Synthetic lesson result");
    } finally { for (const key of names) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } }
  });
}
test("replaced attempt and its late finalizer cannot save or clear the winning lesson lock", async () => {
  const f = await fixture();
  const firstRequest = await store.getStoredDocument(f.reservation.requestPath);
  mock.timers.enable({ apis: ["Date"], now: Date.parse(String(firstRequest!.leaseUntil)) + 1 });
  try {
    const second = await f.owned(() => reserveAiUsage(f.actor, "lesson_generation", `${f.id}-takeover`, `${f.id}:0-0:generate`));
    await assert.rejects(f.owned(() => store.saveLesson(f.id, "0-0", f.data, f.guard)), /attempt.*changed|expired/);
    await f.owned(() => finalizeAiUsage(f.reservation, { usageSamples: f.guard.usage.usageSamples, failed: true }));
    assert.equal((await store.getStoredDocument(second.periodPath))?.activeAttemptToken, second.attemptToken);
    await f.owned(() => store.saveLesson(f.id, "0-0", { ...f.data, content: "Winning attempt" }, { ...f.guard, reservation: second }));
    assert.equal((await store.getLesson(f.id, "0-0"))?.content, "Winning attempt");
    assert.equal((await store.getStoredDocument(second.userBudgetPath))?.reservedCostMicros, 0);
  } finally { mock.timers.reset(); }
});
test("deletion fences the atomic lesson and accounting write set", async () => {
  const f = await fixture();
  const path = `accountLifecycles/${f.actor.uid}`;
  await f.owned(() => store.putStoredDocument(path, { ...f.scope, state: "deleting", jobId: `${f.id}-deletion` }));
  await assert.rejects(f.owned(() => store.saveLesson(f.id, "0-0", f.data, f.guard)), (error: unknown) => (error as { code?: string }).code === "ACCOUNT_GENERATION_UNAVAILABLE");
  assert.equal(await store.getLesson(f.id, "0-0"), null);
  assert.equal((await store.getStoredDocument(f.reservation.requestPath))?.status, "reserved");
});
test("target resource and global curriculum/source edits invalidate the scoped guard", async () => {
  for (const change of ["curriculum", "sources", "target-resources"]) {
    const f = await fixture();
    const course = { ...f.course, sourcePack: [{ id: "source1", url: "https://example.invalid/one" }] };
    await f.owned(() => store.putStoredDocument(`courses/${f.id}`, course));
    const guard = { ...f.guard, scopeVersion: 1 as const, courseFingerprint: lessonCourseFingerprint((await store.getCourse(f.id))!, "0-0") };
    const changed = structuredClone(course);
    if (change === "curriculum") changed.modules[0].lessons[1].title = "Changed prerequisite";
    if (change === "sources") changed.sourcePack[0].url = "https://example.invalid/two";
    if (change === "target-resources") Object.assign(changed.modules[0].lessons[0], { contentBasis: "model-knowledge", sourceIds: [] });
    await f.owned(() => store.putStoredDocument(`courses/${f.id}`, changed));
    await assert.rejects(f.owned(() => store.saveLesson(f.id, "0-0", f.data, guard)), /course changed/);
    assert.equal(await store.getLesson(f.id, "0-0"), null);
  }
});
test("an attempt reserved for one lesson cannot commit another target", async () => {
  const f = await fixture();
  await assert.rejects(f.owned(() => store.saveLesson(f.id, "0-1", f.data, f.guard)), /attempt|target/i);
  assert.equal(await store.getLesson(f.id, "0-1"), null);
});
test("quarantine applied during generation prevents a late lesson commit", async () => {
  const f = await fixture();
  await f.owned(() => store.quarantineCourse(f.id, "Synthetic moderation hold"));
  await assert.rejects(f.owned(() => store.saveLesson(f.id, "0-0", f.data, f.guard)), /quarantin/i);
  assert.equal(await store.getLesson(f.id, "0-0"), null);
});
