import { spawnSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { EMPTY_LEARNER_STATE, readLearnerState, writeLearnerState } from "../src/lib/learner-state";
import { getLocalProgress, saveLocalProgress } from "../src/lib/learning-progress";
import { getLocalMasteryJourney, saveLocalMasteryJourney, type LearningOutcomePlan } from "../src/lib/mastery";
import { learnerStateRouteMigrationFixture } from "./fixtures/learner-state-route-migration";

import {
  isCurrentLearnerSession, learnerRequest, learnerSessionSnapshot, setLearnerStorageIdentity,
  readLearnerStorage, writeLearnerStorage, clearLearnerAccountStorage,
} from "../src/lib/learner-storage";

test("the required smoke runner selects account switching and delayed cross-tab privacy regressions", () => {
  const result = spawnSync(process.execPath, [
    "--experimental-strip-types", "scripts/run-playwright-smoke.mjs", "--list", "--reporter=line",
  ], {
    cwd: process.cwd(), encoding: "utf8", timeout: 30_000,
    env: { ...process.env, PLAYWRIGHT_MATRIX_DRY_RUN: "0" },
  });
  expect(result.status, result.stderr).toBe(0);
  const selected = result.stdout.split("\n").filter((line) => line.includes("account-storage-isolation.spec.ts:"));
  expect(selected).toHaveLength(2);
  expect(selected.some((line) => line.includes("A signs out; guest and B see none of A's work"))).toBe(true);
  expect(selected.some((line) => line.includes("a cross-tab signout invalidates mounted private work and ignores a delayed A mastery response"))).toBe(true);
});

// A device-wide record has no evidence of ownership. Signing in cannot claim it.
test("does not expose unowned legacy notes to a signed-in learner", async () => {
  const stored = new Map([["filosage-learner-state-v1", JSON.stringify({
    ...EMPTY_LEARNER_STATE, notes: { "course:0-0": "A-private-note" },
  })]]);
  await withStorage(stored, () => {
    expect(readLearnerState().notes).toEqual({});
  });
});

test("does not migrate unowned legacy completion into a learner record", async () => {
  await withStorage(new Map([["teach-progress:course", '["0-0"]']]), () => {
    expect(getLocalProgress("course")).toBeNull();
  });
});

test("migrates legacy notes transactionally without overwriting timestamp winners", async () => {
  const older = "2026-09-08T00:00:00.000Z";
  const newer = "2026-09-08T01:00:00.000Z";
  const cases = [
    { name: "durable newer", legacy: { content: "legacy-old", updatedAt: older }, durable: { content: "durable-new", updatedAt: newer }, response: "durable-new", durableResult: "durable-new" },
    { name: "legacy newer", legacy: { content: "legacy-new", updatedAt: newer }, durable: { content: "durable-old", updatedAt: older }, response: "legacy-new", durableResult: "legacy-new" },
    { name: "equal timestamps", legacy: { content: "legacy-tie", updatedAt: newer }, durable: { content: "durable-tie", updatedAt: newer }, response: "durable-tie", durableResult: "durable-tie" },
    { name: "concurrent durable edit", legacy: { content: "legacy-stale", updatedAt: newer }, durable: { content: "durable-old", updatedAt: older }, concurrentDurable: { content: "durable-concurrent", updatedAt: "2026-09-08T02:00:00.000Z" }, response: "legacy-stale", durableResult: "durable-concurrent" },
    { name: "missing legacy timestamp and durable valid timestamp", legacy: { content: "legacy-missing-time" }, durable: { content: "durable-valid-time", updatedAt: newer }, response: "durable-valid-time", durableResult: "durable-valid-time" },
    { name: "missing legacy timestamp and durable missing timestamp", legacy: { content: "legacy-missing-time" }, durable: { content: "durable-missing-time" }, response: "durable-missing-time", durableResult: "durable-missing-time" },
    { name: "missing legacy timestamp and durable invalid timestamp", legacy: { content: "legacy-missing-time" }, durable: { content: "durable-invalid-time", updatedAt: "not-a-timestamp" }, response: "durable-invalid-time", durableResult: "durable-invalid-time" },
  ];
  for (const scenario of cases) {
    const fixture = learnerStateRouteMigrationFixture(scenario);
    const response = await fixture.run();
    expect(response.status, scenario.name).toBe(200);
    expect((await response.json()).notes["course:0-0"], scenario.name).toBe(scenario.response);
    expect(fixture.durable(), scenario.name).toMatchObject({ content: scenario.durableResult });
    expect(fixture.preferences(), scenario.name).not.toHaveProperty("notes");
    expect(fixture.preferences(), scenario.name).not.toHaveProperty("noteUpdatedAt");
    expect(fixture.directMigrationWrites(), scenario.name).toBe(0);
    expect(fixture.transactionCalls(), scenario.name).toBeGreaterThan(0);
  }
  const failing = learnerStateRouteMigrationFixture({
    legacy: { content: "legacy-rollback", updatedAt: newer },
    durable: { content: "durable-before-failure", updatedAt: older },
    failBeforeCommit: true,
  });
  const failure = await failing.run();
  expect(failure.status).toBe(500);
  expect(failing.durable()).toMatchObject({ content: "durable-before-failure", updatedAt: older });
  expect(failing.preferences()).toMatchObject({
    notes: { "course:0-0": "legacy-rollback" },
    noteUpdatedAt: { "course:0-0": newer },
  });
  expect(failing.directMigrationWrites()).toBe(0);
  const invalidTimestamp = learnerStateRouteMigrationFixture({
    legacy: { content: "legacy-invalid-timestamp", updatedAt: "not-a-timestamp" },
  });
  const invalidTimestampResponse = await invalidTimestamp.run();
  expect(invalidTimestampResponse.status).toBe(200);
  expect((await invalidTimestampResponse.json()).notes["course:0-0"]).toBe("legacy-invalid-timestamp");
  expect(invalidTimestamp.durable()).toMatchObject({ content: "legacy-invalid-timestamp" });
  expect(invalidTimestamp.durable()?.updatedAt).not.toBe("not-a-timestamp");
  expect(Number.isFinite(Date.parse(String(invalidTimestamp.durable()?.updatedAt)))).toBe(true);
  expect(invalidTimestamp.preferences()).not.toHaveProperty("notes");
  expect(invalidTimestamp.preferences()).not.toHaveProperty("noteUpdatedAt");
  const epochTimestamp = "1970-01-01T00:00:00.000Z";
  const epoch = learnerStateRouteMigrationFixture({
    legacy: { content: "legacy-epoch", updatedAt: epochTimestamp },
  });
  expect((await epoch.run()).status).toBe(200);
  expect(epoch.durable()).toMatchObject({ content: "legacy-epoch", updatedAt: epochTimestamp });
  const maximumLegacyNotes = Object.fromEntries(Array.from({ length: 500 }, (_, index) => [
    `course:${index}`,
    { content: `legacy-${index}`, updatedAt: newer },
  ]));
  const maximum = learnerStateRouteMigrationFixture({
    legacy: { content: "unused" },
    legacyNotes: maximumLegacyNotes,
  });
  const maximumResponse = await maximum.run();
  expect(maximumResponse.status).toBe(200);
  expect(Object.keys((await maximumResponse.json()).notes)).toHaveLength(500);
  expect(maximum.maximumTransactionWrites()).toBeLessThanOrEqual(500);
  expect(maximum.transactionCalls()).toBe(2);
  for (const [noteKey, note] of Object.entries(maximumLegacyNotes)) {
    expect(maximum.durable(noteKey)).toMatchObject(note);
  }
  expect(maximum.preferences()).not.toHaveProperty("notes");
  expect(maximum.preferences()).not.toHaveProperty("noteUpdatedAt");
  const overLimitLegacyNotes = Object.fromEntries(Array.from({ length: 501 }, (_, index) => [
    `course:over-limit-${index}`,
    { content: `legacy-over-limit-${index}`, updatedAt: newer },
  ]));
  const overLimit = learnerStateRouteMigrationFixture({
    legacy: { content: "unused" },
    legacyNotes: overLimitLegacyNotes,
  });
  expect((await overLimit.run()).status).toBe(500);
  expect(overLimit.transactionCalls()).toBe(1);
  expect(overLimit.maximumTransactionWrites()).toBe(0);
  expect(overLimit.preferences()).toMatchObject({
    notes: Object.fromEntries(Object.entries(overLimitLegacyNotes).map(([noteKey, note]) => [noteKey, note.content])),
    noteUpdatedAt: Object.fromEntries(Object.entries(overLimitLegacyNotes).map(([noteKey]) => [noteKey, newer])),
  });
  for (const noteKey of Object.keys(overLimitLegacyNotes)) expect(overLimit.durable(noteKey)).toBeNull();
});

test("does not hydrate unowned mastery evidence for automatic cloud replay", async () => {
  await withStorage(new Map([["filosage-mastery-v1:course", JSON.stringify({
    plan: { courseId: "course", desiredOutcome: "A-private-goal" },
    evidence: [{ id: "A-private-evidence", courseId: "course", objectiveId: "objective-m0-l0", type: "transfer", result: "attempted", label: "A-private-evidence", observedAt: "2026-09-01T00:00:00.000Z" }],
  })]]), () => {
    expect(getLocalMasteryJourney("course")).toEqual({ plan: null, evidence: [] });
  });
});

test("keeps notes, goals, evidence, completion and both draft families private while preserving same-account reentry", async () => {
  await withStorage(new Map(), () => {
    const plan: LearningOutcomePlan = {
      courseId: "course", courseTopic: "Evidence", desiredOutcome: "A-private-goal", applicationContext: "A-private-context",
      targetArtifact: "An explanation", weeklyMinutes: 60, diagnostics: [], recommendedLessonId: "0-0", explanation: "Start here.",
      createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
    };
    writeLearnerState({ ...EMPTY_LEARNER_STATE, notes: { "course:0-0": "A-private-note" } }, "account-A");
    saveLocalMasteryJourney("course", { plan, evidence: [{ id: "A-evidence", courseId: "course", objectiveId: "objective-m0-l0", type: "transfer", result: "attempted", label: "A-private-evidence", observedAt: plan.createdAt }] }, "account-A");
    saveLocalProgress({ courseId: "course", topic: "Evidence", lessonId: "0-0", lessonTitle: "A-private-completion", totalQuestions: 0, firstAttemptCorrect: 0, attempts: 0, confidence: "high" }, "account-A");
    writeLearnerStorage("account-A", "source-cache", "/api/courses?scope=mine", ["A-private-course"]);
    writeLearnerStorage("account-A", "experience-draft", "course:0-0", "A-private-experience");
    writeLearnerStorage("account-A", "transfer-draft", "course:0-0", "A-private-transfer");
    for (const other of [null, "account-B"]) {
      setLearnerStorageIdentity(other);
      expect(readLearnerState(other).notes).toEqual({});
      expect(getLocalMasteryJourney("course", other)).toEqual({ plan: null, evidence: [] });
      expect(getLocalProgress("course", other)).toBeNull();
      expect(readLearnerStorage(other, "source-cache", "/api/courses?scope=mine")).toBeNull();
      expect(readLearnerStorage(other, "experience-draft", "course:0-0")).toBeNull();
      expect(readLearnerStorage(other, "transfer-draft", "course:0-0")).toBeNull();
      expect(writeLearnerStorage("account-A", "transfer-draft", "course:0-0", "stale write")).toBe(false);
    }
    setLearnerStorageIdentity("account-A");
    expect(readLearnerState("account-A").notes).toEqual({ "course:0-0": "A-private-note" });
    expect(getLocalMasteryJourney("course", "account-A").plan?.desiredOutcome).toBe("A-private-goal");
    expect(getLocalMasteryJourney("course", "account-A").evidence[0].label).toBe("A-private-evidence");
    expect(getLocalProgress("course", "account-A")?.completedLessonIds).toEqual(["0-0"]);
    expect(readLearnerStorage("account-A", "source-cache", "/api/courses?scope=mine")).toEqual(["A-private-course"]);
    expect(readLearnerStorage("account-A", "experience-draft", "course:0-0")).toBe("A-private-experience");
    expect(readLearnerStorage("account-A", "transfer-draft", "course:0-0")).toBe("A-private-transfer");
  });
});

test("invalidates an old request while its token is delayed, including reentry as the same UID", async () => {
  await withStorage(new Map(), async () => {
    let release!: (token: string) => void;
    const token = new Promise<string>((resolve) => { release = resolve; });
    const oldSession = learnerSessionSnapshot();
    const pending = learnerRequest({ uid: "account-A", getIdToken: () => token }, "/api/mastery", {
      method: "PUT", body: "A-private-goal",
    });
    const rejected = expect(pending).rejects.toThrow("learning session changed");
    setLearnerStorageIdentity(null);
    setLearnerStorageIdentity("account-A");
    release("old-session-marker");
    await rejected;
    expect(isCurrentLearnerSession(oldSession)).toBe(false);
    expect(oldSession.signal.aborted).toBe(true);
  });
});

test("aborts an in-flight learning upload and ignores its delayed response after switching accounts", async () => {
  await withStorage(new Map(), async () => {
    const originalFetch = globalThis.fetch;
    let release!: (response: Response) => void;
    let dispatched!: () => void;
    const started = new Promise<void>((resolve) => { dispatched = resolve; });
    let requestSignal: AbortSignal | null | undefined;
    globalThis.fetch = async (_input, init) => {
      requestSignal = init?.signal;
      dispatched();
      return new Promise<Response>((resolve) => { release = resolve; });
    };
    try {
      const pending = learnerRequest({ uid: "account-A", getIdToken: async () => "A-token" }, "/api/mastery", { method: "PUT", body: "A-private-goal" });
      const rejected = expect(pending).rejects.toThrow("learning session changed");
      await started;
      setLearnerStorageIdentity("account-B");
      expect(requestSignal?.aborted).toBe(true);
      release(new Response('{"saved":true}', { status: 200 }));
      await rejected;
    } finally { globalThis.fetch = originalFetch; }
  });
});

test("rejects blank account IDs instead of creating an unowned namespace", async () => {
  await withStorage(new Map(), () => {
    expect(() => setLearnerStorageIdentity(" ")).toThrow("canonical account ID");
  });
});

test("server authorization rejects a stale or malformed account claim before accepting a cookie-backed write", () => {
  const script = `
    const { getVerifiedUser, requireUser } = await import('./src/lib/auth-server.ts');
    const rows = [];
    for (const claim of [undefined, 'local-owner', 'account-A', '', '%', '%20local-owner', 'local-owner,account-A']) {
      const headers = { authorization: 'Bearer playwright-local-owner' };
      if (claim !== undefined) headers['x-filosage-expected-uid'] = claim;
      const request = new Request('http://localhost/api/learner-state', { method: 'PUT', headers });
      const user = await getVerifiedUser(request);
      let status = 200;
      try { await requireUser(request); } catch (error) { status = error.status; }
      rows.push({ claim: claim ?? 'absent', uid: user?.uid ?? null, status });
    }
    const claimOnly = await getVerifiedUser(new Request('http://localhost/api/learner-state', {
      headers: { 'x-filosage-expected-uid': 'local-owner' },
    }));
    console.log(JSON.stringify({ rows, claimOnly }));
  `;
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--eval", script], {
    cwd: process.cwd(), encoding: "utf8", timeout: 20_000,
    env: { ...process.env, NODE_ENV: "test", DATABASE_URL: "" },
  });
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ rows: [
    { claim: "absent", uid: "local-owner", status: 200 },
    { claim: "local-owner", uid: "local-owner", status: 200 },
    { claim: "account-A", uid: null, status: 401 },
    { claim: "", uid: null, status: 401 },
    { claim: "%", uid: null, status: 401 },
    { claim: "%20local-owner", uid: null, status: 401 },
    { claim: "local-owner,account-A", uid: null, status: 401 },
  ], claimOnly: null });
});

