# Filosage rebrand audit

Date: 2026-08-09

## Result

The application, public marketing experience, product copy, metadata, support content, documentation, generated brand library, and user-facing test expectations now use **Filosage** and the motto **Turn curiosity into understanding.**

The visual system uses the approved gateway-and-path symbol, the two-tone `Filo` / `sage` wordmark, and the existing navy, teal, blue, coral, and off-white palette. The supplied source PNGs are preserved in `art_src/brand`; the runtime and generated asset families use deterministic theme-specific crops from those originals, with no reconstructed center path.

## Customer-facing audit

- No unintended `Erudoza` or `Erudosa` product-name references remain in application UI, metadata, prompts, support articles, public assets, or user-facing tests.
- The former tagline and the former “daily dose” language no longer appear.
- The old public logo filenames and two obsolete OpenGraph images were removed.
- The legacy support article URL permanently redirects to the Filosage slug.
- Desktop and mobile landing-page screenshots were captured after live browser verification.

## Compatibility identifiers intentionally retained

These identifiers are not branding. Renaming them without a data and integration migration could break existing accounts, learner state, security verification, billing history, or operational tooling.

- `ERUDOZA_*` environment and test-process variables
- `__ERUDOZA_*` runtime globals
- `erudoza:*` and `erudoza-*` browser storage, cache, event, export-format, and idempotency keys
- Stripe metadata keys such as `erudoza_uid`, `erudoza_plan`, and `erudoza_interval`
- `X-Erudoza-*` request, version, signature, and model-evaluation headers
- Firestore backup prefixes and local development store directories
- the existing GitHub repository name and Firebase/Sites project identifiers

## Current domain and mailbox dependencies

Filosage continues to operate at `https://erudoza.com` until a Filosage domain is provisioned. Canonical URLs, the sitemap, robots metadata, product-frame labels, and production checks therefore continue to use that live domain. The existing `support@erudoza.com` and `legal@erudoza.com` addresses also remain active dependencies.

Changing these requires a coordinated infrastructure migration rather than a source-only rename: DNS and redirects, TLS, Firebase authorized domains and OAuth branding, Sites custom-domain configuration, sender authentication and mailboxes, Search Console and analytics properties, and any external social or marketplace profiles.

## Release safeguards

- Billing must remain disabled unless separately authorized.
- Git publication and Sites deployment are separate release states.
- A production release is only confirmed after the hosted `SITE_VERSION`, health endpoint, public URL, and billing state are verified against the intended commit.
- The pre-existing edit in `docs/COMMERCIAL_LAUNCH_RUNBOOK.md` must be preserved and explicitly handled when preparing the release commit.

## Verification record

- `npm.cmd run lint` passed with warnings denied.
- `npm.cmd run build` passed and generated 73 routes.
- `npm.cmd run test:e2e` completed with 399 passed and 21 intentionally skipped tests across Chromium, Mobile Chromium, and Mobile WebKit.
- `npm.cmd run build:sites` passed and prepared the production Workers package.
- `npm.cmd run test:smoke:sites` passed the release-critical public-page smoke test.
- Live browser checks covered the public landing page at 1440 × 1000 and 375 × 812, plus the signed-in application shell and sign-out path.
- The billing configuration remains explicitly closed with `BILLING_ENABLED=false`.
