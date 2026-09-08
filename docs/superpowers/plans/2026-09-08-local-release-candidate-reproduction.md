# Local Release Candidate Reproduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproduce and independently review the exact September release candidate on Victor's Intel Mac, correct only confirmed defects with test-first evidence, and reconcile the release evidence without changing external systems.

**Architecture:** Preserve `8b4c8c271243de249ea4a6d5303f6a66186ab4f1` as the immutable review baseline in an isolated worktree. Establish a Node 22 toolchain from the lockfile, execute the local release gates, review the complete `origin/main...HEAD` range by risk domain, and route every confirmed defect through a separate red-green fix before updating release evidence.

**Tech Stack:** macOS 15.7.9 Intel x86_64, Homebrew, Node.js 22, npm lockfile, Next.js 16.2.12, TypeScript, Oxlint, ESLint, Playwright, Git, GitHub CLI.

**Spec:** `docs/releases/2026-09-release-contract.md` and `docs/releases/2026-09-blue-green-bff-contract.md`

## Global Constraints

- The immutable baseline is commit `8b4c8c271243de249ea4a6d5303f6a66186ab4f1`, tree `741b9743a636d79b977ced27413e4e3aafeb18b8`.
- Preserve the one-Azure-Container-App, one-image, same-origin BFF, blue/green revision architecture.
- Use Node 22 and install JavaScript dependencies only with `npm ci` from `package-lock.json`.
- Before changing any Next.js code, read the relevant installed guide under `node_modules/next/dist/docs/` and record the guide path in the task report.
- Every product-code defect requires a failing behavioral regression test before its fix and a passing focused test afterward.
- Do not weaken assertions, skip gates, use `--pass-with-no-tests`, or convert hosted/provider evidence into a local pass.
- Do not commit `FiloSage-Release-Agent-Handoff.md`; it remains contextual input in the primary checkout.
- Do not push, change GitHub settings, enable paid security, authenticate or modify Azure, deploy, merge, activate billing, send alerts, mutate providers, or claim production verification in this plan.
- Preserve user work and unrelated files. Commit only plan-owned files and confirmed fixes.

---

### Task 1: Establish the Node 22 local runtime

**Files:**
- Create outside Git: Homebrew `node@22` installation and worktree `node_modules/`
- Modify in Git: none

**Interfaces:**
- Consumes: Intel macOS with Homebrew at `/usr/local/bin/brew` and `package-lock.json`.
- Produces: `/usr/local/opt/node@22/bin/node`, `/usr/local/opt/node@22/bin/npm`, and a lockfile-exact `node_modules/` used by every later task.

- [ ] **Step 1: Install the versioned Node 22 formula**

```bash
/usr/local/bin/brew install node@22
```

Expected: Homebrew installs the available Node 22 release without linking an unversioned Node into the repository.

- [ ] **Step 2: Verify the selected runtime explicitly**

```bash
export PATH="/usr/local/opt/node@22/bin:$PATH"
node --version
npm --version
node -p 'process.platform + " " + process.arch + " node " + process.versions.node'
```

Expected: `node --version` starts with `v22.` and the platform line contains `darwin x64`.

- [ ] **Step 3: Install dependencies from the lockfile**

```bash
export PATH="/usr/local/opt/node@22/bin:$PATH"
npm ci
```

Expected: installation exits zero and does not modify `package.json` or `package-lock.json`.

- [ ] **Step 4: Verify dependency and Git state**

```bash
export PATH="/usr/local/opt/node@22/bin:$PATH"
npm ls --depth=0
git status --short --branch
```

Expected: the dependency tree resolves; the only Git change is this plan file until later plan-owned work begins.

---

### Task 2: Reproduce the exact candidate locally

**Files:**
- Create outside Git: `.next/`, `test-results/`, `playwright-report/`, and Playwright browser caches
- Modify in Git: none unless a command exposes a confirmed defect routed to Task 4

**Interfaces:**
- Consumes: Task 1 Node 22 runtime, exact candidate source, Azure CLI 2.90.0 already installed locally.
- Produces: command-by-command local evidence with exit status, test counts, skips/retries, and explicit environmental limitations.

- [ ] **Step 1: Reconfirm immutable candidate identity**

