import { expect, test, type Page } from "@playwright/test";
import { EMPTY_LEARNER_STATE } from "../src/lib/learner-state";
import { exactLearnerAccount } from "./fixtures/local-learner";

const course = { id: "recovery-course", courseId: "recovery-course", topic: "Recovery evidence", isPublic: true,
  outcome: "Explain an observation.", modules: [{ title: "Evidence", lessons: [{ title: "Inspect evidence", concept: "Observation" }] }] };
async function signedIn(page: Page) {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: {
    recentAuthentication: true,
    authentication: { primaryProvider: "filosage", externalIdAvailable: true, externalIdNewAccountsAvailable: true, legacyGoogleAvailable: true },
    user: { uid: "recovery-A", displayName: "Recovery Learner", email: "recovery@example.com", photoURL: null, authenticationProvider: "filosage" },
  } }));
  await page.route("**/api/account", (route) => route.fulfill({ json: exactLearnerAccount({ plan: "pro" }) }));
  await page.route("**/api/learner-state", (route) => route.fulfill({ json: route.request().method() === "GET" ? EMPTY_LEARNER_STATE : { success: true } }));
  await page.route("**/api/courses?*", (route) => route.fulfill({ json: { courses: [] } }));
  await page.route("**/api/courses/recovery-course", (route) => route.fulfill({ json: course }));
  // Same Spark-state probe as the storage-isolation fixture: mock the
  // disabled-feature 200 so the request cannot reach the dev server and
  // invalidate the fixture session with a 401.
  await page.route("**/api/spark/courses/*/state*", (route) => route.fulfill({ json: {
    featureEnabled: false,
    availability: "saved_only",
    course: { id: course.id, topic: course.topic },
    lesson: { id: "0-0", title: "Inspect evidence", version: "test", content: "" },
    currentStage: "define",
    manifest: null,
    preparation: "not_prepared",
    evidence: { records: 0, demonstrated: 0 },
    review: { due: false, nextReviewAt: null },
    entitlement: { questionsRemaining: null, resetAt: null },
  } }));
}