test("deployed authorization compares the account marker with the independently resolved canonical UID", () => {
  const result = spawnSync(process.execPath, [
    "--conditions=react-server", "--experimental-test-module-mocks", "--import", "tsx", "tests/fixtures/account-storage-server-behavior.ts",
  ], {
    cwd: process.cwd(), encoding: "utf8", timeout: 20_000,
    env: {
      ...process.env, NODE_ENV: "production", DATABASE_URL: "", AZURE_EASY_AUTH_ENABLED: "true",
      DIRECT_GOOGLE_AUTH_ENABLED: "true", EXTERNAL_ID_AUTH_ENABLED: "false",
      IDENTITY_LINK_HMAC_SECRET: "account-storage-test-secret-32-characters",
    },
  });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(result.stdout).toContain("ACCOUNT_STORAGE_DEPLOYED_IDENTITY_OK");
});

test("a new account generation invalidates same-UID drafts and removes only that account's browser records", async () => {
  await withStorage(new Map(), () => {
    setLearnerStorageIdentity("account-A", "generation-old");
    writeLearnerStorage("account-A", "transfer-draft", "course", "old private draft");
    const oldSession = learnerSessionSnapshot();
    setLearnerStorageIdentity("account-B", "generation-B");
    writeLearnerStorage("account-B", "transfer-draft", "course", "B private draft");
    setLearnerStorageIdentity("account-A", "generation-new");
    expect(isCurrentLearnerSession(oldSession)).toBe(false);
    expect(readLearnerStorage("account-A", "transfer-draft", "course")).toBeNull();
    writeLearnerStorage("account-A", "transfer-draft", "course", "new draft");
    clearLearnerAccountStorage("account-B");
    expect(readLearnerStorage("account-A", "transfer-draft", "course")).toBe("new draft");
    clearLearnerAccountStorage("account-A");
    setLearnerStorageIdentity("account-A", "generation-new");
    expect(readLearnerStorage("account-A", "transfer-draft", "course")).toBeNull();
    setLearnerStorageIdentity("account-B", "generation-B");
    expect(readLearnerStorage("account-B", "transfer-draft", "course")).toBe("B private draft");
  });
});

