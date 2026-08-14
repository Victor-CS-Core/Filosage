# Filosage Course Deck visual overhaul — Gauntlet plan

**Date:** 2026-08-13
**Baseline SHA:** `4de275a3e4cabf39652542231f7b46e3e237fd79`
**Approved visual:** B2 “Course Deck” (`exec-7042c5e8-4001-4fe6-ba9c-6fc0962cf965.png`)
**Independent finish review:** SHIP (2026-08-14)
**Release boundary:** local implementation and validation only; no production deployment, provider mutation, course deletion, banner regeneration campaign, or billing activation.

## Objective

Turn the approved B2 concept into a coherent Filosage product system:

- the learner home is organized around a tactile deck of started, unfinished courses;
- learners can cycle the equal-dimension horizontal deck with horizontal drag/swipe, keyboard, or explicit controls while vertical drag remains a no-op;
- the selected course exposes one clear continuation action and honest progress;
- course covers use one deterministic geometric fallback system and one matching generated-banner art direction;
- the library and course map inherit the same authored cover, card, type, color, and motion grammar without turning every surface into a dashboard;
- the B2 material language extends across the complete application: public pages, learning, creation, review, progress, pricing, support, profile, legal, and owner tools use the same midnight book-board, warm paper stock, editorial hierarchy, physical edge depth, and restrained motion;
- the Command Center contains stable destinations and actions, not an unbounded list of courses or lessons;
- Command Center icons use semantic colors from the Filosage palette while labels and behavior remain familiar;
- all motion has keyboard, touch, pointer, screen-reader, and reduced-motion alternatives.

## Product truth and data rules

1. The home deck is derived from stored learner progress, not recommendations or invented activity.
2. A course is active while it has a next lesson or its capstone is not passed. Passed courses do not occupy the active deck.
3. Progress is `completed lessons / known total lessons`, clamped to `0–100`; unknown totals remain explicit.
4. Course metadata may enrich a progress card when the course is still available, but progress remains usable when the public/private course record cannot be resolved.
5. Generated and fallback cover art is decorative. Course titles and state remain semantic HTML, never rasterized into the image.
6. Existing banner assets are preserved. A style-version bump applies to future generation or an explicit regeneration request; it does not silently replace or delete stored assets.
7. “My courses” remains the single Command Center gateway. It unfolds from the top-right profile/Command Center as a bounded non-modal floating shelf above 900px, converts to a scroll-locking modal bottom sheet at 900px and below, and changes presentation live when an open viewport crosses that breakpoint. Dynamic course and lesson results are removed from the top Command Center.
8. The Filosage logo retains the original brand asset without a raised tile, paper wrapper, added texture, or redraw; the surrounding app shell carries the material treatment.

## Acceptance requirements

### Home deck

- **DECK-001:** Zero active courses renders one intentional create/explore state and no zero-value metric grid.
- **DECK-002:** One active course renders without misleading stacked cards or disabled carousel controls.
- **DECK-003:** Two or more active courses cycle deterministically through horizontal pointer drag, horizontal touch swipe, Arrow Left/Right, Home/End, and labeled previous/next buttons.
- **DECK-004:** Vertical drag is a no-op, horizontal dragging never activates a course link accidentally, and vertical page scrolling remains available on touch devices.
- **DECK-005:** The selected card is the only course card in the tab order; hidden cards are not announced as current content.
- **DECK-006:** Course count, selected position, title, next lesson, lesson count, time, and progress are exposed semantically.
- **DECK-007:** `prefers-reduced-motion` removes rotation, parallax, and animated rearrangement without removing navigation.
- **DECK-008:** The deck has no horizontal viewport overflow at desktop, tablet, or phone widths.

### Visual system