test("an owner's saved course request resumes as ordinary generation with its original identity", { tag: "@smoke" }, async ({ page }) => {
  await signedIn(page);
  await page.route("**/api/account", (route) => route.fulfill({ json: exactLearnerAccount({ isOwner: true }) }));
  await page.route("**/api/generation-operations", (route) => route.fulfill({ json: { operations: [] } }));
  const identity = { key: "owner-saved-request-123", signature: JSON.stringify({ topic: "Recovery evidence" }) };
  await page.addInitScript((saved) => {
    localStorage.setItem("filosage:learner:v1:recovery-A:generation-operation:all", JSON.stringify(saved));
  }, identity);
  const requests: Array<{ evaluation: string | undefined; key: string | undefined; body: string | null }> = [];
  await page.route("**/api/generate-course", (route) => {
    const headers = route.request().headers();
    requests.push({ evaluation: headers["x-filosage-model-evaluation"], key: headers["idempotency-key"], body: route.request().postData() });
    return route.fulfill(headers["x-filosage-model-evaluation"]
      ? { status: 409, json: { error: "EVALUATION_APPROVAL_REQUIRED" } }
      : { json: { courseId: course.id } });
  });
  await page.goto("/create");
  await page.getByRole("button", { name: "Resume course request", exact: true }).click();
  await expect(page).toHaveURL(/\/course\//);
  expect(requests).toEqual([{ evaluation: undefined, key: identity.key, body: identity.signature }]);
});

test("required evidence sources recover independently and optional recommendations do not block the report", { tag: "@smoke" }, async ({ page }) => {
  await signedIn(page);
  const unavailable = new Set(["progress", "mastery", "shares", "analysis"]);
  for (const [name, path, data] of [
    ["progress", "**/api/progress?courseId=recovery-course", { progress: null }],
    ["mastery", "**/api/mastery?courseId=recovery-course", { plan: null, evidence: [] }],
    ["shares", "**/api/evidence/recovery-course/shares", { shares: [] }],
    ["analysis", "**/api/capstone-analysis?courseId=recovery-course", { analysis: null }],
  ] as const) await page.route(path, (route) => route.fulfill(unavailable.has(name)
    ? { status: 503, json: { error: "Temporarily unavailable" } } : { json: data }));
  let releaseRecommendations!: () => void;
  const recommendationHeld = new Promise<void>((resolve) => { releaseRecommendations = resolve; });
  await page.route("**/api/courses?scope=public", async (route) => { await recommendationHeld; await route.fulfill({ json: { courses: [] } }); });
  try {
    await page.goto("/evidence/recovery-course");
    await expect(page.getByText("Progress unavailable", { exact: true })).toBeVisible();
    await expect(page.getByText("Learning evidence unavailable", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Learning evidence summary" })).toHaveCount(0);
    unavailable.delete("progress"); await page.getByRole("button", { name: "Retry progress", exact: true }).click();
    unavailable.delete("mastery"); await page.getByRole("button", { name: "Retry learning evidence", exact: true }).click();
    await expect(page.getByRole("region", { name: "Learning evidence summary" })).toBeVisible();
    await expect(page.getByText("Share links unavailable", { exact: true })).toBeVisible();
    await expect(page.getByText("Final-project analysis unavailable", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Add portable export with Pro" })).toHaveCount(0);
    unavailable.delete("shares"); await page.getByRole("button", { name: "Retry share links", exact: true }).click();
    unavailable.delete("analysis"); await page.getByRole("button", { name: "Retry final-project analysis", exact: true }).click();
    await expect(page.getByText("Share links unavailable", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Final-project analysis unavailable", { exact: true })).toHaveCount(0);
    await expect(page.getByText("No observed evidence yet.", { exact: true })).toBeVisible();
  } finally { releaseRecommendations(); }
});

test("the library retains the last known private courses and labels a failed refresh before retry", { tag: "@smoke" }, async ({ page }) => {
  await signedIn(page);
  let failing = true;
  await page.route("**/api/courses?scope=mine", (route) => route.fulfill(failing
    ? { status: 503, json: { error: "Temporarily unavailable" } }
    : { json: { courses: [{ ...course, isPublic: false, topic: "My private recovery draft" }] } }));
  await page.goto("/library?q=recovery");
  await expect(page.getByText("Your courses unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No matching courses", exact: true })).toHaveCount(0);
  failing = false;
  await page.getByRole("button", { name: "Retry your courses", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My private recovery draft", exact: true })).toBeVisible();
  failing = true;
  await page.evaluate(() => window.dispatchEvent(new Event("filosage:courses-changed")));
  await expect(page.getByText("Your courses may be out of date", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "My private recovery draft", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Your courses may be out of date", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "My private recovery draft", exact: true })).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: "Retry your courses", exact: true }).click();
  await expect(page.getByText("Your courses may be out of date", { exact: true })).toHaveCount(0);
});

test("a note draft survives a failed save and explicit retry syncs it without replacing its text", { tag: "@smoke" }, async ({ page }) => {
  await signedIn(page);
  let failing = true;
  let cloud = { ...EMPTY_LEARNER_STATE, notes: {} as Record<string, string> };
  const savedChanges: string[] = [];
  await page.route("**/api/learner-state", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: cloud });
    if (failing) return route.fulfill({ status: 503, json: { error: "Unavailable" } });
    const body = route.request().postDataJSON();
    cloud = { ...cloud, ...body.preferences };
    for (const note of body.noteChanges) { savedChanges.push(note.content); cloud = { ...cloud, notes: { ...cloud.notes, [note.key]: note.content }, noteUpdatedAt: { ...cloud.noteUpdatedAt, [note.key]: note.updatedAt } }; }
    return route.fulfill({ json: { success: true } });
  });
  await page.route("**/api/mastery?*", (route) => route.fulfill({ json: { plan: null, evidence: [] } }));
  await page.route("**/api/progress?*", (route) => route.fulfill({ json: { progress: null } }));
  await page.route("**/api/courses/recovery-course/lessons/*", (route) => route.fulfill({ json: {
    content: "## Observe\n\nRecord what happened before explaining why.", quizzes: [],
    experience: { type: "synthesis", challenge: "Explain an observation.", connections: [], capstoneContribution: "An explanation", reflectionPrompt: "Explain your reasoning." },
  } }));
  await page.goto("/course/Recovery%20evidence/lesson/0-0?id=recovery-course");
  await page.getByRole("button", { name: "Study tools", exact: true }).click();
  const notes = page.getByLabel("Your notes", { exact: true });
  await notes.fill("My preserved private draft");
  await expect(page.getByRole("alert").filter({ hasText: "saved on this device" })).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: "Close study tools" }).click();
  await page.getByRole("button", { name: "Retry learning notes", exact: true }).click();
  await expect.poll(() => savedChanges).toEqual(["My preserved private draft"]);
  await page.getByRole("button", { name: "Study tools", exact: true }).click();
  await expect(notes).toHaveValue("My preserved private draft");
  await page.reload();
  await page.getByRole("button", { name: "Study tools", exact: true }).click();
  await expect(notes).toHaveValue("My preserved private draft");
});

test("active course creation shows progress while preserving its saved request", { tag: "@smoke" }, async ({ page }) => {
  await signedIn(page);
  await page.route("**/api/generation-operations", (route) => route.fulfill({ json: { operations: [] } }));
  const identity = { key: "progress-saved-request-123", signature: JSON.stringify({ topic: "Recovery evidence" }) };
  await page.addInitScript((saved) => localStorage.setItem("filosage:learner:v1:recovery-A:generation-operation:all", JSON.stringify(saved)), identity);
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/generate-course", async (route) => {
    await hold;
    await route.fulfill({ json: { courseId: course.id } });
  });
  try {
    await page.goto("/create");
    await page.getByRole("button", { name: "Resume course request", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Creating your course." })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Course generation in progress" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Continue your saved course request." })).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("filosage:learner:v1:recovery-A:generation-operation:all")!).key)).toBe(identity.key);
    release();
    await expect(page).toHaveURL(/\/course\//);
  } finally { release(); }
});

test("uncertain requests check status automatically and show the reconciled refund without redispatch", { tag: "@smoke" }, async ({ page }) => {
  await signedIn(page);
  const operationId = "uncertain-operation";
  await page.route("**/api/generation-operations", (route) => route.fulfill({ json: { operations: [{ operationId, status: "running", stage: "Course generation", retryAt: new Date(Date.now() - 1000).toISOString() }] } }));
  let checks = 0;
  let posts = 0;
  await page.route(`**/api/generation-operations/${operationId}`, (route) => {
    if (route.request().method() === "POST") posts += 1;
    checks += 1;
    return route.fulfill({ json: { operationId, status: "failed", stage: "Course creation ended", recovery: "Your course credit has been restored." } });
  });
  await page.goto("/create");
  await expect(page.getByRole("heading", { name: "This course request has ended." })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Your course credit has been restored.", { exact: true })).toBeVisible();
  expect(checks).toBeGreaterThan(0);
  expect(posts).toBe(0);
});

test("status checks follow the listed running operation instead of a stale saved identity", { tag: "@smoke" }, async ({ page }) => {
  await signedIn(page);
  await page.addInitScript(() => localStorage.setItem("filosage:learner:v1:recovery-A:generation-operation:all", JSON.stringify({ key: "stale-key-123", signature: "{}", operationId: "old-operation" })));
  await page.route("**/api/generation-operations", (route) => route.fulfill({ json: { operations: [{ operationId: "current-operation", status: "running", stage: "Planning lessons" }] } }));
  const requested: string[] = [];
  await page.route("**/api/generation-operations/*", (route) => {
    requested.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    return route.fulfill({ json: { operationId: "current-operation", status: "completed", resultId: course.id, topic: course.topic } });
  });
  await page.goto("/create");
  await expect(page).toHaveURL(/\/course\/Recovery%20evidence\?id=recovery-course/, { timeout: 15000 });
  expect(requested).toEqual(["GET /api/generation-operations/current-operation"]);
});
