# September 2026 release implementation contract

Victor authorized implementing the September 5 release plan and committing/pushing all intended changes on September 6, 2026. Work starts from the existing hardening commit `be16cd6810d8135d0a2f8de45650db2f73e3191b` on `codex/release-implementation-20260906`; main remains `859782450d8f7c2991f9eb1e45ebb82d1855afed` at baseline verification.

The approved plan is [the release implementation plan](../superpowers/plans/2026-09-05-filosage-release-implementation.md). Its historical planning-only language does not override the later implementation/commit/push authorization. Merge, deployment, production mutation, billing activation, secret/RBAC administration and live provider changes remain separate gates.

## Release scope

Retain the current Next.js/Azure product, verified learners aged 13+, English interface with evaluated requested content languages, existing course and brand contracts, and Free/Plus/Pro entitlements. Integrate existing hardening before adding further changes. Implement all 26 work packages; external acceptance is tracked honestly rather than inferred from local fixtures.

Base release requires one reviewed complete flagship and a real hosted non-owner learner journey. New checkout remains closed. Paid activation additionally requires complete commerce and provider evidence. Existing subscribers' recovery, cancellation and lifecycle processing are base-release obligations unless an authorized current read-only provider check establishes no outstanding obligations. That current provider check has not been performed; unknown is not zero.

Preserve the approved August 25 subscription policy: immediate upgrades, downgrades and billing-interval changes, `always_invoice` proration, unchanged billing anchor, cancellation at period end. Do not fabricate new consent, grant access from redirects, or automatically activate payments.

Keep optional features explicit. The initial plan selects flashcards off; independently supported deck-only and deck-plus-generation configurations must match build/runtime/health evidence. Retain the established owner V2 canary and current identity mode until their respective evidence gates authorize changes.

## Branch disposition

- Existing release hardening is the actual parent of implementation.
- PR #10 support-context work is conditional on enabling that context surface. Support availability is implemented independently; unrelated operational Command Center functions are not activated just to accept tickets.
- PR #4 is stale/conflicting; only verified remaining intent may be ported.
- Draft PR #6 is separate operator tooling. Already integrated branches are not remerged.

## Evidence and ownership

Lead: Codex acting on Victor's request. Bounded Astra workers own isolated changes; independent review and integrated verification precede final delivery. Local, committed, pushed, CI, deployed and production-verified states are separate.

The checkout preserves the exact candidate commit/tree and missing artwork IDs. All application source is available. Fifteen original artwork/screenshot blobs are absent locally and remain unchanged through sparse checkout. Prior history is shallow. GitHub authenticated object/ref operations are available even though CLI Git authentication is not.

The implementation outcome and task ledger are maintained in repository handoff records and summarized in the evidence index. Multica is optional at Victor's direction and is not a release prerequisite; no external item or synchronization is required.
