# Filosage rebrand inventory

Date: 2026-08-09

## Initial audit

The pre-migration case-insensitive audit found 179 files containing `Erudoza`, `Erudosa`, the previous tagline, an `erudoza.com` dependency, or a legacy brand identifier.

| Area | Files | Migration treatment |
| --- | ---: | --- |
| Application source | 102 | Replace customer-facing names, accessible labels, metadata, prompts, auth, learning, pricing, support, and legal copy. Preserve persisted browser keys and API/data contracts. |
| Public brand assets | 29 | Regenerate from the Filosage symbol, two-tone wordmark, motto, and existing approved palette. Rename old logo filenames. |
| Product and operations docs | 14 | Update product-facing brand language while retaining documented infrastructure dependencies. |
| Tests | 15 | Update user-visible expectations; preserve fixtures and compatibility keys that protect existing learner data. |
| Scripts and configuration | 14 | Update visible output and brand generation; preserve environment variables, headers, storage prefixes, backup paths, and runtime globals. |
| Root product/design docs | 5 | Reframe the existing product and design system as Filosage without changing the product contract. |

## Production-sensitive legacy contracts

The following identifiers are intentionally excluded from blind renaming:

- `ERUDOZA_*` environment and test-process variables
- `__ERUDOZA_*` runtime globals
- `erudoza:*` and `erudoza-*` browser storage, event, cache, idempotency, and export-format keys
- Stripe metadata keys including `erudoza_uid`, `erudoza_plan`, and `erudoza_interval`
- `X-Erudoza-*` internal request/signature headers
- Firestore backup prefixes and local store directories
- the Firebase/Sites project identifiers and the current `erudoza.com` production domain
- existing `@erudoza.com` support and legal mailboxes until Filosage email infrastructure exists

Changing these in a visual rebrand could orphan learner state, invalidate integrations, or break production operations. They remain compatibility debt and are listed again in the final audit.

## Brand surfaces in scope

- Shared symbol and two-tone `Filo` + `sage` wordmark
- Browser/app icon, light/dark placements, social/OpenGraph assets, and generated brand library
- Landing page, desktop and mobile navigation, dashboard, learning/course views, authentication, pricing, settings, support, errors, and legal pages
- Metadata, browser titles, social descriptions, canonical-domain dependencies, sitemap, robots, alt text, and accessible names
- Product prompts and user-visible operational messages
- Documentation and tests that assert user-visible branding

This inventory records the starting state. The post-migration audit is maintained separately so intentional compatibility references are not confused with unfinished customer-facing work.
