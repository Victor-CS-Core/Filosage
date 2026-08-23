import { expect, test } from "@playwright/test";
import {
  type BackfillAccountInput,
  identityIntentPathsToPrune,
  planIdentityBackfill,
} from "../src/lib/identity-link-policy";
import {
  type BackfillIdentityLinksDependencies,
  backfillIdentityLinksMain,
} from "../scripts/backfill-identity-links";
import {
  assertIdentityMaintenanceWriteTarget,
  identityMaintenanceTarget,
} from "../scripts/identity-maintenance-safety";
import {
  type PruneIdentityLinkIntentsDependencies,
  pruneIdentityLinkIntentsMain,
} from "../scripts/prune-identity-link-intents";

const secret = "test-secret-with-at-least-32-characters";
const plannedAt = "2026-08-18T12:00:00.000Z";
const oldIntentA = `v1_${"a".repeat(64)}`;
const oldIntentB = `v1_${"b".repeat(64)}`;

interface FakeBackfillState {
  reads: number;
  writes: Array<{ path: string; data: Record<string, unknown> }>;
  output: string[];
}

function fakeBackfillDependencies(options: {
  users?: Array<Record<string, unknown> & { id: string }>;
  existing?: Record<string, Record<string, unknown> | null>;
  transactionDocuments?: Record<string, Record<string, unknown> | null>;
} = {}) {
  const state: FakeBackfillState = { reads: 0, writes: [], output: [] };
  const users = options.users ?? [{ id: "google-a", email: "A@example.com" }];
  const existing = options.existing ?? {};
  const transactionDocuments = options.transactionDocuments ?? {};
  const dependencies: BackfillIdentityLinksDependencies = {
    getStoredDocument: async (path) => {
      state.reads += 1;
      return existing[path] ?? null;
    },
    listCollectionDocumentsPage: async () => {
      state.reads += 1;
      return {
        documents: users,
        inspected: users.length,
        hasMore: false,
        nextAfterId: null,
      };
    },
    planIdentityBackfill: (accounts, records, _explicit, now) => (
      planIdentityBackfill(accounts, records, secret, now)
    ),
    runStoredDocumentTransaction: async (paths, update) => {
      state.reads += 1;
      const documents = Object.fromEntries(paths.map((path) => [
        path,
        transactionDocuments[path] ?? null,
      ]));
      const result = update(documents);
      state.writes.push(...result.writes);
      return result.result;
    },
    now: () => plannedAt,
    writeOutput: (line) => state.output.push(line),
  };
  return { dependencies, state };
}

interface FakePruneState {
  reads: number;
  deletes: string[];
  output: string[];
}

function fakePruneDependencies(
  intents: Array<Record<string, unknown> & { id: string }> = [],
) {
  const state: FakePruneState = { reads: 0, deletes: [], output: [] };
  const dependencies: PruneIdentityLinkIntentsDependencies = {
    deleteStoredDocuments: async (paths) => {
      state.deletes.push(...paths);
    },
    listCollectionDocumentsPage: async () => {
      state.reads += 1;
      return {
        documents: intents,
        inspected: intents.length,
        hasMore: false,
        nextAfterId: null,
      };
    },
    now: () => Date.parse(plannedAt),
    writeOutput: (line) => state.output.push(line),
  };
  return { dependencies, state };
}

const qaEnvironment = {
  DATABASE_URL: "postgresql://operator:private-value@qa-db.example:5432/filosageqa?sslmode=require",
  OPERATIONS_ENVIRONMENT: "qa",
};
const qaTargetArgument = "--expected-target=postgres:qa-db.example/filosageqa";

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
  expect(conflict.counts.missing).toBe(1);
});

test("backfill rejects non-canonical identifiers before deriving registry paths", async () => {
  for (const uid of [
    " google-a",
    "google-a ",
    "google/a",
    "google\\a",
    "google\na",
    `google${String.fromCharCode(133)}a`,
  ]) {
    const plan = await planIdentityBackfill([{ uid, email: "a@example.com" }], {}, secret);
    expect(plan.candidates, uid).toEqual([]);
    expect(plan.writes, uid).toEqual([]);
    expect(plan.counts.invalid, uid).toBe(1);
  }
});

