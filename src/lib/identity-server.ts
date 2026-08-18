import { authenticationRuntimeConfiguration } from "@/lib/auth-runtime";
import "server-only";

import { easyAuthIdentityFromHeaders } from "@/lib/easy-auth-principal";
import type { VerifiedProviderIdentity, VerifiedUser } from "@/lib/identity-types";
import { isLocalMode, LOCAL_OWNER_EMAIL, LOCAL_OWNER_UID } from "@/lib/local-mode";
import { serverEnvironment } from "@/lib/runtime-environment";

export type { VerifiedUser } from "@/lib/identity-types";

const LOCAL_PLAYWRIGHT_LEARNERS = new Map<string, { uid: string; email: string }>([
  ["playwright-free-learner-api", {
    uid: "local-free-learner-api",
    email: "learner-api@filosage.local",
  }],
  ["playwright-free-learner", { uid: "local-free-learner", email: "learner@filosage.local" }],
  ["playwright-free-learner-mobile-chromium", {
    uid: "local-free-learner-mobile-chromium",
    email: "learner-mobile-chromium@filosage.local",
  }],
  ["playwright-free-learner-mobile-webkit", {
    uid: "local-free-learner-mobile-webkit",
    email: "learner-mobile-webkit@filosage.local",
  }],
  ["playwright-plus-learner", { uid: "local-plus-learner", email: "plus-learner@filosage.local" }],
]);

function localVerifiedUser(idToken: string): VerifiedUser | null {
  const auth_time = Math.floor(Date.now() / 1_000);
  const localUser = (uid: string, email: string, name: string, authTime = auth_time): VerifiedUser => ({
    uid,
    email,
    email_verified: true,
    auth_time: authTime,
    name,
    providerIdentity: {
      provider: "local",
      issuer: "https://local.filosage.invalid",
      subject: uid,
      email,
      emailVerified: true,
      authTime,
      name,
    },
    identityLinkRegistered: true,
  });
  if (idToken === "local-dev-token" || idToken === "playwright-local-owner") {
    return localUser(
      LOCAL_OWNER_UID,
      serverEnvironment.OWNER_EMAIL?.trim().toLowerCase() || LOCAL_OWNER_EMAIL,
      "Local Owner",
    );
  }
  if (idToken === "playwright-stale-local-owner") {
    return localUser(
      LOCAL_OWNER_UID,
      serverEnvironment.OWNER_EMAIL?.trim().toLowerCase() || LOCAL_OWNER_EMAIL,
      "Local Owner",
      auth_time - 10 * 60,
    );
  }
  const learner = LOCAL_PLAYWRIGHT_LEARNERS.get(idToken);
  if (learner) return localUser(learner.uid, learner.email, "Playwright Learner");
  const isolatedPlusLearner = /^playwright-plus-learner-([0-9a-f]{8}-[0-9a-f-]{27})$/i.exec(idToken);
  if (isolatedPlusLearner) {
    const runId = isolatedPlusLearner[1].toLowerCase();
    return localUser(
      `local-plus-learner-${runId}`,
      `plus-learner-${runId}@filosage.local`,
      "Playwright Plus Learner",
    );
  }
  if (idToken === "playwright-preaccount-learner") {
    return localUser("local-preaccount-learner", "preaccount@filosage.local", "Pre-account Learner");
  }
  return null;
}

/**
 * Reads claims injected by the Azure Container Apps authentication sidecar.
 * Azure removes these headers from external requests before adding its own,
 * and this path is enabled only in the deployed Easy Auth runtime.
 */
export function verifiedEasyAuthIdentity(request: Request): VerifiedProviderIdentity | null {
  return easyAuthIdentityFromHeaders(request.headers, authenticationRuntimeConfiguration());
}

/**
 * Temporary compatibility bridge until Task 2 resolves every provider identity
 * through the canonical identity-link registry. External ID remains fail-closed.
 */
export function verifiedEasyAuthUser(request: Request): VerifiedUser | null {
  const providerIdentity = verifiedEasyAuthIdentity(request);
  if (!providerIdentity || providerIdentity.provider !== "google") return null;
  return {
    uid: providerIdentity.subject,
    email: providerIdentity.email,
    email_verified: true,
    auth_time: providerIdentity.authTime,
    name: providerIdentity.name,
    picture: providerIdentity.picture,
    providerIdentity,
    identityLinkRegistered: true,
  };
}

export async function verifyProviderIdentity(idToken: string): Promise<VerifiedProviderIdentity | null> {
  return isLocalMode() ? localVerifiedUser(idToken)?.providerIdentity ?? null : null;
}

/** Temporary local-fixture compatibility bridge until Task 2 registry resolution. */
export async function verifyIdentityToken(idToken: string): Promise<VerifiedUser | null> {
  return isLocalMode() ? localVerifiedUser(idToken) : null;
}
