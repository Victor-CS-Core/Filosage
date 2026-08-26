# Filosage Local Release Hardening Execution Plan

**Base SHA:** `859782450d8f7c2991f9eb1e45ebb82d1855afed`

**Branch:** `codex/release-readiness-local-20260824`

**Constraint:** Local implementation and verification only. Keep `BILLING_ENABLED=false`; do not mutate GitHub, Azure, Stripe, email, secrets, production data, deployments, or traffic.

## Slice L1 — Secure the source-to-release contract

**Files:** `.github/workflows/*.yml`, `.github/dependabot.yml`, workflow contract tests.

1. Add failing contracts requiring immutable action pins with readable version comments, top-level least-privilege permissions, dependency update automation, and CodeQL.
2. Pin every third-party action to a verified commit SHA; retain the human-readable tag in an adjacent comment.
3. Add Dependabot coverage for npm and GitHub Actions and a least-privilege JavaScript/TypeScript CodeQL workflow.
4. Verify focused release contracts, then all contract tests.

**External exit gate:** enable repository security features and branch protection after GitHub Actions account billing is healthy.

## Slice L2 — Preserve the deployed identity architecture

**Files:** `.github/workflows/azure-qa.yml`, `azure-staging.yml`, `azure-promote-staging.yml`, `scripts/check-auth-provider-state.mjs`, release and infrastructure tests.

1. Add failing contracts proving staging and promotion declare an explicit expected authentication mode and default to `migration-dual`.
2. Make provider checks accept an exact mode instead of an ambiguous External-ID boolean.
3. Set and verify runtime provider flags from that reviewed mode without mutating the Azure Easy Auth provider configuration.
4. Require the same mode before staging, on the zero-traffic revision, after labeling, and before/after promotion.

**External exit gate:** run signed-in Google, email, and linked-identity acceptance on isolated QA and zero-traffic production.

## Slice L3 — Make local operational contracts production-safe

**Files:** health routes, `runtime-config.ts`, Azure Bicep/workflows, release scripts, operations tests and runbooks.

1. Add failing behavior tests for process-only liveness, dependency-aware readiness, bounded startup, and no-store responses.
2. Implement `/api/health/live`, `/api/health/ready`, and `/api/health/startup`; keep `/api/health` as the detailed release endpoint.
3. Configure distinct Container Apps probes in production and QA templates.
4. Make production staging identify itself as `production` and fail closed until signed alert configuration exists.
5. Tighten backup evidence instructions and checks so a successful read is not described as a restore rehearsal.

**External exit gate:** Azure RBAC, alert receiver, external uptime monitor, retention/HA decisions, and a real non-production restore rehearsal.

## Slice L4 — Add a fail-closed Stripe-hosted billing lifecycle

**Files:** billing/runtime configuration, Stripe server integration, billing routes, pricing UI, environment/release checks, billing tests.

1. Add failing tests for `closed`, `configured`, `canary`, and `open` rollout modes. `BILLING_ENABLED=false` must always deny new Checkout while hosted Portal management remains available when configured.
2. Add safe public readiness fields without exposing secret details. Canary requires an audited server-side allowlist; open still requires provider, catalog, legal, and tax readiness.
3. Keep acquisition on Stripe-hosted Checkout and management on Stripe Customer Portal. Remove hard-coded `payment_method_types`; use Dashboard-controlled dynamic payment methods.
4. Gate `automatic_tax` on an exact tax-readiness flag, defaulting closed. Treat Victor's completed Stripe tax work as unverified until read-only Stripe access is restored.
5. Require explicit 18-or-older, U.S.-resident, automatic-renewal acknowledgments in the pricing UI and server request schema. Bind the versioned acknowledgement to the durable Checkout claim and Stripe metadata.
6. Add bounded, accessible return-from-Stripe reconciliation with a clear timeout and recovery action. Never grant access from the redirect alone.
7. Make all management copy and controls clearly redirect to Stripe's hosted portal; do not build a custom subscription editor.

**External exit gate:** reauthenticate Stripe, verify Live tax registrations/catalog/Portal/webhook settings read-only, then run the four-offer sandbox matrix.

## Slice L5 — Release polish and evidence

**Files:** pricing/account CSS and browser tests, `.env.example`, billing/operations/runbooks, final diff.

1. Add mobile, keyboard, screen-reader-name, reduced-motion, long-content, slow-return, and hosted-Portal tests for changed flows.
2. Run focused red/green tests after each behavior change.
3. Run lint, TypeScript, production build, contracts, API tests, browser smoke, full browser matrix where locally feasible, npm audits, secret scan, and `git diff --check`.
4. Classify every remaining roadmap item as locally complete, externally permission-gated, or live-evidence blocked.

**Stop conditions:** unexpected baseline regression; unresolved identity ambiguity; migration requiring production data; a change that could create a Stripe object or charge; missing legal/product decision that changes customer-facing terms.
