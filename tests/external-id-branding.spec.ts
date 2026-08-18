import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { supportArticles } from "../src/content/support/articles";
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

function rgbChannels(value: string) {
  const match = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) throw new Error(`Unsupported CSS color: ${value}`);
  return match.slice(1, 4).map(Number);
}

function relativeLuminance(value: string) {
  const channels = rgbChannels(value).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first: string, second: string) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
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

test("banner preserves the complete approved logo geometry with transparent edge clearance", async ({ page }) => {
  await page.goto("/");
  const [source, banner] = await page.evaluate(async ([sourceRequest, bannerRequest]) => {
    const measure = async ({
      path,
      region,
    }: {
      path: string;
      region?: { minX: number; minY: number; maxX: number; maxY: number };
    }) => {
      const image = new Image();
      image.src = path;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas 2D context unavailable");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let minX = canvas.width;
      let minY = canvas.height;
      let maxX = -1;
      let maxY = -1;
      const scan = region ?? { minX: 0, minY: 0, maxX: canvas.width - 1, maxY: canvas.height - 1 };
      for (let y = scan.minY; y <= scan.maxY; y += 1) {
        for (let x = scan.minX; x <= scan.maxX; x += 1) {
          if (pixels[(y * canvas.width + x) * 4 + 3] > 0) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }
      return {
        width: canvas.width,
        height: canvas.height,
        alphaBounds: { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 },
      };
    };
    return Promise.all([measure(sourceRequest), measure(bannerRequest)]);
  }, [
    {
      path: "/brand/logo/filosage-horizontal.svg",
      region: { minX: 155, minY: 0, maxX: 619, maxY: 95 },
    },
    { path: String(manifest.bannerLogo) },
  ]);

  expect(source).toMatchObject({ width: 620, height: 160 });
  expect(source.alphaBounds).toMatchObject({ minX: 169, minY: 46, maxX: 343, maxY: 87 });
  expect(banner).toMatchObject({ width: 245, height: 36 });
  expect(banner.alphaBounds.minX).toBeGreaterThan(0);
  expect(banner.alphaBounds.minY).toBeGreaterThan(0);
  expect(banner.alphaBounds.maxX).toBeLessThan(banner.width - 1);
  expect(banner.alphaBounds.maxY).toBeLessThan(banner.height - 1);
  expect(banner.alphaBounds.width / banner.alphaBounds.height).toBeCloseTo(
    source.alphaBounds.width / source.alphaBounds.height,
    1,
  );
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
    const link = document.querySelector<HTMLAnchorElement>(".ext-link")!;
    const input = document.querySelector<HTMLInputElement>(".ext-input")!;
    const button = document.querySelector<HTMLButtonElement>(".ext-button")!;
    const inputBorderColor = getComputedStyle(input).borderColor;
    link.focus();
    const linkOutlineColor = getComputedStyle(link).outlineColor;
    input.focus();
    const inputOutlineColor = getComputedStyle(input).outlineColor;
    const inputFocusBorderColor = getComputedStyle(input).borderColor;
    button.focus();
    const buttonOutlineColor = getComputedStyle(button).outlineColor;
    const primary = getComputedStyle(button);
    const signInBox = getComputedStyle(document.querySelector(".ext-sign-in-box")!);
    return {
      selectors,
      media,
      declarations,
      primary: { backgroundColor: primary.backgroundColor, minHeight: primary.minHeight },
      signInBox: { backgroundColor: signInBox.backgroundColor, borderRadius: signInBox.borderRadius },
      accessibleColors: {
        inputBorderColor,
        inputFocusBorderColor,
        linkOutlineColor,
        inputOutlineColor,
        buttonOutlineColor,
      },
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
  for (const color of Object.values(stylesheet.accessibleColors)) {
    expect(contrastRatio(color, "rgb(255, 255, 255)"), `${color} against white`).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(color, "rgb(250, 250, 247)"), `${color} against #FAFAF7`).toBeGreaterThanOrEqual(3);
  }
});

test("privacy and support pages render the managed sign-in disclosures", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Privacy Notice" })).toBeVisible();
  await expect(page.getByText(/Microsoft Entra External ID or Google provider identifier/)).toBeVisible();
  await expect(page.getByText(/Filosage does not receive the one-time code/)).toBeVisible();
  await expect(page.getByText(/Identity-link deletion is not part of automated learning-data deletion/)).toBeVisible();
  await expect(page.getByText(/retained for no more than 30 days before pruning/)).toHaveCount(0);
  await expect(page.getByText(/become eligible for pruning after 30 days/)).toBeVisible();
  await expect(page.getByText(/Removal currently requires an approved identity-maintenance run/)).toBeVisible();
  await expect(page.getByText(/Protect your chosen email or Google account/)).toBeVisible();
  await expect(page.getByText(/never share a one-time code/)).toBeVisible();
  await expect(page.getByText(/Paid subscriptions must remain disabled/)).toBeVisible();

  await page.goto("/support/articles/sign-in-help");
  await expect(page.getByRole("heading", { level: 1, name: "Troubleshoot secure sign-in" })).toBeVisible();
  await expect(page.getByText(/Google sign-in remains available when it is enabled/)).toBeVisible();
  await expect(page.getByText(/Email-code sign-in appears only when Microsoft Entra External ID is enabled/)).toBeVisible();
  await expect(page.getByText(/existing-account email recovery may be available before new email-code account creation/)).toBeVisible();
  await expect(page.getByText(/Filosage support cannot see, generate, or validate a code/)).toBeVisible();
  await expect(page.getByText(/Never send a password or one-time code/)).toBeVisible();

  await page.goto("/support/articles/getting-started");
  await expect(page.locator(".support-article-body").getByText(/select one of the sign-in methods currently shown/)).toBeVisible();
  await expect(page.locator(".support-article-body").getByText(/Google remains available when enabled/)).toBeVisible();
  await expect(page.locator(".support-article-body").getByText(/email-code sign-in appears only when Microsoft Entra External ID is enabled/)).toBeVisible();

  await page.goto("/support/articles/privacy-controls");
  await expect(page.getByText(/recent managed sign-in/)).toBeVisible();
});

test("sign-in help inventories the implemented identity-link recovery surfaces", () => {
  const article = supportArticles.find(({ slug }) => slug === "sign-in-help");
  expect(article?.sources).toEqual(expect.arrayContaining([
    "src/components/IdentityLinkRequiredModal.tsx",
    "src/app/auth/complete-link/page.tsx",
    "src/app/auth/complete-link/CompleteIdentityLink.tsx",
  ]));
});
