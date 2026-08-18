import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  LEGAL_EFFECTIVE_DATE,
  PRIVACY_EFFECTIVE_DATE,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from "../src/lib/legal";

const rootAssetHashes = {
  "public/brand/logo/filosage-horizontal.svg": "60d24c9b74378363e9133aaf445beb233c233b0a59a36d59c6dda325ec2743e1",
  "public/brand/backgrounds/hero-light.svg": "4ebf1a01c2434c903540c301beb91b53461569756afcbb460d8978e3a9d121b4",
  "public/brand/logo/browser-icon.png": "b1165595ff93abc622a822fcb2657a6ce44ada055ce6d97d30088d690c73e9a5",
} as const;

const manifest = JSON.parse(
  readFileSync("infra/azure/external-id-branding/manifest.json", "utf8"),
) as Record<string, unknown>;
const css = readFileSync("infra/azure/external-id-branding/custom.css", "utf8");

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function pngMetadata(path: string) {
  const bytes = readFileSync(path);
  return {
    bytes: bytes.length,
    signature: bytes.subarray(0, 8).toString("hex"),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

test("hosted branding declares the complete reviewed non-secret configuration", () => {
  expect(Object.keys(manifest).sort()).toEqual([
    "authenticationMethods",
    "backgroundImage",
    "bannerLogo",
    "contrastStandard",
    "customCss",
    "favicon",
    "fontStack",
    "footerVisible",
    "headerVisible",
    "hostedDomainMode",
    "oneTimeCodeTitle",
    "pageBackgroundColor",
    "privacyText",
    "privacyUrl",
    "provider",
    "schemaVersion",
    "signInPageText",
    "template",
    "termsText",
    "termsUrl",
    "usernameHintText",
  ]);
  expect(manifest).toEqual({
    schemaVersion: 1,
    provider: "Microsoft Entra External ID",
    hostedDomainMode: "microsoft-managed",
    template: "partial-screen",
    headerVisible: true,
    footerVisible: true,
    pageBackgroundColor: "#FAFAF7",
    bannerLogo: "/brand/identity/filosage-sign-in-banner.png",
    backgroundImage: "/brand/identity/filosage-sign-in-background.png",
    favicon: "/brand/identity/filosage-sign-in-favicon.png",
    customCss: "infra/azure/external-id-branding/custom.css",
    privacyText: "Privacy Notice",
    privacyUrl: "https://filosage.com/privacy",
    termsText: "Terms of Service",
    termsUrl: "https://filosage.com/terms",
    usernameHintText: "Email address",
    signInPageText: "Choose Google or a private email code. Microsoft securely manages sign-in; Filosage never sees your password or one-time code.",
    oneTimeCodeTitle: "Enter your private email code",
    authenticationMethods: ["google", "email_one_time_code"],
    fontStack: "Inter, ui-sans-serif, system-ui, sans-serif",
    contrastStandard: "WCAG 2.2 AA",
  });
  for (const key of Object.keys(manifest)) {
    expect(key).not.toMatch(/secret|password|credential|token/i);
  }
});

test("portal derivatives have exact PNG signatures, dimensions, and byte ceilings", () => {
  expect(pngMetadata(`public${String(manifest.bannerLogo)}`)).toEqual({
    signature: "89504e470d0a1a0a",
    width: 245,
    height: 36,
    bytes: expect.any(Number),
  });
  expect(pngMetadata(`public${String(manifest.bannerLogo)}`).bytes).toBeLessThanOrEqual(10 * 1024);

  expect(pngMetadata(`public${String(manifest.backgroundImage)}`)).toEqual({
    signature: "89504e470d0a1a0a",
    width: 1600,
    height: 900,
    bytes: expect.any(Number),
  });
  expect(pngMetadata(`public${String(manifest.backgroundImage)}`).bytes).toBeLessThanOrEqual(300 * 1024);

  expect(pngMetadata(`public${String(manifest.favicon)}`)).toEqual({
    signature: "89504e470d0a1a0a",
    width: 32,
    height: 32,
    bytes: expect.any(Number),
  });
  expect(pngMetadata(`public${String(manifest.favicon)}`).bytes).toBeLessThanOrEqual(5 * 1024);
});

test("official brand sources remain byte-for-byte unchanged", () => {
  for (const [path, expectedHash] of Object.entries(rootAssetHashes)) {
    expect(sha256(path), path).toBe(expectedHash);
  }
});

test("versions only the revised Privacy Notice", () => {
  expect({ version: PRIVACY_VERSION, effectiveDate: PRIVACY_EFFECTIVE_DATE }).toEqual({
    version: "2026-08-18",
    effectiveDate: "August 18, 2026",
  });
  expect({ version: TERMS_VERSION, effectiveDate: LEGAL_EFFECTIVE_DATE }).toEqual({
    version: "2026-08-11",
    effectiveDate: "August 11, 2026",
  });
});

test("custom CSS parses into the supported responsive and accessible portal surface", async ({ page }) => {
  await page.setContent(`
    <style>${css}</style>
    <main class="ext-background-image">
      <header class="ext-header"><a class="ext-link" href="#form">Privacy Notice</a></header>
      <section id="form" class="ext-sign-in-box">
        <h1 class="ext-title">Keep your learning in sync</h1>
        <p class="ext-subtitle">Choose a managed sign-in method.</p>
        <input class="ext-input" aria-label="Email address">
        <button class="ext-button ext-primary">Continue securely</button>
        <p class="ext-error">Try again.</p>
      </section>
    </main>
  `);

  const stylesheet = await page.evaluate(() => {
    const selectors: string[] = [];
    const media: string[] = [];
    const declarations: Array<{ property: string; value: string }> = [];
    const visit = (rules: CSSRuleList) => {
      for (const rule of Array.from(rules)) {
        if (rule instanceof CSSStyleRule) {
          selectors.push(...rule.selectorText.split(",").map((selector) => selector.trim()));
          for (const property of Array.from(rule.style)) {
            declarations.push({ property, value: rule.style.getPropertyValue(property) });
          }
        }
        if (rule instanceof CSSMediaRule) {
          media.push(rule.conditionText);
          visit(rule.cssRules);
        }
      }
    };
    visit(document.styleSheets[0].cssRules);
    const primary = getComputedStyle(document.querySelector(".ext-button.ext-primary")!);
    const signInBox = getComputedStyle(document.querySelector(".ext-sign-in-box")!);
    return {
      selectors,
      media,
      declarations,
      primary: { backgroundColor: primary.backgroundColor, minHeight: primary.minHeight },
      signInBox: { backgroundColor: signInBox.backgroundColor, borderRadius: signInBox.borderRadius },
    };
  });

  expect(stylesheet.selectors).toEqual(expect.arrayContaining([
    ".ext-sign-in-box",
    ".ext-button.ext-primary",
    ".ext-link:focus",
    ".ext-input:focus",
  ]));
  expect(stylesheet.media).toEqual(expect.arrayContaining([
    "(max-width: 480px)",
    "(prefers-reduced-motion: reduce)",
    "(forced-colors: active)",
  ]));
  expect(stylesheet.declarations.map(({ property }) => property)).not.toContain("position");
  expect(stylesheet.declarations.map(({ property }) => property)).not.toContain("z-index");
  expect(stylesheet.primary).toEqual({ backgroundColor: "rgb(23, 107, 100)", minHeight: "46px" });
  expect(stylesheet.signInBox).toEqual({ backgroundColor: "rgb(255, 255, 255)", borderRadius: "18px" });
});

test("privacy and support pages render the managed sign-in disclosures", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Privacy Notice" })).toBeVisible();
  await expect(page.getByText(/Microsoft Entra External ID or Google provider identifier/)).toBeVisible();
  await expect(page.getByText(/Filosage does not receive the one-time code/)).toBeVisible();
  await expect(page.getByText(/Identity-link deletion is not part of automated learning-data deletion/)).toBeVisible();
  await expect(page.getByText(/Protect your chosen email or Google account/)).toBeVisible();
  await expect(page.getByText(/never share a one-time code/)).toBeVisible();
  await expect(page.getByText(/Paid subscriptions must remain disabled/)).toBeVisible();

  await page.goto("/support/articles/sign-in-help");
  await expect(page.getByRole("heading", { level: 1, name: "Troubleshoot secure sign-in" })).toBeVisible();
  await expect(page.getByText(/choose Continue with Google or enter your email address to receive an email code/)).toBeVisible();
  await expect(page.getByText(/Filosage support cannot see, generate, or validate a code/)).toBeVisible();
  await expect(page.getByText(/Never send a password or one-time code/)).toBeVisible();

  await page.goto("/support/articles/getting-started");
  await expect(page.locator(".support-article-body").getByText(/Google or a private email code/)).toBeVisible();

  await page.goto("/support/articles/privacy-controls");
  await expect(page.getByText(/recent managed sign-in/)).toBeVisible();
});
