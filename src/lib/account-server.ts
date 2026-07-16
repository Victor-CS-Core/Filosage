import "server-only";

import {
  getStoredDocument,
  putStoredDocument,
  type VerifiedFirebaseUser,
} from "@/lib/firebase-server";
import type { AccessLevel, LearnerPlan } from "@/lib/course-types";

export interface ServerAccount {
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  plan: LearnerPlan;
  access: Exclude<AccessLevel, "anonymous">;
  isOwner: boolean;
  subscriptionStatus: "none" | "trialing" | "active" | "past_due" | "canceled";
  currentPeriodEnd?: string;
  billingCustomerId?: string;
}

function premiumEmailSet() {
  return new Set(
    (process.env.PREMIUM_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isOwnerUser(user: VerifiedFirebaseUser) {
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  return Boolean(ownerEmail && user.email_verified && user.email?.trim().toLowerCase() === ownerEmail);
}

export async function getOrCreateAccount(user: VerifiedFirebaseUser): Promise<ServerAccount> {
  const path = `users/${user.uid}`;
  const existing = await getStoredDocument(path);
  const now = new Date().toISOString();
  const email = user.email?.trim().toLowerCase();
  const isOwner = isOwnerUser(user);
  const allowlisted = Boolean(email && premiumEmailSet().has(email));
  const subscriptionStatus = String(existing?.subscriptionStatus ?? "none") as ServerAccount["subscriptionStatus"];
  const subscribed = subscriptionStatus === "active" || subscriptionStatus === "trialing";
  const plan: LearnerPlan = isOwner || allowlisted || subscribed ? "pro" : "free";
  const access: ServerAccount["access"] = isOwner ? "owner" : plan === "pro" ? "pro" : "free";

  const saved = await putStoredDocument(path, {
    ...(existing ?? {}),
    uid: user.uid,
    email: email ?? null,
    displayName: user.name ?? existing?.displayName ?? null,
    photoURL: user.picture ?? existing?.photoURL ?? null,
    plan,
    subscriptionStatus,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });

  return {
    uid: user.uid,
    email,
    displayName: String(saved.displayName ?? "") || undefined,
    photoURL: String(saved.photoURL ?? "") || undefined,
    plan,
    access,
    isOwner,
    subscriptionStatus,
    currentPeriodEnd: typeof saved.currentPeriodEnd === "string" ? saved.currentPeriodEnd : undefined,
    billingCustomerId: typeof saved.billingCustomerId === "string" ? saved.billingCustomerId : undefined,
  };
}
