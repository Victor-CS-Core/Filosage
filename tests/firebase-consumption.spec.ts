import { expect, test } from "@playwright/test";
import { estimateFirestoreCost } from "@/lib/firebase-pricing";

test("Firestore consumption applies the elapsed daily free quota and storage allowance", () => {
  const gib = 2 ** 30;
  expect(estimateFirestoreCost({
    reads: 1_650_000,
    writes: 720_000,
    deletes: 720_000,
    dataStorageBytes: 2 * gib,
    backupStorageBytes: gib,
    pitrStorageBytes: gib,
    elapsedDays: 31,
    daysInMonth: 31,
  })).toBeCloseTo(0.46, 6);
});

test("Firestore consumption remains zero while metered usage is inside the free tier", () => {
  expect(estimateFirestoreCost({
    reads: 49_000,
    writes: 19_000,
    deletes: 19_000,
    dataStorageBytes: 2 ** 30,
    backupStorageBytes: 0,
    pitrStorageBytes: 0,
    elapsedDays: 1,
    daysInMonth: 31,
  })).toBe(0);
});

test("Firestore storage estimates are prorated over the month to date", () => {
  const gib = 2 ** 30;
  expect(estimateFirestoreCost({
    reads: 0,
    writes: 0,
    deletes: 0,
    dataStorageBytes: 2 * gib,
    backupStorageBytes: 2 * gib,
    pitrStorageBytes: 0,
    elapsedDays: 15,
    daysInMonth: 30,
  })).toBeCloseTo(0.105, 6);
});