test("registry exactness requires the path id, complete schema, and valid timestamps", async () => {
  const initial = await planIdentityBackfill(
    [{ uid: "google-a", email: "a@example.com" }],
    {},
    secret,
    plannedAt,
  );
  const [identity, owner] = initial.writes;
  const exact = Object.fromEntries(initial.writes.map((write) => [
    write.path,
    { id: write.path.split("/").at(-1), ...write.data },
  ]));
  const accepted = await planIdentityBackfill(
    [{ uid: "google-a", email: "a@example.com" }],
    exact,
    secret,
    plannedAt,
  );
  expect(accepted.counts.exact).toBe(2);

  const corruptRecords: Array<Record<string, unknown>> = [
    { ...exact[identity.path], id: "v1_not-the-path-id" },
    { ...exact[identity.path], unexpected: "private-data" },
    Object.fromEntries(Object.entries(exact[identity.path]).filter(([key]) => key !== "createdAt")),
    Object.fromEntries(Object.entries(exact[identity.path]).filter(([key]) => key !== "schemaVersion")),
    { ...exact[identity.path], createdAt: "not-a-timestamp" },
    { ...exact[identity.path], updatedAt: 1_776_513_600_000 },
    { ...exact[identity.path], updatedAt: "2026-08-18 12:00:00" },
    {
      ...exact[identity.path],
      createdAt: "2026-08-18T12:01:00.000Z",
      updatedAt: "2026-08-18T12:00:00.000Z",
    },
  ];
  for (const corrupt of corruptRecords) {
    const result = await planIdentityBackfill(
      [{ uid: "google-a", email: "a@example.com" }],
      { [identity.path]: corrupt, [owner.path]: exact[owner.path] },
      secret,
      plannedAt,
    );
    expect(result.writes, JSON.stringify(corrupt)).toEqual([]);
    expect(result.counts.conflicts, JSON.stringify(corrupt)).toBe(1);
  }
});

test("intent pruning selects only consumed or expired records older than 30 days", () => {
  const now = Date.parse("2026-08-18T12:00:00.000Z");

  expect(identityIntentPathsToPrune([
    {
      id: oldIntentA,
      usedAt: "2026-07-01T00:00:00.000Z",
      expiresAt: "2026-07-01T00:10:00.000Z",
    },
    {
      id: oldIntentB,
      usedAt: null,
      expiresAt: "2026-07-10T00:00:00.000Z",
    },
    {
      id: `v1_${"c".repeat(64)}`,
      usedAt: "2026-08-10T00:00:00.000Z",
      expiresAt: "2026-08-10T00:10:00.000Z",
    },
    {
      id: `v1_${"d".repeat(64)}`,
      usedAt: null,
      expiresAt: "2026-08-18T12:05:00.000Z",
    },
  ], now)).toEqual([
    `identityLinkIntents/${oldIntentA}`,
    `identityLinkIntents/${oldIntentB}`,
  ]);
});

test("intent pruning retains malformed document identifiers", () => {
  const old = "2026-07-01T00:00:00.000Z";
  expect(identityIntentPathsToPrune([
    { id: "../users/victim", usedAt: old },
    { id: `v1_${"A".repeat(64)}`, expiresAt: old },
    { id: "plain-id", expiresAt: old },
  ], Date.parse(plannedAt))).toEqual([]);
});

test("write confirmation identifies the datastore without exposing its credential", () => {
  const target = identityMaintenanceTarget({
    DATABASE_URL: "postgresql://operator:private-value@qa-db.example:5432/filosageqa?sslmode=require",
    AZURE_POSTGRES_SERVER_NAME: "qa-db",
  });

  expect(target).toBe("postgres:qa-db.example/filosageqa");
  expect(target).not.toContain("operator");
  expect(target).not.toContain("private-value");
  expect(() => assertIdentityMaintenanceWriteTarget(
    ["--apply", "--expected-target=postgres:production-db/filosage"],
    target,
    { OPERATIONS_ENVIRONMENT: "qa" },
  )).toThrow(/exact target/i);
});

