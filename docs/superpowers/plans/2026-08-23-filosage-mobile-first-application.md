# Filosage mobile-first hardening implementation plan

> **For Codex:** Execute this plan in order. Apply test-driven development to every production behavior change and keep the existing `FILOSAGE-29` Multica item current. Do not commit, push, merge, deploy, mutate production data, or change billing/secrets/accounts without Victor's explicit approval.

**Goal:** Make Filosage demonstrably mobile-first across its complete route inventory while preserving the Course Deck containment fix, desktop density, themes, accessibility, and reduced-motion behavior.

**Architecture:** Keep the existing shared shells and responsive component system. Strengthen the app at the shared-selector level for the verified phone touch-target exceptions, then account for every route through its controlling shell/template with 320px or 390px browser contracts. Avoid a mechanical desktop-first-to-mobile-first stylesheet inversion; prefer behavioral proof and use narrow base styles for new components going forward.

**Tech stack:** Next.js 16.2.12, React 19, TypeScript, global CSS/modules, Playwright, axe-core.

---

## Task 1: Complete the signed-in route containment matrix

**Files:**
- Modify: `tests/app-shell.spec.ts:1225`

**Step 1: Expand the existing mobile route matrix**

Bring the phone route list to parity with the existing signed-in desktop matrix:

```ts
const routes = [
  { path: "/library", heading: /Find your next course/ },
  { path: "/create", heading: /Build toward a real outcome/ },
  { path: "/progress", heading: /Your progress/ },
  { path: "/profile", heading: /Playwright/ },
  { path: "/review", heading: /caught up|concept/ },
  { path: "/pricing", heading: /Choose how far Filosage carries your goal/ },
  { path: "/support", heading: /What do you need help with/ },
  { path: "/standard", heading: /Capability Cycle turns a goal into usable skill/ },
];
```

For every route, keep the shared paper-system assertion and `expectNoHorizontalPageOverflow` check. This is coverage expansion, so it should pass before production edits; if it fails, record the precise route as a product defect and handle it red-to-green.

**Step 2: Run the narrow signed-in matrix in both mobile engines**

```powershell
$env:FILOSAGE_PLAYWRIGHT_PROJECT='mobile-chromium'
$env:PLAYWRIGHT_PORT='3480'
npx.cmd playwright test tests/app-shell.spec.ts --project=mobile-chromium --grep "platform paper system"

$env:FILOSAGE_PLAYWRIGHT_PROJECT='mobile-webkit'
$env:PLAYWRIGHT_PORT='3490'
npx.cmd playwright test tests/app-shell.spec.ts --project=mobile-webkit --grep "platform paper system"
```

Expected: pass in both engines with no horizontal overflow.

## Task 2: Prove and fix shared mobile interaction targets

**Files:**
- Modify: `tests/app-shell.spec.ts`
- Modify: `tests/example.spec.ts`
- Modify: `tests/admin-research-layout.spec.ts`
- Modify: `tests/support-wiki.spec.ts`
- Modify: `src/app/globals.css`

**Step 1: Add failing phone-target assertions**

Add a small test helper local to each affected suite or reuse a typed helper if one already exists:

```ts
async function expectMinimumTargetHeight(locator: Locator, minimum = 44) {
  const heights = await locator.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().height),
  );
  expect(heights.length).toBeGreaterThan(0);
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(minimum);
}
```

At phone width, assert the 44px floor for:

- legal local navigation links;
- support article category links;
- owner-document resource links;
- admin tabs and visible account/action controls;
- lesson section navigator buttons.

Keep these assertions scoped to visible controls; do not create a brittle document-wide scanner.

**Step 2: Run only the new assertions and confirm RED**

```powershell
$env:FILOSAGE_PLAYWRIGHT_PROJECT='mobile-chromium'
$env:PLAYWRIGHT_PORT='3500'
npx.cmd playwright test tests/app-shell.spec.ts tests/example.spec.ts tests/admin-research-layout.spec.ts --project=mobile-chromium --grep "44px|touch targets"
```

Expected before production CSS: failures show 34–40px rendered targets.

**Step 3: Read the UI craft floor immediately before editing CSS**

Read `.agents/skills/impeccable/reference/craft-floor.md` completely and apply only the mobile rules that match the verified failures.

**Step 4: Implement the narrow-screen floor at the owning breakpoints**

Add the smallest selector-level correction to `src/app/globals.css`:

