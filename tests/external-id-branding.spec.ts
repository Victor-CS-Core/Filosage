import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
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

function reviewedBannerMetadata(path: string) {
  return { ...pngMetadata(path), sha256: sha256(path) };
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
  expect(reviewedBannerMetadata(`public${String(manifest.bannerLogo)}`)).toEqual({
    signature: "89504e470d0a1a0a",
    width: 245,
    height: 36,
    bytes: expect.any(Number),
    sha256: "0c6814319a02faba8954a3e20037f49b8b1bddf77cce369b1500221fda26c43e",
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
  expect(banner.alphaBounds).toEqual({ minX: 56, minY: 2, maxX: 188, maxY: 33, width: 133, height: 32 });
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

test("operator runbook preserves every gated External ID rollout checkpoint", () => {
  const runbookPath = "docs/AUTH_EXTERNAL_ID_RUNBOOK.md";
  expect(existsSync(runbookPath), `${runbookPath} must exist`).toBe(true);
  const runbook = readFileSync(runbookPath, "utf8").replaceAll("\r\n", "\n");

  for (const heading of [
    "## Approval ledger",
    "## Non-secret configuration inventory",
    "## Google federation redirect URIs",
    "## QA activation procedure",
    "## Live acceptance matrix",
    "## Production promotion gates",
    "## Rollback",
    "## Direct Google retirement criteria",
  ]) expect(runbook).toContain(heading);
  expect(runbook).toContain("BILLING_ENABLED=false");
  expect(runbook).toContain("/.auth/login/filosage/callback");
  expect(runbook).toContain("### Phase A: Existing-account readiness");
  expect(runbook).toContain("### Phase B: New-account acceptance");
  expect(runbook).toContain("`.github/workflows/azure-qa.yml`");
  expect(runbook).toContain("external_id_auth_enabled=");
  expect(runbook).toContain("external_id_new_accounts_enabled=");
  expect(runbook).toContain("`.github/workflows/azure-staging.yml`");
  expect(runbook).toContain("`target_slot`");
  expect(runbook).toContain("`expected_sha`");
  expect(runbook).toContain("The authentication-mode handoff is resolved in the reviewed workflows");
  expect(runbook).not.toContain("KNOWN PROMOTION BLOCKER");

  const section = (heading: string) => {
    const start = runbook.indexOf(`${heading}\n`);
    expect(start, `${heading} must exist`).toBeGreaterThanOrEqual(0);
    const contentStart = start + heading.length + 1;
    const end = runbook.indexOf("\n## ", contentStart);
    return runbook.slice(contentStart, end < 0 ? undefined : end);
  };
  const tableRows = (markdown: string) => markdown
    .split("\n")
    .filter((line) => line.startsWith("|") && !line.includes("---"))
    .slice(1)
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));

  const approvalRows = tableRows(section("## Approval ledger"));
  expect(approvalRows.map(([gate]) => gate)).toEqual([
    "QA external tenant, application, sign-up/sign-in user flow, and Google-provider writes",
    "QA External ID OAuth-secret creation or rotation and one-time identity-link HMAC key creation",
    "QA inactive deployment",
    "QA External ID provider enablement",
    "QA registry backfill `--apply --missing-only`",
    "QA new-account enablement",
    "Production external tenant, application, sign-up/sign-in user flow, and Google-provider writes",
    "Production External ID OAuth-secret creation or rotation and one-time identity-link HMAC key creation",
    "Production registry backfill `--apply --missing-only`",
    "Production inactive zero-traffic deployment",
    "Production External ID provider enablement",
    "Production new-account enablement",
    "Direct Google retirement",
    "Later direct-Google secret removal",
  ]);
  for (const [gate, approval, ...values] of approvalRows) {
    expect(approval, gate).toBe("[ ]");
    expect(values, `${gate} approval values must remain blank`).toEqual(values.map(() => ""));
  }

  const inventoryRows = tableRows(section("## Non-secret configuration inventory"));
  expect(inventoryRows.map(([field]) => field)).toEqual([
    "External tenant display name",
    "External tenant ID",
    "External tenant subdomain",
    "Tenant region and data location",
    "Approved tenant administrator",
    "Sign-up/sign-in user-flow ID",
    "Application client ID",
    "Exact issuer URL",
    "Exact OpenID discovery URL",
    "Named Container Apps Easy Auth provider, expected `filosage`",
    "Azure subscription ID",
    "Azure resource group",
    "Container App name, QA committed default `filosageqa-app`",
    "Container App origin",
    "Easy Auth callback URL ending `/.auth/login/filosage/callback`",
    "Google OAuth web client ID",
    "Maintenance target fingerprint, exactly `postgres:server/database` or `firestore:project`",
    "Key Vault name",
    "External ID OAuth Key Vault secret name, expected QA `external-id-client-secret-qa`, production `external-id-client-secret`",
    "External ID OAuth Key Vault secret version identifier",
    "Identity-link HMAC Key Vault secret name, expected QA `identity-link-hmac-secret-qa`, production `identity-link-hmac-secret`",
    "Identity-link HMAC Key Vault secret version identifier",
    "QA or production revision full Git SHA",
    "Immutable container image digest",
  ]);
  for (const [field, ...values] of inventoryRows) {
    expect(values, `${field} inventory values must remain blank`).toEqual(values.map(() => ""));
  }

  const redirectRows = tableRows(section("## Google federation redirect URIs"));
  expect(redirectRows.map(([environment]) => environment)).toEqual([
    "QA",
    "QA",
    "Production",
    "Production",
  ]);
  for (const [environment, ...values] of redirectRows) {
    expect(values, `${environment} redirect evidence must remain blank`).toEqual(values.map(() => ""));
  }

  const productionPromotion = section("## Production promotion gates");
  for (const productionRegistryRequirement of [
    "### Production registry preparation",
    "The production dry run is mandatory and non-mutating",
    "target the recorded production datastore fingerprint",
    "The environment must report `OPERATIONS_ENVIRONMENT=production`",
    "Production write mode requires its separate production registry-backfill approval",
    "npm.cmd run migrate:identity-links -- --apply --missing-only \"--expected-target=$identityTarget\"",
    "Record counts only",
    "Fail closed on invalid accounts, duplicate normalized emails, conflicting mappings, a target mismatch",
    "rerun the non-mutating production dry run to prove idempotency",
    "before production External ID provider enablement",
  ]) expect(productionPromotion, productionRegistryRequirement).toContain(productionRegistryRequirement);

  for (const command of [
    "npm.cmd run migrate:identity-links",
    "npm.cmd run migrate:identity-links -- --apply --missing-only \"--expected-target=$identityTarget\"",
    "npm.cmd run check:production -- <zero-traffic-revision-url> <full-40-character-sha> <public-site-origin>",
    "npm.cmd run check:release-safety -- <zero-traffic-revision-url>",
    "node scripts/check-auth-provider-state.mjs false",
    "node scripts/check-auth-provider-state.mjs true",
  ]) expect(runbook, command).toContain(command);

  for (const setupRequirement of [
    "`openid profile email`",
    "`infra/azure/external-id-branding/manifest.json`",
    "`infra/azure/external-id-branding/custom.css`",
    "`external-id-client-secret-qa`",
    "`identity-link-hmac-secret-qa`",
    "az bicep build --file infra/azure/qa.bicep",
    "az deployment group validate",
    "az deployment group what-if",
    "DIRECT_GOOGLE_AUTH_ENABLED=true",
    "EXTERNAL_ID_AUTH_ENABLED=false",
    "EXTERNAL_ID_NEW_ACCOUNTS_ENABLED=false",
    "Stop on invalid accounts, duplicate normalized emails, conflicting mappings",
    "connection strings, secret values, cookies, authorization responses, raw claim headers",
  ]) expect(runbook, setupRequirement).toContain(setupRequirement);

  for (const inputCombination of [
    "`external_id_auth_enabled=false` and `external_id_new_accounts_enabled=false`",
    "`external_id_auth_enabled=true` and `external_id_new_accounts_enabled=false`",
    "`external_id_auth_enabled=true` and `external_id_new_accounts_enabled=true`",
  ]) expect(runbook, inputCombination).toContain(inputCombination);

  for (const scenario of [
    "Legal acceptance is stored only after authenticated return",
    "Logout denies protected APIs",
    "Session restoration works after a fresh browser navigation",
    "Malicious external return URLs resolve to `/`",
    "Disabled or suspended accounts remain denied",
    "Monitoring records bounded categories without secrets or raw identity payloads",
  ]) expect(runbook, scenario).toContain(scenario);

  const matrixRows = tableRows(section("## Live acceptance matrix"));
  expect(matrixRows.map(([phase, scenario]) => `${phase}: ${scenario}`)).toEqual([
    "A: Existing direct-Google sign-in and ordinary account use",
    "A: Owner migration through the two-session intent; canonical UID and learning data unchanged",
    "B: Google federation sign-up through External ID and returning sign-in",
    "B: Non-Gmail email-code sign-up and returning sign-in",
    "B: Gmail email-code sign-up and returning sign-in",
    "A: Wrong-email link attempt fails without mutation",
    "A: Expired link intent fails without mutation",
    "A: Replayed link intent fails without mutation",
    "A: Concurrent link attempts produce one success and one bounded conflict without duplicate mutation",
    "A: Same-email second identity is blocked from automatic linking",
    "A: User cancellation returns to a recoverable state without mutation",
    "A: Email-code resend and expiry behavior remains Microsoft-hosted",
    "A: Registration and link throttling is bounded and non-enumerating",
    "A: Google or External ID provider outage is recoverable and non-destructive",
    "A: Network interruption and retry recover without duplicate mutation",
    "A: Fresh Google-federation authentication permits deletion only when recent",
    "A: Fresh email-code authentication permits deletion only when recent",
    "A: Fresh Google-federation authentication protects owner-sensitive actions",
    "A: Fresh email-code authentication protects owner-sensitive actions",
    "A: Missing or stale `auth_time` fails closed for sensitive actions",
    "A: Hosted branding, Privacy Notice, Terms, and visible keyboard focus",
    "A: Reduced motion, 320 px, 390 px, desktop, dark mode, and 200% zoom",
    "B: Legal acceptance is stored only after authenticated return",
    "B: Logout denies protected APIs",
    "B: Session restoration works after a fresh browser navigation",
    "B: Malicious external return URLs resolve to `/`",
    "B: Disabled or suspended accounts remain denied",
    "B: Monitoring records bounded categories without secrets or raw identity payloads",
    "B: Account export preserves the canonical account boundary",
    "B: Account deletion retains the approved identity-link maintenance boundary",
    "B: Existing owner and plan authorization regressions remain denied or allowed correctly",
  ]);
  for (const [phase, scenario, ...values] of matrixRows) {
    expect(values, `${phase}: ${scenario} evidence must remain blank`).toEqual(values.map(() => ""));
  }

  for (const prohibition of [
    "must not delete either provider",
    "unlink identities",
    "rewrite canonical UIDs",
    "rotate the `v1` identity-link HMAC key",
    "remove secrets",
    "`v2` dual-read/dual-write migration design",
  ]) expect(section("## Rollback"), prohibition).toContain(prohibition);

  const sourceUrls = [...section("## Sources").matchAll(/\]\((https:\/\/[^)]+)\)/g)]
    .map(([, url]) => url);
  expect(sourceUrls).toEqual([
    "https://learn.microsoft.com/en-us/entra/external-id/customers/concept-authentication-methods-customers",
    "https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-google-federation-customers",
    "https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-customize-branding-customers",
    "https://learn.microsoft.com/en-us/entra/fundamentals/how-to-customize-branding-themes-apps",
    "https://learn.microsoft.com/en-us/entra/fundamentals/reference-company-branding-css-template",
    "https://learn.microsoft.com/en-us/azure/container-apps/authentication",
    "https://learn.microsoft.com/en-us/azure/templates/microsoft.app/2025-01-01/containerapps/authconfigs",
    "https://pages.nist.gov/800-63-4/sp800-63b.html",
    "https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html",
  ]);

  expect(runbook).not.toMatch(/(?:client secret|HMAC secret|one-time code):\s*\S+/i);
  expect(runbook).not.toMatch(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  expect(runbook).not.toMatch(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
  expect(runbook).not.toMatch(/sk_(?:live|test)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/i);
  expect(runbook).not.toMatch(/(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s`]+/i);
  expect(runbook).not.toMatch(/(?:DATABASE_URL|IDENTITY_LINK_HMAC_SECRET|EXTERNAL_ID_CLIENT_SECRET|client[_ -]?secret|password|token|cookie)\s*[:=]\s*(?!false\b|true\b|<)[^\s`|]+/i);
});
