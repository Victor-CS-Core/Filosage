import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { runStoredDocumentTransaction } from "@/lib/document-store";

export type AccountGeneration = Readonly<{ uid: string; generation: string }>;
export type AccountLifecycle = AccountGeneration & { state: "active" | "deleting" | "deleted"; jobId?: string };
type Scope = (AccountGeneration & { kind: "account" | "initialize" })
  | (AccountGeneration & { kind: "deletion" | "billing-containment"; jobId: string; leaseToken?: string })
  | (AccountGeneration & { kind: "banner-receipt"; assetId: string; claimId?: string })
  | { kind: "global-usage" };
const accountScope = new AsyncLocalStorage<Readonly<Scope>>();
export class AccountLifecycleError extends Error {
  readonly status = 403;
  readonly code = "ACCOUNT_GENERATION_UNAVAILABLE";
  constructor(message = "This account session is no longer available. Sign in again or resume your deletion request.") { super(message); }
}
export function accountLifecyclePath(uid: string) {
  if (!uid || uid.includes("/") || uid !== uid.trim()) throw new AccountLifecycleError();
  return `accountLifecycles/${uid}`;
}
export function currentAccountScope() { return accountScope.getStore(); }
export function currentAccountGeneration(): AccountGeneration | null {
  const scope = currentAccountScope();
  return scope && "uid" in scope ? { uid: scope.uid, generation: scope.generation } : null;
}
export function runWithAccountGeneration<T>(generation: AccountGeneration, work: () => T): T {
  return accountScope.run(Object.freeze({ ...generation, kind: "account" }), work);
}
export function runWithAccountDeletion<T>(job: AccountGeneration & { jobId: string; leaseToken?: string }, work: () => T): T {
  return accountScope.run(Object.freeze({ ...job, kind: "deletion" }), work);
}
// This scope is only for verified Stripe reconciliation callers. The commit
// boundary restricts it to existing billing control records and audit receipts.
export function runWithBillingContainment<T>(job: AccountGeneration & { jobId: string; leaseToken?: string }, work: () => T): T {
  return accountScope.run(Object.freeze({ ...job, kind: "billing-containment" }), work);
}
export function runWithGlobalUsageAccounting<T>(work: () => T): T {
  return accountScope.run(Object.freeze({ kind: "global-usage" }), work);
}
export async function captureAccountGeneration(uid: string): Promise<AccountLifecycle> {
  const path = accountLifecyclePath(uid);
  const proposed = randomUUID();
  return accountScope.run(Object.freeze({ kind: "initialize", uid, generation: proposed }), () =>
    runStoredDocumentTransaction([path, `users/${uid}`], (documents) => {
      const current = documents[path];
      if (current) {
        if (typeof current.generation !== "string" || !["active", "deleting", "deleted"].includes(String(current.state))) {
          throw new AccountLifecycleError();
        }
        return { writes: [], result: { uid, generation: current.generation, state: current.state as AccountLifecycle["state"],
          ...(typeof current.jobId === "string" ? { jobId: current.jobId } : {}) } };
      }
      // Older deletion flags also fail closed during the one-time migration.
      const state = documents[`users/${uid}`]?.accountDeletionInProgress ? "deleting" as const : "active" as const;
      const lifecycle = { uid, generation: proposed, state };
      return { writes: [{ path, data: { ...lifecycle, createdAt: new Date().toISOString() } }], result: lifecycle };
    }));
}

// An upload started under a valid generation must record its terminal outcome
// even if deletion fenced the account while Azure was responding.
export function runWithBannerUploadReceipt<T>(asset: AccountGeneration & { assetId: string; claimId?: string }, work: () => T): T {
  return accountScope.run(Object.freeze({ ...asset, kind: "banner-receipt" }), work);
}
