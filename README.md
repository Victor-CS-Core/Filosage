# Filosage

Filosage is a premium AI-assisted learning product built to turn curiosity into understanding. Public visitors can inspect published course outcomes and structure without an account. Verified learner accounts open lesson content and add cloud progress, notes, evidence, and spaced review. Filosage Pro adds metered private course generation and lesson-grounded tutoring, while publishing remains owner-only.

Owner access is resolved server-side from the verified Google account matching the `OWNER_EMAIL` deployment secret. The owner email is never sent in the account API or rendered in the interface.

## Product modes

- Anonymous learning: open discovery, published lessons, retrieval practice, mastery checks, and device progress
- Free learner: Google sign-in, cloud progress, review scheduling, and a small daily tutor allowance
- Filosage Pro: private course generation with monthly credits and a larger tutor allowance
- Owner: Pro access plus publishing and unpublishing for the public library

## Stack

- Next.js 16 App Router, React 19, and TypeScript
- Firebase Authentication and Firestore
- OpenAI Responses API with Zod Structured Outputs
- Lucide icons and prose-first lesson explanations
- CSS design tokens with light/dark themes and WCAG 2.2 AA targets

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Add the Firebase browser and Admin SDK values.
3. Add `OPENAI_API_KEY`. Course outlines and lessons default to `gpt-5.6-terra`; the grounded tutor defaults to `gpt-5.6-luna`.
4. Configure the separate Free, Pro, and owner OpenAI budget pools plus the per-account cost ceilings shown in `.env.example`. Course briefs are screened with the free `omni-moderation-latest` model before generation and generated outlines are screened again before storage.
5. Add test Pro users to `PREMIUM_EMAILS` until subscription billing is enabled.
6. Run `npm install` and then `npm run dev`.

## Release readiness

Run `npm run check:release` in the deployment environment before opening traffic. It validates required configuration without printing secret values. GoDaddy can host the domain/site, but recurring Pro subscriptions require a billing provider such as Stripe. The Stripe implementation is intentionally disabled until `BILLING_PROVIDER=stripe`, `BILLING_ENABLED=true`, a secret key, webhook signing secret, and a monthly Price ID are all configured.

## Local testing without credentials

When Firebase Admin credentials are absent and `NODE_ENV` is not production, `npm run dev` runs in **local mode**: a file-backed document store (`.erudoza-local/store.json`, gitignored) replaces Firestore, the sign-in button signs you in as a local owner account, and AI generation is served by deterministic stubs that satisfy the real schemas and quality gates. Add only `OPENAI_API_KEY` to use real AI models against the local store.

This makes every feature testable offline as the owner: course generation, lesson generation, publishing and unpublishing, the tutor, quizzes and progress, the daily review session, misconception tracking, capstone assessment (submissions of 600+ characters pass the stub assessor; shorter ones return a needs-revision verdict), data export and deletion, legal acceptance, telemetry, and the admin control room. Billing remains disabled unless Stripe is configured. Local mode is hard-gated to development builds and never activates in production. Delete `.erudoza-local/` to reset local data.

## Validation

```bash
npm run lint
npm run build
npm run build:sites
```

Deployment is intentionally separate from local validation. The current Sites build should be replaced only after the local redesign is approved.
