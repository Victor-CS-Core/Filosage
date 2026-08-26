# Hosted Stripe Subscription Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure, branded Stripe-hosted subscription management for invoices, payment methods, immediate plan changes with proration, and at-period-end cancellation.

**Architecture:** Filosage keeps acquisition in Checkout and sends existing subscribers to explicit Customer Portal flows. A small pure module validates the route action and builds Portal session parameters; the server verifies customer and subscription ownership before creating deep links, while signed webhooks remain the only entitlement authority.

**Tech Stack:** Next.js 16.2 Route Handlers, React 19, TypeScript 5, Stripe Node 22, Playwright 1.61, Stripe Customer Portal.

**Spec:** `docs/superpowers/specs/2026-08-25-hosted-stripe-subscription-management.md`

## Global Constraints

- Keep `BILLING_ENABLED=false` and do not deploy or activate billing.
- Never create a Live customer, subscription, invoice, PaymentIntent, charge, refund, or dispute.
- Preserve every pre-existing uncommitted change in this isolated worktree.
- Do not commit or push without Victor's separate approval.
- Never expose Stripe keys, webhook secrets, customer IDs, or user subscription IDs to client responses or logs.
- Use Stripe-hosted Checkout and Customer Portal; do not collect payment details or implement a local subscription editor.

---

### Task 1: Make the Portal configuration an explicit release contract

**Files:**
- Modify: `src/lib/billing-lock.ts`
- Modify: `src/lib/runtime-config.ts`
- Modify: `scripts/check-release-env.mjs`
- Modify: `.env.example`
- Test: `tests/billing-lifecycle.spec.ts`
- Test: `tests/release-scripts.spec.ts`

**Interfaces:**
- Consumes: `BillingEnvironment` and `evaluateBillingConfiguration(environment)`.
- Produces: `STRIPE_PORTAL_CONFIGURATION_ID`, `portalConfigurationReady`, and a `managementReady` state that requires a Stripe key plus a syntactically valid `bpc_` configuration ID.

- [ ] **Step 1: Write the failing configuration tests**

  Add `STRIPE_PORTAL_CONFIGURATION_ID: "bpc_filosage"` to the valid fixture, assert it produces `portalConfigurationReady: true`, and assert missing or malformed values keep `managementReady`, `providerReady`, and configured rollout false. Add a release-script case expecting `STRIPE_PORTAL_CONFIGURATION_ID must be a valid Stripe Customer Portal configuration ID`.

- [ ] **Step 2: Run the focused tests and verify RED**

  Run `npm.cmd run test:contracts -- tests/billing-lifecycle.spec.ts tests/release-scripts.spec.ts` and confirm the new readiness and validation assertions fail because the environment variable is not consumed.

- [ ] **Step 3: Implement the minimal readiness contract**

  Extend `BillingEnvironment`, require `/^bpc_[A-Za-z0-9]{8,}$/` for Portal readiness, pass the variable through `billingConfiguration()`, add it to the billing activation checks, and document the non-secret ID in `.env.example`.

- [ ] **Step 4: Re-run the focused tests and verify GREEN**

  Run the same Playwright contract command and require zero failures.

- [ ] **Step 5: Record the diff checkpoint without committing**

  Run `git diff --check` and `git diff -- src/lib/billing-lock.ts src/lib/runtime-config.ts scripts/check-release-env.mjs .env.example tests/billing-lifecycle.spec.ts tests/release-scripts.spec.ts`.

### Task 2: Create strict, ownership-bound Portal sessions

**Files:**
- Create: `src/lib/billing-portal.ts`
- Modify: `src/lib/account-server.ts`
- Modify: `src/lib/stripe-server.ts`
- Modify: `src/app/api/billing/portal/route.ts`
- Test: `tests/billing-lifecycle.spec.ts`

**Interfaces:**
- Consumes: an exact JSON object with `action`, the verified server account, `STRIPE_PORTAL_CONFIGURATION_ID`, and the stored Stripe customer/subscription IDs.
- Produces: `parseBillingPortalRequest(value): BillingPortalAction | null` and `billingPortalSessionParameters(input): Stripe.BillingPortal.SessionCreateParams`.