```css
@media (max-width: 820px) {
  .support-article-nav li a,
  .owner-docs-links a {
    min-height: 44px;
  }
}

@media (max-width: 700px) {
  .legal-local-nav a {
    min-height: 44px;
  }
}

@media (max-width: 620px) {
  .lesson-section-navigator button,
  .admin-tabs button,
  .admin-header-actions select,
  .admin-pro-controls select,
  .admin-account-controls .button,
  .admin-launch-actions .button,
  .admin-ai-cost-strip > button {
    min-height: 44px;
  }
}
```

Preserve horizontal scrolling for dense legal/admin navigation and desktop compactness above the phone breakpoints.

**Step 5: Run the focused tests and confirm GREEN**

Repeat the focused command from Step 2. Expected: all new target-height and containment checks pass.

## Task 3: Add direct phone contracts for remaining surface families

**Files:**
- Modify: `tests/admin-research-layout.spec.ts`
- Modify: `tests/flashcard-visual.spec.ts`
- Verify: `tests/shared-evidence-ui.spec.ts`
- Verify: `playwright.shared-evidence.config.ts`

**Step 1: Add admin phone flow/containment evidence**

Extend the research layout test after its current 1024px assertion:

```ts
await page.setViewportSize({ width: 390, height: 844 });
await expect(page.locator(".admin-page")).toBeVisible();
expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
await expectNoVerticalOverlap(phaseOne, phaseTwo);
```

Also assert that the horizontally scrollable tab strip remains within its own viewport rather than widening the page.

**Step 2: Add a phone flashcard-workspace contract**

Preserve the existing desktop visual capture, then resize the same populated workspace to `390 × 844` and assert:

```ts
await page.setViewportSize({ width: 390, height: 844 });
expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
await expect(page.locator(".deck-study-card")).toBeVisible();
await expect(page.getByRole("button", { name: /Show answer|Reveal/ })).toBeVisible();
```

Use the actual accessible button name found in the rendered component.

**Step 3: Exercise the existing dedicated shared-evidence matrix**

The dedicated shared-evidence configuration already runs desktop Chromium, mobile Chromium, and mobile WebKit. Preserve its readable-type, no-overflow, axe, privacy, and security-header assertions and run all three projects; do not duplicate the existing contract.

**Step 4: Run these three surface suites**

```powershell
$env:PLAYWRIGHT_PORT='3510'
npx.cmd playwright test tests/admin-research-layout.spec.ts tests/flashcard-visual.spec.ts --project=chromium
npx.cmd playwright test --config playwright.shared-evidence.config.ts
```

Expected: all pass at their explicit phone viewports. Any failure becomes a new red production-fix loop before proceeding.

## Task 4: Verify course, lesson, shell, themes, and breakpoints together

**Files:**
- Verify only unless a new regression is found: `tests/app-shell.spec.ts`, `tests/example.spec.ts`, `tests/support-wiki.spec.ts`, `tests/auth-accessibility.spec.ts`, `tests/command-center.spec.ts`

**Step 1: Run full mobile Chromium**

```powershell
$env:FILOSAGE_PLAYWRIGHT_PROJECT='mobile-chromium'
$env:PLAYWRIGHT_PORT='3520'
npx.cmd playwright test --project=mobile-chromium
```

**Step 2: Run full mobile WebKit**

```powershell
$env:FILOSAGE_PLAYWRIGHT_PROJECT='mobile-webkit'
$env:PLAYWRIGHT_PORT='3530'
npx.cmd playwright test --project=mobile-webkit
```

**Step 3: Run touched suites on desktop Chromium**

```powershell
$env:PLAYWRIGHT_PORT='3540'
npx.cmd playwright test tests/app-shell.spec.ts tests/example.spec.ts tests/admin-research-layout.spec.ts tests/flashcard-visual.spec.ts tests/shared-evidence-ui.spec.ts --project=desktop-chromium
```

Expected: no Course Deck regression, no page-level horizontal overflow, actions remain reachable, light/dark behavior remains intact, and reduced-motion coverage remains green.

## Task 5: Static and production-build verification

**Files:**
- Review: all files changed in this plan

**Step 1: Run lint, typecheck, and production build**

```powershell
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
```

**Step 2: Review the exact worktree diff**

```powershell
git diff --check
git diff -- src/app/globals.css tests/app-shell.spec.ts tests/example.spec.ts tests/admin-research-layout.spec.ts tests/flashcard-visual.spec.ts tests/support-wiki.spec.ts .impeccable/audit/2026-08-23-mobile-first-application.md docs/superpowers/plans/2026-08-23-filosage-mobile-first-application.md
git status --short
```

Confirm unrelated user changes remain untouched.

**Step 3: Re-read the Multica outcome checklist and report review readiness**

Record fresh evidence on `FILOSAGE-29`. Mark `review_ready`, not `completed`, because commit, push, deployment, and production verification remain approval-gated and were not requested.
