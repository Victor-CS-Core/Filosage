# Filosage brand audit

Updated: 2026-08-10

## Result

The application, marketing experience, product copy, metadata, support content, documentation, generated brand library, runtime identifiers, operational tooling, and test expectations use **Filosage** and the motto **Turn curiosity into understanding.**

The visual system uses the approved gateway-and-path symbol, the two-tone `Filo` / `sage` wordmark, and the navy, teal, blue, coral, and off-white palette. The supplied source PNGs are preserved in `art_src/brand`; runtime and generated asset families use deterministic theme-specific crops from those originals.

## Domain and contact surfaces

- `https://filosage.com` is the canonical production website.
- `https://www.filosage.com` is attached to the same Sites project.
- Canonical metadata, Open Graph metadata, the sitemap, robots metadata, product-frame labels, reminders, generated assets, production checks, and runtime URL configuration use the Filosage domain.
- Public contact links use `support@filosage.com` and `legal@filosage.com`.
- Mailbox delivery, sender authentication, Firebase authorization, OAuth behavior, analytics, Search Console, and external profiles require independent operational verification.

## Internal identifiers

Environment variables, runtime globals, browser storage keys, cache keys, events, export formats, Stripe metadata, request headers, backup prefixes, and local development directories use Filosage identifiers. This intentionally resets compatibility with identifiers that predate the completed migration.

## Release safeguards

- Billing remains disabled unless separately authorized.
- Git publication and Sites deployment are separate release states.
- Production is confirmed only after the hosted `SITE_VERSION`, health endpoint, public URL, billing state, canonical metadata, and sign-in behavior are verified against the intended commit.

## Verification record

Record current lint, type-check, build, Sites build, focused browser checks, production health, domain status, and billing state with the release that completes this migration.