async function withStorage(stored: Map<string, string>, run: () => void | Promise<void>) {
  const storage: Storage = {
    get length() { return stored.size; },
    clear: () => stored.clear(),
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => { stored.set(key, value); },
    removeItem: (key) => { stored.delete(key); },
    key: (index) => [...stored.keys()][index] ?? null,
  };
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage, dispatchEvent: () => true } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  setLearnerStorageIdentity("account-A");
  try { await run(); } finally {
    setLearnerStorageIdentity(null);
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
}

test("a delayed A generation-error body cannot invalidate B after the response headers arrive", async () => {
  await withStorage(new Map(), async () => {
    const originalFetch = globalThis.fetch;
    let release!: (value: unknown) => void;
    let started!: () => void;
    const reading = new Promise<void>((resolve) => { started = resolve; });
    const body = new Promise((resolve) => { release = resolve; });
    const response = new Response(null, { status: 403 });
    response.clone = () => ({ json: () => { started(); return body; } }) as Response;
    globalThis.fetch = async () => response;
    try {
      const pending = learnerRequest({ uid: "account-A", getIdToken: async () => "A" }, "/api/mastery");
      const rejected = expect(pending).rejects.toThrow("learning session changed");
      await reading;
      setLearnerStorageIdentity("account-B");
      const currentB = learnerSessionSnapshot();
      release({ code: "ACCOUNT_GENERATION_UNAVAILABLE" });
      await rejected;
      expect(isCurrentLearnerSession(currentB)).toBe(true);
    } finally { globalThis.fetch = originalFetch; }
  });
});

