# Filosage External ID Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure, Filosage-branded sign-up and sign-in system that offers Google and passwordless email one-time codes through Microsoft Entra External ID while preserving every existing learner's canonical account and Azure-managed browser session.

**Architecture:** Microsoft Entra External ID owns Google federation, email-code delivery, credential verification, and the hosted sign-in page. Azure Container Apps Easy Auth remains the session boundary; Filosage parses only Azure-injected claims, resolves each issuer-qualified provider identity through HMAC-keyed registries to a canonical Filosage UID, and links an existing Google account only after recent proof of both identities. The current direct-Google provider stays available behind a separate server gate until migration evidence and an explicit retirement approval exist.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript 5, Zod 4, Azure Container Apps Easy Auth, Microsoft Entra External ID, Bicep `Microsoft.App/containerApps/authConfigs@2025-01-01`, Key Vault-backed Container Apps secrets, the existing Azure PostgreSQL document transaction layer, Playwright 1.61, oxlint, ESLint.

**Spec:** `docs/superpowers/specs/2026-08-18-filosage-external-id-auth-design.md`

## Global Constraints

- Read the approved spec completely before starting, and treat it as the product and security authority for this plan.
- Start execution with `superpowers:using-git-worktrees`; create a clean worktree from the then-current verified `origin/main`, and bring in only the approved authentication spec and plan commits.
- Preserve the user's unrelated changes in the named checkout. Never stage, commit, reset, delete, or move them.
- Read the relevant Next.js 16.2 guides in `node_modules/next/dist/docs/` before editing Route Handlers, cookies, redirects, or authentication code. In this version, `cookies()` is asynchronous and cookies may be changed only in a Server Function or Route Handler.
- Do not add MSAL Browser, Auth.js, a password store, an OTP endpoint, a token verifier, or an application-owned browser session.
- `EXTERNAL_ID_AUTH_ENABLED=false`, `EXTERNAL_ID_NEW_ACCOUNTS_ENABLED=false`, and `DIRECT_GOOGLE_AUTH_ENABLED=true` are the default migration state.
- Reject production configuration in which both External ID and direct Google are disabled.
- Keep `BILLING_ENABLED=false` in Bicep, workflows, release checks, deployments, and verification evidence.
- Existing Google learners keep their current Google subject as the canonical Filosage UID. A new unclaimed External ID learner starts with the External ID subject as canonical UID.
- Never use an email address as the canonical UID and never auto-link identities from email equality alone.
- Registry document IDs use versioned HMAC-SHA-256 keys derived with `IDENTITY_LINK_HMAC_SECRET`; raw emails, raw provider subjects, client secrets, cookies, authorization responses, and one-time codes never appear in document paths or logs.
- This rollout creates the `v1` HMAC secret once and does not rotate it. Rotation requires a separately reviewed dual-read/dual-write `v2` migration so existing registry paths never become unreachable.
- Linking requires a recent direct-Google session, a random single-use 10-minute intent, a fresh External ID authentication, exact normalized verified-email equality, and one transaction that both creates the mapping and consumes the intent.
- Sensitive actions continue to fail closed when `auth_time` is missing, stale, or not proven by live QA for the chosen authentication method.
- Direct Google, the custom OIDC provider, the identity registry, and learner records remain intact during rollback. Provider retirement and secret removal are out of scope until separately approved.
- External tenant creation, identity-provider changes, Graph/portal writes, secret creation or rotation, registry write mode, deployment, traffic changes, production enablement, and direct-Google retirement are separate explicit approval gates.
- QA tenant flows, HMAC registries, link intents, accounts, and acceptance tests use the isolated QA database and QA secret versions; no QA test reads or writes production learner records.
- Authentication security events contain stable codes, a correlation ID, and HMAC-pseudonymous actor keys only. Azure Log Analytics retention remains 30 days.
- The modal and hosted page use the approved copy, Filosage assets, visible keyboard focus, reduced-motion-safe styling, and WCAG 2.2 AA contrast.

---

## Preflight: isolate the work and capture the baseline

Use PowerShell from the named checkout. Do not begin Task 1 in the dirty checkout.

- [ ] **Step 1: Fetch the current remote without changing the checkout**

Run:

```powershell
git fetch origin
git status --short
git rev-parse origin/main
```

Expected: the existing unrelated changes remain listed, and the exact `origin/main` SHA is recorded in Multica as the implementation base.

- [ ] **Step 2: Create the isolated worktree**

Run the `superpowers:using-git-worktrees` workflow, choosing `.worktrees/filosage-external-id-auth` and branch `codex/filosage-external-id-auth-20260818` from `origin/main`.

Expected: `git -C .worktrees/filosage-external-id-auth status --short` is empty before the two documentation commits are brought in.

- [ ] **Step 3: Bring in only the approved spec and plan documentation**

Use the exact spec commit reported in the handoff and the exact plan commit reported in the handoff:

```powershell
git -C .worktrees/filosage-external-id-auth cherry-pick 5e85238019f063ad2670b5e1bd82f73e5d5ccb94
git -C .worktrees/filosage-external-id-auth cherry-pick $env:FILOSAGE_AUTH_PLAN_COMMIT
git -C .worktrees/filosage-external-id-auth status --short
```

Expected: both documentation files exist and the isolated worktree is clean. `FILOSAGE_AUTH_PLAN_COMMIT` is set to the full SHA from the final planning handoff; it is not a secret.

- [ ] **Step 4: Run the current focused baseline**

Run from the isolated worktree:

```powershell
npm.cmd ci
npm.cmd run test:e2e -- tests/azure-infrastructure.spec.ts tests/account-onboarding.spec.ts tests/account-privacy-policy.spec.ts --project=chromium
npm.cmd run lint
```

Expected: the baseline passes. If it does not, record the exact pre-existing failure in Multica and stop before changing authentication code.

## File and responsibility map

### New focused files

| File | Responsibility |
| --- | --- |
| `src/lib/identity-types.ts` | Shared provider and canonical identity types; contains no I/O. |
| `src/lib/auth-runtime.ts` | Parse and validate server-side authentication feature/configuration state. |
| `src/lib/identity-link-policy.ts` | Pure HMAC-key, registration, backfill, retention, and link-intent rules; contains no Next.js or datastore imports. |
| `src/lib/identity-link-server.ts` | Configured HMAC-key adapters, canonical resolution, account registration, link-intent I/O, and link transactions. |
| `src/lib/auth-audit.ts` | Emit bounded authentication security events with pseudonymous actors and correlation IDs. |
| `src/components/IdentityLinkRequiredModal.tsx` | Non-enumerating recovery UI for an email already owned by an existing account. |
| `src/app/api/auth/link-intent/route.ts` | Recently authenticated, rate-limited creation of a link intent and its HTTP-only cookie. |
| `src/app/api/auth/link-intent/complete/route.ts` | Same-origin POST that consumes the link intent after fresh External ID authentication. |
| `src/app/auth/complete-link/page.tsx` | Accessible completion/recovery page. |
| `src/app/auth/complete-link/CompleteIdentityLink.tsx` | Client-side POST and safe navigation for completion. |
| `src/app/auth/complete-link/complete-link.module.css` | Scoped themed completion-page layout. |
| `scripts/identity-maintenance-safety.ts` | Shared environment and datastore-target fingerprint guard for all identity maintenance commands. |
| `scripts/backfill-identity-links.ts` | Dry-run-first, missing-only, idempotent registry backfill. |
| `scripts/prune-identity-link-intents.ts` | Dry-run-first deletion of consumed or expired intents older than 30 days. |
| `tests/auth-identity.spec.ts` | Runtime configuration and claim-parser contracts. |
| `tests/identity-link-server.spec.ts` | Registry, canonicalization, account initialization, and link-domain contracts. |
| `tests/identity-migration.spec.ts` | Backfill and retention-plan contracts. |
| `tests/auth-linking.spec.ts` | Route and browser recovery/linking contracts. |
| `tests/auth-accessibility.spec.ts` | Keyboard, focus, responsive-layout, and automated WCAG checks for both authentication modals. |
| `tests/external-id-branding.spec.ts` | Branding manifest, CSS, assets, privacy, and support contract. |
| `public/brand/identity/filosage-sign-in-banner.png` | 245x36 transparent PNG derived from the unchanged official horizontal Filosage mark for External ID upload. |
| `public/brand/identity/filosage-sign-in-background.png` | PNG derivative of the unchanged approved light hero background for External ID upload. |
| `public/brand/identity/filosage-sign-in-favicon.png` | 32x32 PNG derivative of the existing browser icon for External ID upload. |
| `infra/azure/external-id-branding/manifest.json` | Non-secret source of truth for hosted branding settings and copy. |
| `infra/azure/external-id-branding/custom.css` | External ID CSS using supported `.ext-*` selectors without deprecated positioning. |
| `docs/AUTH_EXTERNAL_ID_RUNBOOK.md` | Approval gates, QA configuration inventory, live matrix, rollback, and retirement criteria. |

### Existing files to modify

| File group | Change |
| --- | --- |
| `src/lib/easy-auth-principal.ts`, `src/lib/identity-server.ts`, `src/lib/auth-server.ts` | Separate raw provider identity from canonical authorization and accept only enabled exact providers/issuers. |
| `src/lib/account-server.ts`, `src/app/api/account/route.ts`, `src/app/api/legal/acceptance/route.ts`, `src/app/api/auth/session/route.ts`, `src/lib/course-types.ts` | Use canonical UIDs and expose bounded onboarding/link-required state. |
| `src/lib/identity-client.ts`, `src/lib/auth-redirect.ts`, `src/components/AuthProvider.tsx`, `src/components/AuthModal.tsx`, `src/components/LegalConsentModal.tsx`, `src/components/AppShell.tsx` | Provider-neutral login, restoration, recovery, reauthentication, and approved modal copy. |
| `src/app/course/[topic]/page.tsx`, `src/app/course/[topic]/lesson/[lessonId]/page.tsx`, `src/app/progress/page.tsx`, `src/app/profile/page.tsx`, `src/app/privacy-center/page.tsx`, `src/app/review/page.tsx`, `src/app/pricing/page.tsx`, `src/components/flashcards/FlashcardStudio.tsx`, `src/components/support/SupportCenter.tsx` | Replace Google-specific context method names with provider-neutral methods. |
| `src/lib/api-security.ts`, `src/lib/request-rate-limit.ts` | Reuse unchanged trusted-mutation and durable throttling boundaries; only add a namespace if a source-level inventory requires it. |
| `src/lib/runtime-config.ts`, `src/lib/azure-infrastructure.ts`, `src/app/api/health/route.ts`, `.env.example` | Validate flags/secrets and report only a bounded auth mode. |
| `src/lib/legal.ts`, `src/app/privacy/page.tsx`, `src/content/support/articles/sign-in-help.ts`, `src/content/support/articles/privacy-controls.ts`, `src/content/support/articles/getting-started.ts` | Accurate External ID, Google federation, email-code, identity-link, and retention disclosures. |
| `infra/azure/main.bicep`, `infra/azure/qa.bicep` | Key Vault references, direct Google plus named `filosage` custom OIDC provider, and fail-closed flags. |
| `.github/workflows/azure-qa.yml`, `.github/workflows/azure-staging.yml`, `scripts/check-release-env.mjs`, `scripts/check-production-health.mjs`, `package.json`, `package-lock.json` | Immutable configuration validation, inactive rollout state, migration/retention commands, locked operator dependencies, and bounded health evidence. |
| `tests/azure-infrastructure.spec.ts`, `tests/release-scripts.spec.ts`, `tests/account-onboarding.spec.ts`, `tests/account-privacy-policy.spec.ts`, `tests/example.spec.ts` | Update existing contracts without weakening owner, privacy, deletion, legal, or modal coverage. |

### Boundary rules

- `easy-auth-principal.ts` parses Azure-injected claims only; it does not read or write the registry.
- `identity-link-policy.ts` contains deterministic rules only and is directly unit-tested; it imports no `server-only`, runtime environment, Next.js, or datastore module.
- `identity-link-server.ts` owns secret lookup plus all registry and intent reads/mutations; API routes do not duplicate its transaction rules.
- `identity-server.ts` obtains a raw provider identity and asks `identity-link-server.ts` for its canonical user.
- `auth-server.ts` authorizes canonical users and never authorizes an email address or raw provider subject directly.
- Client code receives only canonical UID, display fields, provider label, recent-auth boolean, and bounded auth-mode flags.
- The External ID secret and HMAC secret are server-only Key Vault-backed values and never use `NEXT_PUBLIC_` names.

---

### Task 1: Provider-neutral runtime configuration and verified claim parsing

**Files:**
- Create: `src/lib/identity-types.ts`
- Create: `src/lib/auth-runtime.ts`
- Modify: `src/lib/easy-auth-principal.ts`
- Modify: `src/lib/identity-server.ts`
- Create: `tests/auth-identity.spec.ts`
- Modify: `tests/azure-infrastructure.spec.ts`

**Interfaces:**
- Consumes: Azure Easy Auth headers; `serverEnvironment: NodeJS.ProcessEnv`.
- Produces: `IdentityProviderId`, `VerifiedProviderIdentity`, `VerifiedUser`, `AuthenticationRuntimeConfiguration`, `authenticationRuntimeConfiguration(env?)`, `authenticationConfigurationIssues(config)`, and `easyAuthIdentityFromHeaders(headers, config)`.

- [ ] **Step 1: Write failing runtime and claim-parser tests**

Create `tests/auth-identity.spec.ts` with these contracts:

```ts
import { expect, test } from "@playwright/test";
import {
  authenticationConfigurationIssues,
  authenticationRuntimeConfiguration,
} from "../src/lib/auth-runtime";
import { easyAuthIdentityFromHeaders } from "../src/lib/easy-auth-principal";

function principal(provider: string, claims: Array<{ typ: string; val: string }>) {
  return Buffer.from(JSON.stringify({ auth_typ: provider, claims })).toString("base64");
}

const dual = authenticationRuntimeConfiguration({
  NODE_ENV: "production",
  AZURE_EASY_AUTH_ENABLED: "true",
  DIRECT_GOOGLE_AUTH_ENABLED: "true",
  EXTERNAL_ID_AUTH_ENABLED: "true",
  EXTERNAL_ID_NEW_ACCOUNTS_ENABLED: "false",
  EXTERNAL_ID_ISSUER: "https://qa-filosage.ciamlogin.com/11111111-1111-1111-1111-111111111111/v2.0",
});

test("authentication configuration fails closed when no provider is enabled", () => {
  const config = authenticationRuntimeConfiguration({
    NODE_ENV: "production",
    AZURE_EASY_AUTH_ENABLED: "true",
    DIRECT_GOOGLE_AUTH_ENABLED: "false",
    EXTERNAL_ID_AUTH_ENABLED: "false",
    EXTERNAL_ID_NEW_ACCOUNTS_ENABLED: "false",
  });
  expect(authenticationConfigurationIssues(config)).toContain(
    "At least one production authentication provider must be enabled.",
  );
});

test("new External ID accounts cannot be enabled before the provider", () => {
  const config = authenticationRuntimeConfiguration({
    NODE_ENV: "production",
    AZURE_EASY_AUTH_ENABLED: "true",
    DIRECT_GOOGLE_AUTH_ENABLED: "true",
    EXTERNAL_ID_AUTH_ENABLED: "false",
    EXTERNAL_ID_NEW_ACCOUNTS_ENABLED: "true",
  });
  expect(authenticationConfigurationIssues(config)).toContain(
    "EXTERNAL_ID_NEW_ACCOUNTS_ENABLED requires EXTERNAL_ID_AUTH_ENABLED.",
  );
});

test("parses exact enabled External ID claims into an issuer-qualified identity", () => {
  const headers = new Headers({
    "x-ms-client-principal-idp": "filosage",
    "x-ms-client-principal": principal("filosage", [
      { typ: "iss", val: dual.externalIdIssuer! },
      { typ: "sub", val: "external-subject" },
      { typ: "email", val: " Learner@Example.com " },
      { typ: "name", val: "Learner" },
      { typ: "auth_time", val: "1750000000" },
    ]),
  });
  expect(easyAuthIdentityFromHeaders(headers, dual)).toEqual({
    provider: "filosage",
    issuer: dual.externalIdIssuer,
    subject: "external-subject",
    email: "learner@example.com",
    emailVerified: true,
    authTime: 1_750_000_000,
    name: "Learner",
    picture: undefined,
  });
});

test("rejects disabled providers, wrong issuers, malformed email, and missing subjects", () => {
  const encoded = principal("filosage", [
    { typ: "iss", val: "https://attacker.invalid/v2.0" },
    { typ: "sub", val: "external-subject" },
    { typ: "email", val: "learner@example.com" },
  ]);
  expect(easyAuthIdentityFromHeaders(new Headers({
    "x-ms-client-principal-idp": "filosage",
    "x-ms-client-principal": encoded,
  }), dual)).toBeNull();
  expect(easyAuthIdentityFromHeaders(new Headers({
    "x-ms-client-principal-idp": "github",
    "x-ms-client-principal": principal("github", [
      { typ: "sub", val: "subject" },
      { typ: "email", val: "learner@example.com" },
    ]),
  }), dual)).toBeNull();
  expect(easyAuthIdentityFromHeaders(new Headers({
    "x-ms-client-principal-idp": "filosage",
    "x-ms-client-principal": principal("filosage", [
      { typ: "iss", val: dual.externalIdIssuer! },
      { typ: "email", val: "learner@example.com" },
    ]),
  }), dual)).toBeNull();
  expect(easyAuthIdentityFromHeaders(new Headers({
    "x-ms-client-principal-idp": "filosage",
    "x-ms-client-principal": principal("google", [
      { typ: "iss", val: dual.externalIdIssuer! },
      { typ: "sub", val: "external-subject" },
      { typ: "email", val: "not-an-email" },
    ]),
  }), dual)).toBeNull();
});

test("normalizes case and surrounding whitespace without provider alias rewriting", () => {
  const headers = new Headers({
    "x-ms-client-principal-idp": "google",
    "x-ms-client-principal": principal("google", [
      { typ: "sub", val: "google-subject" },
      { typ: "email", val: " Learner+Study@Gmail.com " },
      { typ: "email_verified", val: "true" },
    ]),
  });
  expect(easyAuthIdentityFromHeaders(headers, dual)?.email).toBe("learner+study@gmail.com");
});
```

Move the old Google-only parser assertions out of `tests/azure-infrastructure.spec.ts`; keep that file's infrastructure and no-browser-SDK assertions.

- [ ] **Step 2: Run the tests and verify the new module imports fail**

Run:

```powershell
npm.cmd run test:e2e -- tests/auth-identity.spec.ts --project=chromium
```

Expected: FAIL because `identity-types.ts` and `auth-runtime.ts` do not exist and the parser still accepts only its old `(headers, enabled)` signature.

- [ ] **Step 3: Add the shared identity types**

Create `src/lib/identity-types.ts`:

```ts
export const DIRECT_GOOGLE_ISSUER = "https://accounts.google.com" as const;

export type IdentityProviderId = "google" | "filosage" | "local";

export interface VerifiedProviderIdentity {
  provider: IdentityProviderId;
  issuer: string;
  subject: string;
  email: string;
  emailVerified: true;
  authTime?: number;
  name?: string;
  picture?: string;
}

export interface VerifiedUser {
  uid: string;
  email: string;
  email_verified: true;
  auth_time?: number;
  name?: string;
  picture?: string;
  providerIdentity: VerifiedProviderIdentity;
  identityLinkRegistered: boolean;
}
```

- [ ] **Step 4: Implement explicit runtime parsing and validation**

Create `src/lib/auth-runtime.ts`:

```ts
import { serverEnvironment } from "@/lib/runtime-environment";
import { DIRECT_GOOGLE_ISSUER } from "@/lib/identity-types";

export { DIRECT_GOOGLE_ISSUER } from "@/lib/identity-types";
export const EXTERNAL_ID_PROVIDER_NAME = "filosage";

export interface AuthenticationRuntimeConfiguration {
  easyAuthEnabled: boolean;
  directGoogleEnabled: boolean;
  externalIdEnabled: boolean;
  externalIdNewAccountsEnabled: boolean;
  externalIdIssuer: string | null;
  directGoogleIssuer: typeof DIRECT_GOOGLE_ISSUER;
}

function booleanSetting(value: string | undefined, fallback: boolean) {
  if (value === undefined || value.trim() === "") return fallback;
  return value.trim().toLowerCase() === "true";
}

export function authenticationRuntimeConfiguration(
  env: Record<string, string | undefined> = serverEnvironment,
): AuthenticationRuntimeConfiguration {
  return {
    easyAuthEnabled: booleanSetting(env.AZURE_EASY_AUTH_ENABLED, false),
    directGoogleEnabled: booleanSetting(env.DIRECT_GOOGLE_AUTH_ENABLED, true),
    externalIdEnabled: booleanSetting(env.EXTERNAL_ID_AUTH_ENABLED, false),
    externalIdNewAccountsEnabled: booleanSetting(env.EXTERNAL_ID_NEW_ACCOUNTS_ENABLED, false),
    externalIdIssuer: env.EXTERNAL_ID_ISSUER?.trim().replace(/\/$/, "") || null,
    directGoogleIssuer: DIRECT_GOOGLE_ISSUER,
  };
}

export function authenticationConfigurationIssues(config: AuthenticationRuntimeConfiguration) {
  const issues: string[] = [];
  if (config.easyAuthEnabled && !config.directGoogleEnabled && !config.externalIdEnabled) {
    issues.push("At least one production authentication provider must be enabled.");
  }
  if (config.externalIdEnabled && !config.externalIdIssuer) {
    issues.push("EXTERNAL_ID_ISSUER is required when EXTERNAL_ID_AUTH_ENABLED is true.");
  }
  if (config.externalIdNewAccountsEnabled && !config.externalIdEnabled) {
    issues.push("EXTERNAL_ID_NEW_ACCOUNTS_ENABLED requires EXTERNAL_ID_AUTH_ENABLED.");
  }
  return issues;
}
```

- [ ] **Step 5: Replace the Google-only parser with the exact provider/issuer parser**

Keep the existing safe Base64/JSON decoding helpers in `src/lib/easy-auth-principal.ts`, import the new types/config, and replace the exported parser with:

```ts
import type { AuthenticationRuntimeConfiguration } from "@/lib/auth-runtime";
import type { VerifiedProviderIdentity } from "@/lib/identity-types";

function normalizedEmail(value: string | undefined) {
  const email = value?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function easyAuthIdentityFromHeaders(
  headers: Headers,
  config: AuthenticationRuntimeConfiguration,
): VerifiedProviderIdentity | null {
  if (!config.easyAuthEnabled) return null;
  const encoded = headers.get("x-ms-client-principal")?.trim();
  if (!encoded) return null;
  const principal = decodedPrincipal(encoded);
  if (!principal) return null;
  const claims = Array.isArray(principal.claims) ? principal.claims as EasyAuthClaim[] : [];
  const headerProvider = headers.get("x-ms-client-principal-idp")?.trim().toLowerCase();
  const bodyProvider = String(principal.auth_typ ?? "").trim().toLowerCase();
  if (!headerProvider || !bodyProvider || headerProvider !== bodyProvider) return null;

  const provider = headerProvider === "google" && config.directGoogleEnabled
    ? "google"
    : headerProvider === "filosage" && config.externalIdEnabled
      ? "filosage"
      : null;
  if (!provider) return null;

  const assertedIssuer = claimValue(claims, ["iss"])?.trim().replace(/\/$/, "");
  const expectedIssuer = provider === "google" ? config.directGoogleIssuer : config.externalIdIssuer;
  if (!expectedIssuer || (assertedIssuer && assertedIssuer !== expectedIssuer)) return null;
  if (provider === "filosage" && assertedIssuer !== expectedIssuer) return null;

  const subject = claimValue(claims, [
    "sub",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
  ])?.trim() || (provider === "google" ? headers.get("x-ms-client-principal-id")?.trim() : "");
  const email = normalizedEmail(
    headers.get("x-ms-client-principal-name")
      ?? claimValue(claims, ["email", "emails", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"]),
  );
  if (!subject || !email) return null;
  const verified = claimValue(claims, ["email_verified", "urn:google:email_verified"]);
  if (provider === "google" && verified?.toLowerCase() === "false") return null;

  return {
    provider,
    issuer: expectedIssuer,
    subject,
    email,
    emailVerified: true,
    authTime: integerClaim(claims, ["auth_time", "urn:google:auth_time"]),
    name: claimValue(claims, ["name", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"]),
    picture: claimValue(claims, ["picture", "urn:google:picture"]),
  };
}
```

The External ID email is treated as verified only because the enabled, exact `filosage` user flow is configured for Google federation or local email one-time code; no arbitrary OIDC provider is accepted.

- [ ] **Step 6: Adapt local identities and the server entry point**

In `src/lib/identity-server.ts`, move `VerifiedUser` to `identity-types.ts`, have local fixtures construct `providerIdentity` with provider `local`, issuer `https://local.filosage.invalid`, and `identityLinkRegistered: true`, and expose this provider-level entry point:

```ts
export function verifiedEasyAuthIdentity(request: Request) {
  return easyAuthIdentityFromHeaders(
    request.headers,
    authenticationRuntimeConfiguration(),
  );
}

export async function verifyProviderIdentity(idToken: string) {
  return isLocalMode() ? localVerifiedUser(idToken)?.providerIdentity ?? null : null;
}
```

Keep canonical resolution out of this task; Task 2 will restore `verifiedEasyAuthUser()` and `verifyIdentityToken()` using the registry.

- [ ] **Step 7: Run focused tests and type checking**

Run:

```powershell
npm.cmd run test:e2e -- tests/auth-identity.spec.ts tests/azure-infrastructure.spec.ts --project=chromium
npx.cmd tsc --noEmit --incremental false
```

Expected: PASS, with no browser auth SDK and no client-secret string in `identity-client.ts`.

- [ ] **Step 8: Commit Task 1**

```powershell
git add src/lib/identity-types.ts src/lib/auth-runtime.ts src/lib/easy-auth-principal.ts src/lib/identity-server.ts tests/auth-identity.spec.ts tests/azure-infrastructure.spec.ts
git commit -m "feat: parse managed authentication identities"
```

### Task 2: HMAC registries and canonical identity resolution

**Files:**
- Create: `src/lib/identity-link-policy.ts`
- Create: `src/lib/identity-link-server.ts`
- Modify: `src/lib/identity-server.ts`
- Modify: `src/lib/auth-server.ts`
- Create: `tests/identity-link-server.spec.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `VerifiedProviderIdentity`; explicit secrets in pure policy; `getStoredDocument()` and `IDENTITY_LINK_HMAC_SECRET` in the server adapter.
- Produces: pure `IdentityRegistryKeys` and `identityRegistryKeys(identity, secret)`; server `configuredIdentityRegistryKeys(identity)`; `resolveCanonicalIdentity(identity)`; `identityOnboardingState(user)`; typed errors; restored `verifiedEasyAuthUser(request)` and `verifyIdentityToken(token)` returning canonical `VerifiedUser`.

- [ ] **Step 1: Write failing HMAC and canonicalization tests**

Add to `tests/identity-link-server.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import {
  identityRegistryKeys,
  normalizedVerifiedEmail,
} from "../src/lib/identity-link-policy";
import type { VerifiedProviderIdentity } from "../src/lib/identity-types";

const identity: VerifiedProviderIdentity = {
  provider: "filosage",
  issuer: "https://qa-filosage.ciamlogin.com/11111111-1111-1111-1111-111111111111/v2.0",
  subject: "external-subject",
  email: "Learner@Example.com",
  emailVerified: true,
};

test("identity and email registry paths are deterministic versioned HMACs", async () => {
  const first = await identityRegistryKeys(identity, "test-secret-with-at-least-32-characters");
  const second = await identityRegistryKeys(identity, "test-secret-with-at-least-32-characters");
  expect(second).toEqual(first);
  expect(first.identityPath).toMatch(/^identityLinks\/v1_[a-f0-9]{64}$/);
  expect(first.emailPath).toMatch(/^identityEmailOwners\/v1_[a-f0-9]{64}$/);
  expect(JSON.stringify(first)).not.toContain(identity.subject);
  expect(JSON.stringify(first)).not.toContain("learner@example.com");
});

test("issuer and provider are part of the identity key", async () => {
  const base = await identityRegistryKeys(identity, "test-secret-with-at-least-32-characters");
  const otherIssuer = await identityRegistryKeys(
    { ...identity, issuer: "https://production-filosage.ciamlogin.com/tenant/v2.0" },
    "test-secret-with-at-least-32-characters",
  );
  const otherProvider = await identityRegistryKeys(
    { ...identity, provider: "google" },
    "test-secret-with-at-least-32-characters",
  );
  expect(otherIssuer.identityPath).not.toBe(base.identityPath);
  expect(otherProvider.identityPath).not.toBe(base.identityPath);
  expect(otherIssuer.emailPath).toBe(base.emailPath);
});

test("email normalization changes case and surrounding whitespace only", () => {
  expect(normalizedVerifiedEmail(" Learner+Study@Gmail.com ")).toBe("learner+study@gmail.com");
  expect(normalizedVerifiedEmail("not-an-email")).toBeNull();
});
```

- [ ] **Step 2: Run the registry tests and verify they fail**

Run:

```powershell
npm.cmd run test:e2e -- tests/identity-link-server.spec.ts --project=chromium
```

Expected: FAIL because `identity-link-policy.ts` does not exist.

- [ ] **Step 3: Implement versioned HMAC registry keys and typed errors**

Create `src/lib/identity-link-policy.ts` with no `server-only`, environment, Next.js, or datastore imports:

```ts
import type { VerifiedProviderIdentity } from "@/lib/identity-types";

export const REGISTRY_KEY_VERSION = "v1" as const;

export class IdentityLinkRequiredError extends Error {
  readonly code = "identity_link_required";
  constructor() {
    super("This email is already connected to a Filosage learning account. Confirm your existing sign-in to connect the new method.");
  }
}

export class IdentityRegistryConflictError extends Error {
  readonly code = "identity_registry_conflict";
  constructor() {
    super("The identity registry is inconsistent; no account data was changed.");
  }
}

