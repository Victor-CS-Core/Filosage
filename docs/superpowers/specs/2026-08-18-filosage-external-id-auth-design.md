# Filosage Customer Authentication Modernization Design

**Date:** 2026-08-18

**Status:** Approved by Victor for implementation planning on 2026-08-18

**Project:** Filosage

**Repository:** `Victor-CS-Core/Filosage`

**Operational record:** Multica `bddabca0-bcc8-43a0-a4dd-94ad8fb410d2`

## 1. Purpose

Give Filosage learners two secure ways to create and access an account:

- continue with Google, including Gmail and Google Workspace accounts; or
- continue with any supported email address by receiving a one-time code.

Filosage will not build a password database, generate or deliver authentication codes, or implement its own token verifier and browser session system. Microsoft Entra External ID will own customer authentication. Azure Container Apps Authentication, also called Easy Auth, will continue to own the browser session and inject verified identity claims into the application.

The in-app entry experience and Microsoft-hosted sign-in experience will use Filosage branding, calm learning-oriented language, responsive layouts, and accessible interaction patterns.

## 2. Approved Decisions

- Use Microsoft Entra External ID for customer identity and access management.
- Use browser-delegated authentication so Microsoft hosts the credential and one-time-code screens.
- Configure one External ID sign-up and sign-in user flow with:
  - Google federation; and
  - local email with a one-time passcode.
- Use Azure Container Apps Easy Auth with External ID as a custom OpenID Connect provider.
- Keep the application session in an HTTP-only, Azure-managed same-origin cookie.
- Keep the current direct Google Easy Auth provider only as a temporary migration and rollback path.
- Preserve each existing learner's canonical Filosage account identifier and all data attached to it.
- Never merge or link accounts based only on an equal email address.
- Require proof of both the existing identity and the replacement External ID identity before linking them.
- Keep recent reauthentication mandatory for deletion, identity changes, billing-sensitive actions, and owner operations.
- Store provider secrets in Azure-managed secret storage; never expose them to browser code, source control, build output, or logs.
- Create and prove the change in isolated QA before any production identity configuration or traffic change.
- Keep `BILLING_ENABLED=false` throughout this work.
- Require separate explicit approval for external tenant/provider mutation, secret creation or rotation, deployment, production promotion, and retirement of the direct Google provider.

## 3. Current State

The inspected application currently:

- opens a themed, accessible `AuthModal` that offers Google sign-in after legal acknowledgement;
- redirects through `/.auth/login/google` instead of loading a browser authentication SDK;
- retrieves the current user from `/api/auth/session` using an Azure-managed same-origin session;
- accepts only Azure-injected Google claims when `AZURE_EASY_AUTH_ENABLED=true`;
- rejects missing, malformed, non-Google, or explicitly unverified identities;
- stores application accounts under `users/{providerSubject}`;
- uses the current provider subject as the learner, course-author, subscription, and progress identity;
- requires a recent Google authentication time for sensitive learner and owner actions; and
- configures only Google under the Container Apps authentication resource in `infra/azure/main.bicep` and `infra/azure/qa.bicep`.

This foundation is safer to extend than to replace. The main incompatibility is that an External ID user subject will not equal the existing direct-Google subject. A deliberate canonical identity layer is therefore required before cutover.

## 4. Approaches Considered

### 4.1 Selected: External ID through Container Apps Easy Auth

External ID owns Google federation, email-code authentication, customer user flows, code delivery, abuse protections, and the hosted sign-in UI. Container Apps uses External ID as a custom OIDC provider and continues to issue the application session cookie.

Advantages:

- one managed customer identity authority for both methods;
- no passwords, OTP generation, or authentication tokens in Filosage code;
- minimal change to the current Azure-managed session boundary;
- branded hosted pages with custom colors, assets, text, layout, and CSS;
- standards-based OIDC integration;
- a direct path to future managed security capabilities without redesigning the application session; and
- the first 50,000 monthly active users are currently covered by the External ID core free tier, excluding paid add-ons.

Costs and risks:

- External ID tenant and user-flow configuration is required;
- existing Google identities require migration/linking because their subjects change;
- sensitive-action reauthentication must be proven with actual External ID claims in QA; and
- browser-delegated authentication adds one branded hosted step after the Filosage modal.

