import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { accountLifecyclePath, currentAccountGeneration, runWithAccountDeletion, AccountLifecycleError } from "@/lib/account-lifecycle";
import { deleteStoredDocuments, getStoredDocument, runStoredDocumentTransaction, scanStoredDocuments, type StoredDocument } from "@/lib/document-store";
import { accountDeletionOwnsDocument, AUTHOR_ARTIFACT_COLLECTIONS, documentOwnerUids } from "@/lib/account-write-fence";
import { AUTOMATED_ACCOUNT_DELETION_RETENTION, ACCOUNT_DELETION_POLICY_REVIEW } from "@/lib/account-data-policy";
import { accountDeletionRequiresStripeReconciliation, checkoutClaimRequiresDeletionRetry } from "@/lib/billing-lock";
import { billingConfiguration } from "@/lib/runtime-config";
import { cancelStripeBillingForAccountDeletion } from "@/lib/stripe-server";
import { deleteExclusiveCourseBannerObject } from "@/lib/course-banner-storage";
import { abandonGenerationUsage } from "@/lib/generation-operations";
import { abandonAiUsage } from "@/lib/ai-usage";

type Stage = "checkout" | "inventory" | "billing" | "documents" | "assets" | "verify" | "retention_review";
export interface AccountDeletionJob extends Record<string, unknown> {
  uid: string; generation: string; jobId: string; stage: Stage;
  status: "running" | "pending" | "manual_review" | "retention_review";
  documentPaths: string[]; assetIds: string[]; retainedPaths: string[];
  billingCustomerId?: string; billingSubscriptionId?: string;
  subscriptionStatus: string; billingRawStatus?: string;
  cancellationConfirmed: boolean; activeDataRemoved: boolean;
  leaseToken?: string; leaseUntil?: string; issue?: string;
}
const KNOWN_USER_COLLECTIONS = new Set(["learningData", "lessonNotes", "lessonActivity", "lessonInteraction", "lessonInteractionMutations", "courseProgress", "learningOutcomes", "masteryEvidence", "flashcardDecks", "flashcards", "flashcardReviewState", "evidenceShareRefs", "courseCredits", "courseCreditClaims", "billingCheckout", "billingReconciliation", "billingTransitions"]);
const RETAINED_USER_COLLECTIONS = new Set(["legalAcceptances", "billingConsents"]);
const ACTIVE_COLLECTIONS = new Set(["billingTransitions", "users", "courses", "courseReleases", "coursePipelineEvents", "courseRepairs", "courseManualReviewMutations", "outcomeFeedback", "generationOperations", "generationStages", "aiRequests", "usagePeriods", "userAiBudgets", "userEngagement", "pricingIntents", "productEvents", "referralCodes", "courseResearchArtifacts", "evidenceShares", "courseBannerKeys", "courseBannerAssets"]);
const RETAINED_COLLECTIONS = new Set(["userSafety", "safetyEvents", "contentReports", "adminEvents", "commandCenterTickets", "commandCenterApprovals", "commandCenterDrafts", "commandCenterAuditEvents", "commandCenterTicketRequests", "commandCenterPublicReplyRequests", "commandCenterApprovalReviewRequests", "identityLinks", "identityEmails", "identityEmailOwners", "identityLinkIntents", "identityLinkEvents", "accountLifecycles", "accountDeletionJobs"]);
const now = () => new Date().toISOString();
const jobPath = (jobId: string) => `accountDeletionJobs/${jobId}`;
export async function findAccountDeletionJob(uid: string): Promise<AccountDeletionJob | null> {
  const lifecycle = await getStoredDocument(accountLifecyclePath(uid));
  if (typeof lifecycle?.jobId !== "string") return null;
  return await getStoredDocument(jobPath(lifecycle.jobId)) as unknown as AccountDeletionJob | null;
}
export async function beginAccountDeletion(uid: string): Promise<AccountDeletionJob> {
  const scope = currentAccountGeneration();
  if (scope?.uid !== uid) throw new AccountLifecycleError();
  const existing = await findAccountDeletionJob(uid);
  if (existing) return existing;
  const lifecyclePath = accountLifecyclePath(uid);
  const id = createHash("sha256").update(`${uid}\0${scope.generation}`).digest("hex");
  const path = jobPath(id);
  return runStoredDocumentTransaction([lifecyclePath, path, `users/${uid}`], (documents) => {
    if (documents[path]) return { writes: [], result: documents[path] as unknown as AccountDeletionJob };
    const lifecycle = documents[lifecyclePath];
    const account = documents[`users/${uid}`];
    if (!account || lifecycle?.state !== "active" || lifecycle.generation !== scope.generation) throw new AccountLifecycleError();
    const job: AccountDeletionJob = {
      uid, generation: scope.generation, jobId: id, stage: "checkout", status: "running",
      documentPaths: [], assetIds: [], retainedPaths: [], cancellationConfirmed: false, activeDataRemoved: false,
      subscriptionStatus: String(account.subscriptionStatus ?? "none"),
      ...(typeof account.billingCustomerId === "string" ? { billingCustomerId: account.billingCustomerId } : {}),
      ...(typeof account.billingSubscriptionId === "string" ? { billingSubscriptionId: account.billingSubscriptionId } : {}),
      ...(typeof account.billingRawStatus === "string" ? { billingRawStatus: account.billingRawStatus } : {}),
      ...(typeof account.email === "string" ? { waitlistPath: `waitlist/${createHash("sha256").update(account.email.trim().toLowerCase()).digest("hex")}` } : {}),
      createdAt: now(), updatedAt: now(), policyReview: ACCOUNT_DELETION_POLICY_REVIEW,
    };
    return { writes: [
      { path: lifecyclePath, data: { ...lifecycle, state: "deleting", jobId: id, updatedAt: now() } },
      { path, data: job },
      { path: `users/${uid}`, data: { ...account, accountDeletionInProgress: true, accountDeletionStartedAt: now(), updatedAt: now() } },
    ], result: job };
  });
}
function summarize(job: AccountDeletionJob) {
  return {
    deleted: false, activeDataRemoved: job.activeDataRemoved,
    jobId: job.jobId, status: job.status, stage: job.stage,
    code: job.issue ?? "ACCOUNT_DELETION_RETENTION_REVIEW_PENDING",
    message: job.activeDataRemoved
      ? "Your active account data has been removed. Retention and identity review remain pending. Keep this reference and contact legal@filosage.com."
      : "Your account is closed to new learning activity. Deletion is saved and can be retried using this reference.",
    automatedDeletionRetention: AUTOMATED_ACCOUNT_DELETION_RETENTION,
    retentionReview: ACCOUNT_DELETION_POLICY_REVIEW,
    retainedRecordCount: job.retainedPaths.length,
    contact: "legal@filosage.com",
  };
}
function ownedBy(row: { path: string; data: StoredDocument }, uid: string) {
  return documentOwnerUids(row.path, row.data).includes(uid);
}
export async function inventoryAccountDeletion(job: AccountDeletionJob) {
  const scan = await scanStoredDocuments();
  if (!scan.complete) return { issue: "ACCOUNT_DELETION_INVENTORY_OVERFLOW" } as const;
  const ticketIds = new Set(scan.documents.filter((row) => row.path.startsWith("commandCenterTickets/") && ownedBy(row, job.uid)).map((row) => row.data.id));
  const courseIds = new Set(scan.documents.filter((row) => row.path.startsWith("courses/") && row.path.split("/").length === 2 && ownedBy(row, job.uid)).map((row) => row.data.id));
  // Preserve the course identities after their parent rows have been removed.
  for (const path of job.documentPaths) if (/^courses\/[^/]+$/.test(path)) courseIds.add(path.split("/")[1]);
  const releaseIds = new Set(scan.documents.filter((row) => row.path.startsWith("courseReleases/") && typeof row.data.courseId === "string" && courseIds.has(row.data.courseId)).map((row) => row.path.split("/")[1]));
  for (const path of job.documentPaths) if (/^courseReleases\/[^/]+$/.test(path)) releaseIds.add(path.split("/")[1]);
  const authoredPaths = [...courseIds].map((id) => `courses/${id}`).concat([...releaseIds].map((id) => `courseReleases/${id}`));
  const documentPaths: string[] = []; const assetIds: string[] = []; const retainedPaths: string[] = [];
  for (const row of scan.documents) {
    const parts = row.path.split("/");
    const ownUserPath = parts[0] === "users" && parts[1] === job.uid;
    const relatedCourse = (parts[0] === "courses" && courseIds.has(parts[1])) || (parts[0] === "courseReleases" && releaseIds.has(parts[1]))
      || (AUTHOR_ARTIFACT_COLLECTIONS.has(parts[0]) && typeof row.data.courseId === "string" && courseIds.has(row.data.courseId));
    const sharedCourseReference = typeof row.data.courseId === "string" && courseIds.has(row.data.courseId);
    const relatedTicket = typeof row.data.ticketId === "string" && ticketIds.has(row.data.ticketId);
    const relevant = ownUserPath || ownedBy(row, job.uid) || relatedCourse || relatedTicket || sharedCourseReference || row.path === job.waitlistPath;
    if (!relevant) continue;
    if ((ownUserPath && RETAINED_USER_COLLECTIONS.has(parts[2])) || RETAINED_COLLECTIONS.has(parts[0])) { retainedPaths.push(row.path); continue; }
    if (relatedCourse && ["courses", "courseReleases"].includes(parts[0]) && parts.length > 2 && (parts[2] !== "lessons" || parts.length !== 4)) return { issue: "ACCOUNT_DELETION_UNKNOWN_COURSE_SUBCOLLECTION" } as const;
    if (row.path !== job.waitlistPath && !accountDeletionOwnsDocument(row.path, row.data, job.uid, authoredPaths)) {
      if (ownedBy(row, job.uid)) return { issue: "ACCOUNT_DELETION_SHARED_OWNERSHIP_REVIEW" } as const;
      retainedPaths.push(row.path); continue;
    }
    if (ownUserPath && parts.length > 2 && (!KNOWN_USER_COLLECTIONS.has(parts[2]) || parts.length !== 4)) return { issue: "ACCOUNT_DELETION_UNKNOWN_SUBCOLLECTION" } as const;
    if (!ACTIVE_COLLECTIONS.has(parts[0]) && row.path !== job.waitlistPath) return { issue: "ACCOUNT_DELETION_UNKNOWN_RECORD_CLASS" } as const;
    if (parts[0] === "courseBannerAssets") { assetIds.push(parts[1]); continue; }
    documentPaths.push(row.path);
  }
  // Legacy shared fingerprints have no owner metadata. Keep them under an
  // explicit shared-asset policy rather than guessing exclusive ownership.
  for (const row of scan.documents.filter((row) => row.path.startsWith("courses/") && courseIds.has(row.data.id))) {
    const banner = row.data.banner as { assetId?: string } | undefined;
    if (banner?.assetId && !assetIds.includes(banner.assetId)) retainedPaths.push(`courseBannerAssets/${banner.assetId}`);
  }
  return { documentPaths, assetIds, retainedPaths, scan: scan.documents };
}
export async function resumeAccountDeletion(initial: AccountDeletionJob): Promise<{ status: number; body: ReturnType<typeof summarize> }> {
  return runWithAccountDeletion(initial, async () => {
    const token = randomUUID();
    let job: AccountDeletionJob | null = await runStoredDocumentTransaction<AccountDeletionJob | null>([jobPath(initial.jobId)], (documents) => {
      const current = documents[jobPath(initial.jobId)] as unknown as AccountDeletionJob;
      if (!current) throw new AccountLifecycleError();
      if (current.leaseToken && Date.parse(String(current.leaseUntil)) > Date.now()) return { writes: [], result: null };
      const claimed = { ...current, leaseToken: token, leaseUntil: new Date(Date.now() + 120_000).toISOString(), updatedAt: now() };
      return { writes: [{ path: jobPath(initial.jobId), data: claimed }], result: claimed };
    });
    if (!job) return { status: 409, body: { ...summarize(initial), code: "ACCOUNT_DELETION_RETRY_IN_PROGRESS" } };
    const save = async (patch: Partial<AccountDeletionJob>) => {
      job = await runStoredDocumentTransaction([jobPath(initial.jobId)], (documents) => {
        const current = documents[jobPath(initial.jobId)] as unknown as AccountDeletionJob;
        if (current?.leaseToken !== token) throw new AccountLifecycleError("Deletion recovery was claimed by another request.");
        const next = { ...current, ...patch, updatedAt: now(), leaseUntil: new Date(Date.now() + 120_000).toISOString() };
        return { writes: [{ path: jobPath(initial.jobId), data: next }], result: next };
      });
      return job;
    };
    const pending = async (issue: string, manual = false) => {
      await save({ status: manual ? "manual_review" : "pending", issue });
      return { status: 409, body: summarize(job!) };
    };
    try {
      if (job.stage === "retention_review") {
        await runStoredDocumentTransaction([accountLifecyclePath(job.uid)], (documents) => ({
          writes: [{ path: accountLifecyclePath(job!.uid), data: { ...documents[accountLifecyclePath(job!.uid)], state: "deleted", generation: job!.generation, updatedAt: now() } }], result: undefined,
        }));
        return { status: 202, body: summarize(job) };
      }
      if (job.stage === "checkout") {
        const checkout = await getStoredDocument(`users/${job.uid}/billingCheckout/current`);
        const reconciliation = await getStoredDocument(`users/${job.uid}/billingReconciliation/current`);
        if (checkoutClaimRequiresDeletionRetry(String(checkout?.status ?? "none")) || (typeof reconciliation?.expiresAt === "number" && reconciliation.expiresAt > Date.now())) return await pending("ACCOUNT_DELETION_WAITING_FOR_CHECKOUT");
        await save({ stage: "inventory", status: "running", issue: undefined });
      }
      if (job!.stage === "inventory") {
        const inventory = await inventoryAccountDeletion(job!);
        if (inventory.issue) return await pending(inventory.issue, true);
        await save({ stage: "billing", documentPaths: inventory.documentPaths, assetIds: inventory.assetIds, retainedPaths: inventory.retainedPaths });
      }
      if (job!.stage === "billing") {
        const needsStripe = accountDeletionRequiresStripeReconciliation(job!);
        if (needsStripe && !job!.cancellationConfirmed) {
          const configuration = billingConfiguration() as ReturnType<typeof billingConfiguration> & { apiReady?: boolean };
          if (!configuration.apiReady) return await pending("SUBSCRIPTION_CANCELLATION_REQUIRED");
          try {
            const cancellation = { uid: job!.uid, customerId: job!.billingCustomerId, subscriptionId: job!.billingSubscriptionId, jobId: job!.jobId };
            await cancelStripeBillingForAccountDeletion(cancellation);
          } catch { return await pending("SUBSCRIPTION_CANCELLATION_UNCONFIRMED"); }
        }
        await save({ stage: "documents", cancellationConfirmed: true });
      }
      if (job!.stage === "documents") {
        for (const path of job!.documentPaths.filter((path) => /^aiRequests\/[^/]+$/.test(path))) {
          try { await abandonAiUsage(path.split("/")[1]); }
          catch (error) {
            if (error instanceof Error && error.message === "AI_USAGE_MANUAL_RECONCILIATION_REQUIRED") return await pending("ACCOUNT_DELETION_USAGE_RECONCILIATION_REQUIRED", true);
            return await pending("ACCOUNT_DELETION_USAGE_RECONCILIATION_UNCONFIRMED");
          }
        }
        for (const path of job!.documentPaths.filter((path) => /^generationOperations\/[^/]+$/.test(path))) {
          const operationId = path.split("/")[1];
          try {
            await abandonGenerationUsage(operationId);
            const receipt = await getStoredDocument(`generationUsageReceipts/${operationId}`);
            if (!receipt || typeof receipt.globalPath !== "string" || !receipt.globalPath.startsWith("systemUsageShards/") || receipt.remainingReserveMicros !== 0) return await pending("ACCOUNT_DELETION_USAGE_RECONCILIATION_REQUIRED", true);
          } catch { return await pending("ACCOUNT_DELETION_USAGE_RECONCILIATION_UNCONFIRMED"); }
        }
        await runWithAccountDeletion({ ...job!, leaseToken: token }, () => deleteStoredDocuments(job!.documentPaths));
        await save({ stage: "assets" });
      }
      if (job!.stage === "assets") {
        for (const assetId of job!.assetIds) {
          const asset = await getStoredDocument(`courseBannerAssets/${assetId}`);
          if (!asset) continue;
          if (asset.status === "uploading") return await pending("ACCOUNT_DELETION_WAITING_FOR_ASSET_UPLOAD");
          const scan = await scanStoredDocuments();
          if (!scan.complete) return await pending("ACCOUNT_DELETION_ASSET_INVENTORY_OVERFLOW", true);
          const referenced = scan.documents.some(({ data, path }) => !path.startsWith("accountDeletionJobs/") && (data.banner as { assetId?: string } | undefined)?.assetId === assetId);
          if (asset.ownerUid !== job!.uid || asset.accountGeneration !== job!.generation || asset.ownership !== "exclusive" || referenced) {
            await save({ retainedPaths: [...new Set([...job!.retainedPaths, `courseBannerAssets/${assetId}`])] }); continue;
          }
          try { await deleteExclusiveCourseBannerObject(assetId, asset); }
          catch { return await pending("ACCOUNT_DELETION_ASSET_CLEANUP_UNCONFIRMED"); }
          await save({ documentPaths: [...new Set([...job!.documentPaths, `courseBannerAssets/${assetId}`])] });
          await runWithAccountDeletion({ ...job!, leaseToken: token }, () => deleteStoredDocuments([`courseBannerAssets/${assetId}`]));
        }
        await save({ stage: "verify" });
      }
      if (job!.stage === "verify") {
        const inventory = await inventoryAccountDeletion(job!);
        if (inventory.issue) return await pending(inventory.issue, true);
        const remaining = inventory.documentPaths.filter((path) => !job!.retainedPaths.includes(path));
        if (remaining.length || inventory.assetIds.some((id) => !job!.retainedPaths.includes(`courseBannerAssets/${id}`))) return await pending("ACCOUNT_DELETION_ACTIVE_RECORDS_REMAIN", true);
        await save({ stage: "retention_review", status: "retention_review", activeDataRemoved: true, issue: "ACCOUNT_DELETION_RETENTION_REVIEW_PENDING", retainedPaths: [...new Set([...job!.retainedPaths, ...inventory.retainedPaths])] });
        await runStoredDocumentTransaction([accountLifecyclePath(job!.uid)], (documents) => ({
          writes: [{ path: accountLifecyclePath(job!.uid), data: { ...documents[accountLifecyclePath(job!.uid)], state: "deleted", generation: job!.generation, updatedAt: now() } }], result: undefined,
        }));
      }
      return { status: 202, body: summarize(job!) };
    } finally {
      await save({ leaseToken: undefined, leaseUntil: undefined }).catch(() => undefined);
    }
  });
}
