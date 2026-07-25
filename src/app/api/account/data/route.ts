import { authorizationResponse, requireAccount } from "@/lib/auth-server";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
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
  const [account, preferences, lessonNotes, progress, legalAcceptances, courses, usagePeriods, aiRequests, aiBudgets] = await Promise.all([
    getStoredDocument(`users/${uid}`),
    getStoredDocument(`users/${uid}/learningData/preferences`),
    listAllStoredDocuments(`users/${uid}/lessonNotes`, 500),
    listStoredDocuments(`users/${uid}/courseProgress`, 300),
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
    const courses = data.authoredCourses.map(({ course }) => course);
    await Promise.all(courses.map((course) => course.id ? deleteCourse(String(course.id)) : Promise.resolve()));

    await deleteStoredDocuments([
      ...data.courseProgress.map((record) => `users/${account.uid}/courseProgress/${record.id}`),
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
