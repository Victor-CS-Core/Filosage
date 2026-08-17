# Filosage Consolidation Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the consolidated Filosage `main`, verify the compacted Playwright lanes, deploy the exact commit through the active Azure release path, and remove only obsolete Git branches and worktrees.

**Architecture:** Treat `C:\Users\vitic\Documents\Codex\2026-08-16\filosage-playwright-condense` as the isolated release worktree. Keep GitHub `origin/main` authoritative for published source, use the Azure staging workflow for an immutable candidate, and promote only the verified candidate to production. The retired OpenAI Sites project remains a private rollback artifact and is not reactivated.

**Tech Stack:** Git, GitHub Actions, Next.js 16.2.12, TypeScript, Playwright 1.61.1, Azure Container Apps, Multica.

## Global Constraints

- Keep `BILLING_ENABLED=false` and verify it after deployment.
- Preserve the mixed primary checkout and all unrelated uncommitted files.
- Do not restore the retired `.openai/hosting.json` or Sites runtime.
- Deploy only a clean commit that equals both local `main` and `origin/main`.
- Delete only clean worktrees whose branch is merged or demonstrably superseded.

---

### Task 1: Classify the integration state

**Files:**
- Inspect: Git refs and worktrees only
- Modify: none

**Interfaces:**
- Consumes: local `main` at `952e3a64a5f3378cd2131c6a2f27a2e910e143e5`
- Produces: a branch classification and immutable release candidate

- [ ] **Step 1: Refresh origin without pruning**

Run: `git fetch origin`

Expected: exit 0 with no tracked-file changes.

- [ ] **Step 2: Prove origin is an ancestor of local main**

Run: `git merge-base --is-ancestor origin/main main` and `git rev-list --left-right --count origin/main...main`

Expected: ancestry exit 0 and `0 29` before release-only commits.

- [ ] **Step 3: Classify every local branch**

Run: `git branch --merged main` and `git branch --no-merged main`.

Expected: only `agent/membership-gauntlet-release` remains outside `main`; its adapted successor `agent/membership-gauntlet-integrated` is already an ancestor.

- [ ] **Step 4: Verify the supersession claim**

Compare `agent/membership-gauntlet-release`, `agent/membership-gauntlet-integrated`, and their merge bases. Confirm the integrated branch contains the rollover-credit and Pro-evidence behavior plus the later flashcard coexistence work before marking the release branch obsolete.

### Task 2: Reproduce and close the release gate

**Files:**
- Modify only if a fresh failure proves a root cause in the consolidated tree
- Test: `tests/**/*.spec.ts`
- Test configuration: `playwright*.config.ts`, `scripts/playwright-*.{mjs,ts}`

**Interfaces:**
- Consumes: clean consolidated `main`
- Produces: release evidence with no unresolved test, lint, type, or build failure

- [ ] **Step 1: Verify compacted discovery**

Run: `npx.cmd playwright test --list`

Expected: `512 tests in 21 files`; manifest contracts still own all 49 spec files exactly once.

- [ ] **Step 2: Run static and contract gates**

Run: `npm.cmd run lint`, `npx.cmd tsc --noEmit --incremental false`, `npm.cmd run test:contracts`, and `npm.cmd run check:support-wiki`.

Expected: every command exits 0.

- [ ] **Step 3: Run API and browser gates**

Run: `npm.cmd run test:api`, `npm.cmd run test:browser`, `npm.cmd run test:command-center:v2`, `npm.cmd run test:command-center:v2:ui`, and `npm.cmd run test:shared-evidence:ui`.

Expected: zero unexpected failures; documented skips remain skips.

- [ ] **Step 4: Diagnose any failure before editing**

Capture the complete failing test, reproduce it alone, compare the consolidated implementation with the last working pattern, state one root-cause hypothesis, then make the smallest test-backed correction.

- [ ] **Step 5: Build the application**

Run: `npm.cmd run build`.

Expected: production build exits 0.

### Task 3: Publish the exact source

**Files:**
- Commit: any verified correction plus these plans and the persisted Filosage command-center policy

**Interfaces:**
- Consumes: verified clean release tree
- Produces: `origin/main` at the exact release SHA

- [ ] **Step 1: Check the complete staged diff**

Run: `git diff --check`, `git status --short`, and `git diff --cached --stat`.

Expected: no whitespace errors and no unrelated artifacts.

- [ ] **Step 2: Commit release-only changes**

Create one bounded `[verified]` commit containing only release-plan, policy, and root-cause fixes made in this run.

- [ ] **Step 3: Fast-forward publish**

Run: `git push origin main`.

Expected: `git rev-parse HEAD` equals `git rev-parse origin/main`.

### Task 4: Deploy and promote through Azure

**Files:**
- Inspect: `.github/workflows/azure-staging.yml`
- Inspect: `.github/workflows/azure-promote-staging.yml`
- Inspect: `docs/AZURE_MIGRATION_RUNBOOK.md`

**Interfaces:**
- Consumes: exact pushed SHA
- Produces: verified staging candidate and production traffic at that SHA

- [ ] **Step 1: Select the inactive slot**

Read current workflow/environment state and choose the zero-traffic Azure slot. Never overwrite the slot carrying production traffic.

- [ ] **Step 2: Dispatch staging for the exact SHA**

Run the repository's `azure-staging.yml` workflow with the pushed SHA and selected inactive slot.

Expected: workflow succeeds and the candidate health endpoint reports the same 40-character SHA with billing disabled.

- [ ] **Step 3: Run deployed acceptance**

Read the selected revision URL from the completed staging workflow into `$candidateUrl`, resolve `git rev-parse HEAD` into `$releaseSha`, then run `npm.cmd run check:production -- $candidateUrl $releaseSha` plus the bounded external-server Playwright acceptance configured by the workflow/runbook.

Expected: exact SHA, healthy datastore, and no unexpected browser failures.

- [ ] **Step 4: Promote the verified slot**

Dispatch `azure-promote-staging.yml` for the verified slot and SHA.

Expected: promotion succeeds or automatically restores prior traffic weights.

- [ ] **Step 5: Verify production independently**

Resolve `git rev-parse HEAD` into `$releaseSha`, run `npm.cmd run check:production -- https://filosage.com $releaseSha`, and verify `BILLING_ENABLED=false`.

Expected: production reports the exact SHA and closed billing.

### Task 5: Clean obsolete Git state

**Files:**
- Remove: only verified clean Git worktrees
- Delete: only merged or superseded local branches and merged remote branches

**Interfaces:**
- Consumes: production-verified SHA and branch classification
- Produces: minimal branch/worktree inventory without losing unique work

- [ ] **Step 1: Recompute merged state after publication**

Run: `git branch --merged main`, `git branch --no-merged main`, and `git worktree list --porcelain`.

- [ ] **Step 2: Inspect every candidate worktree for changes**

Skip any worktree with tracked or untracked user data unless that data is proven generated and disposable.

- [ ] **Step 3: Remove clean obsolete worktrees, then branches**

Resolve each absolute target under the known Filosage worktree directories, remove the worktree with native Git, and delete its verified obsolete branch. Delete remote branches only after confirming they are merged into `origin/main`.

- [ ] **Step 4: Verify final repository topology**

Run: `git worktree list`, `git branch -vv`, and `git status --short --branch` in the surviving release worktree.

Expected: `main` clean and aligned with `origin/main`; dirty unrelated worktrees remain untouched and reported.