export function normalizedVerifiedEmail(value: string) {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function requiredExplicitHmacSecret(value: string) {
  const secret = value.trim();
  if (secret.length < 32) throw new Error("IDENTITY_LINK_HMAC_SECRET must contain at least 32 characters.");
  return secret;
}

export async function hmacHex(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requiredExplicitHmacSecret(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  ));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface IdentityRegistryKeys {
  identityHash: string;
  emailHash: string;
  identityPath: string;
  emailPath: string;
}

export async function identityRegistryKeys(identity: VerifiedProviderIdentity, secret: string) {
  const email = normalizedVerifiedEmail(identity.email);
  if (!email || !identity.emailVerified || !identity.subject || !identity.issuer) {
    throw new IdentityRegistryConflictError();
  }
  const [identityHash, emailHash] = await Promise.all([
    hmacHex(JSON.stringify([REGISTRY_KEY_VERSION, identity.provider, identity.issuer, identity.subject]), secret),
    hmacHex(JSON.stringify([REGISTRY_KEY_VERSION, email]), secret),
  ]);
  return {
    identityHash,
    emailHash,
    identityPath: `identityLinks/${REGISTRY_KEY_VERSION}_${identityHash}`,
    emailPath: `identityEmailOwners/${REGISTRY_KEY_VERSION}_${emailHash}`,
  } satisfies IdentityRegistryKeys;
}
```

Create the beginning of `src/lib/identity-link-server.ts` as the only configuration/I/O adapter:

```ts
import "server-only";

import { getStoredDocument } from "@/lib/document-store";
import {
  IdentityRegistryConflictError,
  identityRegistryKeys as identityRegistryKeysWithSecret,
} from "@/lib/identity-link-policy";
import { isLocalMode } from "@/lib/local-mode";
import { serverEnvironment } from "@/lib/runtime-environment";
import type { VerifiedProviderIdentity, VerifiedUser } from "@/lib/identity-types";

export {
  IdentityLinkRequiredError,
  IdentityRegistryConflictError,
} from "@/lib/identity-link-policy";

function requiredHmacSecret(explicit?: string) {
  const secret = explicit?.trim()
    || serverEnvironment.IDENTITY_LINK_HMAC_SECRET?.trim()
    || (isLocalMode() ? "filosage-local-identity-link-secret-v1" : "");
  if (secret.length < 32) throw new Error("IDENTITY_LINK_HMAC_SECRET must contain at least 32 characters.");
  return secret;
}

export function configuredIdentityRegistryKeys(identity: VerifiedProviderIdentity, explicit?: string) {
  return identityRegistryKeysWithSecret(identity, requiredHmacSecret(explicit));
}
```

- [ ] **Step 4: Add canonical resolution and bounded onboarding state**

Append these functions to `identity-link-server.ts`, using `configuredIdentityRegistryKeys()` for every registry lookup:

```ts
function canonicalUser(
  identity: VerifiedProviderIdentity,
  uid: string,
  identityLinkRegistered: boolean,
): VerifiedUser {
  return {
    uid,
    email: identity.email,
    email_verified: true,
    auth_time: identity.authTime,
    name: identity.name,
    picture: identity.picture,
    providerIdentity: identity,
    identityLinkRegistered,
  };
}

export async function resolveCanonicalIdentity(identity: VerifiedProviderIdentity) {
  if (identity.provider === "local") return canonicalUser(identity, identity.subject, true);
  const keys = await configuredIdentityRegistryKeys(identity);
  const link = await getStoredDocument(keys.identityPath);
  const canonicalUid = typeof link?.canonicalUid === "string" ? link.canonicalUid.trim() : "";
  if (!canonicalUid) return canonicalUser(identity, identity.subject, false);
  if (link?.keyVersion !== REGISTRY_KEY_VERSION || link?.identityHash !== keys.identityHash) {
    throw new IdentityRegistryConflictError();
  }
  return canonicalUser(identity, canonicalUid, true);
}

export type IdentityOnboardingState = "ready" | "new_account" | "identity_link_required";

export async function identityOnboardingState(user: VerifiedUser): Promise<IdentityOnboardingState> {
  const keys = await configuredIdentityRegistryKeys(user.providerIdentity);
  const [account, emailOwner] = await Promise.all([
    getStoredDocument(`users/${user.uid}`),
    getStoredDocument(keys.emailPath),
  ]);
  if (account) return "ready";
  const ownerUid = typeof emailOwner?.canonicalUid === "string" ? emailOwner.canonicalUid : "";
  if (ownerUid && ownerUid !== user.uid) return "identity_link_required";
  return "new_account";
}
```

- [ ] **Step 5: Restore canonical server identity entry points**

In `src/lib/identity-server.ts`, make `verifiedEasyAuthUser()` and `verifyIdentityToken()` resolve provider identities:

```ts
export async function verifiedEasyAuthUser(request: Request) {
  const identity = verifiedEasyAuthIdentity(request);
  return identity ? resolveCanonicalIdentity(identity) : null;
}

export async function verifyIdentityToken(idToken: string) {
  if (!isLocalMode()) return null;
  const identity = await verifyProviderIdentity(idToken);
  return identity ? resolveCanonicalIdentity(identity) : null;
}
```

Update `getVerifiedUser()` in `src/lib/auth-server.ts` to `await verifiedEasyAuthUser(request)`. Keep every authorization function operating on canonical `user.uid`.

- [ ] **Step 6: Inventory the dedicated secret without creating it**

Add to `.env.example`:

```dotenv
AZURE_EASY_AUTH_ENABLED=false
DIRECT_GOOGLE_AUTH_ENABLED=true
EXTERNAL_ID_AUTH_ENABLED=false
EXTERNAL_ID_NEW_ACCOUNTS_ENABLED=false
EXTERNAL_ID_ISSUER=
IDENTITY_LINK_HMAC_SECRET=
```

Do not place a sample secret value in source control.

- [ ] **Step 7: Run focused authorization regressions**

Run:

```powershell
npm.cmd run test:e2e -- tests/auth-identity.spec.ts tests/identity-link-server.spec.ts tests/account-privacy-policy.spec.ts --project=chromium
npx.cmd tsc --noEmit --incremental false
```

Expected: PASS; owner, deletion, and plan authorization still consume canonical UIDs.

- [ ] **Step 8: Commit Task 2**

```powershell
git add .env.example src/lib/identity-link-policy.ts src/lib/identity-link-server.ts src/lib/identity-server.ts src/lib/auth-server.ts tests/identity-link-server.spec.ts
git commit -m "feat: resolve canonical learner identities"
```

### Task 3: Transactional identity registration and account onboarding

**Files:**
- Modify: `src/lib/identity-link-policy.ts`
- Modify: `src/lib/identity-link-server.ts`
- Modify: `src/app/api/legal/acceptance/route.ts`
- Modify: `src/lib/account-server.ts`
- Modify: `src/app/api/account/route.ts`
- Modify: `src/app/api/auth/session/route.ts`
- Modify: `src/lib/course-types.ts`
- Modify: `tests/identity-link-server.spec.ts`
- Modify: `tests/account-onboarding.spec.ts`

**Interfaces:**
- Consumes: canonical `VerifiedUser`, legal acceptance input, current account documents, identity/email registry documents.
- Produces: `preparedIdentityRegistration(user)`, `identityRegistrationWrites(documents, registration, now, options)`, `identityLinkRequired` account DTO field, and minimal session DTO field `authenticationProvider`.

- [ ] **Step 1: Add failing registration and public-state tests**

Extend `tests/identity-link-server.spec.ts` with pure transaction-plan tests using records keyed by the returned paths:

```ts
import {
  ExternalIdSignupUnavailableError,
  IdentityLinkRequiredError,
  identityRegistrationWrites,
  prepareIdentityRegistration,
} from "../src/lib/identity-link-policy";
import type { VerifiedUser } from "../src/lib/identity-types";

const unregisteredUser: VerifiedUser = {
  uid: "external-subject",
  email: "learner@example.com",
  email_verified: true,
  providerIdentity: identity,
  identityLinkRegistered: false,
};

test("new account registration writes identity and email ownership to one canonical UID", async () => {
  const registration = await prepareIdentityRegistration(
    unregisteredUser,
    "test-secret-with-at-least-32-characters",
  );
  const writes = identityRegistrationWrites(
    {},
    registration,
    "2026-08-18T12:00:00.000Z",
    { allowNewExternalAccounts: true },
  );
  expect(writes).toEqual([
    expect.objectContaining({ path: registration.identityPath, data: expect.objectContaining({ canonicalUid: "external-subject" }) }),
    expect.objectContaining({ path: registration.emailPath, data: expect.objectContaining({ canonicalUid: "external-subject" }) }),
  ]);
});

test("an owned email never auto-links a second identity", async () => {
  const registration = await prepareIdentityRegistration(
    unregisteredUser,
    "test-secret-with-at-least-32-characters",
  );
  expect(() => identityRegistrationWrites(
    {
      [registration.emailPath]: { id: "owner", canonicalUid: "existing-google-uid", keyVersion: "v1", emailHash: registration.emailHash },
    },
    registration,
    "2026-08-18T12:00:00.000Z",
    { allowNewExternalAccounts: true },
  )).toThrow(IdentityLinkRequiredError);
});

test("an inactive External ID signup gate cannot create a new account", async () => {
  const registration = await prepareIdentityRegistration(
    unregisteredUser,
    "test-secret-with-at-least-32-characters",
  );
  expect(() => identityRegistrationWrites(
    {},
    registration,
    "2026-08-18T12:00:00.000Z",
    { allowNewExternalAccounts: false },
  )).toThrow(ExternalIdSignupUnavailableError);
});
```

In `tests/account-onboarding.spec.ts`, add an API assertion that a pre-account response may return:

```ts
expect(await response.json()).toMatchObject({
  applicationAccountExists: false,
  legalAcceptanceRequired: false,
  identityLinkRequired: true,
});
```

and that legal acceptance returns status `409` with only:

```ts
{ code: "identity_link_required", error: "This email is already connected to a Filosage learning account. Confirm your existing sign-in to connect the new method." }
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```powershell
npm.cmd run test:e2e -- tests/identity-link-server.spec.ts tests/account-onboarding.spec.ts --project=chromium
```

Expected: FAIL because registration planning and `identityLinkRequired` do not exist.

- [ ] **Step 3: Implement pure registry registration planning**

Extend the policy's type import to include `VerifiedUser`, then append the pure types, errors, and write planner to `src/lib/identity-link-policy.ts`:

```ts
export interface PreparedIdentityRegistration extends IdentityRegistryKeys {
  canonicalUid: string;
  provider: VerifiedProviderIdentity["provider"];
}

export class ExternalIdSignupUnavailableError extends Error {
  readonly code = "external_id_signup_unavailable";
  constructor() {
    super("Email-code sign-up is not available yet. You can continue with Google.");
  }
}

export async function prepareIdentityRegistration(user: VerifiedUser, secret: string) {
  const keys = await identityRegistryKeys(user.providerIdentity, secret);
  return {
    ...keys,
    canonicalUid: user.uid,
    provider: user.providerIdentity.provider,
  } satisfies PreparedIdentityRegistration;
}

export function identityRegistrationWrites(
  documents: Record<string, Record<string, unknown> | null>,
  registration: PreparedIdentityRegistration,
  now: string,
  options: { allowNewExternalAccounts: boolean },
) {
  const link = documents[registration.identityPath];
  const emailOwner = documents[registration.emailPath];
  const linkedUid = typeof link?.canonicalUid === "string" ? link.canonicalUid : "";
  const ownerUid = typeof emailOwner?.canonicalUid === "string" ? emailOwner.canonicalUid : "";
  if ((linkedUid && linkedUid !== registration.canonicalUid)
    || link?.identityHash && link.identityHash !== registration.identityHash) {
    throw new IdentityRegistryConflictError();
  }
  if (ownerUid && ownerUid !== registration.canonicalUid) throw new IdentityLinkRequiredError();
  if (emailOwner?.emailHash && emailOwner.emailHash !== registration.emailHash) {
    throw new IdentityRegistryConflictError();
  }
  if (registration.provider === "filosage" && !link && !options.allowNewExternalAccounts) {
    throw new ExternalIdSignupUnavailableError();
  }
  return [
    ...(!link ? [{
      path: registration.identityPath,
      data: {
        schemaVersion: 1,
        keyVersion: REGISTRY_KEY_VERSION,
        identityHash: registration.identityHash,
        canonicalUid: registration.canonicalUid,
        provider: registration.provider,
        createdAt: now,
        updatedAt: now,
      },
    }] : []),
    ...(!emailOwner ? [{
      path: registration.emailPath,
      data: {
        schemaVersion: 1,
        keyVersion: REGISTRY_KEY_VERSION,
        emailHash: registration.emailHash,
        canonicalUid: registration.canonicalUid,
        createdAt: now,
        updatedAt: now,
      },
    }] : []),
  ];
}
```

In `src/lib/identity-link-server.ts`, import `prepareIdentityRegistration` as `prepareIdentityRegistrationWithSecret`, extend the existing policy re-export list with `ExternalIdSignupUnavailableError` and `identityRegistrationWrites`, and add the configured wrapper used by routes:

```ts
export function preparedIdentityRegistration(user: VerifiedUser, explicit?: string) {
  return prepareIdentityRegistrationWithSecret(user, requiredHmacSecret(explicit));
}
```

- [ ] **Step 4: Put identity, account, consent, and signup event in one legal-acceptance transaction**

In `src/app/api/legal/acceptance/route.ts`, compute `registration` and `authConfig` before the transaction, add both registry paths to the transaction read set, and call `identityRegistrationWrites()` first:

```ts
const registration = await preparedIdentityRegistration(user);
const authConfig = authenticationRuntimeConfiguration();
const accountPath = `users/${user.uid}`;
const acceptancePath = `${accountPath}/legalAcceptances/${id}`;
const signupEventPath = `productEvents/signup-completed-${user.uid}`;
const transactionPaths = [
  registration.identityPath,
  registration.emailPath,
  accountPath,
  acceptancePath,
  signupEventPath,
];
```

Pass `transactionPaths` to the existing `runStoredDocumentTransaction`. Immediately after its current `existingAccount` and `existingAcceptance` reads, insert:

```ts
const registryWrites = identityRegistrationWrites(
  documents,
  registration,
  acceptedAt,
  { allowNewExternalAccounts: authConfig.externalIdNewAccountsEnabled },
);
```

Keep the current server-derived `source`, `context`, `sources`, and `contexts` calculations and all three existing record bodies in the callback. Change only the current `writes` initializer so it begins with `...registryWrites` before the existing legal-acceptance and account records. Keep the existing `if (!existingAccount) writes.push(...)` signup-event block and `PRODUCT_EVENT_SCHEMA_VERSION` unchanged. This makes all five paths participate in the same transaction without introducing a second write phase.

Catch `IdentityLinkRequiredError` before the generic response:

```ts
if (error instanceof IdentityLinkRequiredError) {
  return Response.json(
    { code: error.code, error: error.message },
    { status: 409, headers: { "Cache-Control": "private, no-store" } },
  );
}
if (error instanceof ExternalIdSignupUnavailableError) {
  return Response.json(
    { code: error.code, error: error.message },
    { status: 503, headers: { "Cache-Control": "private, no-store", "Retry-After": "300" } },
  );
}
```

The inactive new-account flag is therefore enforced inside the durable transaction path, not only hidden in the UI. It does not block direct Google registration or an External ID identity whose registry link already exists.

- [ ] **Step 5: Return bounded onboarding and session state**

In `src/app/api/account/route.ts`, after `requireUser()` and before the normal null-account response, call `identityOnboardingState(user)`. For `identity_link_required`, return the existing zero-capability shape with:

```ts
{
  legalAcceptanceRequired: false,
  applicationAccountExists: false,
  identityLinkRequired: true,
}
```

For an unclaimed new account return `identityLinkRequired: false` and keep `legalAcceptanceRequired: true`. For an existing account return `identityLinkRequired: false`.

Add to `LearnerAccount` in `src/lib/course-types.ts`:

```ts
identityLinkRequired?: boolean;
```

In `src/app/api/auth/session/route.ts`, keep raw subject and issuer private and add only:

```ts
authenticationProvider: user.providerIdentity.provider,
```

- [ ] **Step 6: Verify onboarding, legal, and account authorization**

Run:

```powershell
npm.cmd run test:e2e -- tests/identity-link-server.spec.ts tests/account-onboarding.spec.ts tests/account-privacy-policy.spec.ts --project=chromium
npx.cmd tsc --noEmit --incremental false
```

Expected: PASS. A same-email second identity receives the generic link-required state and no account, consent, or signup event is created.

- [ ] **Step 7: Commit Task 3**

```powershell
git add src/lib/identity-link-policy.ts src/lib/identity-link-server.ts src/app/api/legal/acceptance/route.ts src/lib/account-server.ts src/app/api/account/route.ts src/app/api/auth/session/route.ts src/lib/course-types.ts tests/identity-link-server.spec.ts tests/account-onboarding.spec.ts
git commit -m "feat: register identities with learner accounts"
```

### Task 4: Dry-run-first registry backfill and intent retention tooling

**Files:**
- Modify: `src/lib/identity-link-policy.ts`
- Modify: `src/lib/identity-link-server.ts`
- Create: `scripts/identity-maintenance-safety.ts`
- Create: `scripts/backfill-identity-links.ts`
- Create: `scripts/prune-identity-link-intents.ts`
- Create: `tests/identity-migration.spec.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: paged `users` and `identityLinkIntents` documents; direct-Google issuer; registry planning functions.
- Produces: pure `planIdentityBackfill(accounts, existing, secret, now?)`, `identityIntentPathsToPrune(records, now)`, configured server wrappers, and commands `migrate:identity-links` and `maintenance:identity-link-intents`.

- [ ] **Step 1: Write failing backfill and retention tests**

Create `tests/identity-migration.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import {
  identityIntentPathsToPrune,
  planIdentityBackfill,
} from "../src/lib/identity-link-policy";
import {
  assertIdentityMaintenanceWriteTarget,
  identityMaintenanceTarget,
} from "../scripts/identity-maintenance-safety";

const secret = "test-secret-with-at-least-32-characters";

test("backfill creates missing Google links and email owners without overwrites", async () => {
  const plan = await planIdentityBackfill([
    { uid: "google-a", email: "A@example.com" },
    { uid: "google-b", email: "B@example.com" },
  ], {}, secret);
  expect(plan.errors).toEqual([]);
  expect(plan.candidates).toHaveLength(2);
  expect(plan.writes).toHaveLength(4);
  expect(plan.counts).toEqual({ accounts: 2, missing: 4, exact: 0, invalid: 0, duplicateEmails: 0, conflicts: 0 });
});

test("backfill is idempotent against exact existing registry documents", async () => {
  const first = await planIdentityBackfill([{ uid: "google-a", email: "a@example.com" }], {}, secret);
  const existing = Object.fromEntries(first.writes.map((write) => [write.path, { id: write.path.split("/").at(-1), ...write.data }]));
  const second = await planIdentityBackfill([{ uid: "google-a", email: "a@example.com" }], existing, secret);
  expect(second.errors).toEqual([]);
  expect(second.writes).toEqual([]);
  expect(second.counts.exact).toBe(2);
});

test("duplicate normalized emails and conflicting mappings fail the plan", async () => {
  const duplicate = await planIdentityBackfill([
    { uid: "google-a", email: "Learner@example.com" },
    { uid: "google-b", email: " learner@EXAMPLE.com " },
  ], {}, secret);
  expect(duplicate.writes).toEqual([]);
  expect(duplicate.counts.duplicateEmails).toBe(1);

  const initial = await planIdentityBackfill([{ uid: "google-a", email: "a@example.com" }], {}, secret);
  const identityWrite = initial.writes.find((write) => write.path.startsWith("identityLinks/"))!;
  const conflict = await planIdentityBackfill([{ uid: "google-a", email: "a@example.com" }], {
    [identityWrite.path]: { id: "conflict", ...identityWrite.data, canonicalUid: "different-uid" },
  }, secret);
  expect(conflict.writes).toEqual([]);
  expect(conflict.counts.conflicts).toBe(1);
});

test("intent pruning selects only consumed or expired records older than 30 days", () => {
  const now = Date.parse("2026-08-18T12:00:00.000Z");
  expect(identityIntentPathsToPrune([
    { id: "old-used", usedAt: "2026-07-01T00:00:00.000Z", expiresAt: "2026-07-01T00:10:00.000Z" },
    { id: "old-expired", usedAt: null, expiresAt: "2026-07-10T00:00:00.000Z" },
    { id: "recent-used", usedAt: "2026-08-10T00:00:00.000Z", expiresAt: "2026-08-10T00:10:00.000Z" },
    { id: "active", usedAt: null, expiresAt: "2026-08-18T12:05:00.000Z" },
  ], now)).toEqual([
    "identityLinkIntents/old-used",
    "identityLinkIntents/old-expired",
  ]);
});

test("write confirmation identifies the datastore without exposing its credential", () => {
  const target = identityMaintenanceTarget({
    DATABASE_URL: "postgresql://operator:private-value@qa-db.example:5432/filosageqa?sslmode=require",
    AZURE_POSTGRES_SERVER_NAME: "qa-db",
  });
  expect(target).toBe("postgres:qa-db/filosageqa");
  expect(target).not.toContain("operator");
  expect(target).not.toContain("private-value");
  expect(() => assertIdentityMaintenanceWriteTarget(
    ["--apply", "--expected-target=postgres:production-db/filosage"],
    target,
    { OPERATIONS_ENVIRONMENT: "qa" },
  )).toThrow(/exact target/i);
});
```

- [ ] **Step 2: Run the migration tests and verify they fail**

Run:

```powershell
npm.cmd run test:e2e -- tests/identity-migration.spec.ts --project=chromium
```

Expected: FAIL because the backfill and pruning planners are not defined.

- [ ] **Step 3: Implement pure backfill and pruning planners**

Append these exported pure contracts to `identity-link-policy.ts`:

```ts
import { DIRECT_GOOGLE_ISSUER } from "@/lib/identity-types";

export interface BackfillAccountInput { uid: string; email: string }
export interface RegistryWrite { path: string; data: Record<string, unknown> }

function exactRegistryRecord(
  value: Record<string, unknown> | null | undefined,
  expected: Record<string, unknown>,
) {
  return Object.entries(expected).every(([key, item]) => value?.[key] === item);
}

export async function planIdentityBackfill(
  accounts: BackfillAccountInput[],
  existing: Record<string, Record<string, unknown> | null>,
  secret: string,
  now = new Date().toISOString(),
) {
  const errors: string[] = [];
  const candidates: Array<{ account: BackfillAccountInput; registration: PreparedIdentityRegistration }> = [];
  const emailOwners = new Map<string, string>();
  let invalid = 0;
  let duplicateEmails = 0;
  let conflicts = 0;
  let exact = 0;

  for (const account of accounts) {
    const email = normalizedVerifiedEmail(account.email);
    if (!account.uid.trim() || !email) { invalid += 1; continue; }
    const priorUid = emailOwners.get(email);
    if (priorUid && priorUid !== account.uid) {
      duplicateEmails += 1;
      errors.push("Two existing accounts share one normalized verified email.");
      continue;
    }
    emailOwners.set(email, account.uid);
    const providerIdentity: VerifiedProviderIdentity = {
      provider: "google",
      issuer: DIRECT_GOOGLE_ISSUER,
      subject: account.uid,
      email,
      emailVerified: true,
    };
    const user: VerifiedUser = {
      uid: account.uid,
      email,
      email_verified: true,
      providerIdentity,
      identityLinkRegistered: false,
    };
    candidates.push({ account: { uid: account.uid, email }, registration: await prepareIdentityRegistration(user, secret) });
  }

  const writes: RegistryWrite[] = [];
  for (const { registration } of candidates) {
    const expected = identityRegistrationWrites(
      {},
      registration,
      now,
      { allowNewExternalAccounts: false },
    );
    for (const write of expected) {
      const found = existing[write.path];
      const stableExpected = Object.fromEntries(
        Object.entries(write.data).filter(([key]) => !["createdAt", "updatedAt"].includes(key)),
      );
      if (!found) writes.push(write);
      else if (exactRegistryRecord(found, stableExpected)) exact += 1;
      else {
        conflicts += 1;
        errors.push("An existing identity registry record conflicts with the expected canonical UID.");
      }
    }
  }
  if (duplicateEmails || conflicts) writes.length = 0;
  return {
    candidates,
    writes,
    errors,
    counts: {
      accounts: accounts.length,
      missing: writes.length,
      exact,
      invalid,
      duplicateEmails,
      conflicts,
    },
  };
}

export const IDENTITY_LINK_INTENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function identityIntentPathsToPrune(
  records: Array<{ id: string; expiresAt?: unknown; usedAt?: unknown }>,
  now = Date.now(),
) {
  const cutoff = now - IDENTITY_LINK_INTENT_RETENTION_MS;
  return records.flatMap((record) => {
    const terminal = typeof record.usedAt === "string" ? Date.parse(record.usedAt)
      : typeof record.expiresAt === "string" ? Date.parse(record.expiresAt)
      : Number.NaN;
    return Number.isFinite(terminal) && terminal <= cutoff
      ? [`identityLinkIntents/${record.id}`]
      : [];
  });
}
```

In `identity-link-server.ts`, import the pure function as `planIdentityBackfillWithSecret`, re-export `identityIntentPathsToPrune`, and add:

```ts
export function planIdentityBackfill(
  accounts: BackfillAccountInput[],
  existing: Record<string, Record<string, unknown> | null>,
  explicit?: string,
  now = new Date().toISOString(),
) {
  return planIdentityBackfillWithSecret(accounts, existing, requiredHmacSecret(explicit), now);
}
```

- [ ] **Step 4: Implement the dry-run-first backfill command**

Create `scripts/identity-maintenance-safety.ts`:

```ts
export function identityMaintenanceTarget(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (databaseUrl) {
    const parsed = new URL(databaseUrl);
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    const server = env.AZURE_POSTGRES_SERVER_NAME?.trim() || parsed.hostname;
    if (!server || !database) throw new Error("The PostgreSQL maintenance target is incomplete.");
    return `postgres:${server}/${database}`;
  }
  throw new Error("No supported identity-maintenance datastore is configured.");
}

export function assertIdentityMaintenanceWriteTarget(
  args: string[],
  actualTarget: string,
  env: Record<string, string | undefined> = process.env,
) {
  const expected = args.find((value) => value.startsWith("--expected-target="))?.slice(18).trim();
  if (!expected || expected !== actualTarget) {
    throw new Error("Write mode requires --expected-target to exactly match the configured datastore.");
  }
  if (!["qa", "production"].includes(env.OPERATIONS_ENVIRONMENT?.trim() ?? "")) {
    throw new Error("Write mode requires OPERATIONS_ENVIRONMENT=qa or production.");
  }
}
```

Create `scripts/backfill-identity-links.ts` with this control flow:

```ts
import {
  getStoredDocument,
  listCollectionDocumentsPage,
  runStoredDocumentTransaction,
} from "../src/lib/document-store.ts";
import {
  identityRegistrationWrites,
  planIdentityBackfill,
} from "../src/lib/identity-link-server.ts";
import {
  assertIdentityMaintenanceWriteTarget,
  identityMaintenanceTarget,
} from "./identity-maintenance-safety.ts";

const apply = process.argv.includes("--apply");
const missingOnly = process.argv.includes("--missing-only");
if (apply && !missingOnly) throw new Error("Write mode requires --apply --missing-only.");
if (apply) assertIdentityMaintenanceWriteTarget(process.argv, identityMaintenanceTarget());

const accounts: Array<{ uid: string; email: string }> = [];
let afterId: string | undefined;
do {
  const page = await listCollectionDocumentsPage("users", { limit: 250, afterId });
  for (const record of page.documents) {
    accounts.push({
      uid: typeof record.uid === "string" && record.uid.trim() ? record.uid.trim() : record.id,
      email: typeof record.email === "string" ? record.email : "",
    });
  }
  afterId = page.nextAfterId ?? undefined;
} while (afterId);

const plannedAt = new Date().toISOString();
const preliminary = await planIdentityBackfill(accounts, {}, undefined, plannedAt);
const existingEntries = await Promise.all(preliminary.candidates.flatMap(({ registration }) =>
  [registration.identityPath, registration.emailPath].map(async (path) => [path, await getStoredDocument(path)] as const),
));
const plan = await planIdentityBackfill(accounts, Object.fromEntries(existingEntries), undefined, plannedAt);
console.log(JSON.stringify({ mode: apply ? "write" : "dry-run", counts: plan.counts, errors: plan.errors.length }));
if (plan.errors.length || plan.counts.invalid) {
  throw new Error("Identity registry preflight failed; no registry writes were attempted.");
}
if (!apply) {
  console.log("Dry run complete. Write mode remains approval-gated.");
  process.exit(0);
}

for (const { registration } of plan.candidates) {
  await runStoredDocumentTransaction(
    [registration.identityPath, registration.emailPath],
    (documents) => ({
      writes: identityRegistrationWrites(
        documents,
        registration,
        plannedAt,
        { allowNewExternalAccounts: false },
      ),
      result: undefined,
    }),
  );
}
console.log(JSON.stringify({ mode: "write", accounts: plan.candidates.length, completed: true }));
```

The command reports counts only; it never prints UIDs, email addresses, document payloads, hashes, or secret values.

- [ ] **Step 5: Implement dry-run-first 30-day intent pruning**

Create `scripts/prune-identity-link-intents.ts`:

```ts
import {
  deleteStoredDocuments,
  listCollectionDocumentsPage,
} from "../src/lib/document-store.ts";
import { identityIntentPathsToPrune } from "../src/lib/identity-link-server.ts";
import {
  assertIdentityMaintenanceWriteTarget,
  identityMaintenanceTarget,
} from "./identity-maintenance-safety.ts";

const apply = process.argv.includes("--apply");
const retentionConfirmed = process.argv.includes("--confirm-30-day-retention");
if (apply && !retentionConfirmed) throw new Error("Prune write mode requires --confirm-30-day-retention.");
if (apply) assertIdentityMaintenanceWriteTarget(process.argv, identityMaintenanceTarget());
const paths: string[] = [];
let afterId: string | undefined;
do {
  const page = await listCollectionDocumentsPage("identityLinkIntents", { limit: 250, afterId });
  paths.push(...identityIntentPathsToPrune(page.documents));
  afterId = page.nextAfterId ?? undefined;
} while (afterId);

console.log(JSON.stringify({ mode: apply ? "write" : "dry-run", eligible: paths.length, retentionDays: 30 }));
if (!apply) process.exit(0);
for (let offset = 0; offset < paths.length; offset += 250) {
  await deleteStoredDocuments(paths.slice(offset, offset + 250));
}
console.log(JSON.stringify({ mode: "write", pruned: paths.length, completed: true }));
```

No scheduled apply run is enabled in source during this task. The production retention schedule is an external operational change covered by the final approval gate.

- [ ] **Step 6: Add package commands and verify dry-run behavior**

Install the minimal TypeScript runtime and the standard Next.js server-boundary marker so the operator scripts can resolve the repository's TypeScript path aliases outside the Next bundler:

```powershell
npm.cmd install --save-dev tsx
npm.cmd install server-only
```

Inspect the resulting `package.json` and `package-lock.json`; do not accept unrelated dependency changes. Then add to `package.json` scripts:

```json
"migrate:identity-links": "node --conditions=react-server --import tsx scripts/backfill-identity-links.ts",
"maintenance:identity-link-intents": "node --conditions=react-server --import tsx scripts/prune-identity-link-intents.ts"
```

Run:

```powershell
npm.cmd run test:e2e -- tests/identity-migration.spec.ts tests/identity-link-server.spec.ts --project=chromium
npx.cmd tsc --noEmit --incremental false
```

Expected: PASS. Do not run `migrate:identity-links -- --apply --missing-only` or the pruning command with `--apply` in this task.

- [ ] **Step 7: Commit Task 4**

```powershell
git add src/lib/identity-link-policy.ts src/lib/identity-link-server.ts scripts/identity-maintenance-safety.ts scripts/backfill-identity-links.ts scripts/prune-identity-link-intents.ts tests/identity-migration.spec.ts package.json package-lock.json
git commit -m "feat: prepare identity registry migration"
```

### Task 5: Single-use link intents, recent-auth enforcement, and bounded audit events

**Files:**
- Create: `src/lib/auth-audit.ts`
- Modify: `src/lib/identity-link-policy.ts`
- Modify: `src/lib/identity-link-server.ts`
- Modify: `src/lib/auth-server.ts`
- Modify: `tests/identity-link-server.spec.ts`
- Modify: `tests/account-privacy-policy.spec.ts`

**Interfaces:**
- Consumes: a recently authenticated canonical direct-Google user; a freshly authenticated External ID provider identity; the existing HMAC registry.
- Produces: `createIdentityLinkIntent(user, returnPath, options?)`, `completeIdentityLinkIntent(token, identity, options?)`, `LinkIntentError`, `recordAuthenticationEvent(event)`, and `requireProviderIdentity(request)`.

- [ ] **Step 1: Write failing link-domain tests**

Add focused tests in `tests/identity-link-server.spec.ts` for the exported pure validators and opaque token helpers:

```ts
import {
  LinkIntentError,
  linkIntentPath,
  safeAuthenticationReturnPath,
  validateLinkCompletion,
} from "../src/lib/identity-link-policy";

test("link-intent values are opaque, HMAC-keyed, and paths contain no raw token", async () => {
  const token = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFG";
  const path = await linkIntentPath(token, "test-secret-with-at-least-32-characters");
  expect(path).toMatch(/^identityLinkIntents\/v1_[a-f0-9]{64}$/);
  expect(path).not.toContain(token);
});

test("authentication return paths are same-origin path values", () => {
  expect(safeAuthenticationReturnPath("/profile?linked=1")).toBe("/profile?linked=1");
  expect(safeAuthenticationReturnPath("https://attacker.invalid/steal")).toBe("/");
  expect(safeAuthenticationReturnPath("//attacker.invalid/steal")).toBe("/");
});

test("completion requires an unused, unexpired intent and exact email hash", () => {
  const now = Date.parse("2026-08-18T12:05:00.000Z");
  const valid = {
    canonicalUid: "google-subject",
    emailHash: "email-hash",
    expiresAt: "2026-08-18T12:10:00.000Z",
    usedAt: null,
    returnPath: "/profile",
  };
  expect(validateLinkCompletion(valid, "email-hash", now)).toEqual({ canonicalUid: "google-subject", returnPath: "/profile" });
  expect(() => validateLinkCompletion({ ...valid, emailHash: "different" }, "email-hash", now)).toThrow(LinkIntentError);
  expect(() => validateLinkCompletion({ ...valid, expiresAt: "2026-08-18T12:04:59.000Z" }, "email-hash", now)).toThrow(LinkIntentError);
  expect(() => validateLinkCompletion({ ...valid, usedAt: "2026-08-18T12:01:00.000Z" }, "email-hash", now)).toThrow(LinkIntentError);
});
```

Add an assertion in `tests/account-privacy-policy.spec.ts` that `requireRecentlyAuthenticatedUser()` accepts a newly linked provider resolving to the same canonical UID and still rejects missing or stale `auth_time`.

- [ ] **Step 2: Run the link-domain tests and verify they fail**

Run:

```powershell
npm.cmd run test:e2e -- tests/identity-link-server.spec.ts tests/account-privacy-policy.spec.ts --project=chromium
```

Expected: FAIL because link-intent helpers and provider-level authorization do not exist.

- [ ] **Step 3: Add bounded audit event emission**

Create `src/lib/auth-audit.ts`:

```ts
import "server-only";

import { serverEnvironment } from "@/lib/runtime-environment";

export type AuthenticationEventCode =
  | "account.identity_link_started"
  | "account.identity_link_succeeded"
  | "account.identity_link_failed"
  | "account.identity_registry_backfilled"
  | "account.identity_provider_retired";

export interface AuthenticationAuditEvent {
  code: AuthenticationEventCode;
  outcome: "allowed" | "denied";
  correlationId: string;
  actorKey?: string;
  reason?: "expired" | "replayed" | "email_mismatch" | "mapping_conflict" | "recent_auth_missing";
}

export function recordAuthenticationEvent(event: AuthenticationAuditEvent) {
  const environment = serverEnvironment.OPERATIONS_ENVIRONMENT?.trim() || "local";
  console.info(JSON.stringify({
    type: "filosage.authentication",
    schemaVersion: 1,
    environment,
    ...event,
  }));
}
```

Only pass HMAC-derived actor keys to this function. Do not pass email, UID, subject, token, cookie, claim payload, or secret.

- [ ] **Step 4: Implement token hashing, return-path safety, and validation**

In `identity-link-policy.ts`, export:

```ts
export const IDENTITY_LINK_INTENT_TTL_MS = 10 * 60 * 1000;

export class LinkIntentError extends Error {
  constructor(
    public readonly reason: "expired" | "replayed" | "email_mismatch" | "mapping_conflict" | "invalid",
  ) {
    super(reason === "expired"
      ? "That confirmation expired. Sign in with your existing method and try again."
      : "We could not connect that sign-in method. No account data was changed.");
  }
}

export function safeAuthenticationReturnPath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const parsed = new URL(value, "https://filosage.invalid");
    return parsed.origin === "https://filosage.invalid"
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : "/";
  } catch {
    return "/";
  }
}

