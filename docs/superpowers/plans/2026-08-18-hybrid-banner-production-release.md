# Hybrid Banner Production Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship hybrid course-banner style v5 and runtime-selected landing flagship support on the latest Filosage `main`, then prove that exact release live before any flagship course is created.

**Architecture:** Keep banner prompting and fingerprint identity as pure helpers in `course-banner-prompt.ts`, while `course-banners.ts` retains provider/storage orchestration. Replace the existing build-time `NEXT_PUBLIC_MARKETING_FLAGSHIP_COURSE_ID` client lookup with a validated server runtime value returned by the public-courses API, leaving library ordering unchanged and retaining the stable client fallback already implemented in `marketing-merchandising.ts`.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Playwright, OpenAI image generation, Azure Container Apps blue/green release workflows, PostgreSQL document storage, Azure Blob Storage.

**Spec:** `docs/superpowers/specs/2026-08-17-flagship-course-hybrid-banner-release-design.md`

## Global Constraints

- Start from `origin/main` and preserve all unrelated worktree changes.
- Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`, `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`, and `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md` before editing route or environment behavior.
- Keep `BILLING_ENABLED=false`; do not activate Stripe or change plan contracts.
- Increment `COURSE_BANNER_STYLE_VERSION` from `4` to `5`.
- Existing banner assets remain immutable; no banner migration or regeneration route is introduced.
- No new course is created until production health reports the exact release SHA containing style v5.
- Deploy through isolated QA, the inactive production slot, and explicit blue/green promotion; never overwrite the live slot.
- Treat code commit, Git push, QA deployment, production staging, traffic promotion, runtime configuration, course mutation, and browser verification as separate states.

---

### Task 1: Make banner semantics and identity testable

**Files:**
- Modify: `tests/example.spec.ts`
- Modify: `src/lib/course-banner-prompt.ts`
- Modify: `src/lib/course-banners.ts`

**Interfaces:**
- Consumes: `CourseBannerPromptInput` values `topic`, `category`, `outcome`, and `mission`; `variant: 0 | 1`
- Produces: `buildCourseBannerPrompt(input): string` and `courseBannerFingerprintMaterial(input, variant): string`

- [ ] **Step 1: Write failing prompt and fingerprint tests**

Extend the existing import and banner test in `tests/example.spec.ts`:

```ts
import {
  buildCourseBannerPrompt,
  courseBannerFingerprintMaterial,
  COURSE_BANNER_STYLE_VERSION,
} from "../src/lib/course-banner-prompt";

test("builds recognizable tactile course banners from the complete course meaning", () => {
  const input = {
    topic: "Decode the Night Sky",
    category: "Astronomy and outdoor observation",
    outcome: "Orient with a sky map and explain visible change using Earth motion.",
    mission: "Build an annotated observation plan for a real evening sky session.",
  };
  const prompt = buildCourseBannerPrompt(input);

  expect(COURSE_BANNER_STYLE_VERSION).toBe(5);
  expect(prompt).toContain(input.outcome);
  expect(prompt).toContain(input.mission);
  expect(prompt).toContain("recognizable subject anchor");
  expect(prompt).toContain("relationship motif");
  expect(prompt).toContain("tactile");
  expect(prompt).toContain("no more than seven major shapes");
  expect(prompt).toContain("Absolute text ban");
  expect(prompt).not.toContain("generic decorative abstraction disconnected from the course");
});

test("changes banner identity when the outcome or mission changes", () => {
  const base = {
    topic: "Systems thinking",
    category: "Decision making",
    outcome: "Map a feedback loop.",
    mission: "Build an intervention brief.",
  };
  const identity = courseBannerFingerprintMaterial(base, 0);

  expect(courseBannerFingerprintMaterial({ ...base, outcome: "Compare two feedback loops." }, 0)).not.toBe(identity);
  expect(courseBannerFingerprintMaterial({ ...base, mission: "Build a diagnostic memo." }, 0)).not.toBe(identity);
  expect(courseBannerFingerprintMaterial({ ...base }, 1)).not.toBe(identity);
  expect(courseBannerFingerprintMaterial({ ...base }, 0)).toBe(identity);
});
```

- [ ] **Step 2: Run the focused tests and prove red**

Run:

```powershell
npx.cmd playwright test tests/example.spec.ts --project=chromium --grep "course banners|banner identity"
```

Expected: FAIL because style version is still 4, `CourseBannerPromptInput` lacks outcome/mission, and `courseBannerFingerprintMaterial` does not exist.

- [ ] **Step 3: Implement normalized semantic identity**

In `src/lib/course-banner-prompt.ts`, extend the interface and add the pure identity helper:

```ts
export const COURSE_BANNER_STYLE_VERSION = 5;

