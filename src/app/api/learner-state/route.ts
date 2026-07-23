import { authorizationResponse, requireAcceptedAccount, requireAccount } from "@/lib/auth-server";
import { getStoredDocument, putStoredDocument } from "@/lib/firebase-server";
import { learnerStateSchema, validationMessage } from "@/lib/validation";
import { DEFAULT_DASHBOARD_PREFERENCES } from "@/lib/dashboard-preferences";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";

const defaults = {
  courseBookmarks: [] as string[],
  lessonBookmarks: [] as string[],
  notes: {} as Record<string, string>,
  noteUpdatedAt: {} as Record<string, string>,
  weeklyLessonGoal: 5,
  dashboardPreferences: DEFAULT_DASHBOARD_PREFERENCES,
};

export async function GET(request: Request) {
  try {
    const account = await requireAccount(request);
    const saved = await getStoredDocument(`users/${account.uid}/learningData/preferences`);
    const parsed = learnerStateSchema.safeParse(saved ?? defaults);
    return Response.json(parsed.success ? parsed.data : defaults, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return authorizationResponse(error) ?? Response.json({ error: "Learning preferences could not be loaded." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const account = await requireAcceptedAccount(request);
    const parsed = learnerStateSchema.safeParse(await readJsonBody(request, 524_288));
    if (!parsed.success) return Response.json({ error: validationMessage(parsed.error) }, { status: 400 });
    const saved = await putStoredDocument(`users/${account.uid}/learningData/preferences`, parsed.data);
    return Response.json(saved, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiRequestErrorResponse(error) ?? authorizationResponse(error) ?? Response.json({ error: "Learning preferences could not be saved." }, { status: 500 });
  }
}
