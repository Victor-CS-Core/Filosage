# Filosage

Filosage is a self-directed learning and course-creation workspace built to turn curiosity into understanding. Public visitors can inspect published course outcomes and structure without an account. Verified Free learner accounts open lesson content and add cloud progress, notes, evidence, and spaced review. Plus adds two monthly course credits for private course creation with rollover up to twenty-four; Pro adds five with rollover up to sixty, advanced portable evidence, revocable sharing, and publishing after completion and review.

Owner access is resolved server-side from the verified Google account matching the `OWNER_EMAIL` deployment secret. Google authentication and the signed-in session are managed by Azure Container Apps built-in authentication (Easy Auth). The owner email is never sent in the account API or rendered in the interface.

## Product modes

- Anonymous discovery: inspect published outcomes, modules, lesson titles, assessment structure, and source status; lesson bodies and learner work remain account-bound
- Free learner: Google sign-in, published lessons, cloud progress, notes, practice, review scheduling, evidence, and five monthly tutor questions
- Filosage Plus: two monthly course credits with rollover up to twenty-four, private course creation, and forty monthly tutor questions
- Filosage Pro: five monthly course credits with rollover up to sixty, advanced capstone analysis, portable evidence export and revocable sharing, publishing after completion and review, and one hundred monthly tutor questions
- Owner: Pro capabilities plus protected operational authority

Flashcard decks, AI flashcard generation, V2 labs and visuals, Command Center functions, course publication, and checkout each have separate feature, entitlement, review, or hosted-configuration gates. Public copy must not treat a disabled or unverified capability as currently available. The reviewed selection is in `config/release-capabilities.json`; see `docs/RELEASE_CAPABILITIES.md` for the exact-SHA/digest release contract and current evidence boundaries.

## Stack

- Next.js 16 App Router, React 19, and TypeScript
- Azure Container Apps Easy Auth for Google sign-in, Azure Database for PostgreSQL, and Azure Blob Storage
- Azure Container Apps, Container Registry, Key Vault, and Azure Monitor
- OpenAI Responses API with Zod Structured Outputs
- Lucide icons and prose-first lesson explanations
- CSS design tokens with light/dark themes and WCAG 2.2 AA targets

## Local setup

1. Copy `.env.example` to `.env.local`.
2. For cloud-backed development, add the Azure PostgreSQL and Blob Storage values. Credential-free local mode needs none of them; deployed sign-in is supplied by Container Apps Easy Auth.
3. Add `OPENAI_API_KEY`. Course outlines default to `gpt-5.6-terra`; lessons and the grounded tutor default to `gpt-5.6-luna`, with `gpt-5.6-terra` as the lesson fallback and `gpt-5.6-sol` reserved for recovery.
4. Configure the separate Free, paid (Plus and Pro), and owner OpenAI budget pools plus the plan-specific per-account cost ceilings shown in `.env.example`. Course briefs are screened with the free `omni-moderation-latest` model before generation and generated outlines are screened again before storage.
5. `PREMIUM_EMAILS` is a legacy Pro-access allowlist for controlled testing; prefer explicit owner grants for new test accounts.
6. Run `npm install` and then `npm run dev`.

## Release readiness

Run `npm run check:release` in the deployment environment before opening traffic. It validates required configuration without printing secret values. Recurring Plus and Pro subscriptions require Stripe. Paid activation requires `BILLING_PROVIDER=stripe`, separate monthly and annual Price IDs for both Plus and Pro, a secret key, and a webhook signing secret. `BILLING_ENABLED=false` remains mandatory until the separate commercial launch gates and explicit activation decision are complete.

## Local testing without credentials

When Azure credentials are absent and `NODE_ENV` is not production, `npm run dev` runs in **local mode**: a file-backed document store (`.filosage-local/store.json`, gitignored) replaces PostgreSQL, the sign-in button signs you in as a local owner account, and AI generation is served by deterministic stubs that satisfy the real schemas and quality gates. Add only `OPENAI_API_KEY` to use real AI models against the local store.

This makes every feature testable offline as the owner: course generation, lesson generation, publishing and unpublishing, the tutor, quizzes and progress, the daily review session, misconception tracking, capstone assessment (submissions of 600+ characters pass the stub assessor; shorter ones return a needs-revision verdict), data export and deletion, legal acceptance, telemetry, and the admin control room. Billing remains disabled unless Stripe is configured. Local mode is hard-gated to development builds and never activates in production. Delete `.filosage-local/` to reset local data.

## Validation

```bash
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

The standalone `tsc` check uses TypeScript 7 through the `@typescript/native` npm alias. The `typescript` alias supplies Microsoft's TypeScript 6 compatibility API for ESLint and the isolated route-test fixtures; it exposes `tsc6`, leaving `tsc` on version 7. Next.js 16.3.4 resolves its additional build check from the `typescript` package, so that check uses version 6. Keep both aliases together when updating the compiler, following Microsoft's [side-by-side guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).

Deployment is intentionally separate from local validation. See `docs/AZURE_MIGRATION_RUNBOOK.md`; Azure staging provisioning, data import, custom-domain cutover, and production traffic each require their own evidence or approval.
