---
target: the Command and Agent Center
total_score: 25
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 3
timestamp: 2026-08-16T06-12-12Z
slug: src-app-admin-command-center-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 3 | Strong safety state, but no last refresh, agent health, or disabled-state explanations. |
| 2 | Match system / real world | 3 | Mostly clear, with implementation terms such as Phase 1 and effect executor leaking through. |
| 3 | User control and freedom | 3 | Strong cancel and dialog behavior; learner-visible publication needs a dedicated review step. |
| 4 | Consistency and standards | 3 | Cohesive patterns, but internal notes and external publishing look too similar. |
| 5 | Error prevention | 3 | Excellent fail-closed and idempotent contracts; public reply publication is under-protected. |
| 6 | Recognition rather than recall | 2 | Agent scope, compatibility, and blocked reasons must be remembered. |
| 7 | Flexibility and efficiency | 2 | No sorting, saved views, bulk review, shortcuts, or attention-first queue. |
| 8 | Aesthetic and minimalist design | 2 | Equal-weight status, navigation, filters, and controls flatten priority. |
| 9 | Error recovery | 3 | Conflicts preserve useful state; load and refresh recovery are less explicit. |
| 10 | Help and documentation | 1 | Existing owner documentation is not available contextually in the interface. |
| **Total** |  | **25/40** | **Acceptable; significant improvements warranted.** |

## Design Specificity Verdict

The semantics are distinctly Filosage: evidence versus claims, bounded drafts, provenance, simulation, and owner review are unusually explicit. The composition is still a conventional three-column admin console whose equal-weight strip, tables, pills, and switches could serve another control-plane product unchanged.

The deterministic scan returned zero findings for `src/app/admin/command-center/page.tsx`. That supports the component's basic static hygiene but does not test task prioritization, runtime accessibility, authenticated interaction, responsive rendering, or visual hierarchy. Browser evidence was unavailable because no browser backend was exposed; no overlay was injected.

## Overall Impression

This is a strong safety foundation with an acceptable operating interface, but it foregrounds system anatomy instead of the owner's next decision. The biggest opportunity is to make it an attention-driven operations cockpit without weakening its draft-only, fail-closed contract.

## What's Working

- Safety boundaries are truthful and contract-backed: drafts have no external side effect, approvals remain unexecuted, and consequential decisions stay owner-controlled.
- Evidence quality is first-class: intake separates confirmed facts from claims, validates inputs, focuses errors, and preserves data on failure.
- Dialog accessibility and responsive behavior have mature source and test coverage, including focus restoration, dirty-close protection, internal scrolling, mobile treatment, and reduced motion.

## Priority Issues

### P1 — The console does not answer what needs owner attention now

Tickets default to recent updates, while pending drafts, approvals, high-risk work, overdue work, and completed history remain spread across equal-weight destinations.

**Fix:** Add a default Needs attention view ordered by critical risk, overdue SLA, and pending owner decision. Separate active queues from reviewed history. Surface high-risk count and earliest SLA in the first viewport.

**Suggested command:** `$impeccable distill`

### P1 — Agent management is a row of switches, not an operable control plane

The interface omits each agent's allowed inputs, compatible categories, review-only output, availability reason, last run, pending count, recent failure, prompt/model version, and evaluated release status.

**Fix:** Present each agent as a bounded operating contract. Group Available, Blocked, and Future agents; explain every disabled state; keep enablement fail-closed and owner-only.

**Suggested command:** `$impeccable shape`

### P1 — Learner-visible publishing is under-protected

Publish reply and Add note are visually similar even though only one creates an immediate external effect.

**Fix:** Add a confirmation sheet with recipient, exact text, immediate visibility, and audit consequence. Rename the action Publish to learner and give it a distinct consequential treatment.

**Suggested command:** `$impeccable harden`

### P2 — Accepted drafts end in a semantic dead end

Acceptance correctly records review without execution, but the owner gets no safe follow-on action.

**Fix:** Explain what acceptance means, then offer non-executing actions: open the linked ticket, copy proposed response, copy classification suggestions, or create an internal note.

**Suggested command:** `$impeccable clarify`

### P2 — Narrow-screen and assistive discoverability loses context

Mobile hides destination labels, loading is not announced as a live status, and disabled agent controls do not expose their reasons.

**Fix:** Retain compact visible labels or use a labeled destination selector; announce load/refresh completion; bind disabled explanations with `aria-describedby`.

**Suggested command:** `$impeccable adapt`

## Cognitive Load

High: 5 of 8 checks fail. Single focus, chunking, visual hierarchy, minimal choices, and progressive disclosure need work. Grouping, master-detail inspection, and keeping the current record visible are strengths.

## Emotional Journey

Entry is reassuring because the owner-only and draft-only boundaries are clear. Confidence then drops because everything appears equally important. Approval dialogs recover trust, but learner-visible publishing creates an anxiety valley. Accepted drafts end flat because there is no guided safe next step.

## Persona Red Flags

- **Alex, power user:** no shortcuts, sorting, saved views, bulk decisions, or pending-only mode; every record is handled one at a time.
- **Sam, accessibility-dependent:** hidden mobile labels, unexplained disabled controls, and non-live initial loading reduce orientation despite otherwise strong dialog semantics.
- **Maya, owner/operator:** the console foregrounds system anatomy instead of which work risks learners, which agent is safe and ready, and what the decision will actually do.

## Minor Observations

- Replace Phase 1, effect executor, and normalized intake with owner-facing language; retain the exact contract in contextual details.
- Add last refreshed time and a clear stale-data state.
- Link the relevant owner handbook, agent policy, and incident procedure from the corresponding controls rather than a generic help destination.
- Treat the future hybrid email/Discord plan as a separate, inactive expansion; do not imply provider health or automation exists today.

## Questions to Consider

- Should the first viewport optimize for system configuration or the next owner decision?
- What should Accept draft enable if it must never execute or publish anything?
- Could agent enablement mean approving a bounded operating contract rather than flipping an abstract switch?
