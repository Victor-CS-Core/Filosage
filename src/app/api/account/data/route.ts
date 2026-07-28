import { authorizationResponse, requireAccount } from "@/lib/auth-server";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { billingConfiguration } from "@/lib/runtime-config";
import { stripeClient } from "@/lib/stripe-server";
import {
  deleteCourse,
  deleteStoredDocuments,
  getStoredDocument,
  listAllStoredDocuments,
  listLessons,
  listOwnerCourses,
  listStoredDocuments,
  listStoredDocumentsByField,
} from "@/lib/firebase-server";

function downloadName() {
  return `erudoza-data-${new Date().toISOString().slice(0, 10)}.json`;
}

async function emailFingerprint(email: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email.trim().toLowerCase()));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function collectAccountData(uid: string) {
  const [
    account,
    preferences,
    lessonNotes,
    progress,
    learningOutcomes,
    masteryEvidence,
    legalAcceptances,
    courses,
    usagePeriods,
    aiRequests,
    aiBudgets,
  ] = await Promise.all([
    getStoredDocument(`users/${uid}`),
    getStoredDocument(`users/${uid}/learningData/preferences`),
    listAllStoredDocuments(`users/${uid}/lessonNotes`, 500),
    listStoredDocuments(`users/${uid}/courseProgress`, 300),
    listAllStoredDocuments(`users/${uid}/learningOutcomes`, 500),
    listAllStoredDocuments(`users/${uid}/masteryEvidence`, 2_000),
    listStoredDocuments(`users/${uid}/legalAcceptances`, 300),
    listOwnerCourses(uid),
    listStoredDocumentsByField("usagePeriods", "uid", uid, 1_000),
    listStoredDocumentsByField("aiRequests", "uid", uid, 1_000),
    listStoredDocumentsByField("userAiBudgets", "uid", uid, 1_000),
  ]);
  const authoredCourses = await Promise.all(courses.map(async (course) => ({
    course,
    lessons: course.id ? await listLessons(String(course.id)) : [],
  })));
  return {
    account,
    learningPreferences: preferences,
    lessonNotes,
    courseProgress: progress,
    learningOutcomes,
    masteryEvidence,
    legalAcceptances,
    authoredCourses,
    aiUsagePeriods: usagePeriods,
    aiRequestRecords: aiRequests,
    aiBudgetRecords: aiBudgets,
  };
}

export async function GET(request: Request) {
  try {
    const account = await requireAccount(request);
    const data = await collectAccountData(account.uid);
    return new Response(JSON.stringify({
      exportFormat: "erudoza-account-data-v1",
      exportedAt: new Date().toISOString(),
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
    const account = await requireAccount(request);
    if (account.isOwner) {
      return Response.json(
        { error: "Owner account deletion requires a manual transfer or shutdown review. Contact legal@erudoza.com." },
        { status: 403 },
      );
    }
    const body = await readJsonBody(request, 1_024) as { confirmation?: unknown };
    if (body.confirmation !== "DELETE MY ACCOUNT") {
      return Response.json({ error: "Type DELETE MY ACCOUNT to confirm permanent deletion." }, { status: 400 });
    }

    const data = await collectAccountData(account.uid);

    // Never orphan a paid subscription: cancel it at Stripe before removing
    // the account, and refuse deletion if cancellation cannot be completed.
    const subscriptionStatus = String(data.account?.subscriptionStatus ?? "none");
    const billingSubscriptionId = typeof data.account?.billingSubscriptionId === "string"
      ? data.account.billingSubscriptionId
      : undefined;
    if (["active", "trialing", "past_due"].includes(subscriptionStatus)) {
      if (!billingConfiguration().configured || !billingSubscriptionId?.startsWith("sub_")) {
        return Response.json(
          { error: "Cancel your Erudoza Pro subscription before deleting your account. Contact support@erudoza.com if you need help." },
          { status: 409 },
        );
      }
      try {
        await stripeClient().subscriptions.cancel(billingSubscriptionId);
      } catch (cancelError) {
        const alreadyCanceled = cancelError instanceof Error
          && /No such subscription|canceled/i.test(cancelError.message);
        if (!alreadyCanceled) {
          console.error("Subscription cancellation before deletion failed:", cancelError);
          return Response.json(
            { error: "Your subscription could not be canceled automatically. Cancel it from the billing portal, then delete your account." },
            { status: 409 },
          );
        }
      }
    }

    const courses = data.authoredCourses.map(({ course }) => course);
    for (const course of courses) {
      if (course.id) await deleteCourse(String(course.id));
    }

    await deleteStoredDocuments([
      ...data.courseProgress.map((record) => `users/${account.uid}/courseProgress/${record.id}`),
      ...data.learningOutcomes.map((record) => `users/${account.uid}/learningOutcomes/${record.id}`),
      ...data.masteryEvidence.map((record) => `users/${account.uid}/masteryEvidence/${record.id}`),
      ...data.legalAcceptances.map((record) => `users/${account.uid}/legalAcceptances/${record.id}`),
      ...data.lessonNotes.map((record) => `users/${account.uid}/lessonNotes/${record.id}`),
      `users/${account.uid}/learningData/preferences`,
      ...data.aiUsagePeriods.map((record) => `usagePeriods/${record.id}`),
      ...data.aiRequestRecords.map((record) => `aiRequests/${record.id}`),
      ...data.aiBudgetRecords.map((record) => `userAiBudgets/${record.id}`),
      ...(account.email ? [`waitlist/${await emailFingerprint(account.email)}`] : []),
      `users/${account.uid}`,
    ]);

    return Response.json(
      { deleted: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "Your account data could not be deleted." }, { status: 500 });
  }
}
