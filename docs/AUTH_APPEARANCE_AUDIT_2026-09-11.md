# Authentication appearance audit

Date: September 11, 2026. Scope: visitor appearance preferences, the existing Azure customer sign-in boundary, and a supported path to hosted appearance parity. No provider, tenant, account, secret, billing or deployment changes were made.

## Findings and source trace

| Finding | Evidence | Status |
| --- | --- | --- |
| A system-derived appearance became a permanent explicit preference after the first page load. System changes were then ignored. | `ThemeProvider.tsx` restored a resolved value and unconditionally persisted it. No media-query change listener existed. Browser regression received stored `light` where no user choice existed. | Fixed locally; verification below. |
| Removing a preference in another tab did not restore system appearance. | The storage listener accepted only `light`/`dark` event values. Browser regression remained light after removal on a dark system. | Fixed locally; verification below. |
| A manually chosen app appearance can differ from the Microsoft-hosted page. | The app preference is in origin-local storage. The tenant CSS selects dark styling through `prefers-color-scheme`, which follows the browser/system preference. No documented per-request theme selector was found in the current Microsoft guidance. | Hosted parity remains open. App restoration is not proof of hosted parity. |

`public/theme-bootstrap.js` applies the saved preference or system preference before hydration. `ThemeProvider` owns interactive state and subsequent changes. Existing stored `light`/`dark` values remain explicit because the old format cannot distinguish a real choice from a value inferred by an older app version. They must not be silently erased.

`AuthModal` passes the intended return path to `AuthProvider`; `identity-client.ts` starts the existing `/.auth/login/filosage` or Google endpoint with the bounded same-origin return destination. Azure Easy Auth owns the authorization exchange and callback. The application restores its own appearance on return. The appearance fix does not modify login parameters, provider IDs, return-path validation, state/nonce/PKCE handling, identity linking or session authorization.

## Read-only Azure evidence

The existing `filosagestg-app` in `filosage-staging-central-rg` has Easy Auth enabled with both Google and the custom `filosage` OIDC provider enabled. Its discovery endpoint is on `filosagecustomersprod.ciamlogin.com` for the configured production customer tenant. Provider configuration was queried with an allowlist of non-secret fields.

Using the existing customer-tenant Graph session, the default organizational branding returned a warm `#e7ddce` background, logo references and a custom stylesheet reference. Its public Microsoft CDN stylesheet was 4,459 bytes and matched `infra/azure/external-id-branding/custom.css` after newline normalization. It contains the navy `#000d23` palette under `prefers-color-scheme: dark`, responsive styling, reduced-motion handling and forced-colors rules. Uploading the same stylesheet again would not fix manual-choice parity.

This verifies the default tenant configuration and served asset, not the effective rendered application-specific hosted page. The available Edge session was already signed in; it was not signed out. A separate in-app browser was unavailable, and Edge blocked a new hosted sign-in tab because another extension UI was open. No account details, codes or forms were submitted.

## Supported way to make the hosted page follow the chosen appearance

The smallest change that retains Azure Easy Auth is application-specific branding selected through separate OIDC clients. It is a supported composition to prototype, not yet a verified deployment:

1. Keep the existing client and `filosage` provider available for current accounts and rollback.
2. Create two client registrations in the same external tenant and associate them with the same reviewed user flow. Give each a fixed light or fixed dark branding theme and stylesheet. The app selects the matching named provider from its resolved appearance; system appearance resolves immediately before navigation.
3. Register exact callbacks for each proposed provider, such as `https://filosage.com/.auth/login/filosagelight/callback` and `https://filosage.com/.auth/login/filosagedark/callback`, plus only the separately approved candidate origins. Store client secrets through the existing reviewed secret workflow. Configure the additional named OIDC providers in the shared Container App auth configuration.
4. Extend the server's strict provider allowlist and client contract only after identity compatibility is resolved. Preserve issuer checks, current account ownership, explicit identity linking, recent-auth requirements, callback validation and existing-session behavior.
5. Verify both explicit choices against the opposite OS preference on desktop/mobile, through sign-in, sign-up, email-code, error/cancel, linking and return. Verify current paid users retain the same canonical account and subscription after either route. No production account creation is part of this audit.

The critical prerequisite is identity compatibility: `easy-auth-principal.ts` uses the OIDC `sub` claim, and Microsoft documents that `sub` changes with the client application ID. Adding theme clients without a verified mapping can create separate identities for the same customer. Current code does not retain a stable `oid`/`tid` anchor. A reviewed migration or explicit linking plan must bind additional client identities to established canonical accounts; matching email is not sufficient. Do not change existing registry keys or infer links as part of a cosmetic fix.

Required administration: Organizational Branding Administrator and Application Administrator in the external tenant; permission to configure the existing user flow and app registrations; scoped write access to the Container App auth configuration and existing secret workflow. Per-app branding is generally available for External ID. The discovered Graph theme endpoints are beta, so use the supported Entra portal configuration flow rather than making production runtime depend on a beta API. Any new registrations, secrets, shared auth changes and identity migration need the owner's concrete approval after the compatibility plan is reviewable.

