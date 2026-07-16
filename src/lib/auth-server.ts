import "server-only";

import type { DecodedIdToken } from "firebase-admin/auth";
import { NextResponse } from "next/server";
import { OWNER_EMAIL } from "@/lib/auth-constants";
import { getAdminAuth } from "@/lib/firebase-admin";

export class AuthorizationError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

export async function getVerifiedUser(request: Request): Promise<DecodedIdToken | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  try {
    return await getAdminAuth().verifyIdToken(authHeader.slice(7));
  } catch {
    return null;
  }
}

export async function requireOwner(request: Request): Promise<DecodedIdToken> {
  const user = await getVerifiedUser(request);
  if (!user) {
    throw new AuthorizationError(401, "Sign in with the owner account to continue.");
  }

  const email = user.email?.trim().toLowerCase();
  if (!user.email_verified || email !== OWNER_EMAIL) {
    throw new AuthorizationError(403, "This workspace is limited to its owner.");
  }

  return user;
}

export function authorizationResponse(error: unknown) {
  if (error instanceof AuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}
