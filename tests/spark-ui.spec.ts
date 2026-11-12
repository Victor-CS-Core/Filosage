import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { mockOwnerLearnerAccount, restoreLocalLearner } from "./fixtures/local-learner";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal";

const course = {
  courseId: "spark-ui-course",
  id: "spark-ui-course",
  topic: "Neural networks",
  mission: "Explain and apply a weighted-input model.",
  isPublic: true,
  modules: [{ title: "Foundations", description: "Start with one neuron", lessons: [{ title: "A first neuron", concept: "Weighted inputs", estimatedMinutes: 8 }] }],
};

const lesson = {
  aiAssisted: true,
  content: "## Weighted inputs\n\nA weight scales its input before the bias is added.",
  learningObjective: "Explain how each weighted input contributes to a neuron's output.",
  quizzes: [],
};

const manifest = {
  schemaVersion: 1,
  registryVersion: "spark-registry-v1",
  id: "manifest-ui-fixture",
  courseId: course.id,
  lessonId: "0-0",
  lessonVersion: "lesson-ui-fixture",
  locale: "en",
  stage: "practice",
  objectiveIds: ["objective-neuron"],
  contentHash: "a".repeat(64),
  evidenceStatus: "course_supported",
  blocks: [
    { id: "explain-weight", type: "explanation", title: "Weights scale inputs", text: "Multiply each input by its weight, add the bias, then apply the activation.", style: "concise", sourceRefs: ["lesson-main"], evidenceStatus: "course_supported", objectiveIds: ["objective-neuron"] },
    { id: "neuron-model", type: "parameter_explorer", title: "Explore one neuron", prompt: "Change a value and observe the output.", template: "neuron-v1", config: { x1: 2, x2: 1, weight1: 0.8, weight2: 0.2, bias: -1, x1Label: "Input one", x2Label: "Input two", minimum: -5, maximum: 5, step: 0.1 }, sourceRefs: ["lesson-main"], evidenceStatus: "course_supported", objectiveIds: ["objective-neuron"] },
    { id: "weight-check", type: "single_choice", taskId: "weight-check", taskVersion: "task-ui-fixture", prompt: "What does a weight do before activation?", options: [{ id: "scale", text: "Scale the input" }, { id: "erase", text: "Erase the input" }], sourceRefs: ["lesson-main"], evidenceStatus: "course_supported", objectiveIds: ["objective-neuron"] },
  ],
  createdAt: "2026-10-09T00:00:00.000Z",
} as const;