export interface CourseBannerPromptInput {
  topic: string;
  category?: string;
  outcome?: string;
  mission?: string;
}

export function courseBannerFingerprintMaterial(
  input: CourseBannerPromptInput,
  variant: 0 | 1,
) {
  return [
    COURSE_BANNER_STYLE_VERSION,
    variant,
    normalized(input.topic).toLowerCase(),
    normalized(input.category).toLowerCase(),
    normalized(input.outcome).toLowerCase(),
    normalized(input.mission).toLowerCase(),
  ].join("|");
}
```

Rewrite `buildCourseBannerPrompt` so it includes the normalized outcome and mission, instructs the model to choose exactly one recognizable subject anchor and one relationship motif, preserves the v4 paper/palette/crop grammar, and explicitly rejects literal scenes, disconnected abstraction, text, arrows, and object collections.

In `src/lib/course-banners.ts`, replace the inline fingerprint array:

```ts
const fingerprint = await sha256(courseBannerFingerprintMaterial(input, input.variant ?? 0));
```

- [ ] **Step 4: Run the focused tests and prove green**

Run the Step 2 command again.

Expected: both banner tests PASS and the existing deterministic artwork tests remain green.

- [ ] **Step 5: Commit the banner unit**

```powershell
git add -- src/lib/course-banner-prompt.ts src/lib/course-banners.ts tests/example.spec.ts
git commit -m "feat: add semantic course banner style"
```

---

### Task 2: Move flagship selection to validated runtime configuration

**Files:**
- Modify: `tests/marketing-gauntlet.spec.ts`
- Modify: `src/lib/marketing-merchandising.ts`
- Modify: `src/app/api/courses/route.ts`
- Modify: `src/components/marketing/PublicCourseProof.tsx`
- Modify: `src/lib/runtime-config.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: server-only `LANDING_FEATURED_COURSE_ID` and public `Course[]`
- Produces: `configuredFlagshipCourseId(courses, preferredCourseId): string | undefined` and API payload `{ courses: Course[]; featuredCourseId?: string }`

- [ ] **Step 1: Write failing unit and browser tests**

In `tests/marketing-gauntlet.spec.ts`, import `configuredFlagshipCourseId` and add:

```ts
test("exposes a configured flagship only when that exact course is publicly eligible", () => {
  const alpha = marketingCourse("alpha-course", "Calculus exam preparation");
  const configured = marketingCourse("configured-course", "Urban sketching");
  const privateCourse = marketingCourse("private-course", "Private study", { isPublic: false });

  expect(configuredFlagshipCourseId([alpha, configured], "configured-course")).toBe("configured-course");
  expect(configuredFlagshipCourseId([alpha, privateCourse], "private-course")).toBeUndefined();
  expect(configuredFlagshipCourseId([alpha], "missing-course")).toBeUndefined();
  expect(configuredFlagshipCourseId([alpha], undefined)).toBeUndefined();
});
```

Update the landing route fixture to return a deliberately non-first flagship:

```ts
await page.route("**/api/courses?scope=public", (route) => route.fulfill({
  json: { courses: [work, project, alpha], featuredCourseId: "project-course" },
}));
await page.goto("/");
await expect(page.getByRole("link", { name: /Inspect course outline/ }))
  .toHaveAttribute("href", /id=project-course/);
```

Add a second assertion with `featuredCourseId: "missing-course"` and reversed courses; expect stable fallback `alpha-course`.

- [ ] **Step 2: Run the focused tests and prove red**

```powershell
npx.cmd playwright test tests/marketing-gauntlet.spec.ts --project=chromium --grep "configured flagship|flagship selection"
```

Expected: FAIL because the helper and API-driven client field do not exist.

- [ ] **Step 3: Implement the server validation helper**

In `src/lib/marketing-merchandising.ts`, preserve `selectFlagshipCourse` and add:

```ts
export function configuredFlagshipCourseId(courses: Course[], preferredCourseId?: string) {
  if (!preferredCourseId) return undefined;
  const preferred = courses.find((course) => (
    courseId(course) === preferredCourseId && isPublicOutcomeCourse(course)
  ));
  return preferred ? courseId(preferred) : undefined;
}
```

- [ ] **Step 4: Return the validated runtime value without reordering**

In `src/app/api/courses/route.ts`, convert releases to DTOs once, validate `serverEnvironment.LANDING_FEATURED_COURSE_ID?.trim()`, and return:

```ts
const publicCourses = releaseCourses
  .filter((course): course is NonNullable<typeof course> => Boolean(course))
  .map((course) => toCourseDto(course));
const featuredCourseId = configuredFlagshipCourseId(
  publicCourses,
  serverEnvironment.LANDING_FEATURED_COURSE_ID?.trim(),
);
return NextResponse.json(
  { courses: publicCourses, ...(featuredCourseId ? { featuredCourseId } : {}) },
  { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600" } },
);
```

Do not sort `publicCourses` in the API.

- [ ] **Step 5: Consume the API field in the client**

In `PublicCourseProof`, add `featuredCourseId` state, parse it from the response, and call:

```ts
const course = useMemo(
  () => selectFlagshipCourse(courses, featuredCourseId),
  [courses, featuredCourseId],
);
```

Remove `process.env.NEXT_PUBLIC_MARKETING_FLAGSHIP_COURSE_ID` from client code.

- [ ] **Step 6: Inventory the optional runtime setting**

Add `LANDING_FEATURED_COURSE_ID=` to `.env.example` and include the name in `src/lib/runtime-config.ts` without making it a release-check requirement. It remains empty until the ten-course scoring decision is complete.

- [ ] **Step 7: Run focused tests and prove green**

Run the Step 2 command, then:

```powershell
npx.cmd playwright test tests/landing-motion.spec.ts --project=chromium
```

Expected: configured selection, invalid fallback, and existing landing motion tests PASS.

- [ ] **Step 8: Commit the runtime-selection unit**

```powershell
git add -- .env.example src/lib/runtime-config.ts src/lib/marketing-merchandising.ts src/app/api/courses/route.ts src/components/marketing/PublicCourseProof.tsx tests/marketing-gauntlet.spec.ts
git commit -m "feat: select landing flagship at runtime"
```

---

### Task 3: Verify the complete local candidate

**Files:**
- Inspect: all files changed in Tasks 1–2
- Inspect: `docs/superpowers/specs/2026-08-17-flagship-course-hybrid-banner-release-design.md`
- Inspect: `.env.example`

**Interfaces:**
- Consumes: both implementation commits
- Produces: a clean, exact release candidate with fresh test evidence

- [ ] **Step 1: Run focused regression coverage**

```powershell
npx.cmd playwright test tests/example.spec.ts tests/marketing-gauntlet.spec.ts tests/landing-motion.spec.ts --project=chromium
```

Expected: zero failures.

- [ ] **Step 2: Run type and lint gates**

```powershell
npx.cmd tsc --noEmit
npm.cmd run lint
```

Expected: both exit 0 with no warnings.

- [ ] **Step 3: Run production build and contract suites**

```powershell
npm.cmd run build
npm.cmd run test:contracts
npm.cmd run test:api
```

Expected: build and both suites exit 0.

- [ ] **Step 4: Run release and dependency safety checks**

```powershell
npm.cmd audit --omit=dev
npm.cmd run check:release-safety -- http://127.0.0.1:3000
git diff --check origin/main...HEAD
git status --short --branch
```

Start the built server on port 3200 with `npm.cmd run start -- -p 3200`, wait until `http://127.0.0.1:3200/api/health` responds, run the safety command against that origin, and stop only the exact server session afterward. Expected: no production dependency vulnerability, no diff errors, and only intentional committed files.

- [ ] **Step 5: Review the candidate against every software acceptance item**

Confirm style version 5, all four semantic inputs, fingerprint identity, no regeneration route, runtime server configuration, stable fallback, public-only configured selection, billing lock, and unchanged library ordering.

---

### Task 4: Publish, deploy, and prove production before course creation