This is the approved approach.

### 4.2 Rejected: External ID with an application-owned Next.js session

The application could integrate OIDC through Auth.js, MSAL, or a custom server-side authorization-code flow and issue its own session cookie.

This offers more direct control over callbacks and sessions, but it replaces a working Azure security boundary with more application code, key rotation, cookie policy, callback handling, CSRF/state/nonce validation, session revocation, and operational maintenance. It does not provide enough user benefit to justify the added attack surface.

### 4.3 Rejected: Keep direct Google and add a separate email authentication stack

Filosage could retain direct Google Easy Auth and add Firebase email link, a custom email-code service, or another independent provider for email users.

This creates two identity authorities and either two session mechanisms or a custom session broker. It increases duplicate-account risk, makes recent authentication inconsistent, complicates logout and recovery, and partially reverses the existing move to Azure-managed sessions. Building a bespoke code-delivery service would also violate the requirement not to reinvent authentication.

Azure AD B2C is not an alternative for this design because it has not been available for new customers since May 1, 2025. Microsoft Entra External ID is the current Microsoft customer identity platform.

## 5. Target Architecture

### 5.1 Identity provider layer

Use a dedicated External ID external tenant for each trust boundary:

- a Filosage QA external tenant for isolated acceptance testing; and
- a Filosage production external tenant created or configured only after QA approval.

Each environment has its own:

- application registration;
- OIDC client credential;
- sign-up/sign-in user flow;
- Google OAuth client configuration;
- callback and logout URLs;
- branding configuration; and
- customer directory.

QA must never use the production External ID client secret or production customer directory.

The user flow offers Google and email one-time-code authentication on the same Microsoft-hosted page. External ID sends the code and verifies it. Filosage receives no code and exposes no endpoint that can generate, inspect, or validate one.

### 5.2 Container Apps session layer

Add a named custom OIDC provider, `filosage`, to Container Apps Authentication. Its callback is the Azure-managed `/.auth/login/filosage/callback` endpoint. The client secret is referenced from Container Apps secret configuration backed by Key Vault in the same pattern as the existing infrastructure.

The server-directed flow remains:

1. Filosage redirects the browser to `/.auth/login/filosage` with a same-origin post-login path.
2. Easy Auth redirects to the External ID user flow.
3. External ID authenticates with Google or an email code.
4. External ID returns an OIDC authorization response to Easy Auth.
5. Easy Auth validates the response and creates its HTTP-only session cookie.
6. Easy Auth injects identity claims into requests to Filosage.
7. Filosage converts the raw provider identity into a canonical application identity.

Anonymous access stays enabled at the platform layer because Filosage deliberately allows public discovery and course-outline browsing. Application API authorization remains server-side.

### 5.3 Raw and canonical identities

Split the current single identity concept into two explicit types:

- `VerifiedProviderIdentity`: the exact identity asserted by Easy Auth, including provider, issuer-qualified subject, normalized verified email, display fields, and authentication time when present.
- `VerifiedUser`: the canonical Filosage identity used by accounts, courses, subscriptions, progress, notes, support, and authorization.

The application never uses email as the canonical identifier. Provider subjects are namespaced by provider and issuer so subjects from different authorities cannot collide.

Add two server-managed registries:

- an identity-link registry mapping a versioned HMAC of `provider + issuer + subject` to a canonical Filosage UID; and
- an email-ownership registry mapping a versioned HMAC of the normalized verified email to the canonical Filosage UID.

Use a dedicated `IDENTITY_LINK_HMAC_SECRET` stored in Key Vault. Raw email addresses and raw provider subjects are not placed in document paths. Version the HMAC key namespace as `v1` so a future controlled rotation can coexist with the original registry.

Existing Google accounts retain their current Google subject as their canonical UID. New External ID accounts use their External ID subject as their initial canonical UID. An External ID subject linked during migration resolves to the existing Google canonical UID.

### 5.4 Registry backfill

Before External ID can be enabled for learners, run a non-destructive migration that reads existing `users/*` records and prepares:

- the direct-Google identity-link entry for each existing account; and
- one email-ownership entry for each normalized verified account email.