test("Spark remains usable, accessible, and contained without live AI", async ({ page }, testInfo) => {
  test.skip(process.env.SPARK_UI_PUBLIC_ENABLED === "false", "Enabled Spark flows run in the enabled-public build.");
  let tutorTurnRequests = 0;
  await restoreLocalLearner(page);
  await page.route("**/api/courses/spark-ui-course", (route) => route.fulfill({ json: course }));
  await page.route("**/api/courses/spark-ui-course/lessons/0-0", (route) => route.fulfill({ json: lesson }));
  await page.route("**/api/spark/courses/spark-ui-course/state*", (route) => route.fulfill({ json: {
    featureEnabled: true,
    availability: "practice_only",
    course: { id: course.id, topic: course.topic },
    lesson: { id: "0-0", title: "A first neuron", version: manifest.lessonVersion, content: lesson.content },
    currentStage: "practice",
    manifest,
    preparation: "ready",
    evidence: { records: 0, demonstrated: 0 },
    review: { due: false, nextReviewAt: null },
    entitlement: { questionsRemaining: 5, resetAt: "2026-11-01T00:00:00.000Z" },
  } }));
  await page.route("**/api/spark/sessions", (route) => route.fulfill({ json: { session: { id: "session-ui", lessonVersion: manifest.lessonVersion, stage: "practice" }, manifest } }));
  await page.route("**/api/spark/sessions/session-ui?*", (route) => route.fulfill({ json: { session: { id: "session-ui" }, turns: [], nextCursor: null } }));
  await page.route("**/api/spark/sessions/*/turns", (route) => { tutorTurnRequests += 1; return route.fulfill({ status: 503, json: { error: "Live tutoring is paused." } }); });
  await page.route("**/api/spark/attempts", (route) => route.fulfill({ json: {
    attempt: { id: "attempt-ui" },
    grade: { state: "demonstrated", gradingMethod: "deterministic", verified: true, feedback: "The weight scales the input." },
    assessmentStatus: "not_required",
    assessment: null,
  } }));

  await page.goto(`/course/${encodeURIComponent(course.topic)}/lesson/0-0?id=${course.id}&spark=1`);
  await expect(page.getByRole("tab", { name: /Spark/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Learn by doing" })).toBeVisible();
  await expect(page.getByText("Live tutoring is paused", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ask Spark" })).toHaveCount(0);

  const output = page.locator(".spark-output strong");
  const before = await output.textContent();
  await page.locator(".spark-range input").first().fill("4");
  await expect(output).not.toHaveText(before ?? "");
  expect(tutorTurnRequests).toBe(0);

  await page.getByLabel("Scale the input").check();
  await page.getByRole("button", { name: "Commit answer" }).click();
  await expect(page.getByText("Demonstrated", { exact: true })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).include(".spark-workspace").analyze();
  expect(accessibility.violations).toEqual([]);
  const overflow = await page.locator(".spark-workspace").evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  await page.screenshot({ path: testInfo.outputPath("spark-workspace.png"), fullPage: true });
});

test("Spark denies private course and session reads across two authenticated accounts", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "spark-1024", "One server-backed identity acceptance run is sufficient.");
  const storeDirectory = process.env.FILOSAGE_SPARK_TEST_STORE_DIR;
  expect(storeDirectory).toBeTruthy();
  const storePath = resolve(storeDirectory!, "store.json");
  await mkdir(resolve(storeDirectory!), { recursive: true });
  const stored = JSON.parse(await readFile(storePath, "utf8").catch(() => "{}")) as Record<string, Record<string, unknown>>;
  const now = "2026-10-09T00:00:00.000Z";
  const authorUid = "local-free-learner-api";
  const otherUid = "local-free-learner";
  const account = (uid: string) => ({
    uid,
    plan: "free",
    accountStatus: "active",
    subscriptionStatus: "none",
    acceptedTermsVersion: TERMS_VERSION,
    acceptedPrivacyVersion: PRIVACY_VERSION,
    createdAt: now,
    updatedAt: now,
  });
  Object.assign(stored, {
    [`users/${authorUid}`]: account(authorUid),
    [`users/${otherUid}`]: account(otherUid),
    "courses/spark-private-acceptance": {
      id: "spark-private-acceptance",
      courseId: "spark-private-acceptance",
      authorId: authorUid,
      topic: "Private weighted inputs",
      isPublic: false,
      modules: [{ title: "Foundations", lessons: [{ title: "A first neuron", concept: "Weighted inputs", objectiveId: "objective-neuron" }] }],
    },
    "courses/spark-private-acceptance/lessons/0-0": {
      title: "A first neuron",
      content: "A weight scales its input before the bias is added.",
      objectiveIds: ["objective-neuron"],
      quizzes: [],
    },
    "sparkSessions/session-private-acceptance": {
      id: "session-private-acceptance",
      ownerUid: authorUid,
      courseId: "spark-private-acceptance",
      lessonId: "0-0",
      lessonVersion: "lesson-private-acceptance",
      locale: "en",
      stage: "practice",
      manifestId: "manifest-private-acceptance",
      contextSummary: "",
      summaryVersion: 1,
      createdAt: now,
      updatedAt: now,
    },
  });
  await writeFile(storePath, JSON.stringify(stored, null, 2));

  const authorHeaders = { Authorization: "Bearer playwright-free-learner-api" };
  const otherHeaders = { Authorization: "Bearer playwright-free-learner" };
  const stateUrl = "/api/spark/courses/spark-private-acceptance/state?lessonId=0-0&locale=en";
  const authorState = await request.get(stateUrl, { headers: authorHeaders });
  expect(authorState.ok(), await authorState.text()).toBe(true);
  const deniedState = await request.get(stateUrl, { headers: otherHeaders });
  expect(deniedState.status()).toBe(403);
  expect(await deniedState.json()).toMatchObject({ code: "SPARK_COURSE_FORBIDDEN" });

  const sessionUrl = "/api/spark/sessions/session-private-acceptance?limit=20";
  const authorSession = await request.get(sessionUrl, { headers: authorHeaders });
  expect(authorSession.ok(), await authorSession.text()).toBe(true);
  const deniedSession = await request.get(sessionUrl, { headers: otherHeaders });
  expect(deniedSession.status()).toBe(403);
  expect(await deniedSession.json()).toMatchObject({ code: "SPARK_SESSION_FORBIDDEN" });
});
const sparkStatePayload = {
  featureEnabled: true,
  availability: "practice_only",
  course: { id: course.id, topic: course.topic },
  lesson: { id: "0-0", title: "A first neuron", version: manifest.lessonVersion, content: lesson.content },
  currentStage: "practice",
  manifest,
  preparation: "ready",
  evidence: { records: 0, demonstrated: 0 },
  review: { due: false, nextReviewAt: null },
  entitlement: { questionsRemaining: 5, resetAt: "2026-11-01T00:00:00.000Z" },
} as const;

test("a Spark 401 with a valid central session keeps the learner signed in and offers retry", async ({ page }) => {
  test.skip(process.env.SPARK_UI_PUBLIC_ENABLED === "false", "Enabled Spark flows run in the enabled-public build.");
  await restoreLocalLearner(page);
  // Local auth uses a bearer-backed learner rather than a browser session cookie.
  await page.route("**/api/auth/session", route => route.fulfill({ json: { user: { uid: "local-owner" } } }));
  await page.route("**/api/courses/spark-ui-course", (route) => route.fulfill({ json: course }));
  await page.route("**/api/courses/spark-ui-course/lessons/0-0", (route) => route.fulfill({ json: lesson }));
  let stateCalls = 0;
  await page.route("**/api/spark/courses/spark-ui-course/state*", (route) => {
    stateCalls += 1;
    if (stateCalls === 1) return route.fulfill({ status: 401, json: { error: "Unauthorized" } });
    return route.fulfill({ json: sparkStatePayload });
  });
  await page.route("**/api/spark/sessions", (route) => route.fulfill({ json: { session: { id: "session-ui", lessonVersion: manifest.lessonVersion, stage: "practice" }, manifest } }));
  await page.route("**/api/spark/sessions/session-ui?*", (route) => route.fulfill({ json: { session: { id: "session-ui" }, turns: [], nextCursor: null } }));

  await page.goto(`/course/${encodeURIComponent(course.topic)}/lesson/0-0?id=${course.id}&spark=1`);
  // The feature failure surfaces the product copy inside the Spark pane only.
  await expect(page.getByText("Spark couldn’t connect. You can continue reading or retry.")).toBeVisible();
  // The session survives: no signed-out shell, same lesson location.
  await expect(page.getByRole("button", { name: "Sign in" })).toHaveCount(0);
  await expect(page).toHaveURL(/spark=1/);
  // The learner can keep reading the lesson.
  await page.locator("#lesson-learn-tab").click();
  await expect(page.getByRole("heading", { name: "Weighted inputs" })).toBeVisible();
  // Retry recovers Spark once the probe succeeds.
  await page.locator("#lesson-spark-tab").click();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Learn by doing" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toHaveCount(0);
});

test("a Spark 401 with an ended central session asks for sign-in without leaving the lesson", async ({ page }) => {
  test.skip(process.env.SPARK_UI_PUBLIC_ENABLED === "false", "Enabled Spark flows run in the enabled-public build.");
  await restoreLocalLearner(page);
  // Serve the real session until expiry is armed, then the same body with a
  // null user: the central endpoint definitively reporting no session.
  let expired = false;
  await page.route("**/api/auth/session", route => route.fulfill({ json: {
    user: expired ? null : { uid: "local-owner" },
    authentication: { primaryProvider: "filosage", externalIdAvailable: true, externalIdNewAccountsAvailable: true, legacyGoogleAvailable: false },
  } }));
  await page.route("**/api/courses/spark-ui-course", (route) => route.fulfill({ json: course }));
  await page.route("**/api/courses/spark-ui-course/lessons/0-0", (route) => route.fulfill({ json: lesson }));
  // Hold the Spark probe until the session is armed as expired, so the 401
  // and the session check happen in a deterministic order.
  let releaseState!: () => void;
  const stateHeld = new Promise<void>((resolve) => { releaseState = resolve; });
  await page.route("**/api/spark/courses/spark-ui-course/state*", async (route) => {
    await stateHeld;
    return route.fulfill({ status: 401, json: { error: "Unauthorized" } });
  });

  const lessonUrl = `/course/${encodeURIComponent(course.topic)}/lesson/0-0?id=${course.id}&spark=1`;
  await page.goto(lessonUrl);
  // Boot completed signed in (the lesson panes only render for the learner).
  await expect(page.locator("#lesson-spark-tab")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toHaveCount(0);
  expired = true;
  releaseState();
  // Only now — confirmed session invalidation — is the learner asked to sign
  // in, and the lesson location is preserved.
  // This local server has external sign-in disabled. Verify the signed-out
  // lesson gate rather than a desktop-only marketing navigation button.
  await expect(page.getByRole("heading", { name: "Open the lesson when you’re signed in" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Open My Courses/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign-in unavailable" })).toBeVisible();
  await expect(page).toHaveURL(/spark=1/);
});


async function mockSparkEntry(page: import("@playwright/test").Page, availability: "live" | "practice_only" = "live") {
  await restoreLocalLearner(page);
  await mockOwnerLearnerAccount(page);
  await page.route("**/api/courses/spark-ui-course", route => route.fulfill({ json: course }));
  await page.route("**/api/courses/spark-ui-course/lessons/0-0", route => route.fulfill({ json: lesson }));
  let stateRequests = 0;
  await page.route("**/api/spark/courses/spark-ui-course/state*", route => {
    stateRequests++;
    return route.fulfill({ json: { featureEnabled: true, availability, course: { id: course.id, topic: course.topic }, lesson: { id: "0-0", title: "A first neuron", version: manifest.lessonVersion, content: lesson.content }, currentStage: "practice", manifest, preparation: "ready", evidence: { records: 0, demonstrated: 0 }, review: { due: false, nextReviewAt: null }, entitlement: { questionsRemaining: 5, resetAt: null } } });
  });
  await page.route("**/api/spark/sessions", route => route.fulfill({ json: { session: { id: "session-ui", lessonVersion: manifest.lessonVersion, stage: "practice" }, manifest } }));
  await page.route("**/api/spark/sessions/session-ui?*", route => route.fulfill({ json: { session: { id: "session-ui" }, turns: [], nextCursor: null } }));
  return () => stateRequests;
}

const lessonUrl = `/course/${encodeURIComponent(course.topic)}/lesson/0-0?id=${course.id}`;

test("public flag off hides Spark without requesting lesson state", async ({ page }) => {
  test.skip(process.env.SPARK_UI_PUBLIC_ENABLED !== "false", "Requires the disabled-public browser build.");
  const stateRequests = await mockSparkEntry(page);
  await page.goto(`${lessonUrl}&spark=1`);
  await expect(page.getByRole("tab", { name: /Learn/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask the tutor", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Spark/ })).toHaveCount(0);
  expect(stateRequests()).toBe(0);
});

test("live Spark replaces Tutor only after its private session is ready", async ({ page }) => {
  test.skip(process.env.SPARK_UI_PUBLIC_ENABLED === "false", "Enabled Spark flows run in the enabled-public build.");
  await mockSparkEntry(page);
  await page.goto(lessonUrl);
  await expect(page.getByRole("button", { name: "Ask the tutor", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /Spark/ }).click();
  await expect(page.locator(".spark-composer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Support Center" }).locator(".lucide-circle-question-mark")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Ask the tutor", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask Spark", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /Learn/ }).click();
  await expect(page.getByRole("button", { name: "Ask Spark", exact: true })).toBeVisible();
});

test("practice-only Spark preserves the original Tutor fallback", async ({ page }) => {
  test.skip(process.env.SPARK_UI_PUBLIC_ENABLED === "false", "Enabled Spark flows run in the enabled-public build.");
  await mockSparkEntry(page, "practice_only");
  await page.goto(`${lessonUrl}&spark=1`);
  await expect(page.getByRole("heading", { name: "Learn by doing" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask the tutor", exact: true })).toBeVisible();
});

test("failed Spark startup retains the original Tutor fallback", async ({ page }) => {
  test.skip(process.env.SPARK_UI_PUBLIC_ENABLED === "false", "Enabled Spark flows run in the enabled-public build.");
  await mockSparkEntry(page);
  await page.route("**/api/spark/sessions", route => route.fulfill({ status: 503, json: { error: "Startup unavailable" } }));
  await page.goto(`${lessonUrl}&spark=1`);
  await expect(page.getByText("Startup unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask the tutor", exact: true })).toBeVisible();
});

for (const code of ["SPARK_INPUT_COUNT_UNAVAILABLE", "SPARK_REQUEST_NOT_STARTED", "SPARK_PROVIDER_UNCERTAIN"]) {
  const retryWithNewRequest = code !== "SPARK_PROVIDER_UNCERTAIN";
  test(`Spark ${code} ${retryWithNewRequest ? "releases an undispatched" : "retains an unknown"} turn identity only on a manual retry`, async ({ page }) => {
  test.skip(process.env.SPARK_UI_PUBLIC_ENABLED === "false", "Enabled Spark flows run in the enabled-public build.");
    await mockSparkEntry(page);
    const identities: string[] = [];
    await page.route("**/api/spark/sessions/session-ui/turns", route => {
      identities.push((route.request().postDataJSON() as { requestId: string }).requestId);
      return route.fulfill({ status: 503, json: { error: "Turn did not complete", code, ...(retryWithNewRequest ? { retryWithNewRequest: true } : {}) } });
    });
    await page.goto(`${lessonUrl}&spark=1`);
    await page.getByLabel("Question for Spark").fill("Explain the role of a weight.");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.getByText("Turn did not complete", { exact: true })).toBeVisible();
    expect(identities).toHaveLength(1);
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect.poll(() => identities.length).toBe(2);
    if (retryWithNewRequest) expect(identities[1]).not.toBe(identities[0]);
    else expect(identities[1]).toBe(identities[0]);
  });
}

test("owner AI operations exposes Spark controls without opening the command center", async ({ page }) => {
  await restoreLocalLearner(page);
  await mockOwnerLearnerAccount(page);
  let budgetRequests = 0;
  await page.route("**/api/admin/spark/budget", route => {
    budgetRequests++;
    return route.fulfill({ json: {
      month: { month_key: "2026-10", configuration_version: 1, ai_cap_microusd: 1000000, committed_microusd: 0, reserved_microusd: 0, unknown_microusd: 0, mode: "practice_only", live_ai_enabled: 0, preparation_enabled: 0, concurrency_limit: 1 },
      categories: ["tutoring", "preparation", "assessment", "summary", "embedding"].map(category => ({ category, cap_microusd: 100000, committed_microusd: 0, reserved_microusd: 0, unknown_microusd: 0 })),
      usage: [], runtime: { sparkEnabled: false, liveAiEnabled: false, prepareEnabled: false, semanticRetrievalEnabled: false, model: "test-model", provider: "openai", priceVersion: "test", limits: { maximumInputTokens: 4000, maximumOutputTokens: 900, globalConcurrency: 1, turnsPerMinute: 1 } },
      preparation: { total: 0, ready: 0, pending: 0, failed: 0, truncated: false, recent: [] },
    } });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "AI operations", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Budget and runtime authority" })).toBeVisible();
  const refresh = page.getByRole("button", { name: "Refresh Spark operations" });
  await expect(refresh).toBeVisible();
  expect((await refresh.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await page.getByRole("button", { name: "Save audited control" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole("combobox", { name: "Mode", exact: true })).toHaveCSS("font-size", "16px");
  expect(budgetRequests).toBe(1);
  await expect(page).toHaveURL(/\/admin$/);
});

test("unknown Spark turn identity survives a lesson reload without retaining the question", async ({ page }) => {
  test.skip(process.env.SPARK_UI_PUBLIC_ENABLED === "false", "Enabled Spark flows run in the enabled-public build.");
  await mockSparkEntry(page);
  const identities: string[] = [];
  const question = "PRIVATE question text that must not persist";
  await page.route("**/api/spark/sessions/session-ui/turns", route => {
    identities.push((route.request().postDataJSON() as { requestId: string }).requestId);
    return route.fulfill({ status: 503, json: { error: "Outcome unknown", code: "SPARK_PROVIDER_UNCERTAIN" } });
  });
  await page.goto(`${lessonUrl}&spark=1`);
  await page.getByLabel("Question for Spark").fill(question);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByText("Outcome unknown", { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.includes("spark-turn")));
  expect(saved.length).toBeGreaterThan(0);
  expect(JSON.stringify(saved)).not.toContain(question);
  await page.reload();
  await expect(page.getByLabel("Question for Spark")).toBeVisible();
  expect(identities).toHaveLength(1);
  await page.getByLabel("Question for Spark").fill(question);
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect.poll(() => identities.length).toBe(2);
  expect(identities[1]).toBe(identities[0]);
});
