# Design System

## Direction

Filosage is a focused learning product with a restrained, quietly premium interface. Its visual identity expresses clarity, knowledge, and daily growth without overpowering the learning task. The experience should feel calm at rest, precise in use, and unmistakably Filosage.

The approved B2 **Course Deck** is the north star for course identity and the returning learner home: an oatmeal paper field in light mode and editorial midnight field in dark mode, where tactile, screen-printed course covers turn stored progress into one clear continuation choice. Its deck metaphor belongs to course selection and should not turn lesson reading or every utility surface into cards.

Private study tools use a **quiet study folio** expression: oatmeal canvas and cream paper hold a single navy recall object, teal grounds progress and supporting state, and one coral rule marks the active mode. Editorial type names the deck or study task while Inter carries controls, metadata, and guidance. Structure these workspaces with ruled sections and open spacing rather than nested cards.

The public landing page extends that world through the approved **Course Proof First** expression: a real published course outcome opens into a visible route toward evidence. The hero uses live public course metadata and the shared `CourseBanner`, not fabricated product art, while the rest of the page uses rules, open editorial bands, and authored product fragments instead of a generic AI feature grid.

The symbol combines an open page or gateway, a winding path, and a coral curiosity spark. In the official wordmark, `Filo` is navy and `sage` is teal, always written as one word with a lowercase `s`. The motto is **Turn curiosity into understanding.**, with the final period optionally carried in coral.

## Theme

The light theme uses warm oatmeal canvas and cream uncoated-paper learning surfaces for daytime study. The dark theme uses deep navy book-board surfaces for sustained reading in low light. Both themes preserve hierarchy, AA contrast, and identical semantic color roles.

A shared high-DPI SVG paper-fiber token carries the material system across both themes: course and library cards, drawers, Command Center and Support, dashboard signals, lesson and study panels, progress, and pricing. Course cards add one extra subtle SVG grain layer for cover-stock depth without reducing text clarity.

On the public landing page, cream sheets and navy book-board surfaces use soft ambient paper depth rather than hard offset shadows. Light and dark themes preserve the same course-proof hierarchy, route meaning, disclosure language, and action priority.

## Color

- Brand navy: `#0D1B3D`
- Brand teal: `#14B8A6`
- Brand blue: `#4DA6FF`
- Brand coral: `#FF8A65`
- Brand off-white: `#FAFAF7`
- Accessible text/action derivatives: teal `#0F766E`, blue `#1D4ED8`
- Semantic states: color-independent success, warning, and error treatments with icons and explanatory copy
- Public learning routes stay teal from outcome through transfer and terminate in one coral evidence signal; coral is not repeated as general decoration

Exact bright brand colors are reserved for the logo, progress, and non-text signals. Navy and accessible derivatives handle text and controls. The Filosage symbol uses the original, unmodified brand asset without a raised tile, paper wrapper, or added shadow; the surrounding header supplies the shared material context in both themes.

## Typography

- Interface, body, and long-form reading: Inter Variable
- Editorial display: Source Serif 4 Variable for all page titles, course titles, learner-home greetings, current-lesson display titles, and course-map hero titles; never use it for controls, metadata, or body copy
- Headings use 700 weight; body and long-form reading use regular weight
- Core scale: caption `0.75rem`, interface `0.875rem`, body `1rem`, lead `1.125rem`, section `1.5rem`, title `2rem`
- Sub-`1rem` text is reserved for compact interface metadata, never long-form prose or writing controls
- Display headings cap at 5.5rem and never track tighter than `-0.04em`
- Body prose stays within 65–70 characters per line

## Layout

- Desktop: 68px Learning Header with primary destinations centered and Courses, Create, and Account controls grouped at the end
- Above 900px, the top-right profile opens **My courses** directly as a compact, non-modal floating shelf; Support, Study tools, and Ask Filosage use the same bounded paper-window presentation. The underlying workspace remains visible and scrollable, and outside click or Escape closes the active window
- At 900px and below, the same open shelf becomes a modal bottom sheet and locks root/body scrolling. Crossing the breakpoint live converts presentation and acquires or releases that scroll lock without closing the surface
- Mobile: 58px top bar, persistent bottom navigation, and explicit modal bottom sheets for course and account controls
- Public home: an outcome-led editorial hero uses roughly two-fifths of the desktop width while a live published course cover and outline use the remaining three-fifths; **Explore course outcomes** remains visible in the first viewport. The outcome-to-evidence runway is horizontal on desktop and becomes one continuous vertical route on mobile. Later sections use rules and open bands rather than equal card grids
- Learner home: zero active courses use one intentional create/explore composition; one active course uses one dominant card with no false stack or carousel controls; with three or more courses, at least three equal-width, equal-height cards remain visible in a horizontal stack—active left at z3, center at z2, right at z1—with offsets revealing the right edges rather than progressively smaller spines. Mobile preserves the same three-layer logic without page overflow
- Private study workspaces: use a compact selector rail beside the study folio on desktop; on mobile it becomes a horizontal, independently scrollable deck selector above the active work. Keep the current recall prompt visible within the first mobile viewport rather than spending that viewport on title, quota, navigation, or setup chrome
- Course map: header summary, local progress, and a sequential accordion curriculum
- Lesson: centered reading column with an optional owner-only tutor drawer

