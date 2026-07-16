import "server-only";

import { NextResponse } from "next/server";
import {
  verifyFirebaseIdToken,
  type VerifiedFirebaseUser,
} from "@/lib/firebase-server";
import { getOrCreateAccount, isOwnerUser, type ServerAccount } from "@/lib/account-server";

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

export async function requireOwner(request: Request): Promise<VerifiedFirebaseUser> {
  const user = await requireUser(request);
  if (!isOwnerUser(user)) throw new AuthorizationError(403, "Only the Erudoza owner can publish courses.");

  return user;
}

export async function requireUser(request: Request): Promise<VerifiedFirebaseUser> {
  const user = await getVerifiedUser(request);
  if (!user || !user.email_verified) {
    throw new AuthorizationError(401, "Sign in with a verified account to continue.");
  }
  return user;
}

export async function requireAccount(request: Request): Promise<ServerAccount> {
  return getOrCreateAccount(await requireUser(request));
}

export async function requirePremium(request: Request): Promise<ServerAccount> {
  const account = await requireAccount(request);
  if (account.plan !== "pro" && !account.isOwner) {
    throw new AuthorizationError(403, "Erudoza Pro is required for this feature.");
  }
  return account;
}

export function authorizationResponse(error: unknown) {
  if (error instanceof AuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}
