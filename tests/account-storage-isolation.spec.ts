import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { EMPTY_LEARNER_STATE } from "../src/lib/learner-state";
import type { Course, LessonData } from "../src/lib/course-types";
import type { LearningOutcomePlan } from "../src/lib/mastery";
import { exactLearnerAccount } from "./fixtures/local-learner";

const courseId = "account-isolation-course";
const topic = "Account isolation";
const lessonPath = `/course/${encodeURIComponent(topic)}/lesson/0-0?id=${courseId}`;
const coursePath = `/course/${encodeURIComponent(topic)}?id=${courseId}`;
const noteKey = `${courseId}:0-0`;
const secret = "A-private-learning-text";
const course: Course = {
  id: courseId, courseId, topic, isPublic: true,
  outcome: "Explain evidence with care.",
  modules: [{ title: "Evidence", lessons: [{ title: "Inspect evidence", concept: "Separate observation from inference." }] }],
};
const lesson: LessonData = {
  content: "## Inspect evidence\n\nObserve the evidence before drawing a conclusion.", quizzes: [],
  experience: { type: "synthesis", challenge: "Explain an observation.", connections: [], capstoneContribution: "A clear explanation", reflectionPrompt: "Explain your reasoning." },
  transferTask: { prompt: "Apply this to a fresh example.", successCriteria: ["Explain the observation"], modelResponse: "State what happened before explaining why." },
};
const plan: LearningOutcomePlan = {
  courseId, courseTopic: topic, desiredOutcome: `${secret}-goal`, applicationContext: `${secret}-context`,
  targetArtifact: `${secret}-artifact`, weeklyMinutes: 60, diagnostics: [], recommendedLessonId: "0-0",
  explanation: "Start with evidence.", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
};

async function fixture(context: BrowserContext) {
  let uid: string | null = "account-A";
  let offline = false;
  let delayMastery = false;
  let releaseMastery: (() => void) | undefined;
  const writes: Array<{ uid: string | null; path: string; body: string }> = [];
  const authentication = { primaryProvider: "filosage", externalIdAvailable: true, externalIdNewAccountsAvailable: true, legacyGoogleAvailable: true };
  await context.route("**/api/auth/session", (route) => route.fulfill({ json: {
    recentAuthentication: true, authentication,
    user: uid ? { uid, displayName: uid, email: `${uid.toLowerCase()}@example.com`, photoURL: null, authenticationProvider: "filosage" } : null,
  } }));
  await context.route("**/.auth/logout*", async (route) => {
    uid = null;
    await route.fulfill({ status: 302, headers: { location: "/" } });
  });
  await context.route("**/api/account", (route) => route.fulfill({ json: exactLearnerAccount({ displayName: uid ?? "Guest" }) }));
  await context.route("**/api/courses?*", (route) => route.fulfill({ json: { courses: [course] } }));
  await context.route(`**/api/courses/${courseId}`, (route) => route.fulfill({ json: course }));
  await context.route(`**/api/courses/${courseId}/lessons/*`, (route) => route.fulfill({ json: lesson }));
  await context.route(/\/api\/(learner-state|mastery|progress)(\?|$)/, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const requestUid = uid;
    if (request.method() !== "GET") {
      const expectedUid = request.headers()["x-filosage-expected-uid"];
      if (!requestUid || (expectedUid && expectedUid !== requestUid)) return route.fulfill({ status: 401, json: { error: "Sign in with a verified account to continue." } });
      writes.push({ uid: requestUid, path, body: request.postData() ?? "" });
      if (offline) return route.abort("internetdisconnected");
      return route.fulfill({ json: path === "/api/mastery" ? { plan: request.postDataJSON(), saved: true } : { saved: true } });
    }
    if (offline) return route.abort("internetdisconnected");
    if (path === "/api/mastery" && delayMastery && requestUid === "account-A") {
      await new Promise<void>((resolve) => { releaseMastery = resolve; });
    }
    if (path === "/api/mastery") return route.fulfill({ json: requestUid === "account-A"
      ? { plan, evidence: [{ id: "evidence-A", courseId, objectiveId: "objective-m0-l0", type: "transfer", result: "attempted", label: `${secret}-evidence`, observedAt: plan.createdAt }] }
      : { plan: null, evidence: [] } });
    if (path === "/api/learner-state") return route.fulfill({ json: { ...EMPTY_LEARNER_STATE,
      notes: requestUid === "account-A" ? { [noteKey]: `${secret}-note` } : {},
      noteUpdatedAt: requestUid === "account-A" ? { [noteKey]: plan.createdAt } : {},
    } });
    return route.fulfill({ json: { progress: new URL(request.url()).searchParams.has("courseId") ? null : [] } });
  });
  return {
    writes, setUid: (value: string | null) => { uid = value; }, setOffline: (value: boolean) => { offline = value; },
    delay: () => { delayMastery = true; }, release: () => { delayMastery = false; releaseMastery?.(); },
    pending: () => Boolean(releaseMastery),
  };
}