**Files:**
- Inspect: `.github/workflows/azure-qa.yml`
- Inspect: `.github/workflows/azure-staging.yml`
- Inspect: `.github/workflows/azure-promote-staging.yml`
- Inspect: `docs/PRODUCTION_OPERATIONS.md`
- Inspect: `docs/AZURE_MIGRATION_RUNBOOK.md`

**Interfaces:**
- Consumes: clean verified candidate from Task 3
- Produces: `origin/main` and live production at one exact full SHA, with billing disabled

- [ ] **Step 1: Publish the exact candidate to main**

Fetch first, verify `origin/main` has not advanced incompatibly, and integrate only the two reviewed commits with a fast-forward or a clean cherry-pick in the dedicated main worktree. Push `main`, fetch again, and require:

```powershell
$releaseSha = (git rev-parse HEAD).Trim()
$originSha = (git rev-parse origin/main).Trim()
$remoteSha = ((git ls-remote origin refs/heads/main) -split "`t")[0]
if ($releaseSha -ne $originSha -or $releaseSha -ne $remoteSha) { throw "Release SHA mismatch." }
```

Expected: all three full SHAs match.

- [ ] **Step 2: Deploy the exact SHA to isolated QA**

```powershell
gh workflow run azure-qa.yml --ref main
```

Wait for the dispatched run, inspect its conclusion and logs, and run:

```powershell
npm.cmd run check:production -- https://qa.filosage.com $releaseSha https://qa.filosage.com
```

Expected: QA health, origin, configuration, and datastore checks pass at the exact SHA.

- [ ] **Step 3: Prove that deployment has not mutated course data**

Do not create QA or production courses in this task. Capture the production public course IDs immediately before QA dispatch and again after promotion:

```powershell
$beforeCourses = @((Invoke-RestMethod 'https://filosage.com/api/courses?scope=public').courses.id) | Sort-Object
```

The post-promotion list must equal `$beforeCourses`. Exact-SHA QA health plus the committed tests prove code identity; the previously approved built-in image prototype remains the visual design reference until the first private flagship course is created after production promotion.

- [ ] **Step 4: Select the inactive production slot**

Read the current blue/green traffic weights from the latest successful promotion run and its logs:

```powershell
$promotionRun = (gh run list --workflow azure-promote-staging.yml --limit 1 --json databaseId,conclusion | ConvertFrom-Json)[0]
if ($promotionRun.conclusion -ne 'success') { throw "The latest promotion run is not successful." }
gh run view $promotionRun.databaseId --log
```

Set `$inactiveSlot` to `blue` or `green` only after the log proves that label has 0% traffic. Refuse to continue if the evidence is ambiguous; both staging and promotion workflows independently reject an active target.

- [ ] **Step 5: Stage the QA-approved digest**

```powershell
gh workflow run azure-staging.yml --ref main -f target_slot=$inactiveSlot -f expected_sha=$releaseSha
```

Wait for success and independently run `check:production` against the revision URL emitted by the workflow. Expected: exact SHA, canonical production origin, safety policy, and 0% public traffic.

- [ ] **Step 6: Promote the verified slot**

```powershell
gh workflow run azure-promote-staging.yml --ref main -f target_slot=$inactiveSlot -f expected_sha=$releaseSha
```

Wait for success. The former production revision remains at 0% as rollback.

- [ ] **Step 7: Verify production independently**

```powershell
npm.cmd run check:production -- https://filosage.com $releaseSha https://filosage.com
npm.cmd run check:release-safety -- https://filosage.com
$afterCourses = @((Invoke-RestMethod 'https://filosage.com/api/courses?scope=public').courses.id) | Sort-Object
if (Compare-Object $beforeCourses $afterCourses) { throw "Course catalog changed during code deployment." }
```

Also verify `https://www.filosage.com/` redirects permanently to the apex, `/api/courses?scope=public` remains private-content safe, and `BILLING_ENABLED=false` is reported by the release-safety contract. Record workflow URLs, slot labels, exact SHA, and rollback revision in Multica.

- [ ] **Step 8: Open the course-creation gate**

Only after Step 7 passes, comment in Multica that production is at the verified style-v5 SHA and that private flagship course creation may begin. If any check fails, keep course creation blocked and either repair forward through this plan or promote the previous verified slot.
