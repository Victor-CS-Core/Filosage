import { expect, test } from "@playwright/test";
import {
  identityIntentPathsToPrune,
  planIdentityBackfill,
} from "../src/lib/identity-link-policy";
import {
  assertIdentityMaintenanceWriteTarget,
  identityMaintenanceTarget,
} from "../scripts/identity-maintenance-safety";

const secret = "test-secret-with-at-least-32-characters";

test("backfill creates missing Google links and email owners without overwrites", async () => {
  const plan = await planIdentityBackfill([
    { uid: "google-a", email: "A@example.com" },
    { uid: "google-b", email: "B@example.com" },
  ], {}, secret);

  expect(plan.errors).toEqual([]);
  expect(plan.candidates).toHaveLength(2);
  expect(plan.writes).toHaveLength(4);
  expect(plan.counts).toEqual({
    accounts: 2,
    missing: 4,
    exact: 0,
    invalid: 0,
    duplicateEmails: 0,
    conflicts: 0,
  });
});

test("backfill is idempotent against exact existing registry documents", async () => {
  const first = await planIdentityBackfill([
    { uid: "google-a", email: "a@example.com" },
  ], {}, secret);
  const existing = Object.fromEntries(first.writes.map((write) => [
    write.path,
    { id: write.path.split("/").at(-1), ...write.data },
  ]));

  const second = await planIdentityBackfill([
    { uid: "google-a", email: "a@example.com" },
  ], existing, secret);

  expect(second.errors).toEqual([]);
  expect(second.writes).toEqual([]);
  expect(second.counts.exact).toBe(2);
});

test("duplicate normalized emails and conflicting mappings fail the plan", async () => {
  const duplicate = await planIdentityBackfill([
    { uid: "google-a", email: "Learner@example.com" },
    { uid: "google-b", email: " learner@EXAMPLE.com " },
  ], {}, secret);
  expect(duplicate.writes).toEqual([]);
  expect(duplicate.counts.duplicateEmails).toBe(1);

  const initial = await planIdentityBackfill([
    { uid: "google-a", email: "a@example.com" },
  ], {}, secret);
  const identityWrite = initial.writes.find((write) => (
    write.path.startsWith("identityLinks/")
  ));
  expect(identityWrite).toBeDefined();
  const conflict = await planIdentityBackfill([
    { uid: "google-a", email: "a@example.com" },
  ], {
    [identityWrite!.path]: {
      id: "conflict",
      ...identityWrite!.data,
      canonicalUid: "different-uid",
    },
  }, secret);
  expect(conflict.writes).toEqual([]);
  expect(conflict.counts.conflicts).toBe(1);
});

test("intent pruning selects only consumed or expired records older than 30 days", () => {
  const now = Date.parse("2026-08-18T12:00:00.000Z");

  expect(identityIntentPathsToPrune([
    {
      id: "old-used",
      usedAt: "2026-07-01T00:00:00.000Z",
      expiresAt: "2026-07-01T00:10:00.000Z",
    },
    {
      id: "old-expired",
      usedAt: null,
      expiresAt: "2026-07-10T00:00:00.000Z",
    },
    {
      id: "recent-used",
      usedAt: "2026-08-10T00:00:00.000Z",
      expiresAt: "2026-08-10T00:10:00.000Z",
    },
    {
      id: "active",
      usedAt: null,
      expiresAt: "2026-08-18T12:05:00.000Z",
    },
  ], now)).toEqual([
    "identityLinkIntents/old-used",
    "identityLinkIntents/old-expired",
  ]);
});

test("write confirmation identifies the datastore without exposing its credential", () => {
  const target = identityMaintenanceTarget({
    DATABASE_URL: "postgresql://operator:private-value@qa-db.example:5432/filosageqa?sslmode=require",
    AZURE_POSTGRES_SERVER_NAME: "qa-db",
  });

  expect(target).toBe("postgres:qa-db/filosageqa");
  expect(target).not.toContain("operator");
  expect(target).not.toContain("private-value");
  expect(() => assertIdentityMaintenanceWriteTarget(
    ["--apply", "--expected-target=postgres:production-db/filosage"],
    target,
    { OPERATIONS_ENVIRONMENT: "qa" },
  )).toThrow(/exact target/i);
});

test("write confirmation requires a named operational environment", () => {
  const target = "firestore:filosage-qa";

  expect(identityMaintenanceTarget({ FIREBASE_PROJECT_ID: "filosage-qa" })).toBe(target);
  expect(() => assertIdentityMaintenanceWriteTarget(
    ["--apply", `--expected-target=${target}`],
    target,
    {},
  )).toThrow(/OPERATIONS_ENVIRONMENT/);
  expect(() => assertIdentityMaintenanceWriteTarget(
    ["--apply", `--expected-target=${target}`],
    target,
    { OPERATIONS_ENVIRONMENT: "qa" },
  )).not.toThrow();
});