test("failed cloud reads retain last-known data and retry certifies empty only on success", async () => {
  const { createLearnerSource, learnerJson } = await import("../src/lib/learner-source");
  await withStorage(new Map(), async () => {
    const originalFetch = globalThis.fetch;
    let status = 503;
    let data = ["A-private-record"];
    globalThis.fetch = async () => Response.json(data, { status });
    const user = { uid: "account-A", getIdToken: async () => "A" };
    const source = createLearnerSource(user, (signal) => learnerJson<string[]>(user, "/api/progress", { signal }), (items) => !items.length, undefined,
      (items) => { writeLearnerStorage(user.uid, "source-cache", "/api/progress", items); });
    try {
      await source.load();
      expect(source.getSnapshot()).toMatchObject({ status: "error", data: undefined });
      status = 200; await source.load();
      expect(source.getSnapshot()).toMatchObject({ status: "loaded", data: ["A-private-record"] });
      status = 503; await source.load();
      expect(source.getSnapshot()).toMatchObject({ status: "stale", data: ["A-private-record"] });
      expect(readLearnerStorage(user.uid, "source-cache", "/api/progress")).toEqual(["A-private-record"]);
      status = 200; data = []; await source.load();
      expect(source.getSnapshot()).toMatchObject({ status: "empty", data: [] });
    } finally { source.cancel(); globalThis.fetch = originalFetch; }
  });
});

