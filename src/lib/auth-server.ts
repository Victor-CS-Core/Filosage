import "server-only";

import { NextResponse } from "next/server";
import {
  verifiedEasyAuthIdentity,
  verifiedEasyAuthUser,
  verifyIdentityToken,
  verifyProviderIdentity,
  type VerifiedUser,
} from "@/lib/identity-server";
import { getExistingAccount, type ServerAccount } from "@/lib/account-server";
import { isLocalMode } from "@/lib/local-mode";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { planAllows, type PlanCapability } from "@/lib/membership-plans";
import { requestAccountMatchesVerifiedUid } from "@/lib/account-session";
import { recentAuthenticationProofMatchesUser } from "@/lib/identity-link-policy";

export class AuthorizationError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

export async function getVerifiedUser(request: Request): Promise<VerifiedUser | null> {
  if (!isLocalMode()) {
    const user = await verifiedEasyAuthUser(request);
    return user && requestAccountMatchesVerifiedUid(request.headers, user.uid) ? user : null;
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  try {
    const user = await verifyIdentityToken(authHeader.slice(7));
    return user && requestAccountMatchesVerifiedUid(request.headers, user.uid) ? user : null;
  } catch {
    return null;
  }
}

export async function requireUser(request: Request): Promise<VerifiedUser> {
  const user = await getVerifiedUser(request);
  if (!user || !user.email_verified) {
    throw new AuthorizationError(401, "Sign in with a verified account to continue.");
  }
  return user;
}

export async function requireProviderIdentity(request: Request) {
  const identity = !isLocalMode()
    ? verifiedEasyAuthIdentity(request)
    : await verifyProviderIdentity(
        request.headers.get("authorization")?.replace(/^Bearer\s+/, "") ?? "",
      );
  if (!identity?.emailVerified) {
    throw new AuthorizationError(401, "Sign in with a verified account to continue.");
  }
  return identity;
}

export async function requireAccount(request: Request): Promise<ServerAccount> {
  const account = await getExistingAccount(await requireUser(request));
  if (!account) {
    throw new AuthorizationError(403, "Complete account setup and accept the current Terms and Privacy Notice to continue.");
  }
  return account;
}

export async function requireRecentlyAuthenticatedUser(
  request: Request,
  recentAuthenticationMessage = "Sign in again before permanently deleting your account.",
  recentAuthenticationCode?: string,
): Promise<VerifiedUser> {
  const user = await requireUser(request);
  if (!isLocalMode()) {
    if (!recentAuthenticationProofMatchesUser(user, user)) {
      throw new AuthorizationError(401, recentAuthenticationMessage, recentAuthenticationCode);
    }
    return user;
  }
  const proofToken = request.headers.get("x-reauthentication-token")?.trim();
  const proof = proofToken ? await verifyIdentityToken(proofToken) : null;
  if (!recentAuthenticationProofMatchesUser(user, proof)) {
    throw new AuthorizationError(401, recentAuthenticationMessage, recentAuthenticationCode);
  }
  return user;
}

export async function requireRecentlyAuthenticatedAccount(
  request: Request,
  recentAuthenticationMessage = "Sign in again before permanently deleting your account.",
  recentAuthenticationCode?: string,
): Promise<ServerAccount> {
  const user = await requireRecentlyAuthenticatedUser(request, recentAuthenticationMessage, recentAuthenticationCode);
  const account = await getExistingAccount(user);
  if (!account) throw new AuthorizationError(403, "Complete account setup before managing account data.");
  return account;
}

export async function requireRecentlyAuthenticatedOwner(
  request: Request,
  recentAuthenticationMessage = "Sign in again before using a publication override.",
  recentAuthenticationCode?: string,
): Promise<ServerAccount> {
  const account = await requireRecentlyAuthenticatedAccount(
    request,
    recentAuthenticationMessage,
    recentAuthenticationCode,
  );
  if (account.accountStatus === "suspended") {
    throw new AuthorizationError(403, "This account is paused. Contact support if you believe this is an error.");
  }
  if (!hasCurrentLegalAcceptance(account)) {
    throw new AuthorizationError(403, "Accept the current terms and privacy notice before managing courses.");
  }
  if (!account.isOwner) throw new AuthorizationError(403, "Owner access is required.");
  return account;
}

export function hasCurrentLegalAcceptance(account: ServerAccount) {
  return account.acceptedTermsVersion === TERMS_VERSION
    && account.acceptedPrivacyVersion === PRIVACY_VERSION;
}

export async function requireAcceptedAccount(request: Request): Promise<ServerAccount> {
  const account = await requireAccount(request);
  if (account.accountStatus === "suspended") {
    throw new AuthorizationError(403, "This account is paused. Contact support if you believe this is an error.");
  }
  if (!hasCurrentLegalAcceptance(account)) {
    throw new AuthorizationError(403, "Review and accept the current Terms and Privacy Notice to continue.");
  }
  return account;
}

export async function requireOwner(request: Request): Promise<ServerAccount> {
  const account = await requireAcceptedAccount(request);
  if (!account.isOwner) throw new AuthorizationError(403, "Owner access is required.");
  return account;
}

export async function requirePremium(request: Request): Promise<ServerAccount> {
  const account = await requireAcceptedAccount(request);
  if (account.plan === "free" && !account.isOwner) {
    throw new AuthorizationError(403, "Filosage Plus or Pro is required for this feature.");
  }
  return account;
}

export async function requirePlanCapability(request: Request, capability: PlanCapability): Promise<ServerAccount> {
  const account = await requireAcceptedAccount(request);
  if (!account.isOwner && !planAllows(account.plan, capability)) {
    const feature = capability === "publish_course" ? "Course publishing" : "This feature";
    throw new AuthorizationError(403, `${feature} requires a plan that includes it.`);
  }
  return account;
}

export function authorizationResponse(error: unknown) {
  if (error instanceof AuthorizationError) {
    return NextResponse.json(
      error.code ? { error: error.message, code: error.code } : { error: error.message },
      { status: error.status },
    );
  }
  return null;
}