- [ ] **Step 1: Write failing pure contract tests**

  Assert that only exact objects containing `manage`, `change_plan`, or `cancel` parse. Assert literal session payloads: all include customer, configuration, and `/pricing` return URL; change uses `flow_data.subscription_update.subscription`; cancel uses `flow_data.subscription_cancel.subscription`; both use redirect after-completion; deep links reject a missing `sub_` ID.

- [ ] **Step 2: Run the focused test and verify RED**

  Run `npm.cmd run test:contracts -- tests/billing-lifecycle.spec.ts` and confirm it fails because `src/lib/billing-portal.ts` does not exist.

- [ ] **Step 3: Implement the pure parser and parameter builder**

  Create the focused module with the exact three-action union, exact-key validation, Stripe session parameter types, and the two deep-link payloads.

- [ ] **Step 4: Re-run the pure tests and verify GREEN**

  Run the focused contract test and require the new pure tests to pass.

- [ ] **Step 5: Write failing route and ownership tests**

  Add assertions that the route reads a bounded JSON body and returns `400` for invalid actions, that `ServerAccount` retains `billingSubscriptionId` only server-side, and that deep-link creation retrieves and validates the subscription against the verified customer before calling `billingPortal.sessions.create`.

- [ ] **Step 6: Run the focused tests and verify RED**

  Run the billing lifecycle contract file and confirm the route/ownership assertions fail for the missing implementation.

- [ ] **Step 7: Implement the route and remote ownership verification**

  Read at most 1,024 JSON bytes, parse the action, load `billingSubscriptionId` in `resolveAccount`, verify the customer metadata binding, retrieve the subscription for deep links, compare its customer, require exactly one supported Filosage Price, then create the explicit-config Portal session.

- [ ] **Step 8: Re-run the focused tests and verify GREEN**

  Run the billing lifecycle contract file and require zero failures.

- [ ] **Step 9: Record the diff checkpoint without committing**

  Run `git diff --check` and inspect only the Task 2 files.

### Task 3: Present a clear, accessible hosted-management action hierarchy

**Files:**
- Modify: `src/app/pricing/page.tsx`
- Modify: `src/app/globals.css`
- Test: `tests/billing-lifecycle.spec.ts`
- Test: `tests/pricing-mobile.spec.ts`

**Interfaces:**
- Consumes: public subscription status and `managementReady` from the existing account/billing status endpoints.
- Produces: authenticated POST bodies `{ action: "manage" | "change_plan" | "cancel" }` and three plainly named Stripe-hosted controls for active/trialing subscribers.

- [ ] **Step 1: Write failing browser tests**

  For an active Plus subscriber, assert visible enabled controls named `Change plan in Stripe`, `Manage billing in Stripe`, and `Cancel membership in Stripe`; intercept each POST and assert the corresponding literal action body. Assert rapid concurrent clicks are disabled while navigation is pending. Preserve the past-due test's generic recovery action and absence of a plan-switch action. Add a mobile assertion that controls wrap without horizontal overflow and retain at least 44px height.

- [ ] **Step 2: Run Chromium-focused tests and verify RED**

  Run `npx.cmd playwright test tests/billing-lifecycle.spec.ts tests/pricing-mobile.spec.ts --config=playwright.contracts.config.ts --project=chromium` and confirm the new controls/request-body expectations fail.

- [ ] **Step 3: Implement the minimal UI and error behavior**

  Send explicit action JSON for every Portal request, show the plan-change action only for active/trialing status, retain generic management for payment recovery, label every action as opening Stripe, reuse the existing busy/error live-region behavior, and group the controls with responsive flex wrapping and existing design tokens.

- [ ] **Step 4: Re-run Chromium-focused tests and verify GREEN**

  Run the same focused browser tests and require zero failures and no page overflow.

- [ ] **Step 5: Run the Impeccable detector once**

  Run `node C:/Users/vitic/OneDrive/Documentos/Teach/.agents/skills/impeccable/scripts/detect.mjs --json src/app/pricing/page.tsx src/app/globals.css`, resolve relevant findings in one batch, and re-run the focused browser tests once.

- [ ] **Step 6: Record the diff checkpoint without committing**

  Run `git diff --check` and inspect the pricing/CSS/test diff.

### Task 4: Align runbooks and validate the webhook-authoritative lifecycle

**Files:**
- Modify: `docs/BILLING_SETUP.md`
- Modify: `docs/COMMERCIAL_LAUNCH_RUNBOOK.md`
- Test: `tests/billing-lifecycle.spec.ts`

