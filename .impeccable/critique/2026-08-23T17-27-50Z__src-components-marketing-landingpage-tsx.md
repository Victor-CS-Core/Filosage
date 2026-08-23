---
target: public landing page
total_score: 22
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 3
timestamp: 2026-08-23T17-27-50Z
slug: src-components-marketing-landingpage-tsx
---
# Filosage public landing page critique

Method: dual-agent (A: landing_design_review · B: landing_detector_evidence)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 3 | Course loading, empty, and recoverable-error states are explicit; the navigation does not show the current section. |
| 2 | Match with the real world | 2 | "Capability Cycle," "transfer," "evidence," and "source status" arrive before enough plain-language grounding. |
| 3 | User control and freedom | 3 | Library, course, standard, and sign-in paths are clear and non-trapping. |
| 4 | Consistency and standards | 3 | Controls and disclosure language are coherent, but several labels describe nearly the same exploration action. |
| 5 | Error prevention | 3 | Course failures recover truthfully; truncating public module names can still hide information needed to judge the course. |
| 6 | Recognition rather than recall | 3 | The public outline and evidence states are visible, but visitors must assemble the relationship between course, cycle, and evidence across several sections. |
| 7 | Flexibility and efficiency | n/a | This is a Persuade surface, not an expert task interface. |
| 8 | Aesthetic and minimalist design | 2 | The individual parts are strong, but too many equally emphatic editorial bands repeat the same argument. |
| 9 | Error recovery | 3 | "Try again" and "Open the library" provide good recovery from failed course data. |
| 10 | Help and documentation | n/a | FAQ and the teaching-standard link are sufficient for this Persuade surface. |
| **Total** |  | **22/32** | **Acceptable: strong foundation, but the argument and hierarchy need a focused pass.** |

## Design Specificity Verdict

**Mixed, 6.5/10.** The paper palette, editorial hero, real course proof, and teal-to-coral learning route feel recognizably Filosage. The page structure is much more interchangeable: oversized declarative headings, a process sequence, explanatory feature bands, a trust section, FAQ, and a repeated CTA. The styling is authored more specifically than the argument.

**Deterministic scan:** The Impeccable detector returned zero findings for `src/components/marketing/LandingPage.tsx` and zero findings across all 13 files in `src/components/marketing`. There were no false positives. This agrees with the source inspection: the problem is editorial judgment and hierarchy, not a stock structural anti-pattern the detector can flag.

**Browser evidence:** The live page was inspected at desktop and mobile sizes. It rendered the real course "Evidence-based product decisions for small software teams," kept both mobile hero actions at a 48px height, stacked the featured course cleanly, and showed no horizontal overflow. Mutable script injection was unavailable, so no user-visible detector overlay was created. Browser screenshots and computed DOM/CSS values were used as the fallback signal.

## Overall Impression

The page has credible proof and unusually honest access boundaries. Its biggest opportunity is subtraction. Let one real course demonstrate the product, explain the learning path once in ordinary language, and give the visitor one clear first decision.

## What's Working

- The hero uses real published course data, including outcome, modules, time, level, source status, and evidence target. That is stronger than a fabricated dashboard mockup.
- Loading, empty, and API-error states are truthful and recoverable. Public course structure and private lesson access are clearly separated.
- The quietly premium paper, navy, teal, coral, and rule-based visual system is coherent. Reduced-motion and responsive contracts are present in source.

## Priority Issues

### [P1] Display copy is abstract, oppositional, and AI-shaped

**Why it matters:** Phrases such as "See the learning task—not a generic dashboard" and "Trust is a visible state, not a marketing badge" sound polished but category-generic. They make visitors decode Filosage's philosophy before they understand what they can do.

**Fix:** Give every large heading one concrete job: describe the learner's outcome, the action they take, or the boundary they should know. Remove "not X, but Y" positioning, internal product language, and repeated words such as "visible," "stays," "connected," and "useful."

**Suggested command:** `$impeccable clarify`

### [P1] The featured-course title treatment is not robust across dynamic art and long titles

**Why it matters:** The live banner is acceptable today, but the component places arbitrary course titles over generated artwork with one fixed gradient. A long title rises into a lighter part of the image, while `overflow-wrap: anywhere` can produce awkward breaks. A dynamic marketing surface needs guaranteed legibility, not screenshot-specific legibility.

**Fix:** Reserve a stable title safe zone at the bottom of the cover. Use a local navy scrim with restrained backdrop blur, reduce and clamp the title scale by available width, replace `overflow-wrap: anywhere`, and test a bright detailed banner plus an 80-character title. Keep the rest of the artwork sharp.

**Suggested command:** `$impeccable harden`

### [P1] The middle of the page repeats the learning model instead of advancing the visitor's decision

