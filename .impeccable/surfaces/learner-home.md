# Learner home

## Scope

- Route: `src/app/page.tsx`
- Mode: Operate
- Audience: signed-in learner returning to make useful progress in a focused session
- Primary job: identify and begin the single best next learning action within seconds
- Fixed constraints: keep the existing Filosage identity and top navigation; Today/Continue learning cannot be hidden; show at most three immediate secondary actions; use only real learner data; preserve authenticated, validated preference sync

## Approved composition

- North star: `.impeccable/mocks/guided-day-option-c-approved.png`
- First viewport: a concise heading and one primary action at left, paired with a large code-native learning arc showing current, next, and after-next states; a rule-separated Today list follows
- Memorable moment: the current lesson anchors a calm geometric path that visually turns progress into direction
- Do not literalize: the raster's sample titles, dates, social/calendar ideas, metric values, or icon labels

## Implementation grammar

| Ingredient | Production medium | Commitment |
| --- | --- | --- |
| App navigation | Existing `AppShell` | Preserve current destinations and behavior. |
| Primary action | Semantic link/button | One teal action, tied to the real daily mission. |
| Learning arc | Semantic HTML plus CSS geometry and Lucide icons | Three real states only; no rasterized text, canvas, or invented nodes. |
| Current lesson | Semantic heading and metadata | Dominant real title, course, time, and progress. |
| Today plan | Three rule-separated rows | Real review/lesson/milestone items, never more than three. |
| Evidence band | Definition list and links | Supporting facts, visually subordinate and details-on-demand. |
| Supporting area | Registered preference-controlled sections | Existing presets and authenticated API; up/down and drag affordances with non-drag alternatives. |
| Mobile | Responsive semantic flow | Heading/action, current node, next states, Today rows, then supporting area; no horizontal overflow. |

## Component language

- Corners: 7px controls; 11-15px only for the dominant grouped learning surface
- Lines: 1px neutral rules; geometry uses 2-3px brand strokes, not colored card borders
- Elevation: one soft offset shadow only on the current lesson surface
- Type: existing Inter Variable; 2.4-3rem desktop title, 1.8rem mobile; compact but readable supporting metadata
- Motion: one short path-settle transition, disabled by reduced-motion; content is visible without animation
