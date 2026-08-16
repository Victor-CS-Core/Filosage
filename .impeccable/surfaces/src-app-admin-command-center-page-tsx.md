---
version: 1
slug: "src-app-admin-command-center-page-tsx"
primary_target: "src/app/admin/command-center/page.tsx"
related_targets:
  - "src/app/admin/command-center/CommandCenterV2.tsx"
  - "src/app/admin/command-center/command-center-v2.module.css"
---

# Command Center v2 — The Owner's Evidence Desk

## Direction contract

- **THESIS:** An owner operations desk should feel like opening one carefully ruled evidence ledger, not entering an AI dashboard. Judgment, provenance, and consequence lead; agents remain bounded drafting instruments.
- **OWN-WORLD:** Filosage oatmeal canvas, cream uncoated paper, midnight book-board, petrol teal selection, one coral consequence signal, Source Serif editorial titles, Inter operational copy, and the shared high-DPI paper-fiber token.
- **STORY:** Enter through the owner/simulation boundary, scan transparently ordered work, select one case, separate facts from claims, inspect provenance and chronology, then take one bounded next step whose effect is stated before it can occur.
- **FIRST VIEWPORT:** The complete page title, safety band, labeled Work/Reviews/Activity/System navigation, truthful loaded/total queue, selected evidence dossier, and persistent review/publication action boundary are simultaneously legible at the approved desktop viewport.
- **FORM:** Seed `ddbdcffa`. A ruled ledger and evidence dossier share one paper sheet; System becomes a narrow boundary rail paired with an explicit agent-contract matrix. Mobile changes to labeled list → detail with Back and a safe-action dock above native navigation.
- **FINISH:** Subtle SVG fiber on canvas, sheets, dialogs, and action docks; fine rules instead of card shadows; almost no motion; AA contrast; visible focus; no gradient, glass, KPI, Kanban, avatar, or decorative AI treatment.

- **Scope and mode:** Complete Operate-mode redesign of `src/app/admin/command-center/page.tsx`, locally behind a default-off v2 flag. The existing Filosage visual world remains authoritative.
- **Audience and job:** The verified owner opens one operational case, separates evidence from claims, makes one bounded decision, and leaves a truthful versioned audit record. The default Work queue is transparently ordered by overdue state, due time, then risk—never an opaque attention score.
- **Approved direction:** A-led synthesis. `command-center-evidence-desk-a.png` governs Work and the case dossier; B governs Reviews; C governs System and agent contracts. One cream paper workspace, navy safety boundary, ruled case ledger, full evidence dossier, labeled navigation, and restrained semantic color replace the generic status-card console.
- **Memorable moment:** Selecting a case keeps the queue visible while the full evidence dossier exposes confirmed facts, unverified claims, evidence, chronology, related reviews, and no more than four safe next actions. Public learner publication is unmistakably separate from internal review.
- **Constraints:** Owner-only server authorization; independent intake/draft gates; simulation always on; drafts and approvals never execute; `BILLING_ENABLED=false`; no email, Discord, providers, external executor, destructive migration, or unsupported totals/health claims. Desktop queue+dossier; mobile list→detail with preserved filters, selection, and scroll. WCAG 2.2 AA, visible labels, live status, reduced motion, 200% zoom, and 44px touch targets.
- **Implementation fidelity:** Use semantic HTML, CSS Modules for route-scoped styling, Lucide icons, existing brand typography/tokens, and repository-backed data. No raster UI, glass, gradients, avatars, KPI cards, Kanban, bulk consequential actions, or decorative AI motion.

## Shipped design record

- **Disposition:** `ship` for the local Command Center v2 implementation on 2026-08-16. This records a finished surface, not a deployment, production activation, or change to the default-off v2 gate.
- **Provenance:** Direction seed `ddbdcffa` and contract `thesis-own-world-story-first-viewport-form-finish` are emitted on the surface. The approved A composition governs Work and the case dossier; B contributes the Reviews structure; C contributes the System boundary rail and agent-contract matrix. The approved comp remains compositional evidence, never a raster UI source.
- **Authority boundary:** This record applies to Command Center v2 only. The existing Filosage world, AppShell, brand mark, course surfaces, marketing surfaces, and shared design semantics remain authoritative outside this route.

### Material and color

- The surface is one evidence-led workspace: a warm oatmeal canvas (`#e9e1d4`) holds a cream paper ledger and dossier (`#fbf7ee` / `#fffdf7`). The shared canvas and sheet fiber tokens provide uncoated-paper texture while live HTML, rules, and labels carry all meaning.
- Midnight navy (`#0d1b3d`) is structural: it establishes the owner/simulation safety band, primary bounded actions, and consequence framing. Petrol teal (`#087278`) marks the selected queue row, active navigation, confirmed state, and enabled review-only contracts. Coral (`#c84432`) is reserved for danger or explicit consequence, never ambient decoration.
- Fine neutral rules (`#c8c0b3` / `#9f9a91`) divide the ledger, dossier evidence groups, chronology, and contract matrix. Surfaces are flat by default; card stacks and ornamental shadows are absent. The mobile action dock may use one restrained upward shadow solely to separate fixed actions from scrolling evidence.
- Dark mode preserves the same roles on midnight book-board: deep navy canvas and paper layers, pale operational ink, brighter teal selection, coral consequence, amber caution, and visible rules. It changes contrast, not information architecture or action priority.

