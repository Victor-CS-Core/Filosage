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
  "public/brand/logo/filosage-horizontal.svg": "d7d70e6b6ff2b659f1262decd7c80eebaf7f04e959c7219745e4f90cdd687672",
  "public/brand/backgrounds/hero-light.svg": "df39f0d610889b9d74b23687824c951f3aec65605a2aa17d66da4f66374fcf6a",
  "public/brand/logo/browser-icon.png": "b1165595ff93abc622a822fcb2657a6ce44ada055ce6d97d30088d690c73e9a5",
} as const;

const manifest = JSON.parse(
  readFileSync("infra/azure/external-id-branding/manifest.json", "utf8"),
) as Record<string, unknown>;
const css = readFileSync("infra/azure/external-id-branding/custom.css", "utf8");

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function canonicalSourceSha256(path: string) {
  const bytes = readFileSync(path);
  const canonicalBytes = path.endsWith(".svg")
    ? Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"), "utf8")
    : bytes;
  return createHash("sha256").update(canonicalBytes).digest("hex");
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
    "backgroundImageDark",
    "bannerLogo",
    "contrastStandard",
    "customCss",
    "customCssRequired",
    "displayNameAttribute",
    "favicon",
    "fontStack",
    "footerVisible",
    "headerVisible",
    "hostedDomainMode",
    "layoutAlignment",
    "oneTimeCodeTitle",
    "pageBackgroundColor",
    "pageBackgroundColorDark",
    "privacyText",
    "privacyUrl",
    "provider",
    "schemaVersion",
    "signInPageText",
    "squareLogo",
    "squareLogoDark",
    "template",
    "termsText",
    "termsUrl",
    "usernameHintText",
  ]);
  expect(manifest).toEqual({
    schemaVersion: 2,
    provider: "Microsoft Entra External ID",
    hostedDomainMode: "microsoft-managed",
    template: "full-screen",
    layoutAlignment: "center",
    headerVisible: true,
    footerVisible: true,
    pageBackgroundColor: "#E7DDCE",
    pageBackgroundColorDark: "#000D23",
    bannerLogo: "/brand/identity/filosage-sign-in-banner.png",
    backgroundImage: "/brand/identity/filosage-sign-in-background.png",
    backgroundImageDark: "/brand/identity/filosage-sign-in-background-dark.png",
    favicon: "/brand/identity/filosage-sign-in-favicon.png",
    squareLogo: "/brand/identity/filosage-sign-in-square.png",
    squareLogoDark: "/brand/identity/filosage-sign-in-square-dark.png",
    customCss: "infra/azure/external-id-branding/custom.css",
    customCssRequired: false,
    privacyText: "Privacy Notice",
    privacyUrl: "https://filosage.com/privacy",
    termsText: "Terms of Service",
    termsUrl: "https://filosage.com/terms",
    usernameHintText: "Email address",
    signInPageText: "Choose Google or a private email code. Microsoft securely manages sign-in; Filosage never sees your password or one-time code.",
    oneTimeCodeTitle: "Enter your private email code",
    authenticationMethods: ["google", "email_one_time_code"],
    displayNameAttribute: {
      attribute: "displayName",
      label: "Name shown in Filosage",
      inputType: "text",
      defaultValue: null,
      hidden: false,
      editable: true,
      writeToDirectory: true,
      required: true,
      validationRegEx: "^.{1,80}$",
      options: [],
    },
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

  expect(pngMetadata(`public${String(manifest.backgroundImageDark)}`)).toEqual({
    signature: "89504e470d0a1a0a",
    width: 1600,
    height: 900,
    bytes: expect.any(Number),
  });
  expect(pngMetadata(`public${String(manifest.backgroundImageDark)}`).bytes).toBeLessThanOrEqual(300 * 1024);

  expect(pngMetadata(`public${String(manifest.favicon)}`)).toEqual({
    signature: "89504e470d0a1a0a",
    width: 32,
    height: 32,
    bytes: expect.any(Number),
  });
  expect(pngMetadata(`public${String(manifest.favicon)}`).bytes).toBeLessThanOrEqual(5 * 1024);

  const reviewedSquareLogos = {
    squareLogo: "44c214bc9be02b92f6e4b6c1bede530e4e816dc2e2edbc9d1e3c16b763a0324c",
    squareLogoDark: "fcff43d79411b57aa4d353d451bb5f6f178eae65a17fbb342f3fe9cb40a47135",
  } as const;
  for (const [field, expectedHash] of Object.entries(reviewedSquareLogos)) {
    const path = `public${String(manifest[field])}`;
    expect(reviewedBannerMetadata(path)).toEqual({
      signature: "89504e470d0a1a0a",
      width: 240,
      height: 240,
      bytes: expect.any(Number),
      sha256: expectedHash,
    });
    expect(pngMetadata(path).bytes).toBeLessThanOrEqual(10 * 1024);
  }
});

