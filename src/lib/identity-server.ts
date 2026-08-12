import "server-only";

import { createRemoteJWKSet, jwtVerify } from "jose";
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

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksUrl = "";

function requiredEntraConfiguration() {
  const issuer = serverEnvironment.ENTRA_ISSUER?.trim();
  const audience = serverEnvironment.ENTRA_AUDIENCE?.trim()
    || serverEnvironment.NEXT_PUBLIC_ENTRA_CLIENT_ID?.trim();
  const uri = serverEnvironment.ENTRA_JWKS_URI?.trim();
  if (!issuer || !audience || !uri) {
    throw new Error("Microsoft Entra token validation is not configured.");
  }
  return { issuer, audience, uri };
}

function remoteKeys(uri: string) {
  if (!jwks || jwksUrl !== uri) {
    jwks = createRemoteJWKSet(new URL(uri));
    jwksUrl = uri;
  }
  return jwks;
}

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
  const learner = LOCAL_PLAYWRIGHT_LEARNERS.get(idToken);
  if (learner) return { ...learner, email_verified: true, auth_time, name: "Playwright Learner" };
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

export async function verifyIdentityToken(idToken: string): Promise<VerifiedUser | null> {
  if (isLocalMode()) return localVerifiedUser(idToken);
  const { issuer, audience, uri } = requiredEntraConfiguration();
  try {
    const { payload } = await jwtVerify(idToken, remoteKeys(uri), { issuer, audience });
    const emailClaim = typeof payload.email === "string"
      ? payload.email
      : typeof payload.preferred_username === "string"
        ? payload.preferred_username
        : Array.isArray(payload.emails) && typeof payload.emails[0] === "string"
          ? payload.emails[0]
          : undefined;
    const uid = typeof payload.oid === "string" ? payload.oid : payload.sub;
    if (!uid) return null;
    return {
      uid,
      email: emailClaim?.trim().toLowerCase(),
      email_verified: Boolean(emailClaim),
      auth_time: typeof payload.auth_time === "number" ? payload.auth_time : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
      picture: typeof payload.picture === "string" ? payload.picture : undefined,
    };
  } catch {
    return null;
  }
}
