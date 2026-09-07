import assert from "node:assert/strict";
import { after, test, mock } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { captureAccountGeneration, runWithAccountGeneration } from "../../src/lib/account-lifecycle.ts";
import { putStoredDocument } from "../../src/lib/document-store.ts";
import { COURSE_PIPELINE_VERSIONS } from "../../src/lib/course-pipeline/contract.ts";
import type { ServerAccount } from "../../src/lib/account-server.ts";
const directory = mkdtempSync(join(tmpdir(), "repair-route-"));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
Object.assign(process.env, { COURSE_PIPELINE_V2: "true", COURSE_VALIDATION_V2: "true", COURSE_REPAIR_V2: "true", COURSE_PIPELINE_V2_OWNER_ONLY: "false", COURSE_PIPELINE_V2_COHORT_PERCENT: "100" });
after(() => rmSync(directory, { recursive: true, force: true }));
const account: ServerAccount = { uid: "repair-actor", isOwner: false, plan: "pro", access: "pro", accountStatus: "active", subscriptionStatus: "active" };
// Only the verified-account boundary is supplied by the fixture. The route's
// cohort/author policy and actual account-scoped store execute unchanged.
const originalAuth = await import("../../src/lib/auth-server.ts");
mock.module("../../src/lib/auth-server.ts", { namedExports: { ...originalAuth, requireAcceptedAccount: async () => account } });
const { POST } = await import("../../src/app/api/courses/[courseId]/repair/route.ts");
for (const owner of [false, true]) test(`actual repair route excludes legacy courses (owner=${owner})`, async () => {
  account.isOwner = owner;
  const scope = await captureAccountGeneration(account.uid);
  const id = `legacy-${owner}`;
  await runWithAccountGeneration(scope, () => putStoredDocument(`courses/${id}`, { authorId: account.uid, isPublic: false, modules: [{ lessons: [{ title: "One" }] }] }));
  const response = await POST(new Request("https://fixture.invalid/api/courses/legacy/repair", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "repair-route-fixture" }, body: JSON.stringify({ action: "apply", snapshotHash: "a".repeat(64), contractVersion: COURSE_PIPELINE_VERSIONS.qualityContract }) }), { params: Promise.resolve({ courseId: id }) });
  assert.equal(response.status, 404, JSON.stringify(await response.json()));
});
test("actual repair route denies a nonowner editing another author's V2 course", async () => {
  account.isOwner = false;
  const scope = await captureAccountGeneration("another-author");
  await runWithAccountGeneration(scope, () => putStoredDocument("courses/other-v2", { authorId: "another-author", isPublic: false, courseSchemaVersion: 5, modules: [{ lessons: [{ title: "One" }] }] }));
  const response = await POST(new Request("https://fixture.invalid/api/courses/other-v2/repair", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": "repair-route-fixture" }, body: JSON.stringify({ action: "apply", snapshotHash: "a".repeat(64), contractVersion: COURSE_PIPELINE_VERSIONS.qualityContract }) }), { params: Promise.resolve({ courseId: "other-v2" }) });
  assert.equal(response.status, 403, JSON.stringify(await response.json()));
});