**Why it matters:** The six-stage runway, three FeatureGrid stories, evidence dossier, trust band, FAQ, and final access section restate the same model. Cognitive-load review found four checklist failures, including a lack of single focus and seven equally weighted FAQ choices.

**Fix:** Keep the hero proof and one six-stage learning route. Reduce the product-story section to concrete platform behavior that is not already shown in the course proof, combine evidence and source disclosure into one proof band, keep the four FAQ questions that resolve real objections, and let the final CTA answer a new hesitation.

**Suggested command:** `$impeccable distill`

### [P2] The first viewport offers competing next steps

**Why it matters:** "Explore course outcomes" opens the whole library while "Inspect course outline" opens the exact course already on screen. Account creation competes before the proof-led decision is complete.

**Fix:** Make the featured course the dominant proof-led action, keep "Browse all courses" as the alternative, and leave account creation secondary until the visitor has inspected a course.

**Suggested command:** `$impeccable layout`

### [P2] Oversized narrow headings and truncated module names reduce scanability

**Why it matters:** Several section headings use roughly 4.35–4.75rem type inside 14–15 character measures, forcing poster-like line breaks throughout the page. Meanwhile, public module titles are forced to one line with ellipsis, hiding the very detail that proves course quality.

**Fix:** Use one display scale for the hero and a calmer 40–52px section scale with 20–24 character measures. Let module names wrap to two lines before clamping. Preserve the mobile 44px touch target and reduced-motion contracts.

**Suggested command:** `$impeccable typeset`

## Persona Red Flags

**Jordan, first-timer:** Jordan sees the main action quickly but must decode "course outcomes," "Capability Cycle," "transfer," and "evidence" before understanding whether Filosage helps them learn, create a course, or evaluate work. The broad-library and specific-course actions compete.

**Riley, deliberate stress tester:** Riley will appreciate the recoverable data states and honest access boundaries, then notice that arbitrary banner art and title lengths share one fixed contrast treatment. Riley will also flag module names that lose their meaningful endings to ellipsis.

**Casey, distracted mobile visitor:** The controls are touch-friendly, but Casey must pass a large heading, two actions, an access note, a runway link, a 330px cover, and a full course outline before the next narrative section. The mechanics adapt; the attention cost does not.

## Minor Observations

- The runway heading's live letter spacing computes to `-0.042em`, slightly tighter than the project's `-0.04em` display floor.
- Native `<details>` is the right FAQ control. The issue is seven equally weighted questions, not the disclosure pattern.
- "Illustrative structure" is an excellent truth label and should remain.
- The final access band largely repeats the hero's actions and account boundary.

## Questions to Consider

- If the real course is the page's strongest proof, why is the hero promise less concrete than the course outcome?
- What single decision should a visitor make first: inspect this course, browse the catalog, or create an account?
- Could Filosage earn more trust by explaining its integrity model once, clearly, instead of repeating it in six places?

## Recommended Bounded Redesign Direction

Keep the approved Course Proof First identity. Refine the argument rather than replacing the visual world.

1. **Hero:** one short editorial headline, one plain-language paragraph, one dominant featured-course action, and one quiet library alternative. Keep account creation secondary.
2. **Featured course:** add a functional blurred navy title safe zone, keep artwork sharp above it, allow long titles and two-line module names, and preserve real API data.
3. **Learning story:** explain the six-stage Capability Cycle once, with visitor language beneath the canonical stage names.
4. **Platform features:** use four open editorial rows rather than more cards: choose or build a course; practice inside each lesson; return at the right time; inspect completed and assessed work.
5. **Evidence and trust:** combine the evidence dossier and source disclosure into one dark proof band.
6. **FAQ and close:** retain the four questions that resolve access, AI, evidence, and availability; finish with one course-led CTA.

## Humanizer Pass

### Draft rewrite

> Learn something you need to use.
>
> Choose a published course or bring your own goal. Filosage gives you a clear path through lessons, guided practice, review, and a final piece of work you can inspect.

### What still sounded AI-generated?

- "Gives you a clear path" is generic marketing language.
- The sentence is tidily assembled around a feature list.
- "Something you need to use" is clear but less memorable than the product behavior it introduces.

### Final direction

**Hero:** "Learn it well enough to use it."

**Lead:** "Choose a published course or bring your own goal. Filosage takes you through short lessons, hands-on practice, timely review, and a final piece of work you can inspect."

**Access note:** "Every course outline is public. Sign up when you want to open lessons and save your work."

**Section headings:**

- "From goal to finished work."
- "Know what to do next."
- "See what you've practiced and what still needs work."
- "Know where the material comes from."
- "Before you sign up."
- "Find a course that fits."

The final direction removes the negative comparisons, internal terminology, slogan fragments, significance language, and repeated "stays visible/connected" constructions while preserving the product's truth boundaries.
