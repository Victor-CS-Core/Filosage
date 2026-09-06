import "server-only";
import { AccountLifecycleError, accountLifecyclePath, currentAccountScope } from "@/lib/account-lifecycle";

type Document = Record<string, unknown> | null;
export type FenceDocuments = Record<string, Document>;
export type FenceMutation = { writes: Array<{ path: string; data: Record<string, unknown> }>; deletes?: string[] };
const OWNER_FIELDS = ["uid", "ownerUid", "authorId", "actorId", "reporterUid", "relatedUserId", "targetUid", "actorUid", "publishedBy", "canonicalUid"] as const;
const UID_COLLECTIONS = new Set(["users", "userEngagement", "pricingIntents", "userSafety"]);
export const GLOBAL_USAGE_COLLECTIONS = new Set(["generationUsageReceipts", "systemUsageShards"]);
export const AUTHOR_ARTIFACT_COLLECTIONS = new Set(["courseReleases", "coursePipelineEvents", "courseRepairs", "courseManualReviewMutations"]);
// A course reference is not ownership: learner evidence, feedback and shares
// remain the learner's work when the course author closes their account.
export function accountDeletionOwnsDocument(path: string, data: Document, uid: string, inventoriedPaths: readonly string[]) {
  const parts = path.split("/");
  if (!data) return true; // An already removed row makes retries idempotent.
  if (parts[0] === "users") return parts[1] === uid;
  const directOwners = documentOwnerUids(path, data);
  if (directOwners.some((owner) => owner !== uid)) return false;
  if (directOwners.includes(uid)) return true;
  if (parts[0] === "courses" && parts.length === 4 && parts[2] === "lessons") return inventoriedPaths.includes(`courses/${parts[1]}`);
  if (parts[0] === "courseReleases" && parts.length === 4 && parts[2] === "lessons") return inventoriedPaths.includes(`courseReleases/${parts[1]}`);
  return parts.length === 2 && AUTHOR_ARTIFACT_COLLECTIONS.has(parts[0]) && typeof data.courseId === "string" && inventoriedPaths.includes(`courses/${data.courseId}`);
}
export function documentOwnerUids(path: string, data: Document): string[] {
  const parts = path.split("/");
  const owners = new Set<string>();
  if (UID_COLLECTIONS.has(parts[0]) && parts[1]) owners.add(parts[1]);
  for (const key of OWNER_FIELDS) {
    const uid = data?.[key];
    if (typeof uid === "string" && uid && !uid.includes("/")) owners.add(uid);
  }
  const course = data?.course;
  if (course && typeof course === "object" && "authorId" in course && typeof course.authorId === "string") owners.add(course.authorId);
  return [...owners];
}
function coursePaths(path: string, data: Document) {
  const parents: string[] = [];
  if (typeof data?.ticketId === "string" && data.ticketId && !data.ticketId.includes("/")) parents.push(`commandCenterTickets/${data.ticketId}`);
  if (path.startsWith("courses/")) parents.push(path.split("/").slice(0, 2).join("/"));
  if (typeof data?.courseId === "string" && data.courseId && !data.courseId.includes("/")) parents.push(`courses/${data.courseId}`);
  return parents;
}

