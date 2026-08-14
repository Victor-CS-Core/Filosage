# Learner home

## Scope

- Route: `src/app/page.tsx`
- Mode: Operate
- Audience: signed-in learner returning to make useful progress in a focused session
- Primary job: identify and begin the single best next learning action within seconds
- Fixed constraints: keep the existing Filosage identity and top navigation; derive active courses and momentum signals only from stored learner data; show one primary continuation and at most three supporting signals; preserve course, progress, and account truth when metadata is missing or a request fails

## Approved composition

- North star: `.impeccable/mocks/course-deck-b2-approved.png`
- First viewport: a Source Serif 4 welcome, truthful active-course count, and a navy-dominant editorial course cover whose selected card exposes the current lesson, progress, and one coral Continue action; weekly, review, and streak signals remain subordinate
- Memorable moment: unfinished courses form a tactile, bounded deck of geometric covers, turning stored progress into a direct choice without becoming a dashboard grid
- Zero / one / many: zero courses use one authored create/explore state; one course fills the hierarchy without a false stack or inert controls; with three or more courses, at least three equal-width, equal-height cards remain visible as active-left z3, center z2, and right z1 layers
- Do not literalize: the raster's sample titles, course count, metrics, generated artwork details, or decorative controls

## Implementation grammar

| Ingredient | Production medium | Commitment |
| --- | --- | --- |
| App navigation | Existing `AppShell` | Preserve destinations and behavior; keep the Command Center bounded to stable pages/actions and route course discovery through **My courses** from the top-right profile/Command Center origin. |
| Course identity | Shared `CourseBanner` | Propagate the same generated banner or deterministic fallback through the deck, library, course drawer, and course-map hero at stable crop dimensions. |
| Course artwork | `CourseArtwork` SVG geometry | High-DPI, topic-seeded vector screen-print compositions on navy, petrol, oatmeal, or brick paper stock with cream, teal, coral, and slate forms; decorative only, text-free, and never a substitute for semantic course content. |
| Active deck | Semantic articles plus CSS transforms | One selected card is current and tabbable. With 3+ courses, equal-dimension left, center, and right cards remain visible at z3, z2, and z1; horizontal offsets reveal right edges without shrinking width or height, and cycling moves the stack front to back. |
| Primary action | Semantic link | One coral Continue action bound to the selected course's real next lesson or course map. |
| Navigation alternatives | Pointer events, keyboard handlers, and labeled buttons | Horizontal drag/swipe, Arrow Left/Right, Home/End, and explicit previous/next controls reach the same front-to-back cycle. Vertical drag is a no-op and page scrolling remains available. |
| Course shelf | Responsive `AppDrawer` | Above 900px, **My courses** unfolds nonmodally from the top-right profile/Command Center and leaves page scrolling available. At 900px and below it is a modal bottom sheet with root/body scroll lock; an open shelf converts live and releases or acquires the lock as the viewport crosses the breakpoint. |
| Supporting signals | Three semantic links | Weekly goal, next review, and streak use real learner data and remain visually subordinate. |
| Loading / error | Structural skeleton and alert | Loading preserves the deck silhouette; request failure explains that data is intact and offers retry instead of presenting a false empty state. |
| Mobile | Responsive semantic flow | Heading/count, the same equal-dimension three-layer stack, explicit controls, then stacked signals; preserve touch targets and prevent horizontal viewport overflow. |

## Component language

- Corners: 7px conventional controls; 14-16px for the dominant deck and momentum surfaces; circular previous/next controls are explicit carousel affordances
- Lines and depth: inset structural rules, a visible 3px paper edge, and soft offset shadows; supporting cards retain the active card's full dimensions and recede through horizontal offset, z-order, paper-ground contrast, and restrained desaturation rather than shrinking into spines
- Type: Source Serif 4 Variable is the editorial display voice for the welcome, course, and current-lesson titles; Inter remains the interface, metadata, and body voice
- Color and material: midnight navy dominates the page while course covers rotate through navy, petrol, oatmeal, and muted brick uncoated stock; cream supplies editorial contrast, teal carries progress/structure, coral marks the primary action, and slate supports construction lines and secondary copy
- Progress truth: compute percentages only from completed lessons over a known total and clamp to `0-100`; unknown totals show `?` and “Total pending,” with no invented percentage or `aria-valuenow`
- Brand material: preserve the Filosage symbol geometry and signature teal, blue, coral, and navy relationships. The richer high-DPI SVG paper-fiber token spans course/library cards, drawers, Command Center/Support, dashboard signals, lesson/study panels, progress/pricing, and both themes; course cards add a second subtler SVG grain layer.
- Motion: horizontal drag feedback, front-to-back rearrangement, progress interpolation, hover lift, and loading pulse communicate selection only; reduced motion removes them while retaining controls and visible hierarchy. Vertical drag never cycles the deck
- Floating paper: **My courses** and Support share a 220ms unfold, 140ms reverse-crumple, common easing, decorative fragments, and live viewport-crossing scroll-lock handoff; only the physical origin changes, from the top-right profile/Command Center to the bottom-right Support Spark
- Command Center: dynamic course and lesson results stay out of the top palette; semantic teal, blue, coral, gold, and slate icon tones distinguish stable actions without relying on color alone
