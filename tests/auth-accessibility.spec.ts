import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { EMPTY_LEARNER_STATE } from "../src/lib/learner-state";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal";
import { exactLearnerAccount } from "./fixtures/local-learner";
import {
  pressNativeSequentialFocus,
  resolveNativeSequentialFocusGesture,
  type NativeSequentialFocusGesture,
} from "./fixtures/native-sequential-focus";

const signedOutManagedSession = {
  recentAuthentication: false,
  authentication: {
    primaryProvider: "filosage",
    externalIdAvailable: true,
    externalIdNewAccountsAvailable: true,
    legacyGoogleAvailable: true,
  },
  user: null,
} as const;

test("@cross-browser follows system appearance without saving an explicit choice", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/standard");
  await expect(page.locator(".marketing-nav-shell .filosage-mark img")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => localStorage.getItem("filosage-theme"))).toBeNull();

  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute("content", "#071127");
  await page.reload();
  await expect(page.locator(".marketing-nav-shell .filosage-mark img")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("filosage-theme"))).toBeNull();
});

test("@cross-browser preserves a chosen appearance across the managed sign-in return", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: {
    ...signedOutManagedSession,
    authentication: { ...signedOutManagedSession.authentication, externalIdNewAccountsAvailable: false, legacyGoogleAvailable: false },
  } }));
  await page.route("**/.auth/login/filosage?**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html",
    body: '<!doctype html><title>Managed sign-in boundary</title><a href="/standard">Return to Filosage</a>',
  }));
  await page.goto("/standard");
  await expect(page.locator(".marketing-nav-shell .filosage-mark img")).toBeVisible();
  await page.locator(".marketing-nav-shell").getByRole("button", { name: "Use dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const menu = page.getByRole("button", { name: "Open navigation menu" });
  if (await menu.isVisible()) await menu.click();
  await page.locator(".marketing-nav-shell").getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sign in with email code" }).click();
  await page.waitForURL(/\/\.auth\/login\/filosage\?post_login_redirect_uri=%2Fstandard$/);
  await page.getByRole("link", { name: "Return to Filosage" }).click();
  await expect(page.locator(".marketing-nav-shell .filosage-mark img")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("filosage-theme"))).toBe("dark");
});

test("@cross-browser resumes system appearance when another tab removes the choice", async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/standard");
  await expect(page.locator(".marketing-nav-shell .filosage-mark img")).toBeVisible();
  await page.locator(".marketing-nav-shell").getByRole("button", { name: "Use light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  const otherTab = await context.newPage();
  await otherTab.goto("/standard");
  await expect(otherTab.locator(".marketing-nav-shell .filosage-mark img")).toBeVisible();
  await otherTab.evaluate(() => localStorage.removeItem("filosage-theme"));
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => localStorage.getItem("filosage-theme"))).toBeNull();
});

const featuredCourse = {
  id: "accessible-featured-course",
  courseId: "accessible-featured-course",
  topic: "Systems thinking",
  outcome: "Map a feedback loop and explain one useful leverage point.",
  artifact: { title: "A feedback-loop map", description: "A finished map", format: "document" },
  level: "Foundations",
  estimatedMinutes: 60,
  isPublic: true,
  modules: [{ title: "Feedback loops", lessons: [{ title: "Map the parts", concept: "Systems" }] }],
} as const;

const linkRequiredAccount = {
  access: "free",
  plan: "free",
  isOwner: false,
  accountStatus: "active",
  subscriptionStatus: "none",
  capabilities: {
    createCourse: false,
    generateLesson: false,
    flashcardDecksEnabled: false,
    createCustomFlashcardDeck: false,
    publishCourse: false,
    advancedCapstoneAnalysis: false,
    exportEvidenceReport: false,
    shareEvidenceReport: false,
  },
  courseCredits: {
    balance: 0,
    monthlyAllocation: 0,
    balanceCap: 0,
    nextAccrualAt: null,
    frozenUntil: null,
  },
  applicationAccountExists: false,
  legalAcceptanceRequired: false,
  identityLinkRequired: true,
  currentTermsVersion: TERMS_VERSION,
  currentPrivacyVersion: PRIVACY_VERSION,
  quotas: [],
} as const;