Microsoft also supports native authentication for React/JavaScript, which would let Filosage render its own theme-aware email-code UI using the existing client where supported. It requires native/public-client configuration, an associated user flow, a reviewed CORS proxy and a new or proven bridge to this application's Easy Auth session boundary. Social sign-in and required web fallbacks still open provider pages. This is a larger authentication change, not a CSS fix, and was not implemented.

Do not repurpose `ui_locales` as a theme switch: Microsoft documents it for language customization. Do not add an undocumented `theme` parameter, proxy the hosted sign-in HTML, disable a provider or accept account duplication to obtain a visual match.

## Local verification

The existing Playwright harness starts isolated servers/stores under this worktree. The added cases in `tests/auth-accessibility.spec.ts` exercise system changes without persistence, explicit choice across an app UI sign-in redirect/return, and storage removal from another tab. The managed endpoint in the return test is a fixture; it does not test Azure's rendered UI or perform authentication.

Before implementation, the system-persistence and cross-tab-removal regressions failed for their intended reasons. After implementation, the complete Chromium auth accessibility and local branding suites passed (19/19), and all three added cases passed separately on mobile Chromium and mobile WebKit (3/3 each). TypeScript, focused Oxlint/ESLint, the tracked-file secret scan, support wiki integrity (19 articles) and whitespace checks passed. The initial cold-page run exposed a short loading wait, and the initial mobile return test used the desktop-only sign-in control; both test setup issues were corrected before these results. Browser runners emitted the existing `NO_COLOR`/`FORCE_COLOR` warning.

Repeat the focused browser cases in PowerShell:

```powershell
$env:PLAYWRIGHT_PORT = '3310'
$env:FILOSAGE_PLAYWRIGHT_PROJECT = 'chromium'
npx playwright test tests/auth-accessibility.spec.ts --project=chromium --grep 'appearance' --reporter=line --timeout=60000
```

Use `mobile-chromium` or `mobile-webkit` for both project settings to run the same tagged cases on the existing mobile projects. Run `tests/external-id-branding.spec.ts` alongside the complete auth accessibility file on Chromium for the surrounding local branding and accessibility checks. Hosted visual verification, real sign-in/sign-up, shared-configuration changes and production deployment remain unperformed.

## Microsoft references checked September 11, 2026

- [External tenant branding](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-customize-branding-customers): hosted company branding and CSS; native authentication owns its UI.
- [Application-specific branding themes](https://learn.microsoft.com/en-us/entra/fundamentals/how-to-customize-branding-themes-apps): availability, app assignments, required roles and per-theme custom CSS.
- [Company branding CSS reference](https://learn.microsoft.com/en-us/entra/fundamentals/reference-company-branding-css-template): supported selectors and the External ID exception to workforce-tenant CSS restrictions.
- [Browser-language customization](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-customize-languages-customers): the purpose of `ui_locales`/`mkt`.
- [Container Apps custom OIDC providers](https://learn.microsoft.com/en-us/azure/container-apps/authentication-openid): multiple named providers, callbacks and client credentials.
- [ID token claims](https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference): pairwise `sub` versus stable tenant/object identifiers.
- [Native authentication React quickstart](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-native-authentication-single-page-app-react-sign-in): registration permissions, public/native flows and CORS proxy requirements.
- [Choosing the authentication approach](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-choose-authentication-approach): framework support and social sign-in/fallback boundaries.


## September 13 — actual hosted wrapper contrast correction

The coordinator reproduced the reported Microsoft-hosted contrast defect: body and form adopted dark colors, but `#background-container` retained a near-white fill, `#background-image.ext-background-image` still painted the provider's light illustration, and `#lightbox-cover` stayed white. `.ext-boilerplate-text` inherited light text over a light-gray provider background. The original dark-ink header/banner logos lacked a contrasting backing. The earlier simplified CSS fixture did not represent those wrappers.

The reviewed CSS now explicitly colors the observed background/cover wrappers in both modes, suppresses the illustration only in dark mode, supplies contrasting boilerplate/placeholder/footer-link colors, and gives only `img.ext-header-logo` and `img.ext-banner-logo` a light backing. The original brand asset bytes and geometry remain unchanged; social-provider marks are unaffected. Fixed light/dark probe assets are regenerated from this same stylesheet.

A new actual-markup regression failed on the original near-white background, then passed. Eight self-contained branding checks pass, including the existing responsive/fixed-theme/accessibility matrix and new boilerplate/placeholder contrast checks. Two unrelated application-navigation cases were not included in this no-server check. Actual hosted upload and rendered verification are coordinator-owned and were not performed by the CSS worker.

This corrects contrast within the existing provider configuration. Hosted automatic appearance still follows `prefers-color-scheme` (browser/OS); it cannot read Filosage's origin-local appearance preference. Explicit app choice versus opposite OS preference is not established. No new client, identity mapping, authentication/session change or app rebuild is part of this correction; the earlier two-client proposal remains historical, not an implementation prerequisite for this CSS fix.