async function openNotes(page: Page) {
  await page.getByRole("button", { name: "Study tools", exact: true }).click();
  await expect(page.getByLabel("Your notes", { exact: true })).toBeVisible();
}
async function signOut(page: Page) {
  await page.locator(".learning-command-trigger:visible").click();
  await page.getByRole("combobox", { name: "Search Filosage" }).fill("sign out");
  await page.getByRole("option", { name: /Sign out End this session/ }).click();
  await expect(page).toHaveURL(/\/$/);
}
async function fillDrafts(page: Page) {
  await page.getByRole("tab", { name: /Activities/ }).click();
  await page.getByLabel("Your reflection").fill(`${secret}-experience`);
  await page.getByRole("tab", { name: /Transfer/ }).click();
  await page.getByLabel("Your response", { exact: true }).fill(`${secret}-transfer`);
}
async function expectNoPrivateWork(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "Inspect evidence" })).toBeVisible();
  await openNotes(page);
  await expect(page.getByLabel("Your notes", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Close study tools" }).click();
  await page.getByRole("tab", { name: /Activities/ }).click();
  await expect(page.getByLabel("Your reflection")).toHaveValue("");
  await page.getByRole("tab", { name: /Transfer/ }).click();
  await expect(page.getByLabel("Your response", { exact: true })).toHaveValue("");
  await expect(page.locator(".completion-banner.is-complete")).toHaveCount(0);
}

test("A signs out; guest and B see none of A's work and B uploads no A payload; A's offline drafts survive reload", { tag: "@smoke" }, async ({ page, context }) => {
  const state = await fixture(context);
  await page.goto(lessonPath);
  await fillDrafts(page);
  await openNotes(page);
  await expect(page.getByLabel("Your notes", { exact: true })).toHaveValue(`${secret}-note`);
  state.setOffline(true);
  await page.getByLabel("Your notes", { exact: true }).fill(`${secret}-offline-note`);
  await expect(page.getByRole("alert").filter({ hasText: /saved on this device/ })).toBeVisible();
  await page.getByRole("button", { name: "Close study tools" }).click();
  state.setOffline(false);
  await signOut(page);
  await page.goto(lessonPath);
  await expect(page.getByRole("heading", { level: 1, name: "Inspect evidence" })).toHaveCount(0);
  state.setUid("account-B");
  await page.reload();
  await expectNoPrivateWork(page);
  await page.goto(coursePath);
  await expect(page.getByText(`${secret}-goal`, { exact: true })).toHaveCount(0);
  expect(state.writes.filter((write) => write.uid === "account-B" && write.body.includes(secret))).toEqual([]);
  state.setUid("account-A");
  await page.goto(lessonPath);
  await openNotes(page);
  await expect(page.getByLabel("Your notes", { exact: true })).toHaveValue(`${secret}-offline-note`);
  await page.getByRole("button", { name: "Close study tools" }).click();
  await page.getByRole("tab", { name: /Activities/ }).click();
  await expect(page.getByLabel("Your reflection")).toHaveValue(`${secret}-experience`);
  await page.getByRole("tab", { name: /Transfer/ }).click();
  await expect(page.getByLabel("Your response", { exact: true })).toHaveValue(`${secret}-transfer`);
});

test("a cross-tab signout invalidates mounted private work and ignores a delayed A mastery response", { tag: "@smoke" }, async ({ page, context }) => {
  const state = await fixture(context);
  state.delay();
  await page.goto(lessonPath);
  await expect.poll(state.pending).toBe(true);
  const otherTab = await context.newPage();
  await otherTab.goto("/profile");
  await expect(otherTab.locator(".profile-identity").getByRole("heading", { name: "account-A", exact: true })).toBeVisible();
  await page.bringToFront();
  await fillDrafts(page);
  await expect(page.getByLabel("Your response", { exact: true })).toHaveValue(`${secret}-transfer`);
  await signOut(otherTab);
  await expect(page.getByRole("heading", { level: 1, name: "Inspect evidence" })).toHaveCount(0);
  state.setUid("account-B");
  await otherTab.goto("/profile");
  await expect(otherTab.locator(".profile-identity").getByRole("heading", { name: "account-B", exact: true })).toBeVisible();
  state.release();
  await page.bringToFront();
  await expectNoPrivateWork(page);
  expect(state.writes.filter((write) => write.uid === "account-B" && write.body.includes(secret))).toEqual([]);
});

test("an expired managed session prevents autosave of the old account's draft", async ({ page, context }) => {
  const state = await fixture(context);
  await page.goto(lessonPath);
  await openNotes(page);
  await expect(page.getByLabel("Your notes", { exact: true })).toHaveValue(`${secret}-note`);
  state.setUid(null);
  await page.getByLabel("Your notes", { exact: true }).fill(`${secret}-expired-draft`);
  await expect(page.getByLabel("Your notes", { exact: true })).toHaveCount(0);
  expect(state.writes.filter((write) => write.uid === null)).toEqual([]);
});


test("completion and evidence stay with A when B has an empty cloud and goes offline", async ({ page, context }) => {
  const state = await fixture(context);
  await page.goto(lessonPath);
  await fillDrafts(page);
  await page.getByRole("tab", { name: /Active lesson/ }).click();
  await page.getByRole("button", { name: "Save synthesis evidence" }).click();
  await page.getByRole("tab", { name: /Transfer/ }).click();
  await page.getByRole("button", { name: "Compare with a model response" }).click();
  await page.getByRole("button", { name: "Mark learned" }).click();
  await expect(page.locator(".completion-banner.is-complete").getByText("Lesson complete", { exact: true })).toBeVisible();
  await expect.poll(() => state.writes.some((write) => write.uid === "account-A" && write.path === "/api/progress" && write.body.includes(secret))).toBe(true);
  await signOut(page);
  state.setUid("account-B");
  state.setOffline(true);
  await page.goto(lessonPath);
  await expectNoPrivateWork(page);
  state.setOffline(false);
  await page.goto(coursePath);
  await expect(page.getByText(`${secret}-goal`, { exact: true })).toHaveCount(0);
  expect(state.writes.filter((write) => write.uid === "account-B" && write.body.includes(secret))).toEqual([]);
  state.setUid("account-A");
  state.setOffline(true);
  await page.goto(lessonPath);
  await expect(page.locator(".completion-banner.is-complete").getByText("Lesson complete", { exact: true })).toBeVisible();
});

test("unowned device records are never assigned to the next signed-in learner", async ({ page, context }) => {
  const state = await fixture(context);
  state.setUid("account-B");
  await page.addInitScript(({ noteKey, courseId, secret, plan }) => {
    localStorage.setItem("filosage-learner-state-v1", JSON.stringify({ notes: { [noteKey]: `${secret}-note` } }));
    localStorage.setItem(`filosage-transfer-draft:${noteKey}`, JSON.stringify({ response: `${secret}-transfer`, revealed: true }));
    localStorage.setItem(`filosage-experience-draft:${noteKey}`, JSON.stringify({ type: "synthesis", response: `${secret}-experience`, completed: true }));
    localStorage.setItem(`teach-progress:${courseId}`, '["0-0"]');
    localStorage.setItem(`filosage-mastery-v1:${courseId}`, JSON.stringify({ plan, evidence: [] }));
  }, { noteKey, courseId, secret, plan });
  await page.goto(lessonPath);
  await expectNoPrivateWork(page);
  await page.goto(coursePath);
  await expect(page.getByText(`${secret}-goal`, { exact: true })).toHaveCount(0);
  expect(state.writes.filter((write) => write.uid === "account-B" && write.body.includes(secret))).toEqual([]);
});
