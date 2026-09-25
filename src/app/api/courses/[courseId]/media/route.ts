import { withAccountRequest, requireAcceptedAccount } from "@/lib/auth-server";
import { NextResponse } from "next/server";
import { getCourse, setCourseIllustrations } from "@/lib/document-store";
import { apiRequestErrorResponse, assertTrustedMutation } from "@/lib/api-security";
import { planAllows } from "@/lib/membership-plans";
import { openAiSafetyIdentifier } from "@/lib/ai-usage";
import { captureAccountGeneration, runWithAccountGeneration } from "@/lib/account-lifecycle";
import { aiClient } from "@/lib/local-ai";
import {
  createOrReuseCourseIllustration,
  type CourseIllustrationResult,
} from "@/lib/course-illustrations";
import { buildCourseBannerPrompt, courseBannerFingerprintMaterial } from "@/lib/course-banner-prompt";
import { budgetTierForAccount } from "@/lib/course-illustration-budget";
import {
  buildModuleIllustrationPrompt,
  moduleIllustrationFingerprintMaterial,
} from "@/lib/course-illustration-prompt";
import type { Course, CourseBanner, CourseIllustration } from "@/lib/course-types";

/**
 * POST /api/courses/[courseId]/media
 *
 * Tier B/C media wave: generates the course hero (Plus and Pro) plus one
 * illustration per module (Plus only — Pro courses illustrate per lesson
 * instead, wired in generate-lesson). Idempotent — subjects that already
 * have art are skipped, and a per-subject lease prevents double-spend on
 * retries. Fire-and-forget safe: the frontend calls this after course
 * creation, and the course page re-triggers it when art is missing.
 *
 * Imagery is enhancement only: any single failure is absorbed and reported
 * in the response, never as an HTTP error.
 */
async function handlePOST(request: Request, { params }: RouteParams) {
  const { courseId } = await params;
  try {
    assertTrustedMutation(request);
    const account = await requireAcceptedAccount(request);
    const course = await getCourse(courseId);
    if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    if (course.authorId !== account.uid && !account.isOwner) {
      return NextResponse.json({ error: "You do not own this course." }, { status: 403 });
    }
    if (!account.isOwner && !planAllows(account.plan, "course_illustrations")) {
      return NextResponse.json({ error: "Course illustrations require Plus or Pro." }, { status: 403 });
    }

    const client = aiClient();
    const safetyIdentifier = await openAiSafetyIdentifier(account.uid);
    const captured = await captureAccountGeneration(account.uid);
    const typedCourse = course as unknown as Course;

    const heroResult = await runWithAccountGeneration(captured, async () => {
      if (typedCourse.banner) return null;
      const topic = String(typedCourse.topic ?? "");
      return createOrReuseCourseIllustration(client, account, {
        kind: "hero",
        subjectKey: "hero",
        prompt: buildCourseBannerPrompt({
          topic,
          category: typedCourse.category,
          outcome: typedCourse.outcome,
          mission: typedCourse.mission,
        }),
        fingerprintMaterial: courseBannerFingerprintMaterial(
          { topic, category: typedCourse.category, outcome: typedCourse.outcome, mission: typedCourse.mission },
          0,
        ),
        safetyIdentifier,
        courseId,
        budgetTier: budgetTierForAccount(account.plan, account.isOwner),
      });
    });

    const moduleResults = account.plan === "plus"
      ? await runWithAccountGeneration(captured, () => runModules(
        client, account, typedCourse, courseId,
        budgetTierForAccount(account.plan, account.isOwner), safetyIdentifier,
      ))
      : [];

    let banner: CourseBanner | undefined;
    if (heroResult?.illustration && !("kind" in heroResult.illustration)) {
      banner = heroResult.illustration as CourseBanner;
    }
    const moduleIllustrations = moduleResults
      .filter((entry) => entry.result !== null)
      .map((entry) => ({ moduleIndex: entry.moduleIndex, illustration: entry.result!.illustration as CourseIllustration }));

    if (banner || moduleIllustrations.length) {
      await setCourseIllustrations(courseId, typedCourse.authorId ?? account.uid, {
        ...(banner ? { banner } : {}),
        moduleIllustrations,
      });
    }

    return NextResponse.json({
      success: true,
      hero: heroResult ? { generated: heroResult.generated, model: heroResult.model, costMicros: heroResult.costMicros } : { generated: false, skipped: true },
      modules: moduleResults.map((entry) => entry.result
        ? { moduleIndex: entry.moduleIndex, generated: entry.result.generated, model: entry.result.model, costMicros: entry.result.costMicros }
        : { moduleIndex: entry.moduleIndex, generated: false, skipped: true }),
    });
  } catch (error: unknown) {
    const requestResponse = apiRequestErrorResponse(error);
    if (requestResponse) return requestResponse;
    console.error("Course media wave failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Course media could not be generated." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

/** Modules generate in pairs to respect the image quota while bounding latency. */
async function runModules(
  client: ReturnType<typeof aiClient>,
  account: Parameters<typeof createOrReuseCourseIllustration>[1],
  course: Course,
  courseId: string,
  budgetTier: "plus" | "pro",
  safetyIdentifier: string,
): Promise<Array<{ moduleIndex: number; result: CourseIllustrationResult | null }>> {
  const modules = Array.isArray(course.modules) ? course.modules : [];
  const results: Array<{ moduleIndex: number; result: CourseIllustrationResult | null }> = [];
  for (let index = 0; index < modules.length; index += 2) {
    const pair = await Promise.all(
      modules.slice(index, index + 2).map(async (courseModule, offset) => {
        const moduleIndex = index + offset;
        if (courseModule?.illustration) return { moduleIndex, result: null };
        const moduleTitle = String(courseModule?.title ?? `Module ${moduleIndex + 1}`);
        const promptInput = {
          courseTopic: String(course.topic ?? ""),
          moduleTitle,
          moduleDescription: typeof courseModule?.description === "string" ? courseModule.description : undefined,
          moduleObjective: typeof courseModule?.objective === "string" ? courseModule.objective : undefined,
          keyConcepts: Array.isArray(courseModule?.lessons)
            ? courseModule.lessons.slice(0, 4).map((lesson) => typeof lesson?.title === "string" ? lesson.title : "").filter(Boolean)
            : [],
        };
        const result = await createOrReuseCourseIllustration(client, account, {
          kind: "module",
          subjectKey: `module:${moduleIndex}`,
          prompt: buildModuleIllustrationPrompt(promptInput),
          fingerprintMaterial: moduleIllustrationFingerprintMaterial(promptInput),
          safetyIdentifier,
          courseId,
          budgetTier,
        });
        return { moduleIndex, result };
      }),
    );
    results.push(...pair);
  }
  return results;
}

interface RouteParams {
  params: Promise<{ courseId: string }>;
}

export const POST = withAccountRequest(handlePOST);