test("learner cloud deadlines include delayed token and body reads and abort stale completion", async () => {
  const { learnerJson } = await import("../src/lib/learner-source");
  await withStorage(new Map(), async () => {
    const originalFetch = globalThis.fetch;
    let requests = 0;
    globalThis.fetch = async () => { requests += 1; return Response.json({}); };
    try {
      await expect(learnerJson({ uid: "account-A", getIdToken: () => new Promise(() => {}) }, "/api/mastery", {}, 10)).rejects.toThrow("taking too long");
      expect(requests).toBe(0);
      globalThis.fetch = async () => new Response(new ReadableStream({ start() { /* Deliberately never supplies a body. */ } }));
      await expect(learnerJson({ uid: "account-A", getIdToken: async () => "A" }, "/api/mastery", {}, 10)).rejects.toThrow("taking too long");
    } finally { globalThis.fetch = originalFetch; }
  });
});

test("51 queued note deletions survive offline reentry and retry acknowledges bounded successful batches", async () => {
  const { queueLearnerStateChanges, mergeLearnerCloud, pendingLearnerSync, syncLearnerState } = await import("../src/lib/learner-sync");
  await withStorage(new Map(), async () => {
    const before = { ...EMPTY_LEARNER_STATE, notes: Object.fromEntries(Array.from({ length: 51 }, (_, index) => [`course:${index}`, `private-${index}`])) };
    const after = { ...EMPTY_LEARNER_STATE, updatedAt: "2026-09-07T00:00:00.000Z" };
    writeLearnerState(before, "account-A");
    queueLearnerStateChanges("account-A", before, after);
    writeLearnerState(after, "account-A");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => Response.json({}, { status: 503 });
    const user = { uid: "account-A", getIdToken: async () => "A" };
    try {
      await expect(syncLearnerState(user)).rejects.toThrow("unavailable");
      setLearnerStorageIdentity(null); setLearnerStorageIdentity("account-B");
      expect(Object.keys(pendingLearnerSync("account-B").deleted)).toHaveLength(0);
      setLearnerStorageIdentity("account-A");
      expect(mergeLearnerCloud("account-A", before).notes).toEqual({});
      expect(Object.keys(pendingLearnerSync("account-A").deleted)).toHaveLength(51);
      const batches: string[][] = [];
      globalThis.fetch = async (_input, init) => {
        const payload = JSON.parse(String(init?.body));
        batches.push(payload.deletedNoteKeys);
        expect(payload.deletedNoteKeys.length).toBeLessThanOrEqual(50);
        expect(payload.noteChanges.length).toBeLessThanOrEqual(50);
        return Response.json({ success: true });
      };
      await syncLearnerState(user);
      expect(batches.map((batch) => batch.length)).toEqual([50, 1]);
      expect(new Set(batches.flat()).size).toBe(51);
      expect(pendingLearnerSync("account-A")).toEqual({ notes: {}, deleted: {} });
      await syncLearnerState(user);
      expect(batches).toHaveLength(2);
    } finally { globalThis.fetch = originalFetch; }
  });
});