### Typography

- Source Serif 4 is the editorial voice for the Command Center title and evidence-document headings, including selected case and System section titles. It makes the surface read as a ledger and dossier, not a metrics console.
- Inter is the operational voice for navigation, filters, labels, buttons, state text, evidence prose, and contract tables. Compact uppercase labels may orient dense records, but actions and body copy remain normally readable and never rely on condensed dashboard styling.
- Monospace is limited to machine-shaped evidence such as references and event metadata. It is not a decorative AI cue and does not replace prose.

### Layout and responsive behavior

- Desktop Work is a single ruled paper sheet split into a persistent ledger and dossier: the ledger occupies approximately 42% and the selected dossier the remaining width. Reviews use the same list-plus-document grammar with a slightly narrower ledger. Selection must not erase queue context.
- The first viewport keeps the complete title, owner/simulation boundary, labeled Work/Reviews/Activity/System navigation, truthful collection state, selected evidence dossier, and review/publication boundary legible together at the approved desktop size.
- At `1180px` and below, supporting grids simplify and the System rail stacks above its contract matrix when necessary. At `800px` and below, Work and Reviews become an explicit list-to-detail flow: selecting a record replaces the list with the dossier, a visible **Back to work/reviews** control restores the preserved list state, and filters, selection, and scroll context survive the transition.
- On mobile detail, the safe-action dock is fixed above the native bottom navigation and scrolls horizontally when its actions do not fit. The evidence body receives matching bottom clearance so the dock never obscures the record. At the narrowest widths, controls stack without hiding their labels.

### Ledger, dossier, and action boundary

- Work ordering is stated in the interface as overdue state, due time, then risk tie; never replace it with an opaque priority or attention score. Loaded-versus-total truth and malformed-record warnings stay visible, and unknown totals remain unknown.
- The dossier separates Situation, record metadata, Confirmed facts, Unverified claims, Evidence references, owner-only notes, chronological workstream, learner-visible replies, and tags. Facts and claims must remain separate in structure and language; untrusted reporter text is visually bounded and explicitly labeled.
- The action dock remains visible with a plain-language **Review-only boundary** before any action. A selected case offers no more than four bounded next steps: generate a draft, request a decision, add an internal note, and, only for learner support, publish to the learner. Publication is visually distinct and must retain confirmation, pending-retry, and learner-visibility language.
- Reviews retain provenance, version, status, and non-executing decision language. Activity is a chronological audit ledger, not a feed, and must state external effect truth directly.

### System boundary rail and agent matrix

- System pairs a narrow boundary rail with an explicit agent-contract matrix. The rail leads with owner access, intake, draft availability, simulation lock, global kill switch, and an impact summary; controls say what stops and what remains available before state can change.
- Each draft agent has its own row for purpose, compatible inputs, review-only output, explicit prohibition, and state control. There is no bulk enable. Disabled reasons remain adjacent to the affected control, and future agents remain visible only to clarify the schema boundary, labeled **Locked off**.
- Agent state never implies autonomy. Drafts and decisions remain non-executing, the external executor remains unavailable, billing actions remain disabled, and evidence access remains available when draft generation is stopped.

### Accessibility and modes

- Preserve semantic tabs and tab panels, ordered ledgers, dossier articles and sections, definition lists, data tables, native dialogs, labeled switches, and polite live regions. Keyboard tab movement, selection focus, dialog focus behavior, and mobile Back controls are part of the design, not optional enhancements.
- Every actionable control has a visible label or accessible name, a practical minimum target of `44px`, and a `3px` visible focus outline. Icons reinforce words; status, risk, enabled state, and consequence never rely on color alone.
- The design must remain usable at 200% zoom. Reduced-motion mode removes meaningful animation and smooth scrolling while preserving state; forced-colors mode restores explicit outlines to selected rows, reviews, and tabs. Dark mode retains hierarchy and semantic parity.

### Explicit anti-patterns

- Do not introduce KPI tiles, health scores, executive-summary cards, Kanban columns, avatar rows, chat bubbles, floating AI assistants, or decorative agent personalities.
- Do not use gradients, glass, blur, glossy depth, rasterized interface fragments, repeated floating cards, hard offset shadows, or decorative paper effects that reduce text clarity.
- Do not hide labels behind icon-only controls, encode status only with hue, invent totals or system health, collapse facts into claims, merge internal review with learner publication, or replace chronology with vague recency.
- Do not add bulk consequential actions, autonomous execution language, opaque ranking, celebratory motion, ambient coral, or sparkle decoration that suggests AI agency. A Sparkles icon may identify the bounded generate-draft action only when paired with its visible label and review-only boundary.
