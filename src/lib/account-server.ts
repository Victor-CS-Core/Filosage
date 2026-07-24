import "server-only";

import {
  getStoredDocument,
  putStoredDocument,
  type VerifiedFirebaseUser,
} from "@/lib/firebase-server";
import type { AccessLevel, AccountStatus, LearnerPlan } from "@/lib/course-types";

export interface ServerAccount {
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  plan: LearnerPlan;
  access: Exclude<AccessLevel, "anonymous">;
  isOwner: boolean;
  accountStatus: AccountStatus;
  suspensionReason?: string;
  manualProUntil?: string;
  subscriptionStatus: "none" | "trialing" | "active" | "past_due" | "canceled";
  currentPeriodEnd?: string;
  billingCustomerId?: string;
  acceptedTermsVersion?: string;
  acceptedPrivacyVersion?: string;
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
  const manualProUntil = typeof existing?.manualProUntil === "string" ? existing.manualProUntil : undefined;
  const manualProActive = manualProUntil === "permanent"
    || (Boolean(manualProUntil) && Date.parse(manualProUntil!) > Date.now());
  const plan: LearnerPlan = isOwner || allowlisted || subscribed || manualProActive ? "pro" : "free";
  const access: ServerAccount["access"] = isOwner ? "owner" : plan === "pro" ? "pro" : "free";
  const accountStatus: AccountStatus = isOwner
    ? "active"
    : existing?.accountStatus === "suspended"
      ? "suspended"
      : "active";

  const saved = await putStoredDocument(path, {
    ...(existing ?? {}),
    uid: user.uid,
    email: email ?? null,
    displayName: user.name ?? existing?.displayName ?? null,
    photoURL: user.picture ?? existing?.photoURL ?? null,
    plan,
    accountStatus,
    manualProUntil: manualProUntil ?? null,
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
    accountStatus,
    suspensionReason: typeof saved.suspensionReason === "string" ? saved.suspensionReason : undefined,
    manualProUntil,
    subscriptionStatus,
    currentPeriodEnd: typeof saved.currentPeriodEnd === "string" ? saved.currentPeriodEnd : undefined,
    billingCustomerId: typeof saved.billingCustomerId === "string" ? saved.billingCustomerId : undefined,
    acceptedTermsVersion: typeof saved.acceptedTermsVersion === "string" ? saved.acceptedTermsVersion : undefined,
    acceptedPrivacyVersion: typeof saved.acceptedPrivacyVersion === "string" ? saved.acceptedPrivacyVersion : undefined,
  };
}
