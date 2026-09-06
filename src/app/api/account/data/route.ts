import { withAccountRequest } from "@/lib/auth-server";
import {
  authorizationResponse,
  requireAccount,
  requireRecentlyAuthenticatedUser,
} from "@/lib/auth-server";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import {
  AUTOMATED_ACCOUNT_DELETION_RETENTION,
  ACCOUNT_DELETION_POLICY_REVIEW,
} from "@/lib/account-data-policy";
import { beginAccountDeletion, resumeAccountDeletion } from "@/lib/account-deletion";
import { runWithAccountDeletion } from "@/lib/account-lifecycle";
import { isOwnerUser } from "@/lib/account-server";
import { learnerSupportTicketDetail } from "@/lib/command-center-server";
import type { CommandCenterTicket } from "@/lib/command-center-types";
import {
  countCollectionDocuments,
  getStoredDocument,
  listAllStoredDocuments,
  scanStoredDocuments,
  listOwnerCourses,
  listStoredDocumentsByField,
} from "@/lib/document-store";
import { courseAuthorIdsForAccount } from "@/lib/course-owner-identity";
import { enforceDurableRateLimit } from "@/lib/request-rate-limit";

const ACCOUNT_SUBCOLLECTION_LIMIT = 2_000;
const ACCOUNT_FIELD_QUERY_LIMIT = 1_000;

function downloadName() {
  return `filosage-data-${new Date().toISOString().slice(0, 10)}.json`;
}

async function emailFingerprint(email: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email.trim().toLowerCase()));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function listCompleteAccountSubcollection(path: string) {
  const documents = await listAllStoredDocuments(path, ACCOUNT_SUBCOLLECTION_LIMIT);
  if (documents.length === ACCOUNT_SUBCOLLECTION_LIMIT) {
    throw new Error(`Automated account export limit reached for ${path}.`);
  }
  return documents;
}

async function listCompleteAccountRecordsByField(collectionId: string, field: string, value: string) {
  const [documents, total] = await Promise.all([
    listStoredDocumentsByField(collectionId, field, value, ACCOUNT_FIELD_QUERY_LIMIT),
    countCollectionDocuments(collectionId, [{ field, value }]),
  ]);
  if (documents.length !== total) {
    throw new Error(`Automated account export limit reached for ${collectionId}.${field}.`);
  }
  return documents;
}