async function expectWcagClean(page: Page) {
  await page.locator(".modal-layer").evaluate(async (layer) => {
    await Promise.all(layer.getAnimations({ subtree: true }).map(async (animation) => {
      try {
        await animation.finished;
      } catch {
        // A cancelled entry animation has already reached its stable replacement state.
      }
    }));
  });
  const accessibility = await new AxeBuilder({ page })
    .include(".auth-dialog")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
}

async function expectFocusContained(
  page: Page,
  dialog: Locator,
  gesture: NativeSequentialFocusGesture,
  tabCount = 10,
) {
  for (let index = 0; index < tabCount; index += 1) {
    await pressNativeSequentialFocus(page, gesture, "forward");
    expect(await page.evaluate(() => (
      document.activeElement?.closest('[role="dialog"]') !== null
    ))).toBe(true);
    await expect(dialog).toBeVisible();
  }
}

async function expectMobileHardening(
  page: Page,
  dialog: Locator,
  longInstruction: Locator,
) {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await expect(dialog).toBeVisible();

  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(await page.locator(".modal-layer").evaluate((node) => (
    node.scrollWidth <= node.clientWidth
  ))).toBe(true);
  expect(await longInstruction.evaluate((node) => (
    getComputedStyle(node).overflowWrap
  ))).toBe("anywhere");

  const textIsReadable = await dialog.locator(
    ".auth-copy, .auth-identity, .auth-redirect-help, .legal-check, button",
  ).evaluateAll((nodes) => nodes.every((node) => (
    Number.parseFloat(getComputedStyle(node).fontSize) >= 16
  )));
  expect(textIsReadable).toBe(true);

  const actionsAreTouchSafe = await dialog.locator("button").evaluateAll((buttons) => (
    buttons.every((button) => {
      const style = getComputedStyle(button);
      return button.getBoundingClientRect().height >= 44 && style.whiteSpace !== "nowrap";
    })
  ));
  expect(actionsAreTouchSafe).toBe(true);

  await page.emulateMedia({ forcedColors: "active" });
  expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
  const forcedColorSurface = await dialog.evaluate((node) => {
    const style = getComputedStyle(node);
    return { borderStyle: style.borderStyle, boxShadow: style.boxShadow };
  });
  expect(forcedColorSurface.borderStyle).toBe("solid");
  expect(forcedColorSurface.boxShadow).toBe("none");
}