- **VIS-001:** A reusable deterministic `CourseArtwork` component produces high-DPI SVG/vector, topic-seeded geometric compositions in the navy, teal, coral, cream, and slate palette.
- **VIS-002:** Home, library cards, course switcher, and course-map hero share cover geometry, matte surface treatment, border language, and progress styling.
- **VIS-003:** Cards remain a hierarchy and navigation device. With 3+ courses, at least three equal-width, equal-height cards remain visible in a horizontal stack: active left at z3, center at z2, and right at z1. Offsets reveal right edges without progressively smaller spines, the same logic holds on mobile without page overflow, and cycling moves the stack front to back.
- **VIS-004:** Light and dark themes preserve WCAG 2.2 AA contrast and the selected visual identity.
- **VIS-005:** Generated course-banner prompts specify the approved abstract orbital/diagrammatic composition, tactile matte editorial material, text ban, crop safety, and thumbnail clarity.
- **VIS-006:** Existing generated banners, missing banners, failed images, and deterministic fallbacks all preserve stable layout dimensions.
- **VIS-007:** Motion communicates selection, depth, and progress only; hover effects do not move layout or conceal controls.
- **VIS-008:** The richer high-DPI SVG paper-fiber token and physical material treatment span both themes and the shared course/library cards, drawers, Command Center/Support, dashboard signals, lesson/study panels, progress, and pricing; course cards add an extra subtle SVG grain while lesson prose remains clean, content-first, and AA legible.
- **VIS-009:** Above 900px, courses open from the top-right profile/Command Center in a compact non-modal floating shelf that leaves the page visible, interactive, and scrollable. At 900px and below, the same surface is a modal bottom sheet with root/body scroll lock. An open surface converts live across the breakpoint, acquiring or releasing the lock without closing. Both modes present tactile paper slips and remove lift or directional motion under reduced motion.
- **VIS-010:** Desktop and mobile route checks cover home, library, course, lesson, create, review, progress, pricing, support, profile, standard, evidence, legal, and owner surfaces through shared-system adoption plus representative renders.
- **VIS-011:** Above 900px, the Support Center uses the same floating paper system as **My courses**, visibly unfolding from and reversing into the bottom-right Spark; fragments are decorative, the final sheet is opaque above page content, and reduced motion removes the morph and fragments entirely. At 900px and below it becomes a modal bottom sheet, with the same live viewport conversion and scroll-lock handoff. Reuse is limited to surfaces with a real physical trigger origin, such as contextual-help or generated-note previews.
- **VIS-012:** All floating paper surfaces share the same 220ms unfold and 140ms reverse-crumple contract, easing, and fragment language; only the physical origin changes to match the trigger. Tablet and mobile retain modal bottom-sheet behavior.
- **VIS-013:** My courses, Support, Study tools, and Ask Filosage are bounded draggable windows above 900px with pointer and keyboard movement, a visible grip, a Home reset, and no page scroll lock. Their tablet/mobile forms remain fixed modal sheets without a draggable affordance.

### Command Center

- **CMD-001:** The Command Center contains no dynamic course or lesson result sections, regardless of the number of owned courses.
- **CMD-002:** “My courses” opens from the top-right profile/Command Center as the searchable non-modal shelf above 900px or modal bottom sheet at 900px and below, preserving course access, Escape/outside close, focus behavior, and correct live viewport-crossing scroll-lock acquisition/release.
- **CMD-003:** Search placeholder and empty-state copy no longer promise course-title search inside the top Command Center.
- **CMD-004:** Every command icon has one semantic palette tone; text contrast and selected-row contrast remain accessible in both themes.
- **CMD-005:** Keyboard navigation, escape, backdrop close, focus restoration, scroll containment, and theme toggle behavior remain intact.

### Release and safety

- **REL-001:** `BILLING_ENABLED=false` behavior is unchanged.
- **REL-002:** No course, progress, source, banner, or account data is deleted or migrated.
- **REL-003:** Lint, TypeScript, focused Playwright, full Playwright, and production build pass.
- **REL-004:** Desktop and mobile visual inspection covers empty, one-course, many-course, light, dark, and reduced-motion states.
- **REL-005:** The validated scope is staged explicitly; unrelated `.impeccable` artifacts remain unbundled unless named in the final scope.

## Gauntlet loop

Every pass follows the repository’s bounded loop:

1. Inspect current source, contracts, runtime behavior, and retained evidence.
2. Define the pass’s exact change, failure modes, tests, non-goals, rollback, and acceptance IDs.
3. Implement only that pass while preserving data, billing, and unrelated work.
4. Exercise deterministic happy paths.
5. Attack empty/one/many-course states, stale or missing metadata, malformed progress, drag cancellation, accidental activation, keyboard/touch failure, reduced motion, slow images, theme contrast, and responsive overflow.
6. Review architecture, privacy/security, content/image safety, billing/operations, UX/accessibility, and regression/release provenance.
7. Fix every P0/P1 and every contract-breaking P2.
8. Rerun affected gates until two consecutive review rounds find no new release blocker.
9. Save commands, results, screenshots, reviewer decisions, limitations, and rollback evidence.
10. Stop at the local gate. Completion never implies deployment or feature activation.

## Implementation passes

### Pass 0 — freeze the contract

- Record the baseline SHA and mixed-tree boundary.
- Persist this plan and the selected B2 reference.
- Inspect installed Next.js 16.2.12 guidance for client boundaries, CSS, images, and accessibility.
- Map the current home, AppShell, Command Center, course banner, library, course-map, theme, and test surfaces.

**Gate:** scope is traceable to acceptance IDs; no product code changed.
**Rollback:** remove only this plan and copied reference.

### Pass 1 — reusable artwork and deck primitives

- Build deterministic `CourseArtwork` and shared course-card metadata helpers.
- Build an accessible `CourseDeck` client component with controlled selection and a horizontal-only, equal-dimension three-card stack. Use pointer capture for direct manipulation and transform-only release choreography so the front card can cycle behind the pile instead of moving a conventional carousel rail.
- Add unit/Playwright coverage for zero, one, multiple, keyboard, drag, touch-safe, and reduced-motion states.

**Gate:** DECK-001–008 and VIS-001 pass in isolation.
**Rollback:** remove the new primitives; existing screens remain unchanged.

### Pass 2 — learner home replacement

- Replace Guided Day’s route diagram, evidence band, continue card, and redundant snapshot layout with the approved course deck.
- Keep honest weekly goal, next review, and streak signals as a restrained supporting row.
- Preserve the existing daily-mission routing and analytics where it still represents the selected course; remove customization UI that no longer serves the simplified home.