async function collectAccountData(uid: string, isOwner = false) {
  const [
    account,
    preferences,
    lessonNotes,
    lessonActivityRecords,
    lessonInteractionRecords,
    lessonInteractionMutationRecords,
    progress,
    learningOutcomes,
    masteryEvidence,
    flashcardDecks,
    flashcards,
    flashcardReviewState,
    evidenceShareRefs,
    evidenceShares,
    courseCredits,
    courseCreditClaims,
    legalAcceptances,
    billingConsents,
    billingCheckout,
    courses,
    usagePeriods,
    aiRequests,
    aiBudgets,
    userEngagement,
    pricingIntent,
    accountLinkedProductEvents,
    referralCodes,
    courseResearchArtifacts,
    safetySummary,
    safetyEvents,
    contentReports,
    adminActionRecords,
    commandCenterTickets,
  ] = await Promise.all([
    getStoredDocument(`users/${uid}`),
    getStoredDocument(`users/${uid}/learningData/preferences`),
    listCompleteAccountSubcollection(`users/${uid}/lessonNotes`),
    listCompleteAccountSubcollection(`users/${uid}/lessonActivity`),
    listCompleteAccountSubcollection(`users/${uid}/lessonInteraction`),
    listCompleteAccountSubcollection(`users/${uid}/lessonInteractionMutations`),
    listCompleteAccountSubcollection(`users/${uid}/courseProgress`),
    listCompleteAccountSubcollection(`users/${uid}/learningOutcomes`),
    listCompleteAccountSubcollection(`users/${uid}/masteryEvidence`),
    listCompleteAccountSubcollection(`users/${uid}/flashcardDecks`),
    listCompleteAccountSubcollection(`users/${uid}/flashcards`),
    listCompleteAccountSubcollection(`users/${uid}/flashcardReviewState`),
    listCompleteAccountSubcollection(`users/${uid}/evidenceShareRefs`),
    listCompleteAccountRecordsByField("evidenceShares", "ownerUid", uid),
    getStoredDocument(`users/${uid}/courseCredits/current`),
    listCompleteAccountSubcollection(`users/${uid}/courseCreditClaims`),
    listCompleteAccountSubcollection(`users/${uid}/legalAcceptances`),
    listCompleteAccountSubcollection(`users/${uid}/billingConsents`),
    getStoredDocument(`users/${uid}/billingCheckout/current`),
    Promise.all(courseAuthorIdsForAccount({ uid, isOwner }).map((authorId) => listOwnerCourses(authorId)))
      .then((groups) => [...new Map(groups.flat().map((course) => [course.id, course] as const)).values()]),
    listCompleteAccountRecordsByField("usagePeriods", "uid", uid),
    listCompleteAccountRecordsByField("aiRequests", "uid", uid),
    listCompleteAccountRecordsByField("userAiBudgets", "uid", uid),
    getStoredDocument(`userEngagement/${uid}`),
    getStoredDocument(`pricingIntents/${uid}`),
    listCompleteAccountRecordsByField("productEvents", "actorId", uid),
    listCompleteAccountRecordsByField("referralCodes", "ownerUid", uid),
    listCompleteAccountRecordsByField("courseResearchArtifacts", "ownerUid", uid),
    getStoredDocument(`userSafety/${uid}`),
    listCompleteAccountRecordsByField("safetyEvents", "uid", uid),
    listCompleteAccountRecordsByField("contentReports", "reporterUid", uid),
    listCompleteAccountRecordsByField("adminEvents", "targetUid", uid),
    listCompleteAccountRecordsByField("commandCenterTickets", "relatedUserId", uid),
  ]);
  const completeInventory = await scanStoredDocuments();
  if (!completeInventory.complete) throw new Error("This account export requires a manual inventory review. Contact legal@filosage.com.");
  const identityRecoveryMappings = completeInventory.documents
    .filter(({ data, path }) => path.startsWith("identity") && data.canonicalUid === uid)
    .map(({ data, path }) => ({ recordClass: path.split("/")[0], canonicalUid: uid, provider: data.provider, createdAt: data.createdAt, updatedAt: data.updatedAt }));
  const generationRecords = completeInventory.documents.filter(({ data, path }) => (path.startsWith("generationOperations/") || path.startsWith("generationStages/")) && (data.uid === uid || data.ownerUid === uid));
  const lifecycle = await getStoredDocument(`accountLifecycles/${uid}`);
  const deletionJob = typeof lifecycle?.jobId === "string" ? await getStoredDocument(`accountDeletionJobs/${lifecycle.jobId}`) : null;
  const authorIds = new Set(courseAuthorIdsForAccount({ uid, isOwner }));
  const scannedCourses = completeInventory.documents.filter(({ path, data }) => /^courses\/[^/]+$/.test(path) && typeof data.authorId === "string" && authorIds.has(data.authorId));
  if (scannedCourses.length !== courses.length) throw new Error("The authored-course export requires a manual inventory review. Contact legal@filosage.com.");
  const learnerSupportTickets = commandCenterTickets
    .filter((ticket) => ticket.source === "user_support")
    .map((ticket) => learnerSupportTicketDetail(ticket as unknown as CommandCenterTicket));
  const authoredCourses = await Promise.all(courses.map(async (course) => ({
    course,
    lessons: course.id
      ? await listCompleteAccountSubcollection(`courses/${String(course.id)}/lessons`)
      : [],
  })));
  for (const authored of authoredCourses) {
    const prefix = `courses/${authored.course.id}/lessons/`;
    const count = completeInventory.documents.filter(({ path }) => path.startsWith(prefix)).length;
    if (count !== authored.lessons.length) throw new Error("The lesson export requires a manual inventory review. Contact legal@filosage.com.");
  }
  const launchWaitlistRecord = typeof account?.email === "string"
    ? await getStoredDocument(`waitlist/${await emailFingerprint(account.email)}`)
    : null;
  return {
    account,
    identityRecoveryMappings,
    generationRecords,
    billingRecoveryRecords: completeInventory.documents.filter(({ path, data }) => (path.startsWith(`users/${uid}/billingReconciliation/`) || path.startsWith(`users/${uid}/billingTransitions/`) || (path.startsWith("billingTransitions/") && data.uid === uid))),
    accountDeletionControl: { lifecycle, deletionJob },
    learningPreferences: preferences,
    lessonNotes,
    lessonActivityRecords,
    lessonInteractionRecords,
    lessonInteractionMutationRecords,
    courseProgress: progress,
    learningOutcomes,
    masteryEvidence,
    flashcardDecks,
    flashcards,
    flashcardReviewState,
    evidenceShareRefs,
    evidenceShares,
    courseCredits,
    courseCreditClaims,
    legalAcceptances,
    billingConsents,
    billingCheckout,
    authoredCourses,
    aiUsagePeriods: usagePeriods,
    aiRequestRecords: aiRequests,
    aiBudgetRecords: aiBudgets,
    userEngagement,
    pricingIntent,
    launchWaitlistRecord,
    accountLinkedProductEvents,
    referralCodes,
    courseResearchArtifacts,
    safetySummary,
    safetyEvents,
    contentReports,
    adminActionRecords,
    commandCenterTickets: learnerSupportTickets,
    // Owner notes, drafts, approvals, and audit records are operational records,
    // not learner-visible support content. Keep the v2 export keys stable without
    // exposing staff identities, internal analysis, or control-plane metadata.
    commandCenterApprovals: [],
    commandCenterDrafts: [],
    commandCenterAuditEvents: [],
  };
}