export function accountFenceReadPaths(paths: string[], documents: FenceDocuments, mutation: FenceMutation): string[] {
  const required = new Set(paths);
  const scope = currentAccountScope();
  if (scope && "uid" in scope) required.add(accountLifecyclePath(scope.uid));
  if (scope && "jobId" in scope) required.add(`accountDeletionJobs/${scope.jobId}`);
  const changed = new Map(mutation.writes.map((write) => [write.path, write.data]));
  for (const path of [...paths, ...changed.keys(), ...(mutation.deletes ?? [])]) {
    required.add(path);
    for (const data of [documents[path], changed.get(path)]) {
      for (const coursePath of coursePaths(path, data ?? null)) required.add(coursePath);
      for (const uid of documentOwnerUids(path, data ?? null)) required.add(accountLifecyclePath(uid));
    }
  }
  return [...required];
}
function allowedBillingChange(path: string, before: Document, after: Document, uid: string, jobId: string) {
  if (!before || !after) return false;
  if (path === `users/${uid}/billingCheckout/current`) {
    const fields = new Set(["status", "sessionId", "containmentOutcome", "containmentConfirmedAt", "containmentJobId", "updatedAt"]);
    return ["creating", "replacing"].includes(String(before.status)) && after.status === "canceled"
      && typeof before.claimId === "string" && after.claimId === before.claimId
      && ((after.containmentOutcome === "contained" && typeof after.sessionId === "string" && after.sessionId.startsWith("cs_"))
        || (after.containmentOutcome === "not_created" && after.sessionId === null))
      && after.containmentJobId === jobId && typeof after.containmentConfirmedAt === "string" && Number.isFinite(Date.parse(after.containmentConfirmedAt))
      && Object.keys({ ...before, ...after }).every((key) => key === "id" || fields.has(key) || JSON.stringify(before[key]) === JSON.stringify(after[key]));
  }
  if (path !== `users/${uid}`) return false;
  const fields = new Set(["updatedAt", "billingRawStatus", "subscriptionStatus", "currentPeriodEnd", "billingCancelAtPeriodEnd", "billingCancellationRequestedAt", "billingLastEventId", "billingLastEventCreated"]);
  return Object.keys({ ...before, ...after }).every((key) => fields.has(key) || JSON.stringify(before[key]) === JSON.stringify(after[key]));
}
export function assertAccountMutation(documents: FenceDocuments, mutation: FenceMutation) {
  const changed = [...mutation.writes.map((write) => ({ ...write, deleting: false })), ...(mutation.deletes ?? []).map((path) => ({ path, data: null, deleting: true }))];
  if (!changed.length) return;
  const scope = currentAccountScope();
  if (scope?.kind === "global-usage") {
    if (changed.some(({ path, data, deleting }) => deleting || !GLOBAL_USAGE_COLLECTIONS.has(path.split("/")[0]) || documentOwnerUids(path, data).length)) throw new AccountLifecycleError("Global accounting cannot write account records.");
    return;
  }
  if (scope?.kind === "initialize") {
    if (changed.length !== 1 || changed[0].path !== accountLifecyclePath(scope.uid) || documents[changed[0].path]
      || changed[0].data?.generation !== scope.generation || !["active", "deleting"].includes(String(changed[0].data?.state))) throw new AccountLifecycleError();
    return;
  }
  const lifecycle = scope && "uid" in scope ? documents[accountLifecyclePath(scope.uid)] : null;
  if (scope?.kind === "banner-receipt") {
    if (!lifecycle || lifecycle.generation !== scope.generation || changed.length !== 1) throw new AccountLifecycleError();
    const receipt = changed[0];
    const before = documents[receipt.path];
    const fields = new Set(["status", "storage", "data", "updatedAt"]);
    if (receipt.deleting || receipt.path !== `courseBannerAssets/${scope.assetId}` || !before || !receipt.data
      || before.status !== "uploading" || before.ownerUid !== scope.uid || before.accountGeneration !== scope.generation
      || before.claimId !== scope.claimId
      || !["uploaded", "failed"].includes(String(receipt.data.status))
      || Object.keys({ ...before, ...receipt.data }).some((key) => key !== "id" && !fields.has(key) && JSON.stringify(before[key]) !== JSON.stringify(receipt.data![key]))) throw new AccountLifecycleError("Only the existing upload outcome may be reconciled.");
    return;
  }
  const deletion = scope?.kind === "deletion" || scope?.kind === "billing-containment";
  if (scope && (!lifecycle || lifecycle.generation !== scope.generation || (!deletion && lifecycle.state !== "active"))) throw new AccountLifecycleError();
  const job = deletion ? documents[`accountDeletionJobs/${scope.jobId}`] : null;
  if (deletion && (lifecycle?.jobId !== scope.jobId || job?.uid !== scope.uid || job?.generation !== scope.generation || !["deleting", "deleted"].includes(String(lifecycle.state)))) throw new AccountLifecycleError();
  if (deletion && scope.leaseToken && job?.leaseToken !== scope.leaseToken) throw new AccountLifecycleError();
  for (const { path, data, deleting } of changed) {
    const before = documents[path];
    const control = path.startsWith("accountLifecycles/") || path.startsWith("accountDeletionJobs/");
    if (control) {
      // The initial fence is the only control transition permitted to an active request.
      const starting = scope?.kind === "account" && lifecycle?.state === "active" && mutation.writes.some((write) => write.path === accountLifecyclePath(scope.uid) && write.data.state === "deleting" && write.data.generation === scope.generation);
      if (!scope || deleting || (!starting && !deletion)) throw new AccountLifecycleError();
      if (path.startsWith("accountLifecycles/") && (path !== accountLifecyclePath(scope.uid) || data?.generation !== scope.generation || !["deleting", "deleted"].includes(String(data?.state)))) throw new AccountLifecycleError();
      if (path.startsWith("accountDeletionJobs/") && (data?.uid !== scope.uid || data?.generation !== scope.generation || (deletion && path !== `accountDeletionJobs/${scope.jobId}`))) throw new AccountLifecycleError();
      continue;
    }
    if (deletion) {
      if (scope.kind === "deletion" && !deleting && path.startsWith("systemRateLimits/") && data?.namespace === "account-deletion"
        && Object.keys(data).every((key) => ["namespace", "scope", "count", "resetAt", "expiresAt", "updatedAt"].includes(key))) continue;
      if (scope.kind === "billing-containment" && allowedBillingChange(path, before, data, scope.uid, scope.jobId)) continue;
      const paths = Array.isArray(job?.documentPaths) ? job.documentPaths : [];
      if (scope.kind === "deletion" && deleting && paths.includes(path)
        && (path === job?.waitlistPath || accountDeletionOwnsDocument(path, before, scope.uid, paths))) continue;
      throw new AccountLifecycleError("Deletion recovery may only remove its inventoried records.");
    }
    const owners = new Set([...documentOwnerUids(path, before), ...documentOwnerUids(path, data)]);
    for (const coursePath of new Set([...coursePaths(path, before), ...coursePaths(path, data)])) {
      const course = documents[coursePath] ?? mutation.writes.find((write) => write.path === coursePath && typeof write.data.authorId === "string")?.data;
      if (course) for (const uid of documentOwnerUids(coursePath, course)) owners.add(uid);
      // Lesson/partial-course writes cannot resurrect a removed course. A complete
      // new course must supply its author and uses the account generation fence.
      if (!deleting && !course && (path.startsWith("courses/") || path.startsWith("courseReleases/"))
        && !(path === coursePath && typeof data?.authorId === "string")) throw new AccountLifecycleError("The course was removed before this write could commit.");
    }
    if (owners.size && !scope) throw new AccountLifecycleError("Owned writes require an account generation scope.");
    for (const uid of owners) {
      const owner = documents[accountLifecyclePath(uid)];
      if (owner && owner.state !== "active") {
        // Existing retained audit records are not active learner/profile writes.
        // New signed-provider containment has its own restricted scope above.
        throw new AccountLifecycleError();
      }
      if (scope && "uid" in scope && uid === scope.uid && owner?.generation !== scope.generation) throw new AccountLifecycleError();
    }
  }
}