test("official brand sources remain canonically byte-for-byte unchanged across checkouts", () => {
  for (const [path, expectedHash] of Object.entries(rootAssetHashes)) {
    expect(canonicalSourceSha256(path), path).toBe(expectedHash);
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
  expect(source.alphaBounds).toMatchObject({ minX: 169, maxX: 343 });
  expect(source.alphaBounds.minY).toBeGreaterThanOrEqual(45);
  expect(source.alphaBounds.minY).toBeLessThanOrEqual(46);
  expect(source.alphaBounds.maxY).toBeGreaterThanOrEqual(87);
  expect(source.alphaBounds.maxY).toBeLessThanOrEqual(88);
  expect(banner).toMatchObject({ width: 245, height: 36 });
  expect(banner.alphaBounds).toEqual({ minX: 56, minY: 2, maxX: 188, maxY: 33, width: 133, height: 32 });
  expect(banner.alphaBounds.minX).toBeGreaterThan(0);
  expect(banner.alphaBounds.minY).toBeGreaterThan(0);
  expect(banner.alphaBounds.maxX).toBeLessThan(banner.width - 1);
  expect(banner.alphaBounds.maxY).toBeLessThan(banner.height - 1);
  expect(banner.alphaBounds.width / banner.alphaBounds.height).toBeCloseTo(179 / 43, 1);
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

test("custom CSS parses into the supported responsive and accessible portal surface", async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.setContent(`
    <style>${css}</style>
    <main class="ext-background-image">
      <div class="ext-middle">
        <header class="ext-header"><a class="ext-link" href="#form">Privacy Notice</a></header>
        <section id="form" class="ext-sign-in-box">
          <h1 class="ext-title">Keep your learning in sync</h1>
          <p class="ext-subtitle">Choose a managed sign-in method.</p>
          <div class="ext-promoted-fed-cred-box">
            <button class="ext-button ext-secondary" type="button">
              <img alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='8' fill='%234285F4'/%3E%3C/svg%3E">
              Google
            </button>
          </div>
          <input class="ext-input" aria-label="Email address">
          <button class="ext-button ext-primary">Continue securely</button>
          <p class="ext-error">Try again.</p>
        </section>
        <footer class="ext-footer">Your sign-in is managed by Microsoft.</footer>
      </div>
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
    const button = document.querySelector<HTMLButtonElement>(".ext-button.ext-primary")!;
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
    const federation = getComputedStyle(document.querySelector(".ext-promoted-fed-cred-box")!);
    const googleMark = getComputedStyle(document.querySelector(".ext-promoted-fed-cred-box img")!);
    return {
      selectors,
      media,
      declarations,
      primary: { backgroundColor: primary.backgroundColor, color: primary.color, minHeight: primary.minHeight },
      signInBox: {
        backgroundColor: signInBox.backgroundColor,
        borderRadius: signInBox.borderRadius,
        backgroundImage: signInBox.backgroundImage,
      },
      federation: { backgroundColor: federation.backgroundColor },
      googleMark: { display: googleMark.display, visibility: googleMark.visibility, opacity: googleMark.opacity },
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
    ".ext-middle",
    ".ext-sign-in-box",
    ".ext-promoted-fed-cred-box",
    ".ext-button.ext-primary",
    ".ext-link:focus",
    ".ext-input:focus",
  ]));
  expect(stylesheet.media).toEqual(expect.arrayContaining([
    "(max-width: 480px)",
    "(prefers-color-scheme: dark)",
    "(prefers-reduced-motion: reduce)",
    "(forced-colors: active)",
  ]));
  const cssProperties = stylesheet.declarations.map(({ property }) => property);
  for (const forbidden of ["position", "z-index", "display", "margin", "transform", "opacity", "overflow", "visibility", "inset"]) {
    expect(cssProperties, forbidden).not.toContain(forbidden);
  }
  expect(stylesheet.primary).toEqual({
    backgroundColor: "rgb(13, 27, 61)",
    color: "rgb(243, 234, 220)",
    minHeight: "44px",
  });
  expect(stylesheet.signInBox.backgroundColor).toBe("rgb(255, 249, 240)");
  expect(stylesheet.signInBox.borderRadius).toBe("15px");
  expect(stylesheet.signInBox.backgroundImage).toMatch(/url\(/);
  expect(stylesheet.federation.backgroundColor).toBe("rgb(255, 249, 240)");
  expect(stylesheet.federation.backgroundColor).not.toBe(stylesheet.primary.backgroundColor);
  expect(stylesheet.googleMark).toMatchObject({ visibility: "visible", opacity: "1" });
  for (const color of Object.values(stylesheet.accessibleColors)) {
    expect(contrastRatio(color, "rgb(255, 249, 240)"), `${color} against #FFF9F0`).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(color, "rgb(231, 221, 206)"), `${color} against #E7DDCE`).toBeGreaterThanOrEqual(3);
  }

  await page.emulateMedia({ colorScheme: "dark" });
  const darkSurface = await page.evaluate(() => {
    const signInBox = getComputedStyle(document.querySelector(".ext-sign-in-box")!);
    const canvas = getComputedStyle(document.querySelector(".ext-background-image")!);
    const title = getComputedStyle(document.querySelector(".ext-title")!);
    const primary = getComputedStyle(document.querySelector(".ext-button.ext-primary")!);
    const federation = getComputedStyle(document.querySelector(".ext-promoted-fed-cred-box")!);
    return {
      canvas: canvas.backgroundColor,
      signInBox: signInBox.backgroundColor,
      title: title.color,
      primary: { backgroundColor: primary.backgroundColor, color: primary.color },
      federation: federation.backgroundColor,
    };
  });
  expect(darkSurface.canvas).toBe("rgb(0, 13, 35)");
  expect(darkSurface.signInBox).toBe("rgb(13, 27, 61)");
  expect(darkSurface.title).toBe("rgb(243, 234, 220)");
  expect(darkSurface.primary).toEqual({
    backgroundColor: "rgb(243, 234, 220)",
    color: "rgb(13, 27, 61)",
  });
  expect(darkSurface.federation).toBe("rgb(13, 27, 61)");
  expect(darkSurface.signInBox).not.toBe("rgb(255, 249, 240)");

  const replaceStylesheet = async (value: string) => {
    await page.locator("style").evaluate((element, text) => { element.textContent = text; }, value);
  };
  const snapshotSurface = async () => page.evaluate(() => {
    const properties = [
      "color", "background-color", "background-image", "border-color", "border-radius",
      "box-shadow", "min-height", "font-family", "font-weight", "letter-spacing", "line-height",
      "outline-color", "outline-width", "outline-style", "outline-offset", "text-decoration-thickness",
      "text-underline-offset", "visibility", "opacity",
    ];
    return Array.from(document.querySelectorAll("body, [class]"), (element) => {
      const style = getComputedStyle(element);
      return Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)]));
    });
  });
  const snapshotStates = async () => {
    await page.mouse.move(0, 0);
    await page.locator(".ext-input").focus();
    const inputFocus = await snapshotSurface();
    await page.locator(".ext-link").focus();
    const linkFocus = await snapshotSurface();
    await page.locator(".ext-button.ext-primary").focus();
    const buttonFocus = await snapshotSurface();
    await page.locator(".ext-button.ext-primary").hover();
    const primaryHover = await snapshotSurface();
    await page.locator(".ext-button.ext-secondary").hover();
    const secondaryHover = await snapshotSurface();
    return { inputFocus, linkFocus, buttonFocus, primaryHover, secondaryHover };
  };

  for (const theme of ["light", "dark"] as const) {
    const fixedCss = readFileSync(`infra/azure/external-id-branding/custom-${theme}.css`, "utf8");
    expect(fixedCss).not.toContain("prefers-color-scheme");
    // The same source selectors and declarations remain, in the same cascade order.
    const conditionalSource = fixedCss.slice(fixedCss.indexOf("body {"))
      .replace(theme === "light" ? "@media not all {" : "@media all {", "@media (prefers-color-scheme: dark) {");
    expect(conditionalSource.replace(/\r\n/g, "\n")).toBe(css.replace(/\r\n/g, "\n"));
    for (const width of [1280, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme, forcedColors: "none", reducedMotion: "no-preference" });
      await replaceStylesheet(css);
      await expect(page.locator(".ext-sign-in-box")).toHaveCSS("border-radius", width === 320 ? "11px" : "15px");
      const expectedStates = await snapshotStates();
      for (const osTheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: osTheme });
        await replaceStylesheet(fixedCss);
        expect(await snapshotStates(), `${theme} asset, ${osTheme} OS, ${width}px`).toEqual(expectedStates);
        const nativeScheme = await page.locator("html").evaluate((element) => getComputedStyle(element).colorScheme);
        expect(nativeScheme.split(" ").sort()).toEqual(["only", theme].sort());
        expect(await page.locator(".ext-sign-in-box").evaluate((element) => getComputedStyle(element).borderRadius)).toBe(width === 320 ? "11px" : "15px");
        if (theme !== osTheme) {
          await page.mouse.move(0, 0);
          await testInfo.attach(`fixed-${theme}-os-${osTheme}-${width}px`, {
            body: await page.screenshot({ fullPage: true }), contentType: "image/png",
          });
        }
      }
    }

    await page.emulateMedia({ colorScheme: theme === "light" ? "dark" : "light", reducedMotion: "reduce", forcedColors: "active" });
    const accessibility = await page.evaluate(() => {
      const box = document.querySelector<HTMLElement>(".ext-sign-in-box")!;
      const input = document.querySelector<HTMLInputElement>(".ext-input")!;
      input.focus();
      const probe = document.createElement("span");
      probe.style.cssText = "color: CanvasText; outline-color: Highlight";
      document.body.append(probe);
      const system = getComputedStyle(probe);
      const boxStyle = getComputedStyle(box);
      const inputStyle = getComputedStyle(input);
      const result = {
        border: boxStyle.borderColor, systemBorder: system.color,
        outline: inputStyle.outlineColor, systemOutline: system.outlineColor,
        shadow: boxStyle.boxShadow, forcedColorAdjust: boxStyle.forcedColorAdjust,
        animationDuration: boxStyle.animationDuration, transitionDuration: boxStyle.transitionDuration,
      };
      probe.remove();
      return result;
    });
    expect(accessibility.border).toBe(accessibility.systemBorder);
    expect(accessibility.outline).toBe(accessibility.systemOutline);
    expect(accessibility.shadow).toBe("none");
    expect(accessibility.forcedColorAdjust).toBe("auto");
    expect(accessibility.animationDuration).toBe("1e-05s");
    expect(accessibility.transitionDuration).toBe("1e-05s");
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

test("operator runbook preserves identity gates in the one-app blue/green topology", () => {
  const runbook = readFileSync("docs/AUTH_EXTERNAL_ID_RUNBOOK.md", "utf8");
  const history = readFileSync("docs/history/AUTH_EXTERNAL_ID_RUNBOOK_BEFORE_BLUE_GREEN.md", "utf8");
  expect(runbook).toContain("shared Easy Auth configuration applies to both blue/green revisions");
  expect(runbook).toContain("expected_auth_mode");
  expect(runbook).toContain("header forgery rejection");
  expect(runbook).toContain("missing/stale/future `auth_time`");
  expect(runbook).toContain("BILLING_ENABLED=false");
  expect(runbook).toContain("exact compatible predecessor");
  expect(runbook).toContain("actual post-swap checks remain pending");
  expect(runbook).not.toContain("azure-qa.yml");
  expect(history).toContain("## Approval ledger");
  expect(history).toContain("### Phase A: Existing-account readiness");
  expect(history).toContain("### Phase B: New-account acceptance");
});