```bash
git fetch --prune origin
test "$(git rev-parse HEAD)" = "8b4c8c271243de249ea4a6d5303f6a66186ab4f1"
test "$(git rev-parse 'HEAD^{tree}')" = "741b9743a636d79b977ced27413e4e3aafeb18b8"
test "$(git rev-parse origin/codex/release-implementation-20260906)" = "8b4c8c271243de249ea4a6d5303f6a66186ab4f1"
```

Expected: all three identity checks exit zero.

- [ ] **Step 2: Run static, security, and release-contract gates**

```bash
export PATH="/usr/local/opt/node@22/bin:$PATH"
npm run check:secrets
npm run check:support-wiki
npx tsc --noEmit --incremental false
npm run lint
npm audit --omit=dev --audit-level=high
npm audit --audit-level=high
npm run test:contracts
git diff --check
```

Expected: each command's actual result is retained. An audit advisory is recorded as an audit finding; it is not silently rewritten into a source defect.

- [ ] **Step 3: Build the production candidate**

```bash
export PATH="/usr/local/opt/node@22/bin:$PATH"
npm run build
```

Expected: the production build exits zero and reports the generated routes. A local build does not establish hosted runtime identity.

- [ ] **Step 4: Install the browser engines used by CI**

```bash
export PATH="/usr/local/opt/node@22/bin:$PATH"
npx playwright install chromium webkit
```

Expected: Chromium and WebKit install successfully for this macOS user.

- [ ] **Step 5: Run the local API and browser lanes**

```bash
export PATH="/usr/local/opt/node@22/bin:$PATH"
npm run test:api
npm run test:browser:smoke
npm run test:browser
npm run test:command-center:v2
npm run test:command-center:v2:ui
npm run test:shared-evidence:ui
```

Expected: retain actual pass/fail/skip/retry counts for every lane. Browser failures are diagnosed from traces and reproduced with the narrowest owning command before any code change.

- [ ] **Step 6: Record the PostgreSQL limitation truthfully**

```bash
command -v psql || true
command -v docker || true
```

Expected: if neither tool is present, do not claim local PostgreSQL execution; retain the exact-SHA PostgreSQL 16 CI result as separate remote evidence.

---

### Task 3: Independently review the complete release diff

**Files:**
- Create outside Git: `.superpowers/sdd/2026-09-08-local-release-candidate-reproduction/` review briefs, packages, and reports
- Modify in Git: none

**Interfaces:**
- Consumes: the full `origin/main...8b4c8c2` diff, Tasks 1-2 evidence, release contracts, and R01-R26 evidence index.
- Produces: deduplicated findings with severity, file/line evidence, violated contract, reproduction command, and disposition.

- [ ] **Step 1: Create one complete review package**

```bash
mkdir -p .superpowers/sdd/2026-09-08-local-release-candidate-reproduction
git log --oneline --decorate origin/main..HEAD > .superpowers/sdd/2026-09-08-local-release-candidate-reproduction/full-diff-review.txt
git diff --stat origin/main...HEAD >> .superpowers/sdd/2026-09-08-local-release-candidate-reproduction/full-diff-review.txt
git diff -U10 origin/main...HEAD >> .superpowers/sdd/2026-09-08-local-release-candidate-reproduction/full-diff-review.txt
```

Expected: one review artifact contains the complete commit list, stat, and diff without modifying tracked files.

- [ ] **Step 2: Review three independent risk domains**

Review the same complete package with separate ownership for:

1. identity, privacy, support, billing, and request security;
2. generation, publication, durable storage, accounting, and recovery;
3. Azure/release workflows, operational alerts, browser behavior, and test integrity.

Each report must issue both a contract-compliance verdict and a code-quality verdict. Findings require exact file/line evidence and may not treat missing live evidence as a source-code bug.

- [ ] **Step 3: Reconcile and reproduce findings**

```bash
git status --short --branch
git diff --check
```

Expected: duplicate findings are merged, false positives are closed with evidence, and every remaining product-code finding has a narrow local reproduction command before Task 4 begins.

---

### Task 4: Correct confirmed defects with red-green evidence

**Files:**
- Modify: only files named by a reproduced Task 3 finding
- Test: the existing owning behavioral suite, extended with one minimal regression per confirmed defect

