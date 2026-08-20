import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal";
import { exactLearnerAccount } from "./fixtures/local-learner";

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

async function expectFocusContained(page: Page, dialog: Locator, tabCount = 10) {
  for (let index = 0; index < tabCount; index += 1) {
    await page.keyboard.press("Tab");
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
  await page.route("**/api/auth/session", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(signedOutManagedSession),
  }));
  await page.goto("/");
  const trigger = page.locator(".marketing-hero").getByRole("button", {
    name: "Create a free account",
  });
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Keep your learning in sync" });
  await expect(dialog).toBeVisible();
  const legalConfirmation = dialog.getByRole("checkbox");
  await legalConfirmation.check();
  await expect(dialog.getByRole("button", { name: "Continue securely" })).toBeEnabled();
  await expectWcagClean(page);
  await expectFocusContained(page, dialog);

  await expectMobileHardening(page, dialog, dialog.locator(".legal-check span"));
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("identity recovery remains blocking, WCAG-clean, and keyboard-reachable", { tag: ["@mobile", "@webkit", "@smoke"] }, async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("filosage-local-session", "1"));
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

  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Confirm existing Google sign-in" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Sign out and choose another method" })).toBeFocused();
  await expectFocusContained(page, dialog, 8);

  await expectMobileHardening(page, dialog, dialog.locator("#identity-link-description"));
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Sign out and choose another method" })).toBeVisible();
});

test("profile name editing remains keyboard reachable and reflows at 200 percent", { tag: ["@mobile", "@webkit", "@smoke"] }, async ({ page }) => {
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
  await page.route("**/api/progress", (route) => route.fulfill({ status: 200, json: { progress: [] } }));
  await page.route("**/api/courses?scope=mine", (route) => route.fulfill({ status: 200, json: { courses: [] } }));

  await page.goto("/profile");
  const profileHeader = page.locator(".profile-identity");
  await profileHeader.getByRole("button", { name: "Edit name" }).click();
  const input = profileHeader.getByRole("textbox", { name: "Name shown in Filosage" });
  await expect(input).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(profileHeader.getByRole("button", { name: "Save name" })).toBeFocused();
  await page.keyboard.press("Tab");
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