The migration has a dry-run mode and a write mode. Both modes report counts, invalid records, duplicate normalized emails, and conflicting mappings. Any duplicate email or conflicting mapping fails the write run without overwriting either account. No learner record, course, subscription, progress document, or author identity is regenerated or deleted.

The migration writes only missing registry records and is idempotent. A second run with the same source state produces no changes.

### 5.5 New-account initialization

After successful External ID authentication:

1. Resolve the provider identity through the identity-link registry.
2. If a mapping exists, return its canonical UID.
3. If no mapping exists, check the email-ownership registry.
4. If the email is unclaimed, the authenticated subject becomes the canonical UID when legal acceptance creates the application account. The identity link, email ownership, legal acceptance, account, and `signup_completed` event are committed transactionally.
5. If the email is already owned by another canonical UID, do not create a second application account and do not auto-link. Return the bounded `identity_link_required` state.

The learner sees a neutral message explaining that the email already belongs to a Filosage learning account and that they must confirm the existing sign-in method to connect it. The response does not disclose plan, owner status, course counts, billing state, or other account details.

### 5.6 Existing-account linking

An existing learner links External ID only while signed in through the existing direct-Google provider:

1. The learner chooses **Add email-code sign-in** or **Move to the new secure sign-in** from account settings or the bounded recovery screen.
2. The server requires a current canonical account and creates a random, single-use linking intent with a 10-minute expiration.
3. The linking intent records the old canonical UID, old provider-identity hash, normalized verified-email hash, safe return path, created time, and used time. It stores no provider credential or token.
4. The browser receives only an opaque intent identifier in an HTTP-only, Secure, SameSite=Lax cookie and redirects through `/.auth/login/filosage`.
5. After External ID authentication, a same-origin completion page sends a POST request to consume the linking intent.
6. The server requires a valid new Easy Auth identity, the unexpired intent, exact equality of the two verified normalized emails, and absence of a conflicting identity mapping.
7. A transaction writes the new External ID identity link to the existing canonical UID and consumes the intent.
8. The learner returns to the original page with a success message and the same courses, subscription, progress, notes, and account history.

Possession of the same email without the authenticated old session and single-use intent is insufficient. A failed or expired link changes no account or registry data.

### 5.7 Recent authentication

External ID sensitive-action reauthentication uses a fresh browser-delegated request with `prompt=login`. The server continues to require:

- the same canonical UID as the active session;
- the same provider identity or an explicitly linked identity;
- an authentication time within the existing recent-authentication window; and
- an unconsumed sensitive-action request.

The isolated QA gate must prove that Container Apps exposes a trustworthy `auth_time` value for both Google federation and email-code sign-in. If either method does not produce a usable fresh-authentication claim, that method cannot perform deletion, identity linking, billing-sensitive changes, or owner mutations. The release remains blocked until the managed flow can provide the required proof; the application must fail closed rather than substitute session age or an unverified timestamp.

## 6. Learner Experience

### 6.1 Filosage entry modal

Keep the existing modal interaction model: focus trapping, Escape dismissal, focus restoration, legal links, age confirmation, browse-without-account option, and responsive sizing.

Update the content to explain both methods without placing credential fields inside Filosage:

- heading: **Keep your learning in sync**;
- body: progress, notes, courses, and review dates remain the concrete account value;
- identity note: **Choose Google or a private email code on the next secure Filosage screen**;
- primary action: **Continue securely**; and
- supporting text: **Microsoft securely manages sign-in. Filosage never sees your password or one-time code.**

The primary action redirects to the branded External ID page. That page visibly presents:

- **Continue with Google**; and
- an email address field followed by the one-time-code flow.

The application does not add an email field to the modal, because collecting it twice adds friction and encourages a misleading impression that Filosage itself handles the code.

### 6.2 Hosted branding

The External ID page will use reviewed Filosage assets and design tokens:

- Filosage mark and wordmark;
- the current light surface, ink, teal, and blue palette;
- `Inter, ui-sans-serif, system-ui, sans-serif` as the CSS font stack, with the system fallback accepted when the hosted page cannot load Inter;
- calm, direct sign-in and error copy;
- Filosage favicon;
- responsive CSS for small phones through desktop;
- visible keyboard focus;
- contrast meeting WCAG 2.2 AA;
- reduced-motion-safe transitions;
- links to the current Privacy Notice and Terms of Service; and
- no unsupported trust, encryption, or privacy claims.