test("secure sign-in modal is WCAG-clean, keyboard-contained, and resilient on small screens", { tag: ["@mobile", "@webkit", "@smoke"] }, async ({ page }) => {
  const sequentialFocus = await resolveNativeSequentialFocusGesture(page);
  await page.route("**/api/auth/session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(signedOutManagedSession),
  }));
  await page.route("**/api/courses**", (route) => route.fulfill({
    status: 200,
    json: { featuredCourseId: featuredCourse.id, courses: [featuredCourse] },
  }));
  await page.goto("/");
  const trigger = page.locator(".marketing-course-proof").getByRole("button", { name: "Create an account to start" });
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Keep your learning in sync" });
  await expect(dialog).toBeVisible();
  const legalConfirmation = dialog.getByRole("checkbox");
  await legalConfirmation.check();
  await expect(dialog.getByRole("button", { name: "Continue securely" })).toBeEnabled();
  await expectWcagClean(page);
  await expectFocusContained(page, dialog, sequentialFocus);

  const lightSurface = await dialog.evaluate((node) => {
    const style = getComputedStyle(node);
    return { color: style.color, backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage };
  });
  expect(lightSurface.backgroundImage).toMatch(/url\(/);
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    localStorage.setItem("filosage-theme", "dark");
  });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const darkSurface = await dialog.evaluate((node) => {
    const style = getComputedStyle(node);
    return { color: style.color, backgroundColor: style.backgroundColor };
  });
  expect(darkSurface.backgroundColor).not.toBe(lightSurface.backgroundColor);
  expect(darkSurface.color).not.toBe(lightSurface.color);
  await expect(dialog.locator(".auth-identity .auth-google-icon")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Use my existing Google sign-in" }).locator(".auth-google-icon")).toBeVisible();
  await expectWcagClean(page);

  await expectMobileHardening(page, dialog, dialog.locator(".legal-check span"));
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("identity recovery remains blocking, WCAG-clean, and keyboard-reachable", { tag: ["@mobile", "@webkit", "@smoke"] }, async ({ page }) => {
  const sequentialFocus = await resolveNativeSequentialFocusGesture(page);
  await page.route("**/api/auth/session", (route) => route.fulfill({
    status: 200,
    json: {
      recentAuthentication: true,
      authentication: {
        primaryProvider: "filosage",
        externalIdAvailable: true,
        externalIdNewAccountsAvailable: true,
        legacyGoogleAvailable: true,
      },
      user: {
        uid: "filosage-canonical-recovery",
        displayName: "Recovery Learner",
        email: "recovery@example.com",
        photoURL: null,
        authenticationProvider: "filosage",
      },
    },
  }));
  await page.route("**/api/account", (route) => route.fulfill({
    status: 409,
    contentType: "application/json",
    body: JSON.stringify(linkRequiredAccount),
  }));
  await page.route("**/api/progress", (route) => route.fulfill({ json: { progress: [] } }));
  await page.route("**/api/courses?scope=public", (route) => route.fulfill({ json: { courses: [] } }));
  await page.route("**/api/courses?scope=mine", (route) => route.fulfill({ json: { courses: [] } }));
  await page.goto("/");

  const dialog = page.getByRole("dialog", { name: "Confirm your existing sign-in" });
  await expect(dialog).toBeVisible();
  await expectWcagClean(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();

  await pressNativeSequentialFocus(page, sequentialFocus, "forward");
  await expect(dialog.getByRole("button", { name: "Confirm existing Google sign-in" })).toBeFocused();
  await expect(dialog.getByRole("button", { name: "Confirm existing Google sign-in" }).locator(".auth-google-icon")).toBeVisible();
  await pressNativeSequentialFocus(page, sequentialFocus, "forward");
  await expect(dialog.getByRole("button", { name: "Sign out and choose another method" })).toBeFocused();
  await expectFocusContained(page, dialog, sequentialFocus, 8);

  await expectMobileHardening(page, dialog, dialog.locator("#identity-link-description"));
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Sign out and choose another method" })).toBeVisible();
});

test("profile name editing remains keyboard reachable and reflows at 200 percent", { tag: ["@mobile", "@webkit", "@smoke"] }, async ({ page }) => {
  const sequentialFocus = await resolveNativeSequentialFocusGesture(page);
  await page.route("**/api/auth/session", (route) => route.fulfill({
    status: 200,
    json: {
      recentAuthentication: true,
      authentication: {
        primaryProvider: "filosage",
        externalIdAvailable: true,
        externalIdNewAccountsAvailable: true,
        legacyGoogleAvailable: true,
      },
      user: {
        uid: "profile-accessibility-learner",
        displayName: "Accessible Learner",
        email: "accessible@example.com",
        photoURL: null,
        authenticationProvider: "filosage",
      },
    },
  }));
  await page.route("**/api/account", (route) => route.fulfill({
    status: 200,
    json: exactLearnerAccount({ displayName: "Accessible Learner" }),
  }));
  await page.route("**/api/learner-state", (route) => route.fulfill({
    json: route.request().method() === "GET" ? EMPTY_LEARNER_STATE : { saved: true },
  }));
  await page.route("**/api/progress", (route) => route.fulfill({ status: 200, json: { progress: [] } }));
  await page.route("**/api/courses?scope=mine", (route) => route.fulfill({ status: 200, json: { courses: [] } }));

  await page.goto("/profile");
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const dashboardView = page.getByRole("button", { name: "Change dashboard view" });
    await expect(dashboardView).toBeVisible();
    expect(await dashboardView.evaluate((node) => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    const profileAccessibility = await new AxeBuilder({ page })
      .include(".profile-side")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(profileAccessibility.violations).toEqual([]);
    await dashboardView.press("Enter");
    await expect(page.getByRole("dialog", { name: "Choose what helps you focus." })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dashboardView).toBeFocused();
  }
  const profileHeader = page.locator(".profile-identity");
  await profileHeader.getByRole("button", { name: "Edit name" }).click();
  const input = profileHeader.getByRole("textbox", { name: "Name shown in Filosage" });
  await expect(input).toBeFocused();
  await pressNativeSequentialFocus(page, sequentialFocus, "forward");
  await expect(profileHeader.getByRole("button", { name: "Save name" })).toBeFocused();
  await pressNativeSequentialFocus(page, sequentialFocus, "forward");
  await expect(profileHeader.getByRole("button", { name: "Cancel" })).toBeFocused();

  await page.setViewportSize({ width: 320, height: 900 });
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  expect(await profileHeader.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(await input.evaluate((node) => node.getBoundingClientRect().width <= 320)).toBe(true);
  const accessibility = await new AxeBuilder({ page })
    .include(".profile-identity")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

for (const initialSetup of [true, false]) {
  test(`legal ${initialSetup ? "account setup" : "terms update"} contains keyboard focus over the real shell`, { tag: ["@smoke", "@mobile", "@webkit"] }, async ({ page }) => {
    const sequentialFocus = await resolveNativeSequentialFocusGesture(page);
    await page.emulateMedia({ colorScheme: initialSetup ? "light" : "dark", reducedMotion: "reduce" });
    await page.route("**/api/auth/session", (route) => route.fulfill({ json: {
      ...signedOutManagedSession, recentAuthentication: true,
      user: { uid: "legal-learner", displayName: "Legal Learner", email: "legal@example.com", photoURL: null, authenticationProvider: "filosage" },
    } }));
    await page.route("**/api/account", (route) => route.fulfill({ json: {
      ...exactLearnerAccount(), applicationAccountExists: !initialSetup, legalAcceptanceRequired: true,
    } }));
    const prematureReads: string[] = [];
    await page.route(/\/api\/(progress|learner-state|courses)(\?|$)/, (route) => {
      prematureReads.push(new URL(route.request().url()).pathname);
      return route.fulfill({ status: 401, json: { error: "Complete legal acceptance first." } });
    });
    let acceptanceRequests = 0;
    await page.route("**/api/legal/acceptance", (route) => {
      acceptanceRequests += 1;
      return route.fulfill({ status: 503, json: { error: "Temporarily unavailable" } });
    });
    await page.goto("/profile");
    const dialog = page.getByRole("dialog", { name: initialSetup ? "Review before creating your account" : "Review before continuing" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveJSProperty("open", true);
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    const within = () => dialog.evaluate((node) => node.contains(document.activeElement));
    for (const shortcut of ["Control+k", "Meta+k"]) {
      await page.keyboard.press(shortcut);
      await expect(page.getByRole("dialog", { name: "Filosage Command Center", exact: true })).toHaveCount(0);
      await expect(dialog).toHaveJSProperty("open", true);
      expect(await within()).toBe(true);
    }
    for (const direction of ["forward", "reverse"] as const) {
      for (let index = 0; index < 14; index += 1) { await pressNativeSequentialFocus(page, sequentialFocus, direction); expect(await within()).toBe(true); }
    }
    await page.locator(".learning-command-trigger").first().evaluate((node) => (node as HTMLElement).focus());
    expect(await within()).toBe(true);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const heading = dialog.getByRole("heading", { level: 2 });
    const headingSize = await heading.evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
    expect(headingSize.scrollWidth, JSON.stringify(headingSize)).toBeLessThanOrEqual(headingSize.clientWidth);
    for (const name of ["Terms of Service", "Privacy Notice", "Acceptable Use Policy"]) {
      const link = dialog.getByRole("link", { name });
      await link.scrollIntoViewIfNeeded(); await expect(link).toBeVisible();
    }
    await expect(dialog.getByRole("button", { name: "Accept and continue" })).toBeDisabled();
    expect(acceptanceRequests).toBe(0);
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Accept and continue" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Your acceptance could not be saved. Check your connection and try again.");
    expect(acceptanceRequests).toBe(1);
    expect(prematureReads).toEqual([]);
    const leave = dialog.getByRole("button", { name: "Sign out", exact: true });
    await leave.scrollIntoViewIfNeeded(); await expect(leave).toBeVisible(); await leave.focus(); await expect(leave).toBeFocused();
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).include(".legal-consent-dialog").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    await dialog.getByRole("link", { name: "Terms of Service" }).click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  });
}


for (const gate of ["legal", "identity"] as const) {
  test(`account switch waits for ${gate} readiness before private reads`, { tag: ["@smoke", "@mobile", "@webkit"] }, async ({ page }) => {
    let uid = "ready-account-A";
    let accountRequested = false;
    let releaseAccount!: () => void;
    const pendingAccount = new Promise<void>((resolve) => { releaseAccount = resolve; });
    const prematureReads: string[] = [];
    await page.route("**/api/auth/session", (route) => route.fulfill({ json: {
      ...signedOutManagedSession, recentAuthentication: true,
      user: { uid, displayName: uid, email: `${uid.toLowerCase()}@example.com`, photoURL: null, authenticationProvider: "filosage" },
    } }));
    await page.route("**/api/account", async (route) => {
      if (uid === "ready-account-A") return route.fulfill({ json: exactLearnerAccount({ displayName: uid }) });
      accountRequested = true;
      await pendingAccount;
      return route.fulfill({ json: gate === "legal"
        ? { ...exactLearnerAccount(), legalAcceptanceRequired: true }
        : linkRequiredAccount });
    });
    await page.route(/\/api\/(progress|learner-state|courses)(\?|$)/, (route) => {
      if (route.request().headers()["x-filosage-expected-uid"] === "blocked-account-B"
        || route.request().headers().authorization?.includes("blocked-account-B")) {
        prematureReads.push(new URL(route.request().url()).pathname);
        return route.fulfill({ status: 401, json: { error: "Resolve the new account first." } });
      }
      return route.fulfill({ json: { ...EMPTY_LEARNER_STATE, progress: [], courses: [] } });
    });
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "ready-account-A", exact: true })).toBeVisible();
    uid = "blocked-account-B";
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", {
      key: "filosage:learner-session-change:v1", newValue: "refresh:blocked-account-B:test",
    })));
    await expect.poll(() => accountRequested).toBe(true);
    // Wait through a render turn while the new account DTO is unresolved.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(prematureReads).toEqual([]);
    releaseAccount();
    const dialog = page.getByRole("dialog", { name: gate === "legal" ? "Review before continuing" : "Confirm your existing sign-in" });
    await expect(dialog).toBeVisible();
    expect(prematureReads).toEqual([]);
  });
}


