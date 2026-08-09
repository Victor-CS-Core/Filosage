import "server-only";

import { NextResponse } from "next/server";
import {
  verifyFirebaseIdToken,
  type VerifiedFirebaseUser,
} from "@/lib/firebase-server";
import { getExistingAccount, type ServerAccount } from "@/lib/account-server";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { hasRecentFirebaseAuthentication } from "@/lib/recent-auth";

export class AuthorizationError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

export async function getVerifiedUser(request: Request): Promise<VerifiedFirebaseUser | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  try {
    return await verifyFirebaseIdToken(authHeader.slice(7));
  } catch {
    return null;
  }
}

export async function requireUser(request: Request): Promise<VerifiedFirebaseUser> {
  const user = await getVerifiedUser(request);
  if (!user || !user.email_verified) {
    throw new AuthorizationError(401, "Sign in with a verified account to continue.");
  }
  return user;
}

export async function requireAccount(request: Request): Promise<ServerAccount> {
  const account = await getExistingAccount(await requireUser(request));
  if (!account) {
    throw new AuthorizationError(403, "Complete account setup and accept the current Terms and Privacy Notice to continue.");
  }
  return account;
}

export async function requireRecentlyAuthenticatedAccount(
  request: Request,
  recentAuthenticationMessage = "Sign in again before permanently deleting your account.",
): Promise<ServerAccount> {
  const user = await requireUser(request);
  if (!hasRecentFirebaseAuthentication(user.auth_time)) {
    throw new AuthorizationError(401, recentAuthenticationMessage);
  }
  const account = await getExistingAccount(user);
  if (!account) throw new AuthorizationError(403, "Complete account setup before managing account data.");
  return account;
}

export async function requireRecentlyAuthenticatedOwner(request: Request): Promise<ServerAccount> {
  const account = await requireRecentlyAuthenticatedAccount(
    request,
    "Sign in again before using a publication override.",
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
  if (account.plan !== "pro" && !account.isOwner) {
    throw new AuthorizationError(403, "Filosage Pro is required for this feature.");
  }
  return account;
}

export function authorizationResponse(error: unknown) {
  if (error instanceof AuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}