**Interfaces:**
- Consumes: existing `customer.subscription.updated`, `customer.subscription.deleted`, and invoice-event reconciliation.
- Produces: explicit operational instructions and regression evidence that plan/interval changes update stored billing fields and course-credit policy only through webhook reconciliation.

- [ ] **Step 1: Write a failing reconciliation test**

  Add a transaction-backed test fixture in which a later `customer.subscription.updated` event changes Plus monthly to Pro annual and assert the stored `billingPlan`, `billingInterval`, `billingPriceId`, event cursor, and course-credit allocation change together. Assert a redirect alone performs no write.

- [ ] **Step 2: Run the focused test and verify RED**

  Run the billing lifecycle contract test and confirm the new fixture fails for the missing or incomplete test harness behavior, not for malformed Stripe data.

- [ ] **Step 3: Implement only any missing reconciliation behavior**

  Reuse `syncStripeSubscription`; change production reconciliation only if the failing test exposes a real gap. Keep webhook signatures, bounded bodies, duplicate claims, event ordering, and durable consent checks intact.

- [ ] **Step 4: Re-run the focused test and verify GREEN**

  Require the plan/interval/cancellation reconciliation tests to pass.

- [ ] **Step 5: Update the operational documentation**

  Document the explicit Portal configuration ID, four-price catalog restriction, immediate prorations, at-period-end cancellation, explicit Price tax behavior, Stripe Tax registration gate, and signed sandbox webhook evidence requirement.

- [ ] **Step 6: Run repository validation**

  Run `npm.cmd run lint`, `npx.cmd tsc --noEmit`, `npm.cmd run build`, focused contract/browser tests, `npm.cmd run check:secrets`, and `git diff --check`. Treat a timed-out broad suite as incomplete and rerun affected tests in isolation.

### Task 5: Apply and inspect the approved hosted Stripe configuration

**Files:**
- External test-mode Stripe objects: intended Plus/Pro Prices and default/explicit Customer Portal configuration.
- External Live Stripe objects: intended Plus/Pro Prices and default/explicit Customer Portal configuration only.

**Interfaces:**
- Consumes: exact account context `acct_1TtgXPRANh4Mnfma`, the four verified environment-specific Product/Price IDs, and current Portal configuration IDs.
- Produces: aligned hosted configuration with an evidence record containing redacted object IDs and read-back state.

- [ ] **Step 1: Re-read current Test and Live objects**

  Confirm account context, zero Live subscriptions, exact four current Prices, Portal configuration, branding, Tax registrations, and webhook endpoints immediately before mutation. Stop if IDs, subscription count, or branding differ from the approved design.

- [ ] **Step 2: Update Test configuration and verify by read-back**

  Set the intended Test Prices from unspecified to exclusive tax behavior, enable Portal price switching for only the intended four Prices with `always_invoice` and `unchanged`, retain at-period-end cancellation/reasons, and set Filosage headline/return URL. Read every object back before continuing.

- [ ] **Step 3: Update Live hosted configuration and verify by read-back**

  After reconfirming zero Live subscriptions, apply only the equivalent Price and Portal configuration changes. Do not create transactional Live objects. Read every changed object back.

- [ ] **Step 4: Attempt bounded sandbox lifecycle proof**

  Use a signed test webhook delivered to a matching local or QA runtime to exercise Checkout, immediate Plus/Pro monthly/annual switching, invoice proration, and at-period-end cancellation. If no approved reachable runtime exists, stop after Stripe-hosted configuration read-back and record the end-to-end lifecycle as blocked.

- [ ] **Step 5: Final evidence and Multica state**

  Re-read this plan and its spec, inspect the full diff, record code/tests/Stripe writes and remaining blockers in `FILOSAGE-35`, and report commit, push, deployment, billing activation, charge, and production-verification states separately.

## Self-review

- Spec coverage: acquisition, management, immediate changes, cancellation, ownership, explicit environment configuration, catalog restriction, tax safety, webhook authority, UI accessibility, and sandbox evidence each map to a task above.
- Placeholder scan: this plan contains no deferred implementation placeholders; the only conditional step is the explicitly bounded signed-webhook runtime gate from the approved specification.
- Type consistency: the action union, parser, session parameter builder, environment variable, stored subscription ID, and Stripe flow types use the same names across tasks.