test("owner navigation stays readable in both themes while a failed overview can be retried", { tag: ["@mobile", "@webkit"] }, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: {
    ...signedOutManagedSession,
    recentAuthentication: true,
    user: { uid: "navigation-audit-owner", displayName: "Navigation Owner", email: "navigation@example.com", photoURL: null, authenticationProvider: "filosage" },
  } }));
  await page.route("**/api/account", (route) => route.fulfill({ json: exactLearnerAccount({ isOwner: true }) }));
  await page.route("**/api/learner-state", (route) => route.fulfill({ json: EMPTY_LEARNER_STATE }));
  await page.route("**/api/progress", (route) => route.fulfill({ json: { progress: [] } }));
  await page.route("**/api/courses?scope=mine", (route) => route.fulfill({ json: { courses: [] } }));
  let attempts = 0;
  await page.route("**/api/admin/overview?**", (route) => {
    attempts += 1;
    return route.fulfill({ status: 503, json: { error: "Overview is temporarily unavailable." } });
  });
  await page.goto("/admin");
  await expect(page.getByText("Overview is temporarily unavailable.")).toBeVisible();
  const beforeRetry = attempts;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect.poll(() => attempts).toBe(beforeRetry + 1);
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const accessibility = await new AxeBuilder({ page })
      .include(".admin-tabs")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  }
  await page.route("**/api/generation-operations", (route) => route.fulfill({ json: { operations: [] } }));
  await page.goto("/create");
  const steps = page.getByRole("navigation", { name: "Course creation steps" });
  await expect(steps).toBeVisible();
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const accessibility = await new AxeBuilder({ page })
      .include('nav[aria-label="Course creation steps"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(accessibility.violations).toEqual([]);
  }
});
