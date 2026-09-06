import "server-only";

import {
  runStoredDocumentTransaction,
} from "@/lib/document-store";
import { AccountLifecycleError, accountLifecyclePath, currentAccountGeneration } from "@/lib/account-lifecycle";
import type { VerifiedUser } from "@/lib/identity-server";
import { isLocalMode, LOCAL_OWNER_UID } from "@/lib/local-mode";
import type { AccessLevel, AccountStatus, LearnerPlan } from "@/lib/course-types";
import { normalizeDisplayName, preferredDisplayName } from "@/lib/display-name";
import { isBillingInterval, isPaidLearnerPlan, type PaidLearnerPlan } from "@/lib/membership-plans";
import { serverEnvironment } from "@/lib/runtime-environment";

export interface ServerAccount {
  uid: string;
  accountGeneration?: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  plan: LearnerPlan;
  access: Exclude<AccessLevel, "anonymous">;
  isOwner: boolean;
  accountStatus: AccountStatus;
  suspensionReason?: string;
  manualPlan?: PaidLearnerPlan;
  manualPlanUntil?: string;
  manualProUntil?: string;
  subscriptionStatus: "none" | "trialing" | "active" | "past_due" | "canceled";
  billingInterval?: "monthly" | "annual";
  currentPeriodEnd?: string;
  billingCustomerId?: string;
  billingSubscriptionId?: string;
  billingRawStatus?: string;
  acceptedTermsVersion?: string;
  acceptedPrivacyVersion?: string;
}

function premiumEmailSet() {
  return new Set(
    (serverEnvironment.PREMIUM_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isOwnerUser(user: VerifiedUser) {
  if (isLocalMode()) return user.uid === LOCAL_OWNER_UID;
  const ownerEmail = serverEnvironment.OWNER_EMAIL?.trim().toLowerCase();
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
  user: VerifiedUser,
): Promise<ServerAccount | null> {
  const path = `users/${user.uid}`;
  const now = new Date().toISOString();
  const email = user.email?.trim().toLowerCase();
  const isOwner = isOwnerUser(user);
  const allowlisted = Boolean(email && premiumEmailSet().has(email));

  // Read and write inside one transaction so a concurrent billing webhook
  // update conflicts (and retries) instead of being overwritten with stale
  // subscription state.
  const resolved = await runStoredDocumentTransaction<ResolvedAccountState | null>([path, accountLifecyclePath(user.uid)], (documents) => {
    const lifecycle = documents[accountLifecyclePath(user.uid)];
    if (lifecycle && lifecycle.state !== "active") throw new AccountLifecycleError();
    const existing = documents[path];
    if (!existing) return { writes: [], result: null };
    const subscriptionStatus = String(existing?.subscriptionStatus ?? "none") as ServerAccount["subscriptionStatus"];
    const subscribed = subscriptionStatus === "active" || subscriptionStatus === "trialing";
    const legacyManualProUntil = typeof existing?.manualProUntil === "string" ? existing.manualProUntil : undefined;
    const manualPlanUntil = typeof existing?.manualPlanUntil === "string" ? existing.manualPlanUntil : legacyManualProUntil;
    const manualPlan = isPaidLearnerPlan(existing?.manualPlan)
      ? existing.manualPlan
      : legacyManualProUntil ? "pro" : undefined;
    const manualPlanActive = manualPlanUntil === "permanent"
      || (Boolean(manualPlanUntil) && Date.parse(manualPlanUntil!) > Date.now());
    const subscribedPlan = isPaidLearnerPlan(existing?.billingPlan) ? existing.billingPlan : "pro";
    const plan: LearnerPlan = isOwner || allowlisted
      ? "pro"
      : subscribed
        ? subscribedPlan
      : manualPlanActive && manualPlan
        ? manualPlan
        : "free";
    const access: ServerAccount["access"] = isOwner ? "owner" : plan;
    const accountStatus: AccountStatus = isOwner
      ? "active"
      : existing?.accountStatus === "suspended"
        ? "suspended"
        : "active";

    const next = {
      ...(existing ?? {}),
      uid: user.uid,
      email: email ?? null,
      displayName: preferredDisplayName(existing?.displayName, user.name, email),
      photoURL: user.picture ?? existing?.photoURL ?? null,
      plan,
      accountStatus,
      manualPlan: manualPlan ?? null,
      manualPlanUntil: manualPlanUntil ?? null,
      manualProUntil: legacyManualProUntil ?? null,
      subscriptionStatus,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const materialKeys = ["uid", "email", "displayName", "photoURL", "plan", "accountStatus", "manualPlan", "manualPlanUntil", "manualProUntil"] as const;
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
    accountGeneration: currentAccountGeneration()?.generation,
    email,
    displayName: normalizeDisplayName(saved.displayName) ?? undefined,
    photoURL: String(saved.photoURL ?? "") || undefined,
    plan,
    access,
    isOwner,
    accountStatus,
    suspensionReason: typeof saved.suspensionReason === "string" ? saved.suspensionReason : undefined,
    manualPlan: isPaidLearnerPlan(saved.manualPlan) ? saved.manualPlan : undefined,
    manualPlanUntil: typeof saved.manualPlanUntil === "string" ? saved.manualPlanUntil : undefined,
    manualProUntil: typeof saved.manualProUntil === "string" ? saved.manualProUntil : undefined,
    subscriptionStatus: String(saved.subscriptionStatus ?? "none") as ServerAccount["subscriptionStatus"],
    billingInterval: isBillingInterval(saved.billingInterval) ? saved.billingInterval : undefined,
    currentPeriodEnd: typeof saved.currentPeriodEnd === "string" ? saved.currentPeriodEnd : undefined,
    billingCustomerId: typeof saved.billingCustomerId === "string" ? saved.billingCustomerId : undefined,
    billingSubscriptionId: typeof saved.billingSubscriptionId === "string" ? saved.billingSubscriptionId : undefined,
    billingRawStatus: typeof saved.billingRawStatus === "string" ? saved.billingRawStatus : undefined,
    acceptedTermsVersion: typeof saved.acceptedTermsVersion === "string" ? saved.acceptedTermsVersion : undefined,
    acceptedPrivacyVersion: typeof saved.acceptedPrivacyVersion === "string" ? saved.acceptedPrivacyVersion : undefined,
  };
}

export function getExistingAccount(user: VerifiedUser) {
  return resolveAccount(user);
}
