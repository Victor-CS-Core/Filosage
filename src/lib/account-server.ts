import "server-only";

import {
  runStoredDocumentTransaction,
  type VerifiedFirebaseUser,
} from "@/lib/firebase-server";
import { isLocalMode, LOCAL_OWNER_UID } from "@/lib/local-mode";
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
  if (isLocalMode()) return user.uid === LOCAL_OWNER_UID;
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  return Boolean(ownerEmail && user.email_verified && user.email?.trim().toLowerCase() === ownerEmail);
}

// Skip the lastSeen refresh write when the stored record is newer than this;
// account state changes always write regardless.
const LAST_SEEN_REFRESH_MS = 15 * 60_000;

interface ResolvedAccountState {
  saved: Record<string, unknown>;
  plan: LearnerPlan;
  access: ServerAccount["access"];
  accountStatus: AccountStatus;
}

async function resolveAccount(
  user: VerifiedFirebaseUser,
): Promise<ServerAccount | null> {
  const path = `users/${user.uid}`;
  const now = new Date().toISOString();
  const email = user.email?.trim().toLowerCase();
  const isOwner = isOwnerUser(user);
  const allowlisted = Boolean(email && premiumEmailSet().has(email));

  // Read and write inside one transaction so a concurrent billing webhook
  // update conflicts (and retries) instead of being overwritten with stale
  // subscription state.
  const resolved = await runStoredDocumentTransaction<ResolvedAccountState | null>([path], (documents) => {
    const existing = documents[path];
    if (!existing) return { writes: [], result: null };
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

    const next = {
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
    };

    const materialKeys = ["uid", "email", "displayName", "photoURL", "plan", "accountStatus", "manualProUntil"] as const;
    const fresh = Boolean(existing?.updatedAt)
      && Date.now() - Date.parse(String(existing!.updatedAt)) < LAST_SEEN_REFRESH_MS;
    const unchanged = Boolean(existing) && fresh
      && materialKeys.every((key) => (existing![key] ?? null) === (next[key] ?? null));

    return {
      writes: unchanged ? [] : [{ path, data: next }],
      result: { saved: next as Record<string, unknown>, plan, access, accountStatus },
    };
  });
  if (!resolved) return null;
  const { saved, plan, access, accountStatus } = resolved;

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
    manualProUntil: typeof saved.manualProUntil === "string" ? saved.manualProUntil : undefined,
    subscriptionStatus: String(saved.subscriptionStatus ?? "none") as ServerAccount["subscriptionStatus"],
    currentPeriodEnd: typeof saved.currentPeriodEnd === "string" ? saved.currentPeriodEnd : undefined,
    billingCustomerId: typeof saved.billingCustomerId === "string" ? saved.billingCustomerId : undefined,
    acceptedTermsVersion: typeof saved.acceptedTermsVersion === "string" ? saved.acceptedTermsVersion : undefined,
    acceptedPrivacyVersion: typeof saved.acceptedPrivacyVersion === "string" ? saved.acceptedPrivacyVersion : undefined,
  };
}

export function getExistingAccount(user: VerifiedFirebaseUser) {
  return resolveAccount(user);
}
