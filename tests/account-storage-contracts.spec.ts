import { spawnSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { EMPTY_LEARNER_STATE, readLearnerState, writeLearnerState } from "../src/lib/learner-state";
import { getLocalProgress, saveLocalProgress } from "../src/lib/learning-progress";
import { getLocalMasteryJourney, saveLocalMasteryJourney, type LearningOutcomePlan } from "../src/lib/mastery";

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
    writeLearnerStorage("account-A", "experience-draft", "course:0-0", "A-private-experience");
    writeLearnerStorage("account-A", "transfer-draft", "course:0-0", "A-private-transfer");
    for (const other of [null, "account-B"]) {
      setLearnerStorageIdentity(other);
      expect(readLearnerState(other).notes).toEqual({});
      expect(getLocalMasteryJourney("course", other)).toEqual({ plan: null, evidence: [] });
      expect(getLocalProgress("course", other)).toBeNull();
      expect(readLearnerStorage(other, "experience-draft", "course:0-0")).toBeNull();
      expect(readLearnerStorage(other, "transfer-draft", "course:0-0")).toBeNull();
      expect(writeLearnerStorage("account-A", "transfer-draft", "course:0-0", "stale write")).toBe(false);
    }
    setLearnerStorageIdentity("account-A");
    expect(readLearnerState("account-A").notes).toEqual({ "course:0-0": "A-private-note" });
    expect(getLocalMasteryJourney("course", "account-A").plan?.desiredOutcome).toBe("A-private-goal");
    expect(getLocalMasteryJourney("course", "account-A").evidence[0].label).toBe("A-private-evidence");
    expect(getLocalProgress("course", "account-A")?.completedLessonIds).toEqual(["0-0"]);
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
