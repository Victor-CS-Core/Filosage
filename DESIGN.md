# Design System

## Direction

Teach is a focused learning product with a restrained, quietly premium interface. It borrows Notion's clarity and content-first confidence without copying its visual language. The experience should feel like a well-made instrument: calm at rest, precise in use, and unmistakably Teach.

## Theme

The light theme uses a true near-white canvas and crisp white learning surfaces for daytime study. The dark theme uses tinted near-black surfaces for sustained reading in low light. Both themes preserve hierarchy, AA contrast, and identical semantic color roles.

## Color

- Canvas: `oklch(97.8% 0.006 270)` light / `oklch(15.5% 0.018 270)` dark
- Surface: `oklch(100% 0 0)` light / `oklch(19% 0.022 270)` dark
- Ink: `oklch(20% 0.025 270)` light / `oklch(95% 0.008 270)` dark
- Accent: ultramarine `oklch(52% 0.215 274)` light / `oklch(69% 0.175 274)` dark
- Signal: sparingly used yellow-green `oklch(82% 0.155 98)`
- Semantic states: color-independent success, warning, and error treatments with icons and explanatory copy

The accent is reserved for primary actions, current selection, progress, and active focus. It is not decorative.

## Typography

- Interface: Inter, with a compact product scale and 600–750 weight for hierarchy
- Reading: Source Serif 4 at 1.12rem / 1.85 line-height for long-form lessons
- Display headings cap at 5.5rem and never track tighter than `-0.04em`
- Body prose stays within 65–70 characters per line

## Layout

- Desktop: 276px private/public navigation rail with a fluid content workspace
- Mobile: 58px top bar and an explicit off-canvas navigation drawer
- Public home: editorial split hero followed by a scan-friendly course list
- Course map: header summary, local progress, and a sequential accordion curriculum
- Lesson: centered reading column with an optional owner-only tutor drawer

## Components

- Controls use 7px corners, clear focus rings, and 40px minimum action height
- Content surfaces use 11–15px corners only where grouping improves comprehension
- Lists use rules and spacing rather than repetitive floating cards
- Loading uses structural skeletons; empty and error states explain the next action
- Icons come from Lucide and always reinforce a visible label or accessible name

## Motion

- State transitions run 160–220ms with an ease-out curve
- Motion communicates drawer state, progress, loading, or feedback only
- `prefers-reduced-motion` reduces all animation and scrolling behavior

## Accessibility

- WCAG 2.2 AA contrast
- Keyboard access and visible focus for every control
- Minimum practical touch targets
- Screen-reader labels for icon controls, navigation, progress, and dialogs
- Status never relies on color alone