test("write confirmation requires a named operational environment", () => {
  const target = identityMaintenanceTarget({
    DATABASE_URL: "postgresql://operator:private-value@qa-db.example:5432/filosageqa",
  });

  expect(target).toBe("postgres:qa-db.example/filosageqa");
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

test("maintenance target uses only the validated DATABASE_URL host", () => {
  expect(identityMaintenanceTarget({
    DATABASE_URL: "postgres://operator:private-value@production-db.example:5432/filosage",
    AZURE_POSTGRES_SERVER_NAME: "qa-db",
  })).toBe("postgres:production-db.example/filosage");

  for (const databaseUrl of [
    "https://operator:private-value@qa-db.example/filosageqa",
    "mysql://operator:private-value@qa-db.example/filosageqa",
    "postgresql://operator:private-value@qa-db.example/",
    "postgresql://operator:private-value@qa-db.example/bad%2Fdatabase",
    "not-a-url-with-private-value",
  ]) {
    expect(() => identityMaintenanceTarget({ DATABASE_URL: databaseUrl }))
      .toThrow(/PostgreSQL maintenance target/);
    try {
      identityMaintenanceTarget({ DATABASE_URL: databaseUrl });
    } catch (error) {
      expect(String(error)).not.toContain("operator");
      expect(String(error)).not.toContain("private-value");
      expect(String(error)).not.toContain(databaseUrl);
    }
  }
});

test("imported operator modules remain inert and dry runs perform zero mutations", async () => {
  const backfill = fakeBackfillDependencies();
  const backfillSummary = await backfillIdentityLinksMain([], qaEnvironment, backfill.dependencies);
  expect(backfillSummary).toMatchObject({ mode: "dry-run", completed: true });
  expect(backfill.state.reads).toBeGreaterThan(0);
  expect(backfill.state.writes).toEqual([]);

  const prune = fakePruneDependencies([{ id: oldIntentA, usedAt: "2026-07-01T00:00:00.000Z" }]);
  const pruneSummary = await pruneIdentityLinkIntentsMain([], qaEnvironment, prune.dependencies);
  expect(pruneSummary).toEqual({
    mode: "dry-run",
    eligible: 1,
    retentionDays: 30,
    pruned: 0,
    completed: true,
  });
  expect(prune.state.reads).toBeGreaterThan(0);
  expect(prune.state.deletes).toEqual([]);
});

test("every missing backfill apply gate fails before the first datastore read", async () => {
  const cases: Array<{ args: string[]; env: Record<string, string | undefined> }> = [
    { args: ["--apply"], env: qaEnvironment },
    { args: ["--apply", "--missing-only"], env: qaEnvironment },
    {
      args: ["--apply", "--missing-only", qaTargetArgument],
      env: { OPERATIONS_ENVIRONMENT: "qa" },
    },
    {
      args: ["--apply", "--missing-only", qaTargetArgument],
      env: { DATABASE_URL: qaEnvironment.DATABASE_URL },
    },
  ];
  for (const item of cases) {
    const fake = fakeBackfillDependencies();
    await expect(backfillIdentityLinksMain(item.args, item.env, fake.dependencies)).rejects.toThrow();
    expect(fake.state.reads, item.args.join(" ")).toBe(0);
    expect(fake.state.writes, item.args.join(" ")).toEqual([]);
  }
});

test("every missing prune apply gate fails before the first datastore read", async () => {
  const cases: Array<{ args: string[]; env: Record<string, string | undefined> }> = [
    { args: ["--apply"], env: qaEnvironment },
    { args: ["--apply", "--confirm-30-day-retention"], env: qaEnvironment },
    {
      args: ["--apply", "--confirm-30-day-retention", qaTargetArgument],
      env: { OPERATIONS_ENVIRONMENT: "qa" },
    },
    {
      args: ["--apply", "--confirm-30-day-retention", qaTargetArgument],
      env: { DATABASE_URL: qaEnvironment.DATABASE_URL },
    },
  ];
  for (const item of cases) {
    const fake = fakePruneDependencies();
    await expect(pruneIdentityLinkIntentsMain(item.args, item.env, fake.dependencies)).rejects.toThrow();
    expect(fake.state.reads, item.args.join(" ")).toBe(0);
    expect(fake.state.deletes, item.args.join(" ")).toEqual([]);
  }
});

test("backfill uses users document ids and rejects every corrupt stored uid", async () => {
  for (const storedUid of ["different", " google-a", "google-a ", 17, null, undefined]) {
    const fake = fakeBackfillDependencies({
      users: [{ id: "google-a", uid: storedUid, email: "sensitive@example.com" }],
    });
    await expect(backfillIdentityLinksMain([], qaEnvironment, fake.dependencies))
      .rejects.toThrow(/preflight failed/i);
    expect(fake.state.writes, String(storedUid)).toEqual([]);
  }

  const exact = fakeBackfillDependencies({
    users: [{ id: "google-a", uid: "google-a", email: "sensitive@example.com" }],
  });
  await expect(backfillIdentityLinksMain([], qaEnvironment, exact.dependencies)).resolves.toMatchObject({
    mode: "dry-run",
  });
});

test("backfill apply reports actual created and race-to-exact registry counts", async () => {
  const source: BackfillAccountInput[] = [{ uid: "google-a", email: "sensitive@example.com" }];
  const initial = await planIdentityBackfill(source, {}, secret, plannedAt);
  const exactDocuments = Object.fromEntries(initial.writes.map((write) => [
    write.path,
    { id: write.path.split("/").at(-1), ...write.data },
  ]));
  const fake = fakeBackfillDependencies({
    users: [{ id: "google-a", email: "sensitive@example.com" }],
    transactionDocuments: exactDocuments,
  });

  const result = await backfillIdentityLinksMain(
    ["--apply", "--missing-only", qaTargetArgument],
    qaEnvironment,
    fake.dependencies,
  );
  expect(result).toMatchObject({
    mode: "write",
    created: 0,
    exact: 2,
    conflicts: 0,
    completed: true,
  });
  expect(fake.state.writes).toEqual([]);
});

test("backfill apply reports exact and conflict document counts before aborting", async () => {
  const source: BackfillAccountInput[] = [{ uid: "google-a", email: "sensitive@example.com" }];
  const initial = await planIdentityBackfill(source, {}, secret, plannedAt);
  const [identity, owner] = initial.writes;
  const fake = fakeBackfillDependencies({
    users: [{ id: "google-a", email: "sensitive@example.com" }],
    transactionDocuments: {
      [identity.path]: {
        id: identity.path.split("/").at(-1),
        ...identity.data,
      },
      [owner.path]: {
        id: owner.path.split("/").at(-1),
        ...owner.data,
        canonicalUid: "other-user",
      },
    },
  });

  let failure: unknown;
  try {
    await backfillIdentityLinksMain(
      ["--apply", "--missing-only", qaTargetArgument],
      qaEnvironment,
      fake.dependencies,
    );
  } catch (error) {
    failure = error;
  }
  expect(String(failure)).toMatch(/conflict/i);
  expect(fake.state.writes).toEqual([]);
  expect(JSON.parse(fake.state.output.at(-1)!)).toEqual({
    mode: "write",
    created: 0,
    exact: 1,
    conflicts: 1,
    completed: false,
  });
  for (const sensitive of ["google-a", "sensitive@example.com", "other-user", secret]) {
    expect(String(failure)).not.toContain(sensitive);
    expect(fake.state.output.join("\n")).not.toContain(sensitive);
  }
});

test("backfill apply counts every conflicting document before aborting", async () => {
  const source: BackfillAccountInput[] = [{ uid: "google-a", email: "sensitive@example.com" }];
  const initial = await planIdentityBackfill(source, {}, secret, plannedAt);
  const transactionDocuments = Object.fromEntries(initial.writes.map((write) => [
    write.path,
    {
      id: write.path.split("/").at(-1),
      ...write.data,
      canonicalUid: "other-user",
    },
  ]));
  const fake = fakeBackfillDependencies({
    users: [{ id: "google-a", email: "sensitive@example.com" }],
    transactionDocuments,
  });

  await expect(backfillIdentityLinksMain(
    ["--apply", "--missing-only", qaTargetArgument],
    qaEnvironment,
    fake.dependencies,
  )).rejects.toThrow(/conflict/i);
  expect(fake.state.writes).toEqual([]);
  expect(JSON.parse(fake.state.output.at(-1)!)).toEqual({
    mode: "write",
    created: 0,
    exact: 0,
    conflicts: 2,
    completed: false,
  });
});

test("backfill apply discards a pending missing write when its pair conflicts", async () => {
  const source: BackfillAccountInput[] = [{ uid: "google-a", email: "sensitive@example.com" }];
  const initial = await planIdentityBackfill(source, {}, secret, plannedAt);
  const [identity] = initial.writes;
  const fake = fakeBackfillDependencies({
    users: [{ id: "google-a", email: "sensitive@example.com" }],
    transactionDocuments: {
      [identity.path]: {
        id: identity.path.split("/").at(-1),
        ...identity.data,
        canonicalUid: "other-user",
      },
    },
  });

  await expect(backfillIdentityLinksMain(
    ["--apply", "--missing-only", qaTargetArgument],
    qaEnvironment,
    fake.dependencies,
  )).rejects.toThrow(/conflict/i);
  expect(fake.state.writes).toEqual([]);
  expect(JSON.parse(fake.state.output.at(-1)!)).toEqual({
    mode: "write",
    created: 0,
    exact: 0,
    conflicts: 1,
    completed: false,
  });
});

test("apply modes mutate only approved collections and output aggregates", async () => {
  const uid = "private-google-uid";
  const email = "private-learner@example.com";
  const backfill = fakeBackfillDependencies({ users: [{ id: uid, email }] });
  const backfillResult = await backfillIdentityLinksMain(
    ["--apply", "--missing-only", qaTargetArgument],
    qaEnvironment,
    backfill.dependencies,
  );
  expect(backfillResult).toMatchObject({ created: 2, exact: 0, conflicts: 0 });
  expect(backfill.state.writes).toHaveLength(2);
  expect(backfill.state.writes.every((write) => (
    write.path.startsWith("identityLinks/")
      || write.path.startsWith("identityEmailOwners/")
  ))).toBe(true);
  expect(backfill.state.writes.some((write) => write.path.startsWith("users/"))).toBe(false);

  const prune = fakePruneDependencies([
    { id: oldIntentA, usedAt: "2026-07-01T00:00:00.000Z" },
    { id: "../users/victim", usedAt: "2026-07-01T00:00:00.000Z" },
  ]);
  const pruneResult = await pruneIdentityLinkIntentsMain(
    ["--apply", "--confirm-30-day-retention", qaTargetArgument],
    qaEnvironment,
    prune.dependencies,
  );
  expect(pruneResult).toMatchObject({ pruned: 1, completed: true });
  expect(prune.state.deletes).toEqual([`identityLinkIntents/${oldIntentA}`]);

  const registryHash = backfill.state.writes[0].path.split("/").at(-1)!;
  const output = [...backfill.state.output, ...prune.state.output].join("\n");
  for (const sensitive of [
    uid,
    email,
    secret,
    registryHash,
    qaEnvironment.DATABASE_URL,
    "operator",
    "private-value",
  ]) expect(output).not.toContain(sensitive);
});
