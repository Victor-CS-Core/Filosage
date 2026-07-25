import { authorizationResponse, requireAcceptedAccount, requireAccount } from "@/lib/auth-server";
import {
  deleteStoredDocuments,
  getStoredDocument,
  listAllStoredDocuments,
  putStoredDocument,
  putStoredDocuments,
} from "@/lib/firebase-server";
import {
  learnerPreferencesSchema,
  learnerStateSchema,
  learnerStateUpdateSchema,
  validationMessage,
} from "@/lib/validation";
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

function noteDocumentId(key: string) {
  const bytes = new TextEncoder().encode(key);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function notePath(uid: string, key: string) {
  return `users/${uid}/lessonNotes/${noteDocumentId(key)}`;
}

function objectStrings(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, string>;
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

export async function GET(request: Request) {
  try {
    const account = await requireAccount(request);
    const [saved, noteDocuments] = await Promise.all([
      getStoredDocument(`users/${account.uid}/learningData/preferences`),
      listAllStoredDocuments(`users/${account.uid}/lessonNotes`, 500),
    ]);
    const preferences = learnerPreferencesSchema.safeParse(saved ?? defaults);
    const legacyNotes = objectStrings(saved?.notes);
    const legacyUpdatedAt = objectStrings(saved?.noteUpdatedAt);
    const notes = { ...legacyNotes };
    const noteUpdatedAt = { ...legacyUpdatedAt };

    for (const document of noteDocuments) {
      const key = typeof document.key === "string" ? document.key : "";
      const content = typeof document.content === "string" ? document.content : "";
      const updatedAt = typeof document.updatedAt === "string" ? document.updatedAt : "";
      if (!key) continue;
      const existingTime = Date.parse(noteUpdatedAt[key] ?? "") || 0;
      const documentTime = Date.parse(updatedAt) || 0;
      if (!(key in notes) || documentTime >= existingTime) {
        notes[key] = content;
        if (updatedAt) noteUpdatedAt[key] = updatedAt;
      }
    }

    if (Object.keys(legacyNotes).length) {
      const now = new Date().toISOString();
      await Promise.all([
        putStoredDocuments(Object.entries(legacyNotes).map(([key, content]) => ({
          path: notePath(account.uid, key),
          data: {
            key,
            content,
            updatedAt: legacyUpdatedAt[key] ?? now,
          },
        }))),
        putStoredDocument(
          `users/${account.uid}/learningData/preferences`,
          preferences.success ? preferences.data : {
            courseBookmarks: defaults.courseBookmarks,
            lessonBookmarks: defaults.lessonBookmarks,
            weeklyLessonGoal: defaults.weeklyLessonGoal,
            dashboardPreferences: defaults.dashboardPreferences,
            updatedAt: now,
          },
        ),
      ]);
    }

    return Response.json({
      ...(preferences.success ? preferences.data : {
        courseBookmarks: defaults.courseBookmarks,
        lessonBookmarks: defaults.lessonBookmarks,
        weeklyLessonGoal: defaults.weeklyLessonGoal,
        dashboardPreferences: defaults.dashboardPreferences,
      }),
      notes,
      noteUpdatedAt,
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return authorizationResponse(error) ?? Response.json({ error: "Learning preferences could not be loaded." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const account = await requireAcceptedAccount(request);
    const body = await readJsonBody(request, 524_288);
    const update = learnerStateUpdateSchema.safeParse(body);
    const legacy = update.success ? null : learnerStateSchema.safeParse(body);
    const legacyData = legacy?.success ? legacy.data : null;
    if (!update.success && !legacyData) {
      return Response.json({ error: validationMessage(update.error) }, { status: 400 });
    }

    const preferences = update.success
      ? update.data.preferences
      : learnerPreferencesSchema.parse(legacyData);
    const noteChanges = update.success
      ? update.data.noteChanges
      : Object.entries(legacyData!.notes).map(([key, content]) => ({
          key,
          content,
          updatedAt: legacyData!.noteUpdatedAt[key] ?? new Date().toISOString(),
        }));
    const deletedNoteKeys = update.success ? update.data.deletedNoteKeys : [];
    const notesToDelete = [
      ...deletedNoteKeys,
      ...noteChanges.filter((note) => !note.content.trim()).map((note) => note.key),
    ];
    const notesToSave = noteChanges.filter((note) => note.content.trim());

    await Promise.all([
      putStoredDocument(`users/${account.uid}/learningData/preferences`, preferences),
      putStoredDocuments(notesToSave.map((note) => ({
        path: notePath(account.uid, note.key),
        data: note,
      }))),
      deleteStoredDocuments(Array.from(new Set(notesToDelete)).map((key) => notePath(account.uid, key))),
    ]);

    return Response.json({ success: true }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiRequestErrorResponse(error) ?? authorizationResponse(error) ?? Response.json({ error: "Learning preferences could not be saved." }, { status: 500 });
  }
}
