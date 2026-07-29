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
  lessonId: z.string().regex(/^\d+-\d+$/),
  category: z.enum(["accuracy", "outdated", "source", "clarity", "safety", "copyright", "other"]),
  note: z.string().trim().max(1_000).optional().default(""),
  contentVersion: z.string().trim().max(120).optional(),
}).strict();

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
    const { courseId, lessonId } = parsed.data;
    const course = await getCourse(courseId);
    if (!course) return Response.json({ error: "Course not found." }, { status: 404 });
    if (!course.isPublic) {
      if (account.uid !== course.authorId && !account.isOwner) {
        return Response.json({ error: "You do not have access to this lesson." }, { status: 403 });
      }
    }
    const lesson = await getLesson(courseId, lessonId);
    if (!lesson) return Response.json({ error: "Lesson not found." }, { status: 404 });

    const existingReports = await listStoredDocumentsByField("contentReports", "courseId", courseId, 500);
    const duplicate = existingReports.some((report) =>
      report.reporterUid === account.uid
      && report.lessonId === lessonId
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
      lessonTitle: lessonTitle(course as unknown as Course, lessonId),
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
