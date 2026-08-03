import { z } from "zod";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { authorizationResponse, requireAccount } from "@/lib/auth-server";
import {
  createStoredDocument,
  getCourse,
  getLesson,
  listStoredDocumentsByField,
  quarantineCourse,
} from "@/lib/firebase-server";
import { enforceBestEffortRateLimit } from "@/lib/request-rate-limit";
import type { Course } from "@/lib/course-types";

const reportSchema = z.object({
  courseId: z.string().trim().min(1).max(200),
  lessonId: z.string().regex(/^\d+-\d+$/).optional(),
  sourceId: z.string().trim().regex(/^source-[a-z0-9-]{1,40}$/).optional(),
  category: z.enum(["accuracy", "outdated", "source", "clarity", "safety", "copyright", "other"]),
  note: z.string().trim().max(1_000).optional().default(""),
  contentVersion: z.string().trim().max(120).optional(),
}).strict().superRefine((value, context) => {
  if (Boolean(value.lessonId) === Boolean(value.sourceId)) {
    context.addIssue({ code: "custom", message: "Choose one lesson or source to report." });
  }
});

function lessonTitle(course: Course, lessonId: string) {
  const [moduleIndex, lessonIndex] = lessonId.split("-").map(Number);
  return course.modules?.[moduleIndex]?.lessons?.[lessonIndex]?.title;
}

export async function POST(request: Request) {
  const limited = enforceBestEffortRateLimit(request, "content-report", 5, 10 * 60_000);
  if (limited) return limited;
  try {
    const account = await requireAccount(request);
    const parsed = reportSchema.safeParse(await readJsonBody(request, 4_096));
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the report and try again." }, { status: 400 });
    }
    const { courseId, lessonId, sourceId } = parsed.data;
    const course = await getCourse(courseId);
    if (!course) return Response.json({ error: "Course not found." }, { status: 404 });
    if (!course.isPublic) {
      if (account.uid !== course.authorId && !account.isOwner) {
        return Response.json({ error: "You do not have access to this lesson." }, { status: 403 });
      }
    }
    const lesson = lessonId ? await getLesson(courseId, lessonId) : null;
    if (lessonId && !lesson) return Response.json({ error: "Lesson not found." }, { status: 404 });
    const typedCourse = course as unknown as Course;
    const source = sourceId ? (typedCourse.sourcePack ?? []).find((item) => item.id === sourceId) : null;
    if (sourceId && !source) return Response.json({ error: "Source not found." }, { status: 404 });

    const existingReports = await listStoredDocumentsByField("contentReports", "courseId", courseId, 500);
    const duplicate = existingReports.some((report) =>
      report.reporterUid === account.uid
      && report.lessonId === lessonId
      && report.sourceId === sourceId
      && report.category === parsed.data.category
      && report.status !== "dismissed",
    );
    if (duplicate) {
      return Response.json(
        { error: "You already reported this issue for this lesson." },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    await createStoredDocument("contentReports", {
      ...parsed.data,
      reporterUid: account.uid,
      topic: course.topic,
      lessonTitle: lessonId ? lessonTitle(typedCourse, lessonId) : undefined,
      sourceLabel: source?.label,
      sourceUrl: source?.url,
      status: "open",
      createdAt: new Date().toISOString(),
    });
    const serious = parsed.data.category === "safety" || parsed.data.category === "copyright";
    const seriousReporters = new Set(existingReports.flatMap((report) =>
      (report.category === "safety" || report.category === "copyright")
        && report.status !== "dismissed"
        && typeof report.reporterUid === "string"
        ? [report.reporterUid]
        : [],
    ));
    if (serious) seriousReporters.add(account.uid);
    const quarantined = course.isPublic
      && serious
      && (account.isOwner || seriousReporters.size >= 2)
      ? await quarantineCourse(courseId, "Multiple verified users reported a serious safety or rights concern.")
      : false;
    return Response.json(
      { reported: true, quarantined },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiRequestErrorResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "The content report could not be submitted." }, { status: 500 });
  }
}
