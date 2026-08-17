import { expect, test } from "@playwright/test";
import {
  arbitrateCourseDeckDragVelocity,
  arbitrateCourseDeckReleaseVelocity,
  COMMIT_VELOCITY,
} from "../src/components/course-deck-velocity";

test("an immediate qualifying reversal overrides larger stale historical velocity", () => {
  expect(arbitrateCourseDeckDragVelocity(5_000, -1_000, 3_000)).toBe(-1_000);
});

test("a slow same-direction terminal sample preserves the fast peak", () => {
  expect(arbitrateCourseDeckDragVelocity(5_000, 100, 3_000)).toBe(5_000);
});

test("full release keeps a qualifying sampled reversal over stale release velocity", () => {
  expect(arbitrateCourseDeckReleaseVelocity(-1_000, 3_000)).toBe(-1_000);
});

test("release arbitration is symmetric at the inclusive commit boundary", () => {
  expect(arbitrateCourseDeckReleaseVelocity(COMMIT_VELOCITY, -3_000)).toBe(COMMIT_VELOCITY);
  expect(arbitrateCourseDeckReleaseVelocity(-COMMIT_VELOCITY, 3_000)).toBe(-COMMIT_VELOCITY);
});

test("an opposite sample below the commit threshold defers to release history", () => {
  expect(arbitrateCourseDeckReleaseVelocity(-(COMMIT_VELOCITY - 1), 100)).toBe(100);
});

test("same-sign release velocities keep the larger magnitude", () => {
  expect(arbitrateCourseDeckReleaseVelocity(-3_000, -1_000)).toBe(-3_000);
  expect(arbitrateCourseDeckReleaseVelocity(1_000, 3_000)).toBe(3_000);
});

test("release arbitration clamps the selected velocity", () => {
  expect(arbitrateCourseDeckReleaseVelocity(13_000, -3_000)).toBe(12_000);
  expect(arbitrateCourseDeckReleaseVelocity(0, -13_000)).toBe(-12_000);
});
