import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import {
  deriveObjectiveMastery,
  normalizeStoredMasteryEvidence,
  type MasteryEvidence,
} from "@/lib/mastery.ts";

function makeEvidence(overrides: Partial<MasteryEvidence>): MasteryEvidence {
  return {
    id: "test-evidence",
    courseId: "course-1",
    objectiveId: "objective-1",
    type: "transfer",
    result: "passed",
    label: "Test",
    observedAt: new Date().toISOString(),
    authority: "learner-reported",
    ...overrides,
  };
}

test("ai-assessed evidence does not advance mastery beyond introduction", () => {
  const evidence = makeEvidence({
    authority: "ai-assessed",
    type: "transfer",
    result: "passed",
  });
  const [mastery] = deriveObjectiveMastery(["objective-1"], [evidence]);
  // AI-assessed should not grant "demonstrated" (strength 3) like server-verified does
  assert.notEqual(mastery.state, "demonstrated");
});

test("server-verified transfer evidence can advance to demonstrated", () => {
  const evidence = makeEvidence({
    authority: "server-verified",
    type: "transfer",
    result: "passed",
  });
  const [mastery] = deriveObjectiveMastery(["objective-1"], [evidence]);
  assert.equal(mastery.state, "demonstrated");
});

test("normalizeStoredMasteryEvidence preserves ai-assessed authority", () => {
  const evidence = makeEvidence({ authority: "ai-assessed" });
  const normalized = normalizeStoredMasteryEvidence(evidence);
  assert.equal(normalized.authority, "ai-assessed");
});

test("normalizeStoredMasteryEvidence preserves server-verified authority", () => {
  const evidence = makeEvidence({ authority: "server-verified" });
  const normalized = normalizeStoredMasteryEvidence(evidence);
  assert.equal(normalized.authority, "server-verified");
});

test("ai-assessed authority survives the mastery API and evidence report paths", { timeout: 120_000 }, () => {
  // Route-level behavior against the real local store: GET must not drop
  // stored ai-assessed records, forged client tiers are downgraded,
  // server-minted records are not client-overwritable, and reports label
  // the tier ai-assessed. See tests/fixtures/mastery-authority-behavior.mjs.
  const result = spawnSync(process.execPath, [
    "--conditions=react-server", "--experimental-test-module-mocks", "--import", "tsx",
    "tests/fixtures/mastery-authority-behavior.mjs",
  ], { cwd: process.cwd(), encoding: "utf8", timeout: 110_000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /MASTERY_AUTHORITY_BEHAVIOR_OK/);
});
