import "server-only";

import { easyAuthIdentityFromHeaders } from "@/lib/easy-auth-principal";
import { isLocalMode, LOCAL_OWNER_EMAIL, LOCAL_OWNER_UID } from "@/lib/local-mode";
import { serverEnvironment } from "@/lib/runtime-environment";

export interface VerifiedUser {
  uid: string;
  email?: string;
  email_verified: boolean;
  auth_time?: number;
  name?: string;
  picture?: string;
}

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
  if (idToken === "local-dev-token" || idToken === "playwright-local-owner") {
    return {
      uid: LOCAL_OWNER_UID,
      email: serverEnvironment.OWNER_EMAIL?.trim().toLowerCase() || LOCAL_OWNER_EMAIL,
      email_verified: true,
      auth_time,
      name: "Local Owner",
    };
  }
  if (idToken === "playwright-stale-local-owner") {
    return {
      uid: LOCAL_OWNER_UID,
      email: serverEnvironment.OWNER_EMAIL?.trim().toLowerCase() || LOCAL_OWNER_EMAIL,
      email_verified: true,
      auth_time: auth_time - 10 * 60,
      name: "Local Owner",
    };
  }
  const learner = LOCAL_PLAYWRIGHT_LEARNERS.get(idToken);
  if (learner) return { ...learner, email_verified: true, auth_time, name: "Playwright Learner" };
  const isolatedPlusLearner = /^playwright-plus-learner-([0-9a-f]{8}-[0-9a-f-]{27})$/i.exec(idToken);
  if (isolatedPlusLearner) {
    const runId = isolatedPlusLearner[1].toLowerCase();
    return {
      uid: `local-plus-learner-${runId}`,
      email: `plus-learner-${runId}@filosage.local`,
      email_verified: true,
      auth_time,
      name: "Playwright Plus Learner",
    };
  }
  if (idToken === "playwright-preaccount-learner") {
    return {
      uid: "local-preaccount-learner",
      email: "preaccount@filosage.local",
      email_verified: true,
      auth_time,
      name: "Pre-account Learner",
    };
  }
  return null;
}

/**
 * Reads claims injected by the Azure Container Apps authentication sidecar.
 * Azure removes these headers from external requests before adding its own,
 * and this path is enabled only in the deployed Easy Auth runtime.
 */
export function verifiedEasyAuthUser(request: Request): VerifiedUser | null {
  return easyAuthIdentityFromHeaders(
    request.headers,
    serverEnvironment.AZURE_EASY_AUTH_ENABLED?.trim().toLowerCase() === "true",
  );
}

export async function verifyIdentityToken(idToken: string): Promise<VerifiedUser | null> {
  return isLocalMode() ? localVerifiedUser(idToken) : null;
}