test("a successful in-flight note save does not acknowledge a newer draft", async () => {
  const { queueLearnerStateChanges, syncLearnerState, pendingLearnerSync } = await import("../src/lib/learner-sync");
  await withStorage(new Map(), async () => {
    const originalFetch = globalThis.fetch;
    let release!: (value: Response) => void;
    let started!: () => void;
    const requested = new Promise<void>((resolve) => { started = resolve; });
    const first = { ...EMPTY_LEARNER_STATE, notes: { "course:0": "first" }, updatedAt: "2026-09-07T01:00:00.000Z" };
    const second = { ...first, notes: { "course:0": "newer draft" }, updatedAt: "2026-09-07T02:00:00.000Z" };
    queueLearnerStateChanges("account-A", EMPTY_LEARNER_STATE, first); writeLearnerState(first, "account-A");
    let calls = 0;
    globalThis.fetch = async () => ++calls === 1 ? (started(), new Promise<Response>((resolve) => { release = resolve; })) : Response.json({}, { status: 503 });
    try {
      const pending = syncLearnerState({ uid: "account-A", getIdToken: async () => "A" });
      const rejected = expect(pending).rejects.toThrow("unavailable");
      await requested;
      queueLearnerStateChanges("account-A", first, second); writeLearnerState(second, "account-A");
      release(Response.json({ success: true })); await rejected;
      expect(pendingLearnerSync("account-A").notes["course:0"].content).toBe("newer draft");
      expect(readLearnerState("account-A").notes["course:0"]).toBe("newer draft");
    } finally { globalThis.fetch = originalFetch; }
  });
});

