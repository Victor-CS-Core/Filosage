import assert from "node:assert/strict";
import { test } from "node:test";
import { stableShard, asCourseProgress } from "@/lib/progress-normalization.ts";

test("stableShard produces consistent shards for web and mobile", () => {
  // Both routes must shard engagement documents identically
  const uid = "test-user-123";
  const webShard = stableShard(uid, 16);
  const mobileShard = stableShard(uid, 16);
  assert.equal(webShard, mobileShard);
  assert.ok(webShard >= 0 && webShard < 16);
});

test("asCourseProgress normalizes identically for web and mobile", () => {
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
  };

  // Web route calls with includePrivateOperations=false (default)
  const webNormalized = asCourseProgress(stored);
  // Mobile route calls with default (no private ops)
  const mobileNormalized = asCourseProgress(stored);

  assert.deepEqual(webNormalized, mobileNormalized);
  assert.equal(webNormalized.courseId, "course-abc");
  assert.equal(webNormalized.completedLessonIds.length, 2);
  // studyMinutes should be inferred from lessons (10 + 15 = 25)
  assert.equal(webNormalized.studyMinutes, 25);
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