The first release uses the Microsoft-hosted External ID domain. A custom `login.filosage.com` domain is a separate future enhancement because it introduces additional DNS, certificate, and edge-routing configuration without being necessary for secure email sign-in.

### 6.3 Errors and recovery

Use bounded, actionable, non-enumerating messages:

- authentication unavailable: **Sign-in is temporarily unavailable. Your learning data has not changed. Please try again.**
- expired code: let the Microsoft-hosted page offer a new code without exposing whether an account already exists;
- link required: **This email is already connected to a Filosage learning account. Confirm your existing sign-in to connect the new method.**
- expired link: **That confirmation expired. Sign in with your existing method and try again.**
- failed recent authentication: **We could not confirm a recent sign-in, so the sensitive action was not completed.**

Client and server logs use stable internal error codes and correlation identifiers. They do not log codes, cookies, client secrets, authorization responses, raw identity headers, full email addresses, or linking-intent values.

## 7. Security and Privacy Controls

- Allow only the exact configured Easy Auth provider name and expected External ID issuer.
- Require a nonempty issuer-qualified subject and a normalized email whose verification is guaranteed by the configured External ID flow.
- Treat Easy Auth headers as trusted only when the application is running behind the enabled Azure authentication sidecar.
- Strip and ignore client-supplied identity headers in local and test entry points.
- Validate all post-login and post-logout destinations as same-origin paths.
- Keep OIDC client secrets and the identity-link HMAC secret in Key Vault-backed configuration.
- Use least-privilege identities for deployment and Microsoft Graph configuration.
- Apply generic authentication, registration, and recovery errors to limit account enumeration.
- Use External ID managed protections for passwordless-code attempts and delivery; add application throttling to linking-intent creation and completion.
- Make linking intents random, hashed at rest, short-lived, single-use, and bound to one canonical account and email hash.
- Require POST for linking completion and other state changes.
- Rotate the Azure session after authentication and reauthentication through the managed Easy Auth flow.
- Record high-signal audit events for account creation, identity-link start, success, failure category, identity unlink, and provider retirement.
- Prune consumed and expired linking-intent records after 30 days. Keep authentication security events under the existing Azure Log Analytics retention, currently 30 days; increasing either period requires privacy review.
- Never put authentication secrets or raw provider payloads in analytics events.
- Keep the existing age confirmation, terms version, privacy version, and authenticated legal-acceptance record.
- Update the Privacy Notice and sign-in help to name External ID, Google federation, email-code delivery, identity-linking behavior, and relevant retention without claiming production behavior before deployment.

## 8. Components and Boundaries

### 8.1 Existing components to generalize

- `src/components/AuthModal.tsx`: provider-neutral entry copy and behavior.
- `src/components/AuthProvider.tsx`: provider-neutral redirect, restoration, linking-required state, and reauthentication.
- `src/lib/identity-client.ts`: External ID login, logout, safe return paths, and reauthentication navigation.
- `src/lib/easy-auth-principal.ts`: exact provider/issuer claim parsing into `VerifiedProviderIdentity`.
- `src/lib/identity-server.ts`: raw provider verification and canonical identity resolution.
- `src/lib/auth-server.ts`: canonical authorization and recent-auth enforcement.
- `src/lib/account-server.ts`: canonical UID use and identity-safe account initialization.
- `src/app/api/auth/session/route.ts`: provider-neutral, minimal session DTO.
- `src/app/api/legal/acceptance/route.ts`: transactional identity/account initialization and `identity_link_required` handling.
- `src/lib/auth-redirect.ts`: provider-neutral pending legal-acceptance state.

### 8.2 New focused components