export async function opaqueIdentityKey(scope: string, value: string, secret: string) {
  return hmacHex(JSON.stringify([REGISTRY_KEY_VERSION, scope, value]), secret);
}

export async function linkIntentPath(token: string, secret: string) {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) throw new LinkIntentError("invalid");
  return `identityLinkIntents/${REGISTRY_KEY_VERSION}_${await opaqueIdentityKey("link-intent", token, secret)}`;
}

export function validateLinkCompletion(
  intent: Record<string, unknown>,
  expectedEmailHash: string,
  now: number,
) {
  if (intent.usedAt) throw new LinkIntentError("replayed");
  const expiresAt = typeof intent.expiresAt === "string" ? Date.parse(intent.expiresAt) : Number.NaN;
  if (!Number.isFinite(expiresAt) || expiresAt < now) throw new LinkIntentError("expired");
  if (intent.emailHash !== expectedEmailHash) throw new LinkIntentError("email_mismatch");
  const canonicalUid = typeof intent.canonicalUid === "string" ? intent.canonicalUid : "";
  if (!canonicalUid) throw new LinkIntentError("invalid");
  return { canonicalUid, returnPath: safeAuthenticationReturnPath(String(intent.returnPath ?? "/")) };
}
```

In `identity-link-server.ts`, re-export `LinkIntentError` and add configured adapters:

```ts
function configuredOpaqueIdentityKey(scope: string, value: string) {
  return opaqueIdentityKey(scope, value, requiredHmacSecret());
}

function configuredLinkIntentPath(token: string) {
  return linkIntentPath(token, requiredHmacSecret());
}
```

- [ ] **Step 5: Implement creation and completion transactions**

Add the I/O functions to `identity-link-server.ts`:

```ts
import { runStoredDocumentTransaction } from "@/lib/document-store";
import { hasRecentAuthentication } from "@/lib/recent-auth";
import { recordAuthenticationEvent } from "@/lib/auth-audit";

function randomLinkToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

export async function createIdentityLinkIntent(
  user: VerifiedUser,
  returnPath: string,
  options: { now?: number; token?: string } = {},
) {
  if (user.providerIdentity.provider !== "google" || !user.identityLinkRegistered) {
    throw new LinkIntentError("invalid");
  }
  const now = options.now ?? Date.now();
  const token = options.token ?? randomLinkToken();
  const [intentPath, keys] = await Promise.all([
    configuredLinkIntentPath(token),
    configuredIdentityRegistryKeys(user.providerIdentity),
  ]);
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + IDENTITY_LINK_INTENT_TTL_MS).toISOString();
  await runStoredDocumentTransaction(
    [intentPath, keys.identityPath, keys.emailPath, `users/${user.uid}`],
    (documents) => {
      if (documents[intentPath]) throw new LinkIntentError("mapping_conflict");
      if (documents[keys.identityPath]?.canonicalUid !== user.uid
        || documents[keys.emailPath]?.canonicalUid !== user.uid
        || !documents[`users/${user.uid}`]) throw new LinkIntentError("mapping_conflict");
      return {
        writes: [{ path: intentPath, data: {
          schemaVersion: 1,
          keyVersion: REGISTRY_KEY_VERSION,
          canonicalUid: user.uid,
          sourceIdentityHash: keys.identityHash,
          emailHash: keys.emailHash,
          returnPath: safeAuthenticationReturnPath(returnPath),
          createdAt,
          expiresAt,
          usedAt: null,
        } }],
        result: undefined,
      };
    },
  );
  const correlationId = crypto.randomUUID();
  recordAuthenticationEvent({
    code: "account.identity_link_started",
    outcome: "allowed",
    correlationId,
    actorKey: await configuredOpaqueIdentityKey("actor", user.uid),
  });
  return { token, expiresAt, correlationId };
}

export async function completeIdentityLinkIntent(
  token: string,
  identity: VerifiedProviderIdentity,
  options: { now?: number } = {},
) {
  const now = options.now ?? Date.now();
  if (identity.provider !== "filosage"
    || !hasRecentAuthentication(identity.authTime, Math.floor(now / 1_000))) {
    throw new LinkIntentError("invalid");
  }
  const [intentPath, keys] = await Promise.all([
    configuredLinkIntentPath(token),
    configuredIdentityRegistryKeys(identity),
  ]);
  const result = await runStoredDocumentTransaction(
    [intentPath, keys.identityPath, keys.emailPath],
    (documents) => {
      const intent = documents[intentPath];
      if (!intent) throw new LinkIntentError("invalid");
      const validated = validateLinkCompletion(intent, keys.emailHash, now);
      const mappedUid = documents[keys.identityPath]?.canonicalUid;
      const emailOwnerUid = documents[keys.emailPath]?.canonicalUid;
      if ((mappedUid && mappedUid !== validated.canonicalUid)
        || emailOwnerUid !== validated.canonicalUid) throw new LinkIntentError("mapping_conflict");
      return {
        writes: [
          ...(!documents[keys.identityPath] ? [{ path: keys.identityPath, data: {
            schemaVersion: 1,
            keyVersion: REGISTRY_KEY_VERSION,
            identityHash: keys.identityHash,
            canonicalUid: validated.canonicalUid,
            provider: identity.provider,
            createdAt: new Date(now).toISOString(),
            updatedAt: new Date(now).toISOString(),
          } }] : []),
          { path: intentPath, data: { ...intent, usedAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() } },
        ],
        result: validated,
      };
    },
  );
  const correlationId = crypto.randomUUID();
  recordAuthenticationEvent({
    code: "account.identity_link_succeeded",
    outcome: "allowed",
    correlationId,
    actorKey: await configuredOpaqueIdentityKey("actor", result.canonicalUid),
  });
  return { ...result, correlationId };
}
```

Wrap denied completions at the API boundary with `account.identity_link_failed` and one allowed `reason`; logging failure must not expose the token or raw identity.

- [ ] **Step 6: Expose provider identity only to trusted server code**

Add to `src/lib/auth-server.ts`:

```ts
export async function requireProviderIdentity(request: Request) {
  const identity = !isLocalMode()
    ? verifiedEasyAuthIdentity(request)
    : await verifyProviderIdentity(request.headers.get("authorization")?.replace(/^Bearer\s+/, "") ?? "");
  if (!identity?.emailVerified) {
    throw new AuthorizationError(401, "Sign in with a verified account to continue.");
  }
  return identity;
}
```

Keep `requireUser()` canonical. Do not export raw claims to a client route.

- [ ] **Step 7: Run focused domain and recent-auth tests**

Run:

```powershell
npm.cmd run test:e2e -- tests/identity-link-server.spec.ts tests/account-privacy-policy.spec.ts --project=chromium
npx.cmd tsc --noEmit --incremental false
```

Expected: PASS; expired, replayed, wrong-email, stale-auth, and conflicting mappings all fail without a registry mutation.

- [ ] **Step 8: Commit Task 5**

```powershell
git add src/lib/auth-audit.ts src/lib/identity-link-policy.ts src/lib/identity-link-server.ts src/lib/auth-server.ts tests/identity-link-server.spec.ts tests/account-privacy-policy.spec.ts
git commit -m "feat: add secure identity linking intents"
```

### Task 6: Linking Route Handlers and accessible completion flow

**Files:**
- Create: `src/app/api/auth/link-intent/route.ts`
- Create: `src/app/api/auth/link-intent/complete/route.ts`
- Create: `src/app/auth/complete-link/page.tsx`
- Create: `src/app/auth/complete-link/CompleteIdentityLink.tsx`
- Create: `src/app/auth/complete-link/complete-link.module.css`
- Create: `tests/auth-linking.spec.ts`

**Interfaces:**
- Consumes: `requireRecentlyAuthenticatedUser()`, `requireProviderIdentity()`, trusted mutation metadata, durable rate limiting, link-domain functions.
- Produces: `POST /api/auth/link-intent`, `POST /api/auth/link-intent/complete`, HTTP-only cookie `filosage_identity_link_intent`, and `/auth/complete-link` UI.

- [ ] **Step 1: Write failing source and browser route contracts**

Create `tests/auth-linking.spec.ts` with source assertions plus one local browser contract:

```ts
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const createRoute = readFileSync("src/app/api/auth/link-intent/route.ts", "utf8");
const completeRoute = readFileSync("src/app/api/auth/link-intent/complete/route.ts", "utf8");

