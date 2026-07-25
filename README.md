# Erudoza

Erudoza is a premium AI-assisted learning product: your daily dose of understanding. Public visitors can discover and complete published courses without an account. Learner accounts add cloud progress and spaced review. Erudoza Pro adds metered private course generation and lesson-grounded tutoring, while publishing remains owner-only.

Owner access is resolved server-side from the verified Google account matching the `OWNER_EMAIL` deployment secret. The owner email is never sent in the account API or rendered in the interface.

## Product modes

- Anonymous learning: open discovery, published lessons, retrieval practice, mastery checks, and device progress
- Free learner: Google sign-in, cloud progress, review scheduling, and a small daily tutor allowance
- Erudoza Pro: private course generation with monthly credits and a larger tutor allowance
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

Without local credentials, the public shell still renders for interface review, while data-backed and authenticated actions report that they are unavailable.

## Validation

```bash
npm run lint
npm run build
npm run build:sites
```

Deployment is intentionally separate from local validation. The current Sites build should be replaced only after the local redesign is approved.