test("a delayed private export body cannot trigger a download after switching accounts", async () => {
  const { downloadLearnerFile } = await import("../src/lib/learner-actions");
  await withStorage(new Map(), async () => {
    const originalFetch = globalThis.fetch;
    let bodyStarted!: () => void;
    let release!: (blob: Blob) => void;
    const reading = new Promise<void>((resolve) => { bodyStarted = resolve; });
    const response = new Response();
    response.blob = () => { bodyStarted(); return new Promise((resolve) => { release = resolve; }); };
    globalThis.fetch = async () => response;
    try {
      const download = downloadLearnerFile({ uid: "account-A", getIdToken: async () => "A" }, "/api/account/data", "private.json");
      const rejected = expect(download).rejects.toThrow("learning session changed");
      await reading; setLearnerStorageIdentity("account-B");
      release(new Blob(["A-private-export"]));
      await rejected;
      // No document exists in this process; reaching anchor creation would fail
      // instead of the expected session rejection above.
    } finally { globalThis.fetch = originalFetch; }
  });
});

test("clipboard completion rejects the old epoch and cannot acknowledge B's UI", async () => {
  const { copyLearnerText } = await import("../src/lib/learner-actions");
  await withStorage(new Map(), async () => {
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    let release!: () => void;
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: () => new Promise<void>((resolve) => { release = resolve; }) } } });
    try {
      const copy = copyLearnerText(learnerSessionSnapshot(), "A-private-summary");
      let visibleAcknowledgements = 0;
      const guarded = copy.then(() => { visibleAcknowledgements += 1; });
      const rejected = expect(guarded).rejects.toThrow("learning session changed");
      setLearnerStorageIdentity("account-B"); release(); await rejected;
      expect(visibleAcknowledgements).toBe(0);
    } finally {
      if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
      else Reflect.deleteProperty(globalThis, "navigator");
    }
  });
});

test("active-data deletion keeps only a generic tab receipt across invalidation, never for B", async () => {
  const { acknowledgeActiveDataRemoval, readDeletionReceipt } = await import("../src/lib/learner-actions");
  const stored = new Map<string, string>();
  await withStorage(stored, () => {
    writeLearnerStorage("account-A", "transfer-draft", "course", "A-private");
    acknowledgeActiveDataRemoval({ uid: "account-A", getIdToken: async () => "A" });
    expect(readDeletionReceipt()).toBe("Your active learning data has been removed. Retention and identity review remain pending.");
    expect([...stored.values()].join(" ")).not.toContain("A-private");
    expect([...stored.values()].join(" ")).not.toContain("Retention");
    setLearnerStorageIdentity("account-B"); expect(readDeletionReceipt()).toBeNull();
    setLearnerStorageIdentity(null); expect(readDeletionReceipt()).toBeNull();
  });
});