**Gate:** the first viewport matches B2’s hierarchy at desktop and remains task-first on mobile.
**Rollback:** restore the prior home composition while retaining reusable primitives.

### Pass 3 — platform-wide system propagation

- Apply the cover/card grammar to the published/private library, course switcher, and course-map hero.
- Promote oatmeal canvas, cream paper, midnight book-board, authored fiber, physical edge depth, and Source Serif 4 page titles into the shared token and surface system used by every primary route.
- Convert course switching into a theme-aware floating paper shelf above 900px and a modal paper bottom sheet at 900px and below, with a top-right profile/Command Center origin, tactile course slips, live viewport-crossing conversion and scroll-lock handoff, and a reduced-motion-safe group reveal.
- Convert Study tools and Ask Filosage from intrusive lesson side drawers into the same bounded, draggable floating paper window above 900px; retain bottom/full modal sheets on smaller viewports and preserve the existing lesson-tool workflows.
- Give My courses, Support, Study tools, and Ask Filosage a shared accessible drag contract: bounded pointer movement, Arrow/Shift+Arrow movement, Home reset, and no draggable affordance while modal.
- Preserve the original Filosage symbol and wordmark without adding a raised tile, grain, stock edge, or wrapper shadow.
- Keep lesson reading surfaces quiet and content-first; inherit the paper canvas, editorial title, rules, source cards, progress, and subtle motion without placing prose inside decorative cards.
- Apply the shared material contract to creation, review, progress, pricing, support, profile, privacy/legal, evidence, and owner/admin surfaces without changing their data or workflows.
- Preserve all URLs, authorization boundaries, filtering, bookmarking, publishing, and course actions.

**Gate:** VIS-002–004 and VIS-006–010 pass with no behavior regression.
**Rollback:** revert surface class/style adoption; shared primitives remain available.

### Pass 4 — Command Center simplification

- Remove dynamic current-course, lesson, and course results from `commandItems`.
- Keep the bounded “My courses” action and its top-right profile/Command Center origin, responsive presentation, and live scroll-lock handoff.
- Add semantic icon-tone metadata and palette-backed styling.
- Update copy and tests to the stable destination/action contract.

**Gate:** CMD-001–005 pass, including large owned-course fixtures.
**Rollback:** restore item construction and neutral icon styling.

### Pass 5 — generated art alignment

- Update the course-banner prompt to the approved B2 art grammar and increment its style version.
- Preserve the absolute text ban, safety identifier, storage budget, lease/idempotency, moderation, and deterministic fallback.
- Update prompt and banner tests without generating or replacing live course images.

**Gate:** VIS-005–006 and REL-002 pass.
**Rollback:** restore the prior prompt/style version; stored assets are untouched.

### Pass 6 — adversarial and visual Gauntlet

- Run lint and TypeScript.
- Run focused home, AppShell/Command Center, library, course-map, banner, navigation, accessibility, and release tests.
- Run the full Playwright suite and production build.
- Inspect signed-in desktop and mobile renders in light/dark and reduced-motion modes.
- Attack zero, one, many, missing-course, long-title, long-localized-copy, SVG/high-DPI rendering, image failure, horizontal drag-cancel, vertical-drag no-op, keyboard wrap, three-card mobile visibility, and horizontal-overflow states.
- Run two independent review rounds with no new release blocker.

**Gate:** REL-001–005 pass and evidence is recorded.
**Rollback:** use the baseline SHA as the code rollback target; no data rollback is required.

## Known non-goals

- No production or QA deployment in this goal unless the owner separately requests it after the local Gauntlet.
- No automatic regeneration of existing course banners.
- No billing activation, Stripe mutation, plan change, or commercial launch decision.
- No course deletion, progress migration, source/citation migration, or account mutation.
- No replacement of long-form lesson typography or established learning interactions merely to add cards.
- No dependency-heavy carousel, animation, or 3D library.

## Completion evidence â€” 2026-08-14

- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed on Next.js 16.2.12, including TypeScript and all 73 generated routes.
- `git diff --check`: passed; only existing Windows line-ending notices were emitted.
- `tests/app-shell.spec.ts`: 78/78 passed across desktop Chromium, mobile Chromium, and mobile WebKit.
- Real lesson-tool flow (`does not complete a lesson after a wrong answer`): 3/3 passed across the same projects, covering Study Tools and Ask Filosage as floating desktop windows and mobile modal sheets.
- Support Center suite: 25/27 passed in the broad run; the remaining two were stale mobile-tooltip expectations. After updating them to the intentional non-overlapping mobile contract, the affected test passed 3/3 across all projects.
- Axe checks for the course deck passed in light and dark themes and in the mobile stack fixture.
- Manual in-app-browser review passed for the learner home, My Courses, Support, Study Tools, Ask Filosage, and lesson page at desktop and 320px widths.
- Local carousel fixtures are available through `npm.cmd run seed:local-carousel`; no external AI generation is required.
- Billing remained disabled, and no commit, push, QA deployment, production deployment, or live course-image regeneration occurred.
