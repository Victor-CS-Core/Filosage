# Design System

## Direction

Erudoza is a focused learning product with a restrained, quietly premium interface. Its visual identity expresses clarity, knowledge, and daily growth without overpowering the learning task. The experience should feel calm at rest, precise in use, and unmistakably Erudoza.

## Theme

The light theme uses Erudoza off-white and crisp white learning surfaces for daytime study. The dark theme uses deep navy surfaces for sustained reading in low light. Both themes preserve hierarchy, AA contrast, and identical semantic color roles.

## Color

- Brand navy: `#0D1B3D`
- Brand teal: `#14B8A6`
- Brand blue: `#4DA6FF`
- Brand coral: `#FF8A65`
- Brand off-white: `#FAFAF7`
- Accessible text/action derivatives: teal `#0F766E`, blue `#1D4ED8`
- Semantic states: color-independent success, warning, and error treatments with icons and explanatory copy

Exact bright brand colors are reserved for the logo, progress, and non-text signals. Navy and accessible derivatives handle text and controls.

## Typography

- Headings: Satoshi Bold
- Interface and reading: Inter Regular/Variable
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