## Components

- Controls use 7px corners, clear focus rings, and a 40px minimum action height on desktop; mobile controls use at least 44px
- Content surfaces use 11–15px corners only where grouping improves comprehension
- Lists use rules and spacing rather than repetitive floating cards
- Loading uses structural skeletons; empty and error states explain the next action
- Icons come from Lucide and always reinforce a visible label or accessible name
- `CourseBanner` is the shared course-art surface across the learner deck, library cards, course switcher, and course-map hero. It preserves generated banners when present and otherwise renders deterministic topic-seeded geometry at stable dimensions.
- `PublicCourseProof` pairs a real published `CourseBanner` with the course outcome, initial modules, evidence deliverable, time, level, and specific source status. Loading, empty, and recoverable error states remain truthful and keep the public library available as the source of truth.
- Authored marketing fragments carry a visible **Illustrative product views** or **Illustrative structure** label. They may explain outcome definition, staged practice, the return loop, or evidence categories, but they never impersonate a learner's live record.
- Public marketing copy keeps four boundaries explicit: source assignment is not claim verification; self-report, observed practice, and assessed evidence remain distinct; lesson bodies and saved learning require a verified account; paid availability is stated only by the current plans surface.
- Course artwork uses high-DPI SVG/vector geometry on heavyweight uncoated paper grounds in midnight navy, petrol teal, oatmeal, or muted brick: large circles, partial discs, arcs, fine axes, restrained dotted paths, architectural rectangles, warm cream counter-forms, teal structure, and one coral active signal. SVG paper fiber and a subtler course-card grain unify the material; artwork remains decorative and never contains rasterized titles or state.
- A multi-course deck supports horizontal pointer drag and touch swipe, plus Arrow Left/Right, Home/End, and labeled previous/next buttons. Vertical drag is a no-op and leaves page scrolling intact. The equal-dimension stack cycles front to back while preserving left/center/right z3/z2/z1 order; the selected card alone is current content and participates in the tab order.
- The top Command Center contains stable destinations and account actions only. **My courses** is the single gateway to the bounded searchable shelf: it originates at the top-right profile/Command Center, floats nonmodally above 900px, and becomes a scroll-locking modal bottom sheet at 900px and below, including live viewport crossings. Icon backgrounds use semantic teal, blue, coral, gold, or slate tones while labels remain primary.
- Floating paper windows expose one small centered grip. Pointer dragging is bounded to a 12px viewport margin; Arrow keys move in precise steps, Shift+Arrow moves in larger steps, and Home returns the window to its trigger origin. Dragging is disabled when the same surface becomes a mobile or tablet modal sheet.
- Unknown totals stay unknown: show `?` and “Total pending,” omit `aria-valuenow`, and never invent `0%`. Load failures use a distinct recoverable error with truthful reassurance and retry, never a false empty state.
- Recall practice centers one materially distinct navy object for the prompt and revealed answer. Teal communicates grounding and progress; coral remains the singular active-mode rule. Supporting selectors, ratings, generation settings, and editor sections stay quieter and use rules instead of becoming a field of competing cards.

## Motion

- Floating paper surfaces use one fast motion contract: 220ms unfold, 140ms reverse crumple, shared easing and decorative fragments. **My courses**, Study tools, and Ask Filosage originate at the top-right; Support uses the same paper system from the bottom-right Spark. All convert live between the above-900px floating presentation and their appropriate scroll-locking modal sheet at 900px and below
- Motion communicates menu or drawer state, progress, loading, or feedback only
- The global Support Center has a visible physical origin: its paper sheet unfolds from the bottom-right Spark with two short decorative paper fragments and reverses into that origin on close. This origin-linked crumple may be reused for compact contextual-help notes and generated-note previews, but not for navigation, billing, destructive confirmation, or routine forms.
- `prefers-reduced-motion` reduces all animation and scrolling behavior
- For the Course Deck, reduced motion removes rotation, drag parallax, animated rearrangement, progress interpolation, hover lift, and loading pulse while preserving every selection control and the visible stack hierarchy
- The landing course proof uses one restrained cover-to-outline entrance. `prefers-reduced-motion` removes both entrance animations and the loading pulse without changing order, visibility, or access to the course outline

## Accessibility

- WCAG 2.2 AA contrast
- Keyboard access and visible focus for every control
- Minimum practical touch targets
- Screen-reader labels for icon controls, navigation, progress, and dialogs
- Status never relies on color alone