async function handleGET(request: Request) {
  try {
    const account = await requireAccount(request);
    const limited = await enforceDurableRateLimit(request, "account-export", 3, 3_600_000, account.uid);
    if (limited) return limited;
    const data = await collectAccountData(account.uid, account.isOwner);
    return new Response(JSON.stringify({
      exportFormat: "filosage-account-data-v2",
      exportedAt: new Date().toISOString(),
      automatedDeletionRetention: AUTOMATED_ACCOUNT_DELETION_RETENTION,
      retentionReview: ACCOUNT_DELETION_POLICY_REVIEW,
      data,
    }, null, 2), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${downloadName()}"`,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    return authorizationResponse(error)
      ?? Response.json({ error: "Your data export could not be prepared." }, { status: 500 });
  }
}

async function handleDELETE(request: Request) {
  try {
    const user = await requireRecentlyAuthenticatedUser(request);
    if (isOwnerUser(user)) return Response.json({ error: "Owner account deletion requires a manual transfer or shutdown review. Contact legal@filosage.com." }, { status: 403 });
    const body = await readJsonBody(request, 1_024) as { confirmation?: unknown };
    if (body.confirmation !== "DELETE MY ACCOUNT") return Response.json({ error: "Type DELETE MY ACCOUNT to confirm permanent deletion." }, { status: 400 });
    const job = await beginAccountDeletion(user.uid);
    const limited = await runWithAccountDeletion(job, () => enforceDurableRateLimit(request, "account-deletion", 10, 600_000, user.uid));
    if (limited) return limited;
    const result = await resumeAccountDeletion(job);
    return Response.json(result.body, { status: result.status, headers: { "Cache-Control": "private, no-store", ...(result.status === 409 ? { "Retry-After": "5" } : {}) } });
  } catch (error) {
    return apiRequestErrorResponse(error) ?? authorizationResponse(error)
      ?? Response.json({ error: "Your deletion request is saved if it was started. Retry to resume it.", code: "ACCOUNT_DELETION_INTERRUPTED" }, { status: 500 });
  }
}

export const GET = withAccountRequest(handleGET);
export const DELETE = withAccountRequest(handleDELETE);
