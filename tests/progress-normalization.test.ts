import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { stableShard, asCourseProgress } from "@/lib/progress-normalization.ts";

test("stableShard matches an independent FNV-1a computation and stays in range", () => {
  // Independent reimplementation of the documented algorithm (FNV-1a over
  // UTF-16 code units, offset 2166136261, prime 16777619) so the check does
  // not just compare the function against itself.
  const fnv1aMod = (value: string, shardCount: number) => {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
    }
    return (hash >>> 0) % shardCount;
  };
  for (const uid of ["test-user-123", "another-user", "uid-with-unicode-é"]) {
    assert.equal(stableShard(uid, 16), fnv1aMod(uid, 16));
    const shard = stableShard(uid, 16);
    assert.ok(shard >= 0 && shard < 16);
  }
  // Distinct users generally land on distinct shards (no degenerate mapping).
  const shards = new Set(Array.from({ length: 64 }, (_, i) => stableShard(`user-${i}`, 16)));
  assert.ok(shards.size > 4, `expected shard spread, got ${shards.size} distinct shards`);
});

test("asCourseProgress keeps capstone publicly but gates recentOperations behind includePrivateOperations", () => {
  const operations = Array.from({ length: 60 }, (_, index) => ({
    id: `op-${index}`, fingerprint: `fp-${index}`, observedAt: "2026-10-12T00:00:00Z",
    response: { nextReviewAt: "2026-10-14T00:00:00Z", calibration: "aligned" },
  }));
  const stored = {
    courseId: "course-abc",
    topic: "Test Topic",
    lastLessonId: "0-1",
    lastLessonTitle: "Lesson 1",
    completedLessonIds: ["0-0", "0-1"],
    lessons: {
      "0-0": { lessonId: "0-0", completedAt: "2026-10-12T00:00:00Z", estimatedMinutes: 10 },
      "0-1": { lessonId: "0-1", completedAt: "2026-10-12T01:00:00Z", estimatedMinutes: 15 },
    },
    lastActivityAt: "2026-10-12T01:00:00Z",
    capstone: { status: "passed", summary: "Done", criteria: [], assessedAt: "2026-10-12T02:00:00Z", attempts: 1 },
    recentOperations: [...operations, null, "junk"],
  };

  // Public parse (API responses): capstone is learner-visible and kept;
  // the private idempotency ledger must not leak into it.
  const publicParsed = asCourseProgress(stored);
  assert.equal(publicParsed.capstone?.status, "passed");
  assert.equal(publicParsed.recentOperations, undefined);
  assert.equal(publicParsed.studyMinutes, 25);

  // Private parse (route transactions): the ledger is preserved, filtered
  // to objects, and capped at the most recent 50 entries.
  const privateParsed = asCourseProgress(stored, true);
  assert.equal(privateParsed.recentOperations?.length, 50);
  assert.equal(privateParsed.recentOperations?.[0]?.id, "op-10");
  assert.equal(privateParsed.recentOperations?.[49]?.id, "op-59");
  assert.equal(privateParsed.capstone?.status, "passed");
});

test("asCourseProgress preserves explicit studyMinutes when positive", () => {
  const stored = {
    courseId: "course-abc",
    studyMinutes: 42,
    lessons: {},
    lastActivityAt: "2026-10-12T00:00:00Z",
  };
  const normalized = asCourseProgress(stored);
  assert.equal(normalized.studyMinutes, 42);
});

test("asCourseProgress falls back to inferred minutes when studyMinutes is zero", () => {
  const stored = {
    courseId: "course-abc",
    studyMinutes: 0,
    lessons: {
      "0-0": { lessonId: "0-0", estimatedMinutes: 10 },
    },
    lastActivityAt: "2026-10-12T00:00:00Z",
  };
  const normalized = asCourseProgress(stored);
  assert.equal(normalized.studyMinutes, 10);
});

test("mobile completions preserve capstone and recentOperations through real routes", { timeout: 120_000 }, () => {
  // Web -> mobile -> web: seeded web-shaped progress (capstone +
  // recentOperations), real mobile POST completions, real web GET read.
  // See tests/fixtures/mobile-progress-preservation-behavior.mjs.
  const result = spawnSync(process.execPath, [
    "--conditions=react-server", "--experimental-test-module-mocks", "--import", "tsx",
    "tests/fixtures/mobile-progress-preservation-behavior.mjs",
  ], { cwd: process.cwd(), encoding: "utf8", timeout: 110_000 });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /MOBILE_PROGRESS_PRESERVATION_OK/);
});
