import { authorizationResponse, requireAcceptedAccount, withAccountRequest } from "@/lib/auth-server";
import type { Course } from "@/lib/course-types";
import { getCourse, listAllStoredDocuments, listStoredDocumentsByField } from "@/lib/document-store";
import { readSparkOperationalControl } from "@/lib/spark/budget";
import { sparkFeaturePolicy } from "@/lib/spark/config";
import { safeSparkManifest } from "@/lib/spark/contracts";

interface RouteParams {
  params: Promise<{ courseId: string }>;
}

function timestamp(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
}

async function handleGET(request: Request, { params }: RouteParams) {
  const { courseId } = await params;
  try {
    const account = await requireAcceptedAccount(request);
    const course = await getCourse(courseId) as Course | null;
    if (!course) return Response.json({ error: "Course not found." }, { status: 404 });
    if (course.authorId !== account.uid && !account.isOwner) {
      return Response.json({ error: "Only the course creator can inspect Spark preparation." }, { status: 403 });
    }
    const policy = sparkFeaturePolicy();
    const [savedLessons, jobs, manifestDocuments, operationalControl] = await Promise.all([
      listAllStoredDocuments(`courses/${courseId}/lessons`, 500),
      listStoredDocumentsByField("sparkPreparationJobs", "courseId", courseId, 500),
      listStoredDocumentsByField("sparkManifests", "courseId", courseId, 500),
      policy.sparkEnabled
        ? readSparkOperationalControl().catch(() => ({ mode: "halted" as const, liveAiEnabled: false, preparationEnabled: false }))
        : Promise.resolve({ mode: "halted" as const, liveAiEnabled: false, preparationEnabled: false }),
    ]);
    const savedLessonIds = new Set(savedLessons.map((lesson) => lesson.id));
    const latestJobByLesson = new Map<string, Record<string, unknown>>();
    for (const job of jobs) {
      if (typeof job.lessonId !== "string") continue;
      const current = latestJobByLesson.get(job.lessonId);
      if (!current || timestamp(job.updatedAt) > timestamp(current.updatedAt)) latestJobByLesson.set(job.lessonId, job);
    }
    const manifestsById = new Map(manifestDocuments.flatMap((value) => {
      const parsed = safeSparkManifest(value);
      return parsed.success ? [[parsed.data.id, parsed.data] as const] : [];
    }));
    const lessons = course.modules.flatMap((module, moduleIndex) => module.lessons.map((lesson, lessonIndex) => {
      const id = `${moduleIndex}-${lessonIndex}`;
      const generated = savedLessonIds.has(id);
      const job = latestJobByLesson.get(id);
      const manifest = typeof job?.manifestId === "string" ? manifestsById.get(job.manifestId) : undefined;
      const state = !generated ? "not_generated" : job?.state === "failed" ? "failed" : manifest ? "ready" : "not_prepared";
      return {
        id,
        title: lesson.title,
        state,
        lessonVersion: manifest?.lessonVersion ?? null,
        preparedAt: manifest?.createdAt ?? null,
        componentTypes: manifest ? [...new Set(manifest.blocks.map((block) => block.type))] : [],
      };
    }));
    return Response.json({
      featureEnabled: policy.sparkEnabled,
      prepareEnabled: policy.prepareEnabled && operationalControl.preparationEnabled,
      summary: {
        total: lessons.length,
        generated: lessons.filter((lesson) => lesson.state !== "not_generated").length,
        ready: lessons.filter((lesson) => lesson.state === "ready").length,
        failed: lessons.filter((lesson) => lesson.state === "failed").length,
      },
      lessons,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return authorizationResponse(error)
      ?? Response.json({ error: "Spark preparation status is temporarily unavailable." }, { status: 500 });
  }
}

export const GET = withAccountRequest(handleGET);