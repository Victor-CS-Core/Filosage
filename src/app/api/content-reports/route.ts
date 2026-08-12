import { z } from "zod";
import { apiRequestErrorResponse, readJsonBody } from "@/lib/api-security";
import { authorizationResponse, requireAccount } from "@/lib/auth-server";
import {
  listStoredDocumentsByField,
  quarantineCourse,
} from "@/lib/firebase-server";
import { enforceDurableRateLimit } from "@/lib/request-rate-limit";
import type { Course } from "@/lib/course-types";
import { reportOperationalEvent } from "@/lib/operational-alerts";
import { recordServerProductEvent } from "@/lib/product-events-server";
import { contentReportDisposition } from "@/lib/content-report-policy";
import { commandCenterEnvironmentEnabled } from "@/lib/command-center-auth";
import { createContentReportAndCommandCenterTicket } from "@/lib/command-center-server";
import {
  getCourseRuntimeArtifact,
  getLessonRuntimeArtifact,
  publishedReleaseUnavailableResponse,
} from "@/lib/course-pipeline/artifact-access";

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
  try {
    const account = await requireAccount(request);
    const limited = await enforceDurableRateLimit(
      request,
      "content-report",
      5,
      10 * 60_000,
      account.uid,
    );
    if (limited) return limited;
    const parsed = reportSchema.safeParse(await readJsonBody(request, 4_096));
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the report and try again." }, { status: 400 });
    }
    const { courseId, lessonId, sourceId } = parsed.data;
    const course = await getCourseRuntimeArtifact(courseId);
    if (!course) return Response.json({ error: "Course not found." }, { status: 404 });
    if (!course.isPublic) {
      if (account.uid !== course.authorId && !account.isOwner) {
        return Response.json({ error: "You do not have access to this lesson." }, { status: 403 });
      }
    }
    const lesson = lessonId ? await getLessonRuntimeArtifact(courseId, lessonId, course) : null;
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

    const reportId = crypto.randomUUID();
    const created = await createContentReportAndCommandCenterTicket({
      reportId,
      commandCenterEnabled: commandCenterEnvironmentEnabled(),
      report: {
        ...parsed.data,
        reporterUid: account.uid,
        topic: course.topic,
        lessonTitle: lessonId ? lessonTitle(typedCourse, lessonId) : undefined,
        sourceLabel: source?.label,
        sourceUrl: source?.url,
        status: "open",
        createdAt: new Date().toISOString(),
      },
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
    const disposition = contentReportDisposition({
      courseIsPublic: course.isPublic === true,
      serious,
      reporterIsOwner: account.isOwner,
      seriousReporterCount: seriousReporters.size,
    });
    const escalated = disposition.escalate;
    // Only the owner may immediately quarantine content. Multiple learner
    // reports create an urgent review signal, but cannot be used as a Sybil
    // attack to unpublish an otherwise public course.
    const quarantined = disposition.quarantine
      ? await quarantineCourse(courseId, "The owner reported a serious safety or rights concern.")
      : false;
    if (escalated && !quarantined) {
      await reportOperationalEvent({
        severity: "critical",
        code: "content.multiple_serious_reports",
        message: "A public course has multiple independent safety or rights reports and needs owner review.",
        deduplicationKey: courseId,
        context: { courseId, reporters: seriousReporters.size },
      });
    }
    await recordServerProductEvent("content_reported", {
      route: lessonId ? "/lesson" : "/course",
      actorId: account.uid,
      courseId,
      lessonId,
      eventId: `content-report-${created.id}`,
    });
    return Response.json(
      { reported: true, quarantined, escalated },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return publishedReleaseUnavailableResponse(error)
      ?? apiRequestErrorResponse(error)
      ?? authorizationResponse(error)
      ?? Response.json({ error: "The content report could not be submitted." }, { status: 500 });
  }
}