- `src/lib/identity-link-policy.ts`: deterministic HMAC-key, ownership, registration, retention, and link-intent rules without datastore or runtime imports.
- `src/lib/identity-link-server.ts`: configured key adapters, canonical resolution, initialization, link-intent I/O, and link transactions.
- `src/app/api/auth/link-intent/route.ts`: authenticated, throttled linking-intent creation.
- `src/app/api/auth/link-intent/complete/route.ts`: same-origin POST completion and transactional intent consumption.
- `src/app/auth/complete-link/page.tsx`: accessible completion and recovery UI.
- `scripts/backfill-identity-links.ts`: dry-run and missing-only registry backfill with conflict reporting.
- reviewed branding source assets under `public/brand/identity/` and an infrastructure-owned branding manifest that contains no secret.

These paths and responsibility boundaries are required. Claim parsing, canonical resolution, account initialization, and linking-intent mutation must not be combined into one large authentication module.

### 8.3 Infrastructure and operations

- `infra/azure/main.bicep`: production custom OIDC provider parameters and Key Vault secret references while retaining direct Google during migration.
- `infra/azure/qa.bicep`: isolated QA External ID provider and environment variables.
- `.github/workflows/azure-qa.yml`: immutable QA configuration inputs and validation.
- `.github/workflows/azure-staging.yml`: inactive production-ready configuration behind approval and feature gates.
- `scripts/check-release-env.mjs`: require complete, internally consistent External ID settings only when the feature is enabled.
- `scripts/check-production-health.mjs`: report the enabled authentication mode without exposing provider secrets.
- `src/lib/runtime-environment.ts` and related runtime inventory: explicit environment and feature-gate state.

## 9. Feature and Rollout Gates

Use explicit server-side gates:

- `EXTERNAL_ID_AUTH_ENABLED=false` by default;
- `DIRECT_GOOGLE_AUTH_ENABLED=true` during migration; and
- a production retirement gate that cannot disable direct Google until migration evidence and owner approval are recorded.

The application must reject an invalid state in which no production authentication provider is enabled. Build-time public flags may control display only; server authorization and provider acceptance use server-side configuration.

Rollout sequence:

1. **Baseline:** capture current direct-Google local and isolated-QA behavior, account counts, and recent-auth evidence.
2. **Registry preparation:** run the backfill dry run, resolve every duplicate/conflict, run missing-only write, and prove idempotency.
3. **Local implementation:** add provider-neutral identity code, link registries, UI, tests, and inactive configuration.
4. **Isolated QA identity:** after explicit external-change approval, create/configure the QA External ID tenant, application, user flow, Google client, branding, and Key Vault secret.
5. **QA acceptance:** deploy an immutable commit to isolated QA and complete the live acceptance matrix in section 10.
6. **Production configuration inactive:** after approval, create/configure production External ID resources and deploy code with External ID still disabled.
7. **Owner pilot:** enable External ID only for the owner and named test accounts while direct Google remains available.
8. **New-account rollout:** enable External ID for new sign-ups; keep direct Google for existing unmigrated learners.
9. **Migration window:** invite existing learners to link the new method and monitor failures, duplicate prevention, support load, and account continuity.
10. **Provider retirement:** disable direct Google only after all release criteria pass and Victor explicitly approves retirement. Remove its secret only after rollback retention expires.

At every stage, local changes, commit, push, deployment, configuration, and production verification are reported separately.

## 10. Verification

### 10.1 Automated tests

Add tests for:

- exact provider and issuer acceptance;
- malformed, spoofed, missing, and wrong-provider identity headers;
- verified email normalization without provider-specific alias rewriting;
- HMAC identity and email registry keys;
- canonical resolution for existing Google, new External ID, and migrated identities;
- dry-run, missing-only, idempotent, duplicate, and conflict backfill behavior;
- transactional new-account initialization;
- refusal to auto-link a matching email;
- linking-intent expiration, single use, account binding, and email equality;
- concurrent account creation and linking races;
- same-origin redirect enforcement;
- recent-auth success and fail-closed behavior;
- provider-neutral legal-acceptance restoration;
- generic public errors and bounded session DTOs;
- modal focus trap, focus restoration, keyboard use, legal gating, and browse-without-account behavior;
- responsive layouts at 320, 390, and desktop widths;
- light/dark theme contrast and reduced-motion behavior; and
- continued authorization of owner, plan, course, privacy, deletion, and support APIs through canonical UIDs.

### 10.2 Live isolated-QA matrix

The exact immutable QA commit must prove:

- new non-Gmail email-code sign-up;
- returning email-code sign-in;
- new Gmail/Google sign-up through Google federation;
- returning Google sign-in;
- legal acceptance stored only after authenticated return;
- direct-Google existing learner migration to External ID with unchanged canonical UID;
- unchanged courses, subscription, progress, reviews, notes, and author access after migration;
- same-email second identity is blocked until explicit linking;
- wrong-email linking fails without mutation;
- expired and replayed linking intents fail without mutation;
- logout removes access to protected APIs;
- session restoration works after a fresh browser navigation;
- sensitive actions require fresh Google and fresh email-code authentication;
- absent or stale `auth_time` blocks the action;
- malicious external return URLs resolve to `/`;
- disabled/suspended accounts remain denied by application authorization;
- Google or External ID unavailability produces a recoverable, non-destructive error;
- branded hosted pages display the approved Filosage assets, copy, privacy link, terms link, focus state, and mobile layout; and
- monitoring records bounded success/failure categories without secrets or raw identity payloads.

### 10.3 Release evidence

Before production enablement, retain:

- exact commit SHA and image digest;
- Bicep build output and configuration diff with secret values redacted;
- QA tenant, application, user-flow, provider, and callback inventory;
- registry backfill counts and zero unresolved conflicts;
- automated test output;
- live QA matrix results for both methods;
- recent-auth claim evidence with personal values redacted;
- accessibility evidence for in-app and hosted pages;
- rollback rehearsal result; and
- Multica review-ready record with approvals and blockers.

## 11. Rollback

Rollback never deletes learner accounts or registry records.

- Before production enablement: leave `EXTERNAL_ID_AUTH_ENABLED=false`; no learner impact occurs.
- During owner pilot or new-account rollout: disable the External ID entry gate and keep direct Google enabled.
- After a bad application release: restore traffic to the last verified container revision and exact image digest.
- After an External ID configuration failure: disable the custom OIDC entry point, preserve its configuration for diagnosis, and continue direct Google.
- After a linking defect: disable link-intent creation, preserve existing valid mappings, and reconcile only proven conflicts through an audited non-destructive repair.
- Do not remove the direct Google secret, provider registration, or callback until the migration window and rollback-retention period pass and Victor approves retirement.

External ID customer objects, identity registries, and audit evidence remain intact during rollback. Any later unlink or deletion operation requires a separate reviewed design because it can affect account recovery.

## 12. Acceptance Criteria

The implementation is ready for production review only when:

- learners can choose Google or email one-time code from the branded External ID flow;
- Filosage never receives or stores a password or one-time code;
- Container Apps continues to own the browser session;
- current Google learners retain the same canonical UID and all associated data after migration;
- a matching email alone cannot create an account link or overwrite an existing account;
- duplicate and conflicting registry data fails closed;
- legal acceptance and age confirmation remain authenticated, versioned, and auditable;
- recent authentication works for both methods and fails closed when proof is missing;
- authentication and recovery errors do not enumerate accounts or expose sensitive state;
- secrets exist only in approved Azure-managed secret stores;
- the app modal and hosted pages meet the approved Filosage theme and WCAG 2.2 AA requirements;
- automated and isolated-QA acceptance tests pass against an immutable commit;
- rollback to direct Google has been rehearsed;
- documentation and privacy disclosures match actual deployed behavior;
- `BILLING_ENABLED=false` is unchanged; and
- Victor separately approves production enablement and later direct-Google retirement.

## 13. Source Guidance

- [Microsoft Entra External ID identity providers](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-authentication-methods-customers)
- [Choose an External ID authentication approach](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-choose-authentication-approach)
- [Customize External ID customer branding](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-customize-branding-customers)
- [Azure Container Apps custom OIDC authentication](https://learn.microsoft.com/en-us/azure/container-apps/authentication-openid)
- [Azure Container Apps authentication architecture](https://learn.microsoft.com/en-us/azure/container-apps/authentication)
- [Microsoft Graph user identity update constraints](https://learn.microsoft.com/en-us/graph/api/user-update?view=graph-rest-1.0)
- [Microsoft Entra External ID migration guidance](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-migrate-users)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
- [NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html)
