import {
  authorizationResponse,
  requireAccount,
  requireRecentlyAuthenticatedAccount,
} from "@/lib/auth-server";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import {
  accountDeletionDocumentPaths,
  AUTOMATED_ACCOUNT_DELETION_RETENTION,
} from "@/lib/account-data-policy";
import { billingConfiguration } from "@/lib/runtime-config";
import {
  accountDeletionRequiresStripeReconciliation,
  checkoutClaimRequiresDeletionRetry,
} from "@/lib/billing-lock";
import { cancelStripeBillingForAccountDeletion } from "@/lib/stripe-server";
import { learnerSupportTicketDetail } from "@/lib/command-center-server";
import type { CommandCenterTicket } from "@/lib/command-center-types";
import {
  countCollectionDocuments,
  deleteCourse,
  deleteStoredDocuments,
  getStoredDocument,
  listAllStoredDocuments,
  listOwnerCourses,
  listStoredDocumentsByField,
  runStoredDocumentTransaction,
} from "@/lib/firebase-server";

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

async function collectAccountData(uid: string) {
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
    listCompleteAccountSubcollection(`users/${uid}/legalAcceptances`),
    listCompleteAccountSubcollection(`users/${uid}/billingConsents`),
    getStoredDocument(`users/${uid}/billingCheckout/current`),
    listOwnerCourses(uid),
    listCompleteAccountRecordsByField("usagePeriods", "uid", uid),
    listCompleteAccountRecordsByField("aiRequests", "uid", uid),
    listCompleteAccountRecordsByField("userAiBudgets", "uid", uid),
    getStoredDocument(`userEngagement/${uid}`),
    getStoredDocument(`pricingIntents/${uid}`),
    listCompleteAccountRecordsByField("productEvents", "actorId", uid),
    listCompleteAccountRecordsByField("referralCodes", "ownerUid", uid),
    getStoredDocument(`userSafety/${uid}`),
    listCompleteAccountRecordsByField("safetyEvents", "uid", uid),
    listCompleteAccountRecordsByField("contentReports", "reporterUid", uid),
    listCompleteAccountRecordsByField("adminEvents", "targetUid", uid),
    listCompleteAccountRecordsByField("commandCenterTickets", "relatedUserId", uid),
  ]);
  const learnerSupportTickets = commandCenterTickets
    .filter((ticket) => ticket.source === "user_support")
    .map((ticket) => learnerSupportTicketDetail(ticket as unknown as CommandCenterTicket));
  const authoredCourses = await Promise.all(courses.map(async (course) => ({
    course,
    lessons: course.id
      ? await listCompleteAccountSubcollection(`courses/${String(course.id)}/lessons`)
      : [],
  })));
  const launchWaitlistRecord = typeof account?.email === "string"
    ? await getStoredDocument(`waitlist/${await emailFingerprint(account.email)}`)
    : null;
  return {
    account,
    learningPreferences: preferences,
    lessonNotes,
    lessonActivityRecords,
    lessonInteractionRecords,
    lessonInteractionMutationRecords,
    courseProgress: progress,
    learningOutcomes,
    masteryEvidence,
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

export async function GET(request: Request) {
  try {
    const account = await requireAccount(request);
    const data = await collectAccountData(account.uid);
    return new Response(JSON.stringify({
      exportFormat: "filosage-account-data-v2",
      exportedAt: new Date().toISOString(),
      automatedDeletionRetention: AUTOMATED_ACCOUNT_DELETION_RETENTION,
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

export async function DELETE(request: Request) {
  try {
    const account = await requireRecentlyAuthenticatedAccount(request);
    if (account.isOwner) {
      return Response.json(
        { error: "Owner account deletion requires a manual transfer or shutdown review. Contact legal@filosage.com." },
        { status: 403 },
      );
    }
    const body = await readJsonBody(request, 1_024) as { confirmation?: unknown };
    if (body.confirmation !== "DELETE MY ACCOUNT") {
      return Response.json({ error: "Type DELETE MY ACCOUNT to confirm permanent deletion." }, { status: 400 });
    }

    const accountPath = `users/${account.uid}`;
    const checkoutPath = `users/${account.uid}/billingCheckout/current`;
    const deletionLock = await runStoredDocumentTransaction([accountPath, checkoutPath], (documents) => {
      const storedAccount = documents[accountPath];
      if (!storedAccount) throw new Error("The account no longer exists.");
      const checkout = documents[checkoutPath];
      const checkoutStatus = typeof checkout?.status === "string" ? checkout.status : "none";
      return {
        writes: [{
          path: accountPath,
          data: {
            ...storedAccount,
            accountDeletionInProgress: true,
            accountDeletionStartedAt: storedAccount.accountDeletionStartedAt ?? new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }],
        result: { checkoutStatus },
      };
    });
    if (checkoutClaimRequiresDeletionRetry(deletionLock.checkoutStatus)) {
      return Response.json(
        {
          error: "Checkout is still being contained. Retry account deletion in a moment.",
          code: "ACCOUNT_DELETION_WAITING_FOR_CHECKOUT",
        },
        { status: 409, headers: { "Retry-After": "5" } },
      );
    }

    const data = await collectAccountData(account.uid);

    // Never orphan a paid subscription: cancel it at Stripe before removing
    // the account, and refuse deletion if cancellation cannot be completed.
    const subscriptionStatus = String(data.account?.subscriptionStatus ?? "none");
    const billingRawStatus = typeof data.account?.billingRawStatus === "string"
      ? data.account.billingRawStatus
      : undefined;
    const billingSubscriptionId = typeof data.account?.billingSubscriptionId === "string"
      ? data.account.billingSubscriptionId
      : undefined;
    const billingCustomerId = typeof data.account?.billingCustomerId === "string"
      ? data.account.billingCustomerId
      : undefined;
    const needsStripeReconciliation = accountDeletionRequiresStripeReconciliation({
      billingCustomerId,
      billingSubscriptionId,
      subscriptionStatus,
      billingRawStatus,
    });
    if (needsStripeReconciliation && (billingCustomerId?.startsWith("cus_") || billingSubscriptionId?.startsWith("sub_"))) {
      if (!billingConfiguration().managementReady) {
        return Response.json(
          {
            error: "Cancel your paid Filosage membership before deleting your account. Contact support@filosage.com if you need help.",
            code: "SUBSCRIPTION_CANCELLATION_REQUIRED",
            subscriptionState: billingRawStatus ?? subscriptionStatus,
          },
          { status: 409 },
        );
      }
      try {
        await cancelStripeBillingForAccountDeletion({
          uid: account.uid,
          customerId: billingCustomerId,
          subscriptionId: billingSubscriptionId,
        });
      } catch (cancelError) {
        console.error("Subscription cancellation before deletion failed:", cancelError);
        return Response.json(
          {
            error: "Your subscription could not be canceled automatically. Cancel it from the billing portal, then delete your account.",
            code: "SUBSCRIPTION_CANCELLATION_UNCONFIRMED",
            subscriptionState: billingRawStatus ?? subscriptionStatus,
          },
          { status: 409 },
        );
      }
    } else if (needsStripeReconciliation) {
      return Response.json(
        {
          error: "Cancel your paid Filosage membership before deleting your account. Contact support@filosage.com if you need help.",
          code: "SUBSCRIPTION_CANCELLATION_REQUIRED",
          subscriptionState: billingRawStatus ?? subscriptionStatus,
        },
        { status: 409 },
      );
    }

    const courses = data.authoredCourses.map(({ course }) => course);
    for (const course of courses) {
      if (course.id) await deleteCourse(String(course.id));
    }

    const waitlistPath = account.email
      ? `waitlist/${await emailFingerprint(account.email)}`
      : undefined;
    await deleteStoredDocuments(accountDeletionDocumentPaths(account.uid, data, waitlistPath));

    return Response.json(
      {
        deleted: true,
        automatedDeletionRetention: AUTOMATED_ACCOUNT_DELETION_RETENTION,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "Your account data could not be deleted." }, { status: 500 });
  }
}