test("link mutation routes require recent identity, same-origin POST, and durable throttling", () => {
  expect(createRoute).toContain("requireRecentlyAuthenticatedUser");
  expect(createRoute).toContain("assertTrustedMutation");
  expect(createRoute).toContain('enforceDurableRateLimit(request, "identity-link-create", 5');
  expect(completeRoute).toContain("requireProviderIdentity");
  expect(completeRoute).toContain("assertTrustedMutation");
  expect(completeRoute).toContain('enforceDurableRateLimit(request, "identity-link-complete", 8');
});

test("link intent cookie is HTTP-only, secure in production, Lax, short-lived, and cleared", () => {
  expect(createRoute).toContain('name: "filosage_identity_link_intent"');
  expect(createRoute).toContain("httpOnly: true");
  expect(createRoute).toContain('sameSite: "lax"');
  expect(createRoute).toContain("maxAge: 10 * 60");
  expect(completeRoute).toContain("maxAge: 0");
});

test("completion page reports failure without exposing account state", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One browser contract is sufficient.");
  await page.route("**/api/auth/link-intent/complete", (route) => route.fulfill({
    status: 409,
    json: { error: "That confirmation expired. Sign in with your existing method and try again." },
  }));
  await page.goto("/auth/complete-link");
  await expect(page.getByRole("heading", { name: "We could not connect that sign-in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Return to Filosage" })).toHaveAttribute("href", "/");
});
```

- [ ] **Step 2: Run the route tests and verify missing files fail**

Run:

```powershell
npm.cmd run test:e2e -- tests/auth-linking.spec.ts --project=chromium
```

Expected: FAIL because the routes and page do not exist.

- [ ] **Step 3: Implement recently authenticated intent creation**

Create `src/app/api/auth/link-intent/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getExistingAccount } from "@/lib/account-server";
import { apiRequestErrorResponse, assertTrustedMutation } from "@/lib/api-security";
import { authorizationResponse, hasCurrentLegalAcceptance, requireRecentlyAuthenticatedUser } from "@/lib/auth-server";
import { createIdentityLinkIntent } from "@/lib/identity-link-server";
import { enforceDurableRateLimit } from "@/lib/request-rate-limit";
import { serverEnvironment } from "@/lib/runtime-environment";

export async function POST(request: Request) {
  try {
    assertTrustedMutation(request);
    const user = await requireRecentlyAuthenticatedUser(
      request,
      "Sign in again with your existing Google method before connecting a new sign-in.",
      "recent_authentication_required",
    );
    const account = await getExistingAccount(user);
    if (!account || !hasCurrentLegalAcceptance(account)) {
      return Response.json({ error: "Complete account setup before connecting another sign-in." }, { status: 403 });
    }
    const limited = await enforceDurableRateLimit(request, "identity-link-create", 5, 10 * 60_000, user.uid);
    if (limited) return limited;
    const returnPath = new URL(request.url).searchParams.get("return") ?? "/profile";
    const intent = await createIdentityLinkIntent(user, returnPath);
    const response = NextResponse.json({
      redirectTo: `/.auth/login/filosage?post_login_redirect_uri=${encodeURIComponent("/auth/complete-link")}`,
      expiresAt: intent.expiresAt,
    }, { headers: { "Cache-Control": "private, no-store" } });
    response.cookies.set({
      name: "filosage_identity_link_intent",
      value: intent.token,
      httpOnly: true,
      secure: serverEnvironment.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "The secure connection could not be started." }, { status: 503 });
  }
}
```

- [ ] **Step 4: Implement same-origin completion and cookie clearing**

Create `src/app/api/auth/link-intent/complete/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { apiRequestErrorResponse, assertTrustedMutation } from "@/lib/api-security";
import { authorizationResponse, requireProviderIdentity } from "@/lib/auth-server";
import { recordAuthenticationEvent } from "@/lib/auth-audit";
import { completeIdentityLinkIntent, LinkIntentError } from "@/lib/identity-link-server";
import { enforceDurableRateLimit } from "@/lib/request-rate-limit";

const COOKIE = "filosage_identity_link_intent";