**Interfaces:**
- Consumes: one reproduced finding at a time from Task 3.
- Produces: a focused commit containing the failing regression, minimal fix, passing focused suite, and reviewer-approved diff.

- [ ] **Step 1: Establish a red test for one confirmed defect**

Use the owning suite and run the narrowest command that demonstrates the defect. The test must fail because the production behavior is wrong, not because of fixture setup, missing tools, or a source-text assertion.

- [ ] **Step 2: Read the relevant installed Next.js guide when the defect touches Next.js**

```bash
find node_modules/next/dist/docs -type f \( -name '*.md' -o -name '*.mdx' \) | sort
```

Expected: before editing, the implementer selects and reads the guide whose filename and headings cover the exact API named in the reproduced finding, records that guide path in the task brief, and follows its current API/deprecation guidance. If the finding does not touch Next.js, this step is recorded as not applicable.

- [ ] **Step 3: Implement the minimal production correction**

Write a finding-specific brief in this plan's SDD workspace containing the exact files, violated contract, desired behavior, red command, and expected failing assertion. Change only the behavior proven by that red test. Do not refactor unrelated modules or alter release thresholds.

- [ ] **Step 4: Verify green and run adjacent regression coverage**

Run the exact red command again, then the owning broader suite, TypeScript, lint for affected files, `git diff --check`, and `npm run check:secrets`.

- [ ] **Step 5: Independently review and commit the correction**

The reviewer must approve contract compliance and code quality. Commit only the finding's production and test files with a conventional message that describes the behavior corrected. Repeat Tasks 4.1-4.5 separately for each remaining confirmed finding.

---

### Task 5: Reconcile release evidence for the local continuation

**Files:**
- Modify: `docs/releases/2026-09-evidence-index.md`
- Create: `docs/releases/2026-09-08-local-candidate-reproduction.md`

**Interfaces:**
- Consumes: exact-SHA GitHub CI results, Tasks 1-4 local evidence, review reports, and any fix commits.
- Produces: a truthful current evidence index and a local reproduction report that keeps CI, local, deployment, and production states separate.

- [ ] **Step 1: Correct stale R01/R02 evidence statements**

Update the evidence index to record that commit `8b4c8c271243de249ea4a6d5303f6a66186ab4f1` was pushed and its engineering, PostgreSQL, browser smoke, full browser regression, and support workflows passed. Preserve CodeQL as failed because repository code scanning remains disabled.

- [ ] **Step 2: Write the local reproduction report**

Record the Intel macOS version, Node/npm versions, exact starting and ending SHA/tree, every command's exit result and counts, review scope/verdicts, confirmed fixes, and unresolved environmental/external gates. Explicitly state that Azure, GitHub settings, push, deployment, merge, billing, and production verification were not performed.

- [ ] **Step 3: Validate documentation and final repository state**

```bash
export PATH="/usr/local/opt/node@22/bin:$PATH"
npm run check:support-wiki
npm run check:secrets
git diff --check
git status --short --branch
```

Expected: checks exit zero and only plan-owned documentation plus independently approved defect fixes are present.

- [ ] **Step 4: Commit the evidence reconciliation**

```bash
git add docs/releases/2026-09-evidence-index.md docs/releases/2026-09-08-local-candidate-reproduction.md docs/superpowers/plans/2026-09-08-local-release-candidate-reproduction.md
git commit -m "docs: record local release candidate reproduction"
```

Expected: a local commit exists on `codex/release-local-verification-20260908`. Do not push it under this plan.

---

## Final Verification

- [ ] Re-read both release contracts and this plan's Global Constraints.
- [ ] Verify every Task 2 command has an actual recorded result or an explicit environmental blocker.
- [ ] Verify every Task 3 review domain has both required verdicts.
- [ ] Verify every Task 4 correction has observed red-green evidence and independent approval.
- [ ] Run the complete applicable Task 2 gate set against the ending local commit.
- [ ] Confirm the primary checkout still points to `8b4c8c2` and still preserves `FiloSage-Release-Agent-Handoff.md` untracked.
- [ ] Report local changes, commits, push, GitHub settings, Azure, deployment, merge, billing, and production-verification state separately.
