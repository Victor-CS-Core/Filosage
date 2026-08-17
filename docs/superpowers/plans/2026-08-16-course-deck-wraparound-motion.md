# Course Deck Wraparound Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a seamless reverse Course Deck cycle in which the previous course enters from the left and every canonical card rotates one slot deeper.

**Architecture:** Keep the shared `dragX` MotionValue and canonical keyed card instances. During a previous-direction gesture, render one inert temporary wrap card for the previous course and derive every transform from normalized drag progress; remove the wrap when the canonical selected index resets.

**Tech Stack:** Next.js 16 client component, React 19, Motion 13, Playwright.

## Global Constraints

- Preserve the approved learner-home composition, full equal-size cards, native vertical scrolling, keyboard controls, and reduced-motion behavior.
- Add no dependency and perform no unrelated refactor.
- Keep the temporary wrap instance inaccessible and noninteractive.
- Do not commit, push, or deploy as part of this local feedback loop.

---

### Task 1: Specify the reverse circular trajectory

**Files:**
- Modify: `tests/app-shell.spec.ts:472-760`

**Interfaces:**
- Consumes: `.course-deck-card`, `data-course-id`, `data-position`, and `data-deck-instance` rendered by `CourseDeck`.
- Produces: browser assertions for canonical and wrap-card trajectories, layers, selection, and cleanup.

- [ ] **Step 1: Write the failing browser assertions**

Add a `data-deck-instance` field to `inspectPaintedPile`, then require the right-drag frame to contain one `wrap` Morse card left of the deck while canonical Decision, Systems, and Morse cards move toward slots one, two, and the clipped right exit. Require handoff layers `wrap=3`, `Decision=2`, `Systems=1`, and canonical `Morse=0`.

- [ ] **Step 2: Run the test and verify the existing implementation fails**

Run:

```powershell
npm.cmd run test:e2e -- tests/app-shell.spec.ts --project=chromium --grep "cycles the held card through the pile" --workers=1
```

Expected: FAIL because no `data-deck-instance="wrap"` course card exists.

### Task 2: Implement and verify the wraparound deck cycle

**Files:**
- Modify: `src/components/CourseDeck.tsx:34-330`
- Verify: `tests/app-shell.spec.ts:472-760`

**Interfaces:**
- Consumes: `dragX`, `DeckGeometry`, `CycleDirection`, the previous canonical item, and the existing commit/reset lifecycle.
- Produces: `CourseDeckCard` support for `wrapPrevious: boolean` and `data-deck-instance="canonical" | "wrap"`.

- [ ] **Step 1: Add the minimal wrap-card motion role**

Extend `CourseDeckCardProps` with `wrapPrevious?: boolean`. For the wrap role, interpolate from `x=-geometry.travel`, `y=geometry.stepY * 0.85`, and negative rotation into the front slot. Keep it inert and assign z-index `3` only after the reverse handoff.

- [ ] **Step 2: Rotate canonical cards one slot deeper during a right drag**

Map canonical active `0 -> 1`, position `1 -> 2`, and position `2 -> 3`; conceal the exiting position-two card by handoff. Keep forward motion unchanged.

- [ ] **Step 3: Render and clean up the temporary wrap instance**

Render the previous course with a distinct React key only while `direction === "previous"` and motion is not idle. Let the existing settle/commit/reset sequence reverse or remove it.

- [ ] **Step 4: Run the focused cross-browser test**

Run:

```powershell
npm.cmd run test:e2e -- tests/app-shell.spec.ts --grep "cycles the held card through the pile" --workers=1
```

Expected: 3 passed across Chromium, mobile Chromium, and mobile WebKit.

### Task 3: Add capped inertial spin

**Files:**
- Modify: `tests/app-shell.spec.ts:472-790`
- Modify: `src/components/CourseDeck.tsx:420-610`

**Interfaces:**
- Consumes: release offset, release velocity, `geometry.travel`, and `items.length`.
- Produces: a one-to-three-cycle queue capped at `items.length - 1`, with no idle frame between visible cycles.

- [ ] **Step 1: Write a failing high-velocity flick assertion**

From the first course in the three-course fixture, dispatch a short, fast right drag and require the deck to settle on course two after traversing two previous positions. The current single-cycle implementation must settle on course three and fail this assertion.

- [ ] **Step 2: Project velocity into a bounded cycle count**

Use `Math.ceil((abs(offset) + abs(velocity) * 0.22) / travel)`, clamped to `1..min(3, items.length - 1)` after the existing commit threshold passes.

- [ ] **Step 3: Run queued cycles without an idle seam**

Store remaining cycles, direction, velocity, and sequence in a ref. After each canonical index reset, jump `dragX` to zero before paint, decay velocity, and start the next cycle; enter `idle` only when the queue is empty.

- [ ] **Step 4: Verify the inertial flick and ordinary drag paths**

Run the focused Chromium test, then the three-project focused matrix. Expected: the fast flick advances two positions while ordinary drags and controls remain single-step.

- [ ] **Step 5: Run static and design gates**

Run:

```powershell
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
node .agents/skills/impeccable/scripts/detect.mjs src/components/CourseDeck.tsx
git diff --check -- src/components/CourseDeck.tsx tests/app-shell.spec.ts
```

Expected: all commands exit `0` with no detector findings or whitespace errors.