export async function POST(request: NextRequest) {
  try {
    assertTrustedMutation(request);
    const limited = await enforceDurableRateLimit(request, "identity-link-complete", 8, 10 * 60_000);
    if (limited) return limited;
    const identity = await requireProviderIdentity(request);
    const token = request.cookies.get(COOKIE)?.value ?? "";
    const result = await completeIdentityLinkIntent(token, identity);
    const response = NextResponse.json(
      { linked: true, returnPath: result.returnPath },
      { headers: { "Cache-Control": "private, no-store" } },
    );
    response.cookies.set({ name: COOKIE, value: "", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    const correlationId = crypto.randomUUID();
    if (error instanceof LinkIntentError) {
      recordAuthenticationEvent({
        code: "account.identity_link_failed",
        outcome: "denied",
        correlationId,
        reason: error.reason === "invalid" ? "mapping_conflict" : error.reason,
      });
      const response = NextResponse.json({ error: error.message, correlationId }, { status: 409 });
      response.cookies.set({ name: COOKIE, value: "", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
      return response;
    }
    return apiRequestErrorResponse(error)
      ?? authorizationResponse(error)
      ?? NextResponse.json({ error: "The sign-in connection could not be completed.", correlationId }, { status: 503 });
  }
}
```

The same environment-derived `secure` rule is used when setting the intent cookie in the creation route, so local HTTP tests work while deployed production remains secure-only.

- [ ] **Step 5: Build the accessible themed completion page**

Create `src/app/auth/complete-link/page.tsx`:

```tsx
import CompleteIdentityLink from "./CompleteIdentityLink";

export const metadata = { title: "Connect secure sign-in" };

export default function CompleteLinkPage() {
  return <CompleteIdentityLink />;
}
```

Create `CompleteIdentityLink.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import FilosageMark from "@/components/FilosageMark";
import styles from "./complete-link.module.css";

type State =
  | { status: "working" }
  | { status: "done"; returnPath: string }
  | { status: "error"; message: string };

export default function CompleteIdentityLink() {
  const [state, setState] = useState<State>({ status: "working" });
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    void fetch("/api/auth/link-intent/complete", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    }).then(async (response) => {
      const body = await response.json().catch(() => ({})) as { error?: string; returnPath?: string };
      if (!response.ok) throw new Error(body.error || "The sign-in connection could not be completed.");
      if (active) setState({ status: "done", returnPath: body.returnPath || "/profile" });
    }).catch((error: unknown) => {
      if (active) setState({
        status: "error",
        message: controller.signal.aborted
          ? "The secure connection took too long. Return to Filosage and try again."
          : error instanceof Error ? error.message : "The sign-in connection could not be completed.",
      });
    }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, []);

  return <main className={styles.page}>
    <section className={styles.card} aria-live="polite">
      <FilosageMark title="Filosage" />
      {state.status === "working" && <><p className="overline">Secure sign-in</p><h1>Connecting your sign-in</h1><p>Your learning data is not being moved or copied.</p></>}
      {state.status === "done" && <><p className="overline">Connected</p><h1>Your sign-in is connected</h1><p>Your courses, progress, notes, and review dates remain with the same Filosage account.</p><Link className="button button-primary" href={state.returnPath}>Continue learning</Link></>}
      {state.status === "error" && <><p className="overline">Nothing changed</p><h1>We could not connect that sign-in</h1><p role="alert">{state.message}</p><Link className="button button-primary" href="/">Return to Filosage</Link></>}
    </section>
  </main>;
}
```

Create scoped CSS that uses existing variables and no motion when reduced motion is requested:

```css
.page { min-height: 100dvh; display: grid; place-items: center; padding: 24px; background: var(--surface-muted); color: var(--ink); }
.card { width: min(100%, 520px); display: grid; gap: 16px; padding: clamp(24px, 6vw, 44px); border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); box-shadow: 0 18px 48px rgb(7 17 39 / 14%); }
.card h1 { max-width: 18ch; font-size: clamp(1.8rem, 6vw, 2.8rem); line-height: 1.05; }
.card p { color: var(--ink-secondary); line-height: 1.65; }
.card :global(.button) { justify-self: start; }
@media (prefers-reduced-motion: reduce) { .card { scroll-behavior: auto; } }
```

- [ ] **Step 6: Run route, cookie, and browser tests**

Run:

```powershell
npm.cmd run test:e2e -- tests/auth-linking.spec.ts tests/request-security.spec.ts --project=chromium
npx.cmd tsc --noEmit --incremental false
```

Expected: PASS. The completion route is POST-only, rejects cross-site mutation metadata, and clears the opaque cookie after both success and terminal failure.

- [ ] **Step 7: Commit Task 6**

```powershell
git add src/app/api/auth/link-intent/route.ts src/app/api/auth/link-intent/complete/route.ts src/app/auth/complete-link tests/auth-linking.spec.ts
git commit -m "feat: complete secure identity linking"
```

### Task 7: Provider-neutral client session, recovery, and entry UI

**Files:**
- Modify: `src/app/api/auth/session/route.ts`
- Modify: `src/lib/identity-client.ts`
- Modify: `src/lib/auth-redirect.ts`
- Modify: `src/components/AuthProvider.tsx`
- Modify: `src/components/AuthModal.tsx`
- Create: `src/components/IdentityLinkRequiredModal.tsx`
- Modify: `src/components/LegalConsentModal.tsx`
- Modify: `src/components/AppShell.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/course/[topic]/page.tsx`
- Modify: `src/app/course/[topic]/lesson/[lessonId]/page.tsx`
- Modify: `src/app/progress/page.tsx`
- Modify: `src/app/profile/page.tsx`
- Modify: `src/app/privacy-center/page.tsx`
- Modify: `src/app/review/page.tsx`
- Modify: `src/app/pricing/page.tsx`
- Modify: `src/components/flashcards/FlashcardStudio.tsx`
- Modify: `src/components/support/SupportCenter.tsx`
- Modify: `tests/auth-linking.spec.ts`
- Modify: `tests/example.spec.ts`

**Interfaces:**
- Consumes: minimal `/api/auth/session` DTO, link-intent routes, current legal-acceptance workflow.
- Produces: `ManagedAuthenticationState`, `currentEasyAuthState()`, `beginManagedSignIn(provider, path)`, context methods `signIn`, `signInWithRedirect`, `useExistingGoogleSignIn`, `connectExternalIdentity`, and provider-neutral pending state.

- [ ] **Step 1: Write failing session, modal, and recovery UI tests**

Extend `tests/auth-linking.spec.ts`:

```ts
const identityClient = readFileSync("src/lib/identity-client.ts", "utf8");
const authProvider = readFileSync("src/components/AuthProvider.tsx", "utf8");
const authModal = readFileSync("src/components/AuthModal.tsx", "utf8");
const appShell = readFileSync("src/components/AppShell.tsx", "utf8");

test("client authentication is provider-neutral and keeps a bounded legacy Google route", () => {
  expect(identityClient).toContain("currentEasyAuthState");
  expect(identityClient).toContain("beginManagedSignIn");
  expect(identityClient).toContain('provider: "google" | "filosage" | "local"');
  expect(authProvider).toContain("useExistingGoogleSignIn");
  expect(authProvider).not.toContain("signInWithGoogleRedirect");
});

test("the entry modal delegates both methods to the next secure screen", () => {
  expect(authModal).toContain("Choose Google or a private email code on the next secure Filosage screen");
  expect(authModal).toContain("Continue securely");
  expect(authModal).toContain("Filosage never sees your password or one-time code");
  expect(authModal).not.toMatch(/type=["']email["']/);
});

test("identity-link-required state takes precedence over legal acceptance", () => {
  expect(appShell).toContain("<IdentityLinkRequiredModal />");
  expect(appShell).toContain("account?.identityLinkRequired");
  expect(appShell).toContain("!account?.identityLinkRequired && account?.legalAcceptanceRequired");
});
```

Update the modal browser contract in `tests/example.spec.ts` to assert the exact new primary copy, legal links, keyboard focus trap, Escape close, focus restoration, and the enabled state after checking the existing age/legal checkbox.

- [ ] **Step 2: Run the focused browser tests and verify they fail**

Run:

```powershell
npm.cmd run test:e2e -- tests/auth-linking.spec.ts tests/example.spec.ts --project=chromium --grep "sign|auth|learning in sync|link"
```

Expected: FAIL on Google-specific method names and old button/help copy.

- [ ] **Step 3: Return bounded authentication availability from the session route**

In `src/app/api/auth/session/route.ts`, compute runtime config even when signed out and return:

```ts
const configuration = authenticationRuntimeConfiguration();
const primaryProvider = configuration.externalIdEnabled
  && configuration.externalIdNewAccountsEnabled
  ? "filosage"
  : "google";

return Response.json({
  recentAuthentication: Boolean(user && hasRecentAuthentication(user.auth_time)),
  authentication: {
    primaryProvider,
    externalIdAvailable: configuration.externalIdEnabled,
    legacyGoogleAvailable: configuration.directGoogleEnabled,
  },
  user: user ? {
    uid: user.uid,
    displayName: user.name ?? null,
    email: user.email,
    photoURL: user.picture ?? null,
    authenticationProvider: user.providerIdentity.provider,
  } : null,
}, {
  headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
});
```

Do not return issuer, subject, registry keys, feature-cohort emails, or raw claims.

- [ ] **Step 4: Generalize client navigation and state restoration**

Replace the Google-specific public API in `src/lib/identity-client.ts` with:

```ts
export interface FilosageUser {
  uid: string;
  displayName: string | null;
  email: string;
  photoURL: string | null;
  provider: "google" | "filosage" | "local";
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  reauthenticationToken?: string;
}

export interface ManagedAuthenticationState {
  recentAuthentication: boolean;
  authentication: {
    primaryProvider: "google" | "filosage";
    externalIdAvailable: boolean;
    legacyGoogleAvailable: boolean;
  };
  user: FilosageUser | null;
}

export async function currentEasyAuthState(): Promise<ManagedAuthenticationState> {
  const response = await fetch("/api/auth/session", {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Azure authentication status is unavailable.");
  const body = await response.json() as EasyAuthSessionResponse;
  return {
    recentAuthentication: body.recentAuthentication === true,
    authentication: body.authentication,
    user: toFilosageUser(body),
  };
}

export function beginManagedSignIn(
  provider: "google" | "filosage",
  postLoginPath = "/",
  prompt?: "login" | "select_account",
) {
  const destination = encodeURIComponent(sameOriginPath(postLoginPath));
  const promptParameter = prompt ? `&prompt=${encodeURIComponent(prompt)}` : "";
  return navigateToAuth(`/.auth/login/${provider}?post_login_redirect_uri=${destination}${promptParameter}`);
}

export async function beginManagedReauthentication(
  provider: "google" | "filosage",
  expectedCanonicalUid: string,
  postLoginPath = "/privacy-center",
) {
  const current = new URL(window.location.href);
  if (current.searchParams.get(REAUTHENTICATED_QUERY) === "1") {
    current.searchParams.delete(REAUTHENTICATED_QUERY);
    window.history.replaceState({}, "", `${current.pathname}${current.search}${current.hash}`);
    const state = await currentEasyAuthState();
    if (!state.recentAuthentication || state.user?.uid !== expectedCanonicalUid) {
      throw new Error(RECENT_AUTHENTICATION_PROOF_MISSING_MESSAGE);
    }
    return { ...state.user, reauthenticationToken: EASY_AUTH_SESSION_MARKER } as FilosageUser;
  }
  const destination = new URL(sameOriginPath(postLoginPath), window.location.origin);
  destination.searchParams.set(REAUTHENTICATED_QUERY, "1");
  return beginManagedSignIn(
    provider,
    `${destination.pathname}${destination.search}`,
    provider === "filosage" ? "login" : "select_account",
  );
}
```

Keep `sameOriginPath()` and Azure-managed logout. Extend `EasyAuthSessionResponse` with the exact `authentication` object and `authenticationProvider` field shown above. `toFilosageUser()` must accept only a nonempty canonical UID, normalized email, and one of `google | filosage | local`; it maps `authenticationProvider` to `provider` and otherwise returns `null`. Add `provider: "local"` to `localOwnerUser()`.

- [ ] **Step 5: Rename pending acceptance and add bounded recovery state**

In `src/lib/auth-redirect.ts`, replace `Google` in exported names with `Managed` and add:

```ts
export const PENDING_IDENTITY_RECOVERY_KEY = "filosage:identity-recovery:v1";
const PENDING_RECOVERY_MAX_AGE_MS = 15 * 60 * 1000;

export function pendingIdentityRecovery(now = Date.now()) {
  return { createdAt: now, returnPath: "/profile?identity-linked=1" } as const;
}

export function parsePendingIdentityRecovery(value: string | null, now = Date.now()) {
  if (!value) return null;
  try {
    const candidate = JSON.parse(value) as { createdAt?: unknown; returnPath?: unknown };
    if (typeof candidate.createdAt !== "number"
      || candidate.createdAt > now
      || now - candidate.createdAt > PENDING_RECOVERY_MAX_AGE_MS
      || candidate.returnPath !== "/profile?identity-linked=1") return null;
    return { createdAt: candidate.createdAt, returnPath: candidate.returnPath };
  } catch {
    return null;
  }
}
```

Session storage is only a UI continuation hint. It grants no server permission and contains no email, UID, provider subject, or token.

- [ ] **Step 6: Generalize `AuthProvider` and automate the proven two-session recovery sequence**

Change `AuthContextValue` to expose:

```ts
authentication: ManagedAuthenticationState["authentication"];
signIn: () => Promise<FilosageUser>;
signInWithRedirect: () => Promise<void>;
useExistingGoogleSignIn: (recoverIdentity?: boolean) => Promise<void>;
connectExternalIdentity: (returnPath?: string) => Promise<void>;
reauthenticate: (postLoginPath?: string) => Promise<FilosageUser>;
```

Add one bounded request helper outside the component:

```ts
async function identityLinkRedirect(returnPath: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`/api/auth/link-intent?return=${encodeURIComponent(returnPath)}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({})) as { redirectTo?: string; error?: string };
    if (response.status === 429) throw new Error("Too many connection attempts. Wait a few minutes, then try again.");
    if (!response.ok || !body.redirectTo) throw new Error(body.error || "The secure connection could not be started.");
    return body.redirectTo;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("The secure connection took too long. Check your network and try again.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
```

On boot, call `currentEasyAuthState()`, set its `authentication` and `user`, then process provider-neutral pending legal acceptance. If the restored provider is `google` and `parsePendingIdentityRecovery()` succeeds, remove the hint before the network call, call `identityLinkRedirect(pending.returnPath)`, and assign the returned URL to `window.location`. If it fails, surface the exact bounded message through the existing `error` state and leave the hint removed so a refresh cannot generate repeated intents.

Implement the context methods with these exact responsibilities:

```ts
const signIn = useCallback(async () => {
  setError(null);
  if (!isManagedAuthConfigured) {
    if (localAuthAvailable) {
      const localUser = localOwnerUser();
      localStorage.setItem(LOCAL_SESSION_KEY, "1");
      setUser(localUser);
      await loadAccount(localUser).catch(() => setAccount(null));
      return localUser;
    }
    const unavailable = new Error("Managed authentication is not configured.");
    setError("Secure sign-in is not available in this build.");
    throw unavailable;
  }
  try {
    return await beginManagedSignIn(
      authentication.primaryProvider,
      `${window.location.pathname}${window.location.search}`,
    );
  } catch (signInError) {
    setError(authErrorMessage(signInError));
    throw signInError;
  }
}, [authentication.primaryProvider, loadAccount]);

const signInWithRedirect = useCallback(async () => {
  sessionStorage.setItem(PENDING_MANAGED_REDIRECT_ACCEPTANCE_KEY, JSON.stringify(pendingManagedRedirectAcceptance()));
  await beginManagedSignIn(authentication.primaryProvider, `${window.location.pathname}${window.location.search}`);
}, [authentication.primaryProvider]);

const useExistingGoogleSignIn = useCallback(async (recoverIdentity = false) => {
  if (recoverIdentity) {
    sessionStorage.setItem(PENDING_IDENTITY_RECOVERY_KEY, JSON.stringify(pendingIdentityRecovery()));
  }
  await beginManagedSignIn("google", `${window.location.pathname}${window.location.search}`);
}, []);

const connectExternalIdentity = useCallback(async (returnPath = "/profile?identity-linked=1") => {
  window.location.assign(await identityLinkRedirect(returnPath));
}, []);
```

`reauthenticate()` passes the active user's provider and canonical UID to `beginManagedReauthentication()`. Preserve the local development account and test token behavior.

- [ ] **Step 7: Build the link-required modal and enforce modal precedence**

Create `src/components/IdentityLinkRequiredModal.tsx`:

```tsx
"use client";

import { Link2, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

export default function IdentityLinkRequiredModal() {
  const { useExistingGoogleSignIn, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
    ) ?? []);
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const confirm = async () => {
    setBusy(true); setError(null);
    try { await useExistingGoogleSignIn(true); }
    catch { setError("The existing sign-in could not be opened. No account data changed."); setBusy(false); }
  };
  const leave = async () => {
    setBusy(true); setError(null);
    try { await signOut(); }
    catch { setError("You could not be signed out. Check your connection and try again."); setBusy(false); }
  };
  return <div className="modal-layer legal-consent-layer">
    <section ref={dialogRef} tabIndex={-1} className="auth-dialog legal-consent-dialog" role="dialog" aria-modal="true" aria-labelledby="identity-link-title" aria-describedby="identity-link-description">
      <span className="legal-consent-icon" aria-hidden="true"><ShieldCheck size={22} /></span>
      <p className="overline">Protecting your learning account</p>
      <h2 id="identity-link-title">Confirm your existing sign-in</h2>
      <p id="identity-link-description" className="auth-copy">This email is already connected to a Filosage learning account. If you used Filosage before email-code sign-in was added, confirm your previous Google sign-in to connect the new method.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-primary auth-submit" disabled={busy} onClick={() => void confirm()}><Link2 size={17} />{busy ? "Opening secure sign-in…" : "Confirm existing Google sign-in"}</button>
      <button className="button button-quiet" disabled={busy} onClick={() => void leave()}>Sign out and choose another method</button>
    </section>
  </div>;
}
```

This recovery dialog is intentionally blocking: Escape does not dismiss it into an unusable unregistered session. Tab and Shift+Tab remain contained, async actions disable both buttons, failures are announced, and the learner always has a sign-out recovery path.

In `AppShell.tsx`, render it before legal acceptance:

```tsx
{account?.identityLinkRequired && !isLegalPage && <IdentityLinkRequiredModal />}
{!account?.identityLinkRequired && account?.legalAcceptanceRequired && !isLegalPage && <LegalConsentModal />}
```

In `LegalConsentModal.tsx`, keep initial setup versus terms-update behavior unchanged; it must never render for `identityLinkRequired`.

- [ ] **Step 8: Apply the approved themed modal copy and fallback**

In `AuthModal.tsx`, keep the existing focus trap, Escape handling, restoration, legal checkbox, links, and browse-without-account button. Replace the identity and action region with:

```tsx
<div className="auth-identity"><Cloud size={16} /><span>Choose Google or a private email code on the next secure Filosage screen</span></div>
<button className="button button-primary auth-submit" onClick={handleSecureContinue} disabled={redirecting || !agreed}>
  {redirecting ? "Opening secure sign-in…" : "Continue securely"}
</button>
<p className="auth-redirect-help">Microsoft securely manages sign-in. Filosage never sees your password or one-time code.</p>
{authentication.primaryProvider === "filosage" && authentication.legacyGoogleAvailable && (
  <button className="button button-secondary auth-redirect" onClick={() => void useExistingGoogleSignIn()} disabled={redirecting}>
    Use my existing Google sign-in
  </button>
)}
```

Keep heading **Keep your learning in sync** and the existing concrete value statement about progress, notes, courses, and review dates. Remove the decorative single-letter Google mark from the primary action.

In `src/app/globals.css`, preserve the incumbent oatmeal/cream, navy, teal, 7 px control, and 11-15 px surface language. Make `.auth-identity` and its text child shrinkable with `min-width: 0`, allow the new sentence to wrap with `white-space: normal` and `overflow-wrap: anywhere`, keep modal body/control text at least `1rem` on mobile, and keep every modal action at least `44px` tall at mobile widths. Add a `@media (forced-colors: active)` rule that uses `Canvas`, `CanvasText`, `ButtonFace`, `ButtonText`, and the system `Highlight` outline for the dialog, controls, and error state. Do not introduce a new card, gradient, glass treatment, or decorative motion.

- [ ] **Step 9: Rename all consumer methods and add the profile linking action**

Across the listed page/component files, make these exact identifier replacements:

```text
signInWithGoogle          -> signIn
signInWithGoogleRedirect  -> signInWithRedirect
beginGoogleSignIn         -> beginManagedSignIn
beginGoogleReauthentication -> beginManagedReauthentication
isGoogleAuthConfigured    -> isManagedAuthConfigured
```

In the **Account and privacy** card in `src/app/profile/page.tsx`, add this action only when the active session is direct Google and External ID is available:

```tsx
{user.provider === "google" && authentication.externalIdAvailable && (
  <button className="text-button" onClick={() => void connectExternalIdentity()}>
    Add email-code sign-in
  </button>
)}
```

Do not label the action as migrated until `/auth/complete-link` returns success.

- [ ] **Step 10: Run focused UI, account, and type regressions**

Run:

```powershell
npm.cmd run test:e2e -- tests/auth-linking.spec.ts tests/account-onboarding.spec.ts tests/example.spec.ts --project=chromium --grep "sign|auth|account setup|learning in sync|link"
npx.cmd tsc --noEmit --incremental false
```

Expected: PASS. The modal contains no credential field; existing-Google recovery is available only while the server reports the fallback enabled.

- [ ] **Step 11: Commit Task 7**

```powershell
git add src/app/api/auth/session/route.ts src/lib/identity-client.ts src/lib/auth-redirect.ts src/components/AuthProvider.tsx src/components/AuthModal.tsx src/components/IdentityLinkRequiredModal.tsx src/components/LegalConsentModal.tsx src/components/AppShell.tsx src/app/globals.css src/app/course src/app/progress/page.tsx src/app/profile/page.tsx src/app/privacy-center/page.tsx src/app/review/page.tsx src/app/pricing/page.tsx src/components/flashcards/FlashcardStudio.tsx src/components/support/SupportCenter.tsx tests/auth-linking.spec.ts tests/example.spec.ts
git commit -m "feat: add provider neutral sign-in experience"
```

### Task 8: Hosted branding artifacts, privacy disclosure, and support guidance

**Files:**
- Reuse unchanged: `public/brand/logo/filosage-horizontal.svg`
- Reuse unchanged: `public/brand/backgrounds/hero-light.svg`
- Create: `public/brand/identity/filosage-sign-in-banner.png`
- Create: `public/brand/identity/filosage-sign-in-background.png`
- Create: `public/brand/identity/filosage-sign-in-favicon.png`
- Create: `infra/azure/external-id-branding/manifest.json`
- Create: `infra/azure/external-id-branding/custom.css`
- Modify: `src/lib/legal.ts`
- Modify: `src/app/privacy/page.tsx`
- Modify: `src/content/support/articles/sign-in-help.ts`
- Modify: `src/content/support/articles/privacy-controls.ts`
- Modify: `src/content/support/articles/getting-started.ts`
- Create: `tests/external-id-branding.spec.ts`

**Interfaces:**
- Consumes: existing Filosage palette/logo conventions and Microsoft External ID supported company-branding fields/selectors.
- Produces: reviewable, non-secret hosted-branding package and accurate versioned privacy/support copy.

- [ ] **Step 1: Write failing branding and disclosure tests**

Create `tests/external-id-branding.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("infra/azure/external-id-branding/manifest.json", "utf8"));
const css = readFileSync("infra/azure/external-id-branding/custom.css", "utf8");
const privacy = readFileSync("src/app/privacy/page.tsx", "utf8");
const signInHelp = readFileSync("src/content/support/articles/sign-in-help.ts", "utf8");

function pngDimensions(path: string) {
  const bytes = readFileSync(path);
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { bytes: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test("hosted branding names exact reviewed assets, links, methods, and copy", () => {
  expect(manifest).toMatchObject({
    schemaVersion: 1,
    hostedDomainMode: "microsoft-managed",
    privacyUrl: "https://filosage.com/privacy",
    termsUrl: "https://filosage.com/terms",
    signInPageText: "Choose Google or a private email code. Microsoft securely manages sign-in; Filosage never sees your password or one-time code.",
    bannerLogo: "/brand/identity/filosage-sign-in-banner.png",
    backgroundImage: "/brand/identity/filosage-sign-in-background.png",
    favicon: "/brand/identity/filosage-sign-in-favicon.png",
  });
  expect(manifest.authenticationMethods).toEqual(["google", "email_one_time_code"]);
  expect(pngDimensions(`public${manifest.bannerLogo}`)).toEqual(expect.objectContaining({ width: 245, height: 36 }));
  expect(pngDimensions(`public${manifest.bannerLogo}`).bytes).toBeLessThanOrEqual(10 * 1024);
  expect(pngDimensions(`public${manifest.backgroundImage}`)).toEqual(expect.objectContaining({ width: 1600, height: 900 }));
  expect(pngDimensions(`public${manifest.backgroundImage}`).bytes).toBeLessThanOrEqual(300 * 1024);
  expect(pngDimensions(`public${manifest.favicon}`)).toEqual(expect.objectContaining({ width: 32, height: 32 }));
  expect(pngDimensions(`public${manifest.favicon}`).bytes).toBeLessThanOrEqual(5 * 1024);
});

test("custom CSS uses supported selectors and avoids retired positioning controls", () => {
  expect(css).toContain(".ext-sign-in-box");
  expect(css).toContain(".ext-button.ext-primary");
  expect(css).toContain(".ext-link:focus");
  expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  expect(css).toContain("@media (forced-colors: active)");
  expect(css).not.toMatch(/\bposition\s*:/);
  expect(css).not.toMatch(/\bz-index\s*:/);
});

test("privacy and help copy accurately describe External ID without asking for codes", () => {
  expect(privacy).toContain("Microsoft Entra External ID");
  expect(privacy).toContain("email one-time code");
  expect(privacy).toContain("Filosage does not receive the one-time code");
  expect(privacy).toContain("Identity-link deletion is not part of automated learning-data deletion");
  expect(signInHelp).toContain("Never send a password or one-time code");
  expect(signInHelp).toContain("Continue with Google");
  expect(signInHelp).toContain("email code");
});
```

- [ ] **Step 2: Run the branding tests and verify missing artifacts fail**

Run:

```powershell
npm.cmd run test:e2e -- tests/external-id-branding.spec.ts --project=chromium
```

Expected: FAIL because the manifest, CSS, and dedicated hosted assets do not exist.

- [ ] **Step 3: Reuse the reviewed Filosage identity assets**

Do not draw or fork a new logo. Preserve `public/brand/logo/filosage-horizontal.svg`, `public/brand/backgrounds/hero-light.svg`, and `public/brand/logo/browser-icon.png` byte-for-byte. Use the installed `ffmpeg` converter to create portal-compatible derivatives:

```powershell
New-Item -ItemType Directory -Force 'public\brand\identity' | Out-Null
ffmpeg -y -i 'public\brand\logo\filosage-horizontal.svg' -vf "crop=340:58:155:30,scale=211:36:flags=lanczos,pad=245:36:(ow-iw)/2:0:color=0x00000000,format=rgba" -frames:v 1 -compression_level 9 'public\brand\identity\filosage-sign-in-banner.png'
ffmpeg -y -i 'public\brand\backgrounds\hero-light.svg' -vf "scale=1600:900:flags=lanczos,format=rgba" -frames:v 1 -compression_level 9 'public\brand\identity\filosage-sign-in-background.png'
ffmpeg -y -i 'public\brand\logo\browser-icon.png' -vf "scale=32:32:flags=lanczos,format=rgba" -frames:v 1 -compression_level 9 'public\brand\identity\filosage-sign-in-favicon.png'
```

Inspect all three outputs together once at desktop and mobile scale. If the banner exceeds 10 KB or favicon exceeds 5 KB, optimize the generated PNG without changing its pixels, dimensions, colors, or source crop. If the source crop does not contain the complete existing `Filosage` wordmark, stop and correct only the crop coordinates; do not redraw it. This follows the incumbent rule that the official mark is not wrapped, restyled, or given a new shadow.

- [ ] **Step 4: Add the non-secret branding manifest**

Create `infra/azure/external-id-branding/manifest.json`:

```json
{
  "schemaVersion": 1,
  "provider": "Microsoft Entra External ID",
  "hostedDomainMode": "microsoft-managed",
  "template": "partial-screen",
  "headerVisible": true,
  "footerVisible": true,
  "pageBackgroundColor": "#FAFAF7",
  "bannerLogo": "/brand/identity/filosage-sign-in-banner.png",
  "backgroundImage": "/brand/identity/filosage-sign-in-background.png",
  "favicon": "/brand/identity/filosage-sign-in-favicon.png",
  "customCss": "infra/azure/external-id-branding/custom.css",
  "privacyText": "Privacy Notice",
  "privacyUrl": "https://filosage.com/privacy",
  "termsText": "Terms of Service",
  "termsUrl": "https://filosage.com/terms",
  "usernameHintText": "Email address",
  "signInPageText": "Choose Google or a private email code. Microsoft securely manages sign-in; Filosage never sees your password or one-time code.",
  "oneTimeCodeTitle": "Enter your private email code",
  "authenticationMethods": ["google", "email_one_time_code"],
  "fontStack": "Inter, ui-sans-serif, system-ui, sans-serif",
  "contrastStandard": "WCAG 2.2 AA"
}
```

The paths are source artifacts. During approved QA configuration, the operator uploads their bytes through Entra Company Branding; the manifest itself is never passed as a credential.

- [ ] **Step 5: Add supported, reduced-motion-safe External ID CSS**

Create `infra/azure/external-id-branding/custom.css`:

```css
body { color: #0d1b3d; background-color: #fafaf7; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
a, a:link, .ext-link { color: #176b64; text-decoration-thickness: .08em; text-underline-offset: .18em; }
a:hover, .ext-link:hover { color: #0f514c; }
a:focus, .ext-link:focus { outline: 3px solid #4da6ff; outline-offset: 3px; border-radius: 4px; }
.ext-background-image { background-color: #fafaf7; }
.ext-header { background-color: rgb(250 250 247 / 94%); border-bottom: 1px solid #d9e1e7; }
.ext-sign-in-box { color: #0d1b3d; background-color: #ffffff; border: 1px solid #d9e1e7; border-radius: 18px; box-shadow: 0 18px 48px rgb(7 17 39 / 14%); }
.ext-title { color: #0d1b3d; font-weight: 700; letter-spacing: -.025em; }
.ext-subtitle { color: #43506b; line-height: 1.55; }
.ext-input { min-height: 46px; border: 1px solid #9aa8b8; border-radius: 10px; color: #0d1b3d; background: #ffffff; }
.ext-input:focus { outline: 3px solid #4da6ff; outline-offset: 1px; border-color: #176b64; }
.ext-button { min-height: 46px; border-radius: 10px; font-weight: 700; }
.ext-button.ext-primary { color: #ffffff; background-color: #176b64; border-color: #176b64; }
.ext-button.ext-primary:hover { background-color: #0f514c; border-color: #0f514c; }
.ext-button:focus { outline: 3px solid #4da6ff; outline-offset: 3px; }
.ext-error { color: #8b1e2d; background-color: #fff1f2; border-radius: 10px; }
@media (max-width: 480px) { .ext-sign-in-box { border-radius: 14px; box-shadow: 0 10px 28px rgb(7 17 39 / 12%); } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; } }
@media (forced-colors: active) { .ext-sign-in-box, .ext-input, .ext-button { border: 1px solid CanvasText; box-shadow: none; } .ext-link:focus, .ext-input:focus, .ext-button:focus { outline: 3px solid Highlight; } }
```

- [ ] **Step 6: Version and update the privacy notice**

In `src/lib/legal.ts`, set:

```ts
export const PRIVACY_VERSION = "2026-08-18";
export const PRIVACY_EFFECTIVE_DATE = "August 18, 2026";
```

Keep the Terms version unchanged unless reviewed Terms wording also changes. In `src/app/privacy/page.tsx`, make these factual changes:

```tsx
<li><strong>Account information:</strong> Microsoft Entra External ID or Google provider identifier, verified email address, display name, profile image when supplied, and a pseudonymous identity-link record used to keep one Filosage learning account across approved sign-in methods. Filosage does not receive the one-time code.</li>
```

```tsx
<p>Information may be processed by Microsoft Azure, including Microsoft Entra External ID, for customer identity, email one-time-code delivery and verification, application hosting, database, private object storage, secrets, logs, and monitoring; Google when you choose federated Google sign-in; OpenAI for requested AI features and safety controls; network and email providers for delivery and security; professional advisers and authorities where legally required; and Stripe for subscription checkout, billing management, and payment processing.</p>
```

Add to retention:

```tsx
<p>Expired or consumed identity-link intents are retained for no more than 30 days before pruning. Authentication security events use bounded categories and pseudonymous actor keys under the current 30-day Azure Log Analytics retention. Identity links remain while needed to keep approved sign-in methods attached to the same account. Identity-link deletion is not part of automated learning-data deletion because removing a mapping can disconnect account recovery; a separately verified identity request and reviewed deletion process are required.</p>
```

Change security advice from protecting only a Google account to protecting the chosen email or Google account and never sharing a one-time code.

- [ ] **Step 7: Replace Google-only support instructions with both managed methods**

Set the sign-in article title to **Troubleshoot secure sign-in**, its reviewed date to `2026-08-18`, and use this body:

```md
## Choose a sign-in method

Select **Continue securely** in Filosage. On the next secure Filosage screen, choose **Continue with Google** or enter your email address to receive an email code. Microsoft manages both methods and returns you to Filosage after verification.

## If an email code does not arrive

Check the address for typing mistakes, wait for the resend option on the secure sign-in page, then check spam or junk folders. Do not repeatedly request codes. Filosage support cannot see, generate, or validate a code.

## If you used Google before

Choose **Use my existing Google sign-in** in Filosage. After Google confirms the existing account, Filosage can connect the new method without moving courses, progress, notes, or review dates.

## If the network or session is slow

Check your connection and retry once. If Filosage reports that the session or account is taking longer than expected, refresh before starting another attempt.

Contact [Filosage support](/support/articles/contact-support) with the page address and exact error message when the problem continues. Never send a password or one-time code.
```

Update getting-started to say “Google or a private email code” and privacy-controls to say sensitive deletion uses a recent managed sign-in rather than “recent Google reauthentication.”

- [ ] **Step 8: Run branding, legal, and accessibility source checks**

Run:

```powershell
npm.cmd run test:e2e -- tests/external-id-branding.spec.ts tests/account-onboarding.spec.ts --project=chromium
npx.cmd tsc --noEmit --incremental false
```

Expected: PASS. The privacy version change causes existing accounts to receive the normal authenticated terms/privacy review modal after deployment.

- [ ] **Step 9: Commit Task 8**

```powershell
git add public/brand/identity infra/azure/external-id-branding src/lib/legal.ts src/app/privacy/page.tsx src/content/support/articles/sign-in-help.ts src/content/support/articles/privacy-controls.ts src/content/support/articles/getting-started.ts tests/external-id-branding.spec.ts
git commit -m "feat: brand and disclose external identity sign-in"
```

### Task 9: Inactive Azure custom OIDC configuration and fail-closed release gates

**Files:**
- Modify: `infra/azure/main.bicep`
- Modify: `infra/azure/qa.bicep`
- Modify: `.env.example`
- Modify: `src/lib/runtime-config.ts`
- Modify: `src/lib/azure-infrastructure.ts`
- Modify: `src/app/api/health/route.ts`
- Modify: `scripts/check-release-env.mjs`
- Modify: `scripts/check-production-health.mjs`
- Modify: `.github/workflows/azure-qa.yml`
- Modify: `.github/workflows/azure-staging.yml`
- Modify: `tests/azure-infrastructure.spec.ts`
- Modify: `tests/release-scripts.spec.ts`

**Interfaces:**
- Consumes: approved Key Vault secret names/values at deployment time, External ID issuer/discovery URL/client ID, current Google configuration.
- Produces: named Easy Auth provider `filosage`, server flags, bounded `authenticationMode`, and release validation that cannot enable zero providers or new External ID accounts without complete configuration.

- [ ] **Step 1: Write failing Bicep and release contracts**

Extend `tests/azure-infrastructure.spec.ts`:

```ts
test("Azure declares dual managed providers with External ID disabled by default", () => {
  for (const source of [azureBicepSource, qaBicepSource]) {
    expect(source).toContain("customOpenIdConnectProviders");
    expect(source).toContain("filosage:");
    expect(source).toContain("enabled: externalIdRuntimeEnabled");
    expect(source).toContain("ClientSecretPost");
    expect(source).toContain("wellKnownOpenIdConfiguration");
    expect(source).toContain("allowedAudiences: [externalIdClientId]");
    expect(source).toContain("external-id-oauth-secret");
    expect(source).toContain("identity-link-hmac-secret");
    expect(source).toContain("EXTERNAL_ID_AUTH_ENABLED");
    expect(source).toContain("EXTERNAL_ID_NEW_ACCOUNTS_ENABLED");
    expect(source).toContain("DIRECT_GOOGLE_AUTH_ENABLED");
    expect(source).toContain("BILLING_ENABLED', value: 'false'");
  }
  expect(azureBicepSource).toContain("param externalIdAuthEnabled bool = false");
  expect(azureBicepSource).toContain("param directGoogleAuthEnabled bool = true");
});

test("the custom OIDC and HMAC secrets remain server-only Key Vault references", () => {
  expect(azureBicepSource).toMatch(/@secure\(\)\s+param externalIdClientSecret string = ''/);
  expect(azureBicepSource).toMatch(/@secure\(\)\s+param identityLinkHmacSecret string = ''/);
  expect(azureBicepSource).not.toContain("NEXT_PUBLIC_EXTERNAL_ID");
  expect(qaBicepSource).toContain("param externalIdClientSecretName string = 'external-id-client-secret-qa'");
  expect(qaBicepSource).toContain("param identityLinkHmacSecretName string = 'identity-link-hmac-secret-qa'");
  expect(qaBicepSource).toContain("keyVaultUrl: '${vaultUri}secrets/${externalIdClientSecretName}'");
  expect(qaBicepSource).toContain("keyVaultUrl: '${vaultUri}secrets/${identityLinkHmacSecretName}'");
});

test("staging preserves direct Google and leaves External ID inactive", () => {
  expect(stagingWorkflowSource).toContain('"DIRECT_GOOGLE_AUTH_ENABLED=true"');
  expect(stagingWorkflowSource).toContain('"EXTERNAL_ID_AUTH_ENABLED=false"');
  expect(stagingWorkflowSource).toContain('"EXTERNAL_ID_NEW_ACCOUNTS_ENABLED=false"');
  expect(stagingWorkflowSource).toContain('"BILLING_ENABLED=false"');
});
```

Extend the valid environment in `tests/release-scripts.spec.ts`:

```ts
IDENTITY_LINK_HMAC_SECRET: "identity-link-hmac-secret-at-least-32-characters",
DIRECT_GOOGLE_AUTH_ENABLED: "true",
EXTERNAL_ID_AUTH_ENABLED: "false",
EXTERNAL_ID_NEW_ACCOUNTS_ENABLED: "false",
```

Add cases that reject both providers false, new accounts true with External ID false, an enabled External ID provider without issuer/client/discovery metadata, a short HMAC secret, and any non-false `BILLING_ENABLED` in ordinary release mode. The release-process environment does not receive the External ID OAuth secret; Bicep validates and passes that secret directly from Key Vault to Easy Auth.

- [ ] **Step 2: Run focused infrastructure tests and verify they fail**

Run:

```powershell
npm.cmd run test:e2e -- tests/azure-infrastructure.spec.ts tests/release-scripts.spec.ts --project=chromium
```

Expected: FAIL because Bicep and release scripts do not yet inventory External ID or the HMAC secret.

- [ ] **Step 3: Add production Bicep parameters and Key Vault secrets**

Add these parameters near the existing Google parameters in `infra/azure/main.bicep`:

```bicep
param directGoogleAuthEnabled bool = true
param externalIdAuthEnabled bool = false
param externalIdNewAccountsEnabled bool = false
param externalIdClientId string = ''
param externalIdIssuer string = ''
param externalIdWellKnownConfiguration string = ''

@secure()
param externalIdClientSecret string = ''

@secure()
param identityLinkHmacSecret string = ''
```

Replace the single Google configuration variable with separate provisioning and runtime-enable variables:

```bicep
var directGoogleConfigured = directGoogleAuthEnabled && !empty(googleClientId) && !empty(googleClientSecret)
var externalIdConfigurationComplete = !empty(externalIdClientId)
  && !empty(externalIdClientSecret)
  && !empty(externalIdIssuer)
  && !empty(externalIdWellKnownConfiguration)
var externalIdRuntimeEnabled = externalIdAuthEnabled && externalIdConfigurationComplete
var easyAuthConfigured = directGoogleConfigured || externalIdConfigurationComplete
```

Add Key Vault resources:

```bicep
resource externalIdSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(externalIdClientSecret)) {
  parent: vault
  name: 'external-id-client-secret'
  properties: { value: externalIdClientSecret }
}

resource identityLinkSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (!empty(identityLinkHmacSecret)) {
  parent: vault
  name: 'identity-link-hmac-secret'
  properties: { value: identityLinkHmacSecret }
}
```

Append Key Vault references to `appSecrets`:

```bicep
!empty(externalIdClientSecret) ? [{ name: 'external-id-oauth-secret', keyVaultUrl: externalIdSecret!.properties.secretUriWithVersion, identity: identity.id }] : [],
!empty(identityLinkHmacSecret) ? [{ name: 'identity-link-hmac-secret', keyVaultUrl: identityLinkSecret!.properties.secretUriWithVersion, identity: identity.id }] : []
```

Append server-only environment entries to `appEnvironment`:

```bicep
{ name: 'DIRECT_GOOGLE_AUTH_ENABLED', value: string(directGoogleConfigured) }
{ name: 'EXTERNAL_ID_AUTH_ENABLED', value: string(externalIdRuntimeEnabled) }
{ name: 'EXTERNAL_ID_NEW_ACCOUNTS_ENABLED', value: string(externalIdRuntimeEnabled && externalIdNewAccountsEnabled) }
{ name: 'EXTERNAL_ID_CLIENT_ID', value: externalIdClientId }
{ name: 'EXTERNAL_ID_ISSUER', value: externalIdIssuer }
{ name: 'EXTERNAL_ID_WELL_KNOWN_CONFIGURATION', value: externalIdWellKnownConfiguration }
```

and conditionally add:

```bicep
!empty(identityLinkHmacSecret) ? [{ name: 'IDENTITY_LINK_HMAC_SECRET', secretRef: 'identity-link-hmac-secret' }] : []
```

Keep `BILLING_ENABLED` exactly `false`.

Document the same names in `.env.example` with safe migration defaults and blank secret/metadata values:

```dotenv
DIRECT_GOOGLE_AUTH_ENABLED=true
EXTERNAL_ID_AUTH_ENABLED=false
EXTERNAL_ID_NEW_ACCOUNTS_ENABLED=false
EXTERNAL_ID_CLIENT_ID=
EXTERNAL_ID_ISSUER=
EXTERNAL_ID_WELL_KNOWN_CONFIGURATION=
IDENTITY_LINK_HMAC_SECRET=
```

Do not add the External ID OAuth client secret to the application environment example because only Easy Auth consumes it through its Key Vault secret setting.

- [ ] **Step 4: Replace the production auth provider object with a conditional union**

Before `appAuth`, define:

```bicep
var configuredIdentityProviders = union(
  directGoogleConfigured ? {
    google: {
      enabled: true
      registration: {
        clientId: googleClientId
        clientSecretSettingName: 'google-oauth-secret'
      }
      validation: { allowedAudiences: [googleClientId] }
    }
  } : {},
  externalIdConfigurationComplete ? {
    customOpenIdConnectProviders: {
      filosage: {
        enabled: externalIdRuntimeEnabled
        login: {
          nameClaimType: 'name'
          scopes: ['openid', 'profile', 'email']
        }
        registration: {
          clientId: externalIdClientId
          clientCredential: {
            clientSecretSettingName: 'external-id-oauth-secret'
            method: 'ClientSecretPost'
          }
          openIdConnectConfiguration: {
            wellKnownOpenIdConfiguration: externalIdWellKnownConfiguration
          }
        }
        validation: { allowedAudiences: [externalIdClientId] }
      }
    }
  } : {}
)
```

Set `identityProviders: configuredIdentityProviders` in `appAuth`; preserve anonymous public access, HTTPS, URL fragments, and disabled token store.

- [ ] **Step 5: Add isolated-QA secret references and dual-provider configuration**

In `infra/azure/qa.bicep`, add:

```bicep
param directGoogleAuthEnabled bool = true
param externalIdAuthEnabled bool = false
param externalIdNewAccountsEnabled bool = false
param externalIdClientId string = ''
param externalIdIssuer string = ''
param externalIdWellKnownConfiguration string = ''
param externalIdClientSecretName string = 'external-id-client-secret-qa'
param identityLinkHmacSecretName string = 'identity-link-hmac-secret-qa'

var directGoogleConfigured = directGoogleAuthEnabled && !empty(googleClientId)
var externalIdConfigurationComplete = !empty(externalIdClientId)
  && !empty(externalIdIssuer)
  && !empty(externalIdWellKnownConfiguration)
var externalIdRuntimeEnabled = externalIdAuthEnabled && externalIdConfigurationComplete
```

Add to `qaSecrets`:

```bicep
{ name: 'identity-link-hmac-secret', keyVaultUrl: '${vaultUri}secrets/${identityLinkHmacSecretName}', identity: identity.id }
```

and conditionally add the External ID secret reference:

```bicep
var externalIdQaSecrets = externalIdConfigurationComplete ? [
  { name: 'external-id-oauth-secret', keyVaultUrl: '${vaultUri}secrets/${externalIdClientSecretName}', identity: identity.id }
] : []
```

Use `secrets: concat(qaSecrets, externalIdQaSecrets)`. Add the same three flags plus the non-secret client ID, issuer, and discovery URL entries as production, then add:

```bicep
{ name: 'IDENTITY_LINK_HMAC_SECRET', secretRef: 'identity-link-hmac-secret' }
```

Build `configuredIdentityProviders` with the same `google` and `customOpenIdConnectProviders.filosage` shapes as production, including `enabled: externalIdRuntimeEnabled`, then assign it to `appAuth.identityProviders`. A complete QA or production configuration is therefore provisioned even while its application flag and provider `enabled` value are false.

- [ ] **Step 6: Validate runtime configuration and expose a bounded auth mode**

In `src/lib/runtime-config.ts`, add the three flags and `IDENTITY_LINK_HMAC_SECRET` to `requiredInProduction`. After the existing missing-name calculation, append `authenticationConfigurationIssues(authenticationRuntimeConfiguration())` with an `authentication: ` prefix and append `IDENTITY_LINK_HMAC_SECRET must contain at least 32 characters` when a present secret is short. Return that combined string array from `missingRuntimeConfiguration()`, so `/api/health` fails closed without publishing the details. Add:

```ts
export type AuthenticationMode = "direct-google" | "external-id" | "migration-dual" | "unavailable";

export function authenticationMode(): AuthenticationMode {
  const config = authenticationRuntimeConfiguration();
  if (config.directGoogleEnabled && config.externalIdEnabled) return "migration-dual";
  if (config.externalIdEnabled) return "external-id";
  if (config.directGoogleEnabled) return "direct-google";
  return "unavailable";
}
```

In `src/lib/azure-infrastructure.ts`, change the authentication provider type to:

```ts
provider: "Azure Container Apps Easy Auth";
mode: AuthenticationMode;
```

and return the mode without issuer, client ID, tenant ID, secret names, or account counts.

In `src/app/api/health/route.ts`, add top-level `authenticationMode: authenticationMode()` to the existing public response. Keep the datastore and origin checks unchanged.

- [ ] **Step 7: Make release configuration fail closed**

In `scripts/check-release-env.mjs`, add `IDENTITY_LINK_HMAC_SECRET`, `DIRECT_GOOGLE_AUTH_ENABLED`, `EXTERNAL_ID_AUTH_ENABLED`, and `EXTERNAL_ID_NEW_ACCOUNTS_ENABLED` to `required`. Append:

```js
const enabled = (name) => process.env[name]?.trim().toLowerCase() === "true";
const directGoogleEnabled = enabled("DIRECT_GOOGLE_AUTH_ENABLED");
const externalIdEnabled = enabled("EXTERNAL_ID_AUTH_ENABLED");
const externalIdNewAccountsEnabled = enabled("EXTERNAL_ID_NEW_ACCOUNTS_ENABLED");
if (!directGoogleEnabled && !externalIdEnabled) invalid.push("At least one production authentication provider must be enabled");
if (externalIdNewAccountsEnabled && !externalIdEnabled) invalid.push("EXTERNAL_ID_NEW_ACCOUNTS_ENABLED requires EXTERNAL_ID_AUTH_ENABLED");
if ((process.env.IDENTITY_LINK_HMAC_SECRET?.trim().length ?? 0) < 32) invalid.push("IDENTITY_LINK_HMAC_SECRET must contain at least 32 characters");
if (externalIdEnabled) {
  for (const name of ["EXTERNAL_ID_CLIENT_ID", "EXTERNAL_ID_ISSUER", "EXTERNAL_ID_WELL_KNOWN_CONFIGURATION"]) {
    if (!process.env[name]?.trim()) invalid.push(`${name} is required when External ID is enabled`);
  }
  for (const name of ["EXTERNAL_ID_ISSUER", "EXTERNAL_ID_WELL_KNOWN_CONFIGURATION"]) {
    try {
      const url = new URL(process.env[name]);
      if (url.protocol !== "https:") invalid.push(`${name} must use HTTPS`);
    } catch {
      invalid.push(`${name} must be a valid HTTPS URL`);
    }
  }
}
```

Do not print values. Keep the ordinary-release requirement `BILLING_ENABLED=false` unchanged.

- [ ] **Step 8: Verify the bounded auth mode in health checks**

In `scripts/check-production-health.mjs`, accept an optional `EXPECTED_AUTH_MODE` environment value. When present, require it to be one of `direct-google`, `external-id`, or `migration-dual` and require `body.authenticationMode` to match. Change the success line to:

```js
console.log(`Production health is healthy (version ${body.version}, authentication ${body.authenticationMode}).`);
```

No provider IDs or secret settings are printed.

- [ ] **Step 9: Keep QA activation explicit and production staging inactive**

Add two boolean `workflow_dispatch` inputs to `.github/workflows/azure-qa.yml`:

```yaml
external_id_auth_enabled:
  description: Enable the already-configured QA custom OIDC provider for acceptance
  required: true
  default: false
  type: boolean
external_id_new_accounts_enabled:
  description: Permit QA-only new External ID accounts after registry preflight
  required: true
  default: false
  type: boolean
```

Before deployment, fail if new accounts are true while External ID is false. In `az containerapp update --set-env-vars`, set:

```bash
"DIRECT_GOOGLE_AUTH_ENABLED=true" \
"EXTERNAL_ID_AUTH_ENABLED=${{ inputs.external_id_auth_enabled }}" \
"EXTERNAL_ID_NEW_ACCOUNTS_ENABLED=${{ inputs.external_id_new_accounts_enabled }}" \
"BILLING_ENABLED=false"
```

After deployment, query only enabled provider names and save the redacted result as workflow evidence:

```bash
az containerapp auth show \
  --resource-group "${{ vars.AZURE_RESOURCE_GROUP }}" \
  --name "${{ vars.AZURE_QA_CONTAINER_APP_NAME }}" \
  --query "{google:properties.identityProviders.google.enabled,filosage:properties.identityProviders.customOpenIdConnectProviders.filosage.enabled}" \
  --output json
```

In `.github/workflows/azure-staging.yml`, set the exact inactive state:

```bash
"DIRECT_GOOGLE_AUTH_ENABLED=true" \
"EXTERNAL_ID_AUTH_ENABLED=false" \
"EXTERNAL_ID_NEW_ACCOUNTS_ENABLED=false" \
"BILLING_ENABLED=false"
```

The staging workflow never accepts an input that enables External ID in production.

- [ ] **Step 10: Build both Bicep templates and run focused tests**

Run:

```powershell
& 'C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd' bicep build --file infra/azure/main.bicep --stdout
& 'C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd' bicep build --file infra/azure/qa.bicep --stdout
npm.cmd run test:e2e -- tests/azure-infrastructure.spec.ts tests/release-scripts.spec.ts tests/auth-identity.spec.ts --project=chromium
npx.cmd tsc --noEmit --incremental false
```

Expected: both Bicep builds succeed and tests pass. These are local validation only; no Azure resource, secret, tenant, or provider is changed.

- [ ] **Step 11: Commit Task 9**

```powershell
git add infra/azure/main.bicep infra/azure/qa.bicep .env.example src/lib/runtime-config.ts src/lib/azure-infrastructure.ts src/app/api/health/route.ts scripts/check-release-env.mjs scripts/check-production-health.mjs .github/workflows/azure-qa.yml .github/workflows/azure-staging.yml tests/azure-infrastructure.spec.ts tests/release-scripts.spec.ts
git commit -m "feat: configure gated external identity auth"
```

### Task 10: End-to-end local linking, accessibility, and release verification

**Files:**
- Modify: `src/lib/identity-server.ts`
- Modify: `tests/auth-linking.spec.ts`
- Create: `tests/auth-accessibility.spec.ts`

**Interfaces:**
- Consumes: local provider fixtures, legal acceptance, link-intent routes, canonical session DTO, themed authentication modals.
- Produces: an API-level proof that two verified sessions preserve one canonical UID, a concurrent single-use proof, and keyboard/mobile/WCAG evidence for the application-owned UI.

- [ ] **Step 1: Add isolated local identities for the two-session contract**

In the post-Task-1 `localVerifiedUser()` implementation in `src/lib/identity-server.ts`, add this branch before the fixed learner map. It is reachable only through `isLocalMode()` and uses a per-test UUID:

```ts
const linkFixture = /^playwright-link-(google|filosage)-([0-9a-f]{8}-[0-9a-f-]{27})$/i.exec(idToken);
if (linkFixture) {
  const provider = linkFixture[1].toLowerCase() as "google" | "filosage";
  const runId = linkFixture[2].toLowerCase();
  const subject = `${provider}-${runId}`;
  const providerIdentity: VerifiedProviderIdentity = {
    provider,
    issuer: provider === "google"
      ? DIRECT_GOOGLE_ISSUER
      : "https://qa-filosage.ciamlogin.com/11111111-1111-1111-1111-111111111111/v2.0",
    subject,
    email: `identity-link-${runId}@filosage.local`,
    emailVerified: true,
    authTime: Math.floor(Date.now() / 1_000),
    name: "Identity Link Learner",
  };
  return {
    uid: subject,
    email: providerIdentity.email,
    email_verified: true,
    auth_time: providerIdentity.authTime,
    name: providerIdentity.name,
    providerIdentity,
    identityLinkRegistered: false,
  };
}
```

Import `DIRECT_GOOGLE_ISSUER` and `VerifiedProviderIdentity` from `identity-types.ts`. Do not accept a user-supplied email, UID, issuer, or arbitrary token shape.

- [ ] **Step 2: Write the failing two-session API test**

In `tests/auth-linking.spec.ts`, import `request as playwrightRequest` from Playwright plus `PRIVACY_VERSION` and `TERMS_VERSION`. Add one Chromium-only test with this sequence:

```ts
test("links two verified sessions once and preserves the Google canonical UID", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The transaction contract needs one isolated server.");
  const baseURL = String(testInfo.project.use.baseURL);
  const runId = crypto.randomUUID();
  const googleToken = `playwright-link-google-${runId}`;
  const externalToken = `playwright-link-filosage-${runId}`;
  const googleUid = `google-${runId}`;
  const trustedHeaders = (token: string) => ({
    Authorization: `Bearer ${token}`,
    Origin: baseURL,
    Accept: "application/json",
  });

  const accepted = await request.post("/api/legal/acceptance", {
    headers: { ...trustedHeaders(googleToken), "Content-Type": "application/json" },
    data: {
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      ageEligibilityConfirmed: true,
      source: "signup",
    },
  });
  expect(accepted.status()).toBe(200);

  const created = await request.post("/api/auth/link-intent?return=%2Fprofile%3Fidentity-linked%3D1", {
    headers: trustedHeaders(googleToken),
  });
  expect(created.status()).toBe(200);
  const storageState = await request.storageState();

  const completionHeaders = trustedHeaders(externalToken);
  const first = await playwrightRequest.newContext({ baseURL, storageState, extraHTTPHeaders: completionHeaders });
  const second = await playwrightRequest.newContext({ baseURL, storageState, extraHTTPHeaders: completionHeaders });
  try {
    const outcomes = await Promise.all([
      first.post("/api/auth/link-intent/complete"),
      second.post("/api/auth/link-intent/complete"),
    ]);
    expect(outcomes.map((response) => response.status()).sort()).toEqual([200, 409]);
    const session = await first.get("/api/auth/session");
    expect(await session.json()).toMatchObject({
      user: { uid: googleUid, authenticationProvider: "filosage" },
    });
  } finally {
    await first.dispose();
    await second.dispose();
  }
});
```

This test uses only the Playwright-owned local store. It must not run against an external `ACCEPTANCE_BASE_URL` because it creates a temporary learner account and registry records.

- [ ] **Step 3: Run the API test and verify the intended failure**

Run:

```powershell
npm.cmd run test:e2e -- tests/auth-linking.spec.ts --project=chromium --grep "links two verified sessions"
```

Expected: FAIL until the provider fixtures and full linking route are present. After the implementation exists, rerun and require exactly one `200`, one `409`, and the original Google canonical UID.

- [ ] **Step 4: Add focused accessibility and responsive tests**

Create `tests/auth-accessibility.spec.ts` with `@axe-core/playwright`. The primary modal test runs in all three configured projects:

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("secure sign-in modal stays keyboard-contained and WCAG-clean", async ({ page }) => {
  await page.goto("/");
  const trigger = page.locator(".marketing-hero").getByRole("button", { name: "Create a free account" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Keep your learning in sync" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("checkbox").check();
  await expect(dialog.getByRole("button", { name: "Continue securely" })).toBeEnabled();

  const accessibility = await new AxeBuilder({ page })
    .include(".auth-dialog")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);

  for (let index = 0; index < 10; index += 1) await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)).toBe(true);
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
```

Add a second test that seeds `filosage-local-session`, fulfills `/api/account` with `identityLinkRequired: true`, and applies the same axe, focus-containment, and horizontal-overflow assertions to the **Confirm your existing sign-in** dialog. Press Escape and assert that this blocking recovery dialog remains visible, then assert that **Sign out and choose another method** is keyboard reachable. Use response fields `plan: "free"`, `accountStatus: "active"`, `applicationAccountExists: false`, `legalAcceptanceRequired: false`, and `identityLinkRequired: true` so no unrelated modal can win precedence.

For both dialogs, add a 320 px viewport pass with the root font size set to `200%`, verify `scrollWidth <= clientWidth`, and test one forced-colors pass. Long instructions must wrap with `overflow-wrap: anywhere`, action labels must not use fixed widths, body/control text stays at least 16 px on mobile, and buttons stay at least 44 px tall. This implements the Impeccable hardening floor without changing the approved visual language.

- [ ] **Step 5: Run the full local verification ladder**

Run from the isolated worktree, in this order:

```powershell
npm.cmd run test:e2e -- tests/auth-identity.spec.ts tests/identity-link-server.spec.ts tests/identity-migration.spec.ts tests/auth-linking.spec.ts tests/external-id-branding.spec.ts tests/account-onboarding.spec.ts tests/account-privacy-policy.spec.ts tests/azure-infrastructure.spec.ts tests/release-scripts.spec.ts --project=chromium
npm.cmd run test:e2e -- tests/auth-accessibility.spec.ts
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run build
npm.cmd run test:e2e -- --project=chromium
```

Expected: every command exits `0`. The last command is the full local Chromium suite; the accessibility suite separately covers Desktop Chrome, Pixel 7, and iPhone 13 profiles. If any command fails, report the exact failing command and test count and do not call the branch review-ready.

- [ ] **Step 6: Scan the implementation for forbidden ownership and leakage patterns**

Run:

```powershell
rg -n "NEXT_PUBLIC_.*(?:SECRET|ISSUER)|localStorage.*(?:token|code|secret)|sessionStorage.*(?:token|code|secret)|console\.(?:log|error).*?(?:email|subject|token|code|secret)|type=[\"']password|send.*otp|verify.*otp" src scripts infra tests
rg -n "signInWithGoogle|signInWithGoogleRedirect|beginGoogleSignIn|beginGoogleReauthentication|isGoogleAuthConfigured" src tests
```

Expected: the first scan has no credential/session leakage or application-owned OTP/password implementation; inspect every match rather than relying on count alone. The second scan has no obsolete client identifiers except a reviewed migration comment or test assertion that explicitly proves their removal.

- [ ] **Step 7: Commit Task 10**

```powershell
git add src/lib/identity-server.ts tests/auth-linking.spec.ts tests/auth-accessibility.spec.ts
git commit -m "test: verify external identity migration flow"
```

### Task 11: Operator runbook, gated QA handoff, and review readiness

**Files:**
- Create: `docs/AUTH_EXTERNAL_ID_RUNBOOK.md`
- Modify: `tests/external-id-branding.spec.ts`

**Interfaces:**
- Consumes: approved design, final infrastructure names, local verification evidence, current release-safety workflow.
- Produces: a non-secret approval ledger, exact QA/production configuration inventory, live acceptance matrix, rollback procedure, and a handoff that makes no deployment claim.

- [ ] **Step 1: Write a failing runbook contract**

Extend `tests/external-id-branding.spec.ts` to read `docs/AUTH_EXTERNAL_ID_RUNBOOK.md` and require all of these literal sections:

```ts
for (const heading of [
  "## Approval ledger",
  "## Non-secret configuration inventory",
  "## Google federation redirect URIs",
  "## QA activation procedure",
  "## Live acceptance matrix",
  "## Production promotion gates",
  "## Rollback",
  "## Direct Google retirement criteria",
]) expect(runbook).toContain(heading);
expect(runbook).toContain("BILLING_ENABLED=false");
expect(runbook).toContain("/.auth/login/filosage/callback");
expect(runbook).not.toMatch(/(?:client secret|HMAC secret|one-time code):\s*\S+/i);
```

Run:

```powershell
npm.cmd run test:e2e -- tests/external-id-branding.spec.ts --project=chromium
```

Expected: FAIL because the runbook does not yet exist.

- [ ] **Step 2: Create the approval ledger and non-secret inventory**

Create `docs/AUTH_EXTERNAL_ID_RUNBOOK.md`. The approval ledger has separate unchecked rows for:

1. External tenant/application/user-flow and Google-provider writes.
2. QA External ID OAuth-secret creation/rotation and one-time HMAC-secret creation.
3. QA deployment and provider enablement.
4. Registry backfill `--apply --missing-only` mode.
5. Production External ID OAuth-secret creation/rotation and one-time HMAC-secret creation.
6. Production zero-traffic deployment.
7. Production External ID enablement.
8. New-account rollout.
9. Direct Google retirement and later secret removal.

For each row record approver, approval time, operator, target tenant/subscription/resource group, change reference, and evidence link. Leave values blank; never guess an identifier or approval.

The non-secret inventory records the tenant ID, tenant subdomain, user-flow ID, application client ID, exact issuer, exact discovery URL, named Easy Auth provider `filosage`, QA and production Container App names, callback URLs, Google OAuth client ID, the exact `postgres:server/database` maintenance target, and Key Vault secret *names and version identifiers only*. It explicitly forbids connection strings, secret values, cookies, authorization responses, raw claim headers, provider subjects, emails, and one-time codes.

- [ ] **Step 3: Document the approved External ID setup**

Under the QA procedure, require the operator to:

1. Confirm the approved External ID tenant name, subdomain, region/data location, and administrator before creating anything.
2. Register the application with the QA Easy Auth callback `https://<qa-container-app-host>/.auth/login/filosage/callback`.
3. Create one sign-up/sign-in user flow with email one-time passcode plus Google federation, and collect `openid profile email` only.
4. Configure the reviewed banner, background, favicon, footer, privacy link, terms link, and `infra/azure/external-id-branding/custom.css`; keep the Microsoft-hosted domain in this release.
5. Add all Google federation redirect URIs produced by the tenant/user-flow portal, including both tenant-ID and tenant-subdomain `ciamlogin.com` forms; copy the exact values into the non-secret inventory before saving Google OAuth changes.
6. Store the External ID OAuth secret and a separately generated 32-byte-or-longer identity-link HMAC secret in the QA Key Vault under the exact Bicep names. Record versions, never values.
7. Run Bicep validation and `az deployment group what-if`; review the complete diff before any deployment.
8. Deploy with direct Google enabled, External ID disabled, new External ID accounts disabled, and `BILLING_ENABLED=false` before the explicit QA activation gate.

The runbook links the official Microsoft instructions in the Sources section below and says portal labels may drift; the tenant-produced redirect URI list is authoritative.

- [ ] **Step 4: Document dry-run, activation, and the live acceptance matrix**

Require this order after the corresponding approvals:

```powershell
npm.cmd run migrate:identity-links
$identityTarget = Read-Host 'Type the exact datastore target recorded in the approved inventory'
npm.cmd run migrate:identity-links -- --apply --missing-only "--expected-target=$identityTarget"
```

The first command is mandatory and non-mutating. The second is a separate registry-write approval. Record counts only and stop on invalid accounts, duplicate normalized emails, or conflicts.

Then enable External ID in isolated QA while keeping new accounts disabled. Prove the owner/existing-account linking path first. Enable QA new accounts only after that proof. The live matrix records pass/fail, time, QA revision SHA, browser/device, auth method, canonical-UID evidence, and redacted correlation ID for:

- existing direct-Google sign-in and ordinary account use;
- owner migration through the two-session intent with unchanged canonical UID;
- Google federation sign-up and return through External ID;
- non-Gmail email-code sign-up and return;
- Gmail email-code sign-up and return;
- wrong-email, expired, replayed, and concurrent link attempts without mutation;
- same-email second identity blocked from automatic linking;
- cancellation, resend, throttling, provider outage, and network recovery;
- fresh-auth requirements for Google federation and email code on deletion and owner-sensitive actions;
- hosted branding, privacy/terms links, keyboard focus, reduced motion, 320 px, 390 px, desktop, dark mode, and 200% zoom;
- account export/deletion and the existing owner/plan authorization regressions.

If either External ID method does not produce a trustworthy fresh `auth_time`, mark sensitive operations for that method blocked and stop promotion.

- [ ] **Step 5: Document production gates and rollback without executing them**

Production promotion requires all local and QA evidence, exact-SHA independent QA, an inactive zero-traffic production revision, `EXPECTED_AUTH_MODE=direct-google` before activation, a reviewed production `what-if`, current backup/restore evidence, alert readiness, rollback rehearsal, and Victor's separate production-enable approval. `BILLING_ENABLED=false` remains invariant.

Rollback is configuration-first and non-destructive:

1. Set `EXTERNAL_ID_NEW_ACCOUNTS_ENABLED=false`.
2. Set `EXTERNAL_ID_AUTH_ENABLED=false` and disable only the `filosage` Easy Auth provider.
3. Confirm `DIRECT_GOOGLE_AUTH_ENABLED=true` and health mode `direct-google`.
4. Keep the External ID tenant, user flow, provider registration, Key Vault secrets, registry documents, and learner records intact for diagnosis and recovery.
5. Re-run signed-in direct-Google smoke tests and the exact-SHA production health check.

The runbook forbids deleting either provider, unlinking identities, rewriting canonical UIDs, rotating the `v1` HMAC secret, or removing secrets during rollback. Any HMAC rotation requires a separate `v2` dual-read/dual-write migration design. Direct Google retirement requires migration coverage, a completed observation window, support/error thresholds, rollback-retention completion, and Victor's later explicit approval.

- [ ] **Step 6: Verify the runbook and inspect the final branch**

Run:

```powershell
npm.cmd run test:e2e -- tests/external-id-branding.spec.ts --project=chromium
git status --short
git diff --check
git log --oneline --decorate -12
```

Expected: the focused contract passes, `git diff --check` is silent, and status contains only the runbook/test changes awaiting this task's commit. Record the implementation base and every task commit SHA in Multica.

- [ ] **Step 7: Commit Task 11**

```powershell
git add docs/AUTH_EXTERNAL_ID_RUNBOOK.md tests/external-id-branding.spec.ts
git commit -m "docs: add external identity rollout runbook"
```

- [ ] **Step 8: Run final evidence and request review**

Freshly rerun the Task 10 verification ladder after the final commit. Then invoke `superpowers:requesting-code-review` and address findings with `superpowers:receiving-code-review`. Do not merge, push, deploy, create/modify the External ID tenant, create/rotate secrets, or apply the registry backfill as part of this plan execution unless Victor separately approves the exact external action.

Mark the Multica item `review_ready`, not `completed`, with separate fields for local commit, push, QA deployment, production deployment, and production verification. At this point only the local implementation and evidence are expected to exist.

## Sources

- [Microsoft Entra External ID authentication methods](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-authentication-methods-customers)
- [Add Google as an External ID identity provider](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-google-federation-customers)
- [Customize branding for External ID customers](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-customize-branding-customers)
- [Microsoft Entra company-branding themes and image constraints](https://learn.microsoft.com/en-us/entra/fundamentals/how-to-customize-branding-themes-apps)
- [Microsoft company-branding CSS reference](https://learn.microsoft.com/en-us/entra/fundamentals/reference-company-branding-css-template)
- [Azure Container Apps authentication and authorization](https://learn.microsoft.com/en-us/azure/container-apps/authentication)
- [Container Apps `authConfigs` Bicep reference](https://learn.microsoft.com/en-us/azure/templates/microsoft.app/2025-01-01/containerapps/authconfigs)
- [NIST SP 800-63B digital identity guidelines](https://pages.nist.gov/800-63-4/sp800-63b.html)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

## Definition of done for this plan

- The implementation is complete only when Tasks 1-11 are committed in the isolated worktree and the fresh final local verification ladder passes.
- Local completion does not imply a push, QA deployment, production deployment, or production verification.
- QA identity configuration and live acceptance require their own explicit approvals and evidence.
- Production remains on direct Google with External ID and new External ID accounts disabled until the separate activation gate passes.
- Direct Google remains configured and available for rollback until a later retirement approval.
- `BILLING_ENABLED=false` throughout.