for (const failure of [401, 403, 503, "network", "deadline"] as const) {
  test(`required learner sources distinguish ${failure} from successful empty and recover with a new attempt`, async () => {
    const { createLearnerSource, learnerJson } = await import("../src/lib/learner-source");
    await withStorage(new Map(), async () => {
      const originalFetch = globalThis.fetch;
      try {
        for (const path of ["/api/mastery?courseId=one", "/api/progress?courseId=one", "/api/courses?scope=mine", "/api/evidence/one/shares", "/api/capstone-analysis?courseId=one"]) {
          setLearnerStorageIdentity("account-A");
          const session = learnerSessionSnapshot();
          const user = { uid: "account-A", getIdToken: async () => "A" };
          globalThis.fetch = async () => {
            if (failure === "network") throw new TypeError("offline");
            if (failure === "deadline") return new Promise<Response>(() => {});
            return Response.json({ error: "Unavailable" }, { status: failure });
          };
          const source = createLearnerSource(user, (signal) => learnerJson<unknown[]>(user, path, { signal }, 10), (items) => !items.length);
          await source.load();
          expect(source.getSnapshot().data).toBeUndefined();
          expect(source.getSnapshot().status).not.toBe("empty");
          if (failure === 401) expect(isCurrentLearnerSession(session)).toBe(false);
          else expect(source.getSnapshot().status).toBe("error");
          source.cancel();
          setLearnerStorageIdentity("account-A");
          globalThis.fetch = async () => Response.json(["restored record"]);
          const recovered = createLearnerSource(user, (signal) => learnerJson<unknown[]>(user, path, { signal }), (items) => !items.length);
          await recovered.load();
          expect(recovered.getSnapshot()).toMatchObject({ status: "loaded", data: ["restored record"] });
          recovered.cancel();
        }
      } finally { globalThis.fetch = originalFetch; }
    });
  });
}

test("a share mutation cannot be erased by the older source read it supersedes", async () => {
  const { createLearnerSource } = await import("../src/lib/learner-source");
  await withStorage(new Map(), async () => {
    let release!: (value: string[]) => void;
    const source = createLearnerSource({ uid: "account-A", getIdToken: async () => "A" }, () => new Promise<string[]>((resolve) => { release = resolve; }), (items) => !items.length);
    const loading = source.load();
    await Promise.resolve();
    source.replace(["newly-created-share"]);
    release([]);
    await loading;
    expect(source.getSnapshot()).toMatchObject({ status: "loaded", data: ["newly-created-share"] });
    source.cancel();
  });
});


test("an acknowledged deletion fences out an older cloud read and a fresh retry stays deleted", async () => {
  const { beginLearnerStateRead, queueLearnerStateChanges, syncLearnerState, pendingLearnerSync } = await import("../src/lib/learner-sync");
  const { learnerJson } = await import("../src/lib/learner-source");
  await withStorage(new Map(), async () => {
    const before = { ...EMPTY_LEARNER_STATE, notes: { "course:0": "deleted private text" } };
    const after = { ...EMPTY_LEARNER_STATE, updatedAt: "2026-09-07T03:00:00.000Z" };
    writeLearnerState(before, "account-A");
    const originalFetch = globalThis.fetch;
    let release!: (response: Response) => void;
    let started!: () => void;
    const requested = new Promise<void>((resolve) => { started = resolve; });
    globalThis.fetch = async (_input, init) => init?.method === "PUT"
      ? Response.json({ success: true })
      : (started(), new Promise<Response>((resolve) => { release = resolve; }));
    const user = { uid: "account-A", getIdToken: async () => "A" };
    try {
      const merge = beginLearnerStateRead("account-A");
      const read = learnerJson<typeof before>(user, "/api/learner-state");
      await requested;
      queueLearnerStateChanges("account-A", before, after); writeLearnerState(after, "account-A");
      await syncLearnerState(user);
      expect(pendingLearnerSync("account-A").deleted).toEqual({});
      release(Response.json(before));
      const cloud = await read;
      expect(() => merge(cloud)).toThrow("changed while loading");
      expect(readLearnerState("account-A").notes).toEqual({});
      globalThis.fetch = async () => Response.json(after);
      const retryMerge = beginLearnerStateRead("account-A");
      const recovered = retryMerge(await learnerJson<typeof after>(user, "/api/learner-state"));
      expect(recovered.notes).toEqual({});
      writeLearnerState(recovered, "account-A");
      expect(readLearnerState("account-A").notes).toEqual({});
    } finally { globalThis.fetch = originalFetch; }
  });
});
