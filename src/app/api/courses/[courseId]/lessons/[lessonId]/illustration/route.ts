import { withAccountRequest } from "@/lib/auth-server";
import { authorizationResponse, requireAcceptedAccount } from "@/lib/auth-server";
import { apiRequestErrorResponse, assertTrustedMutation } from "@/lib/api-security";
import { captureAccountGeneration, runWithAccountGeneration } from "@/lib/account-lifecycle";
import { getCourse, getLesson, setLessonIllustration } from "@/lib/document-store";
import { aiClient } from "@/lib/local-ai";
import { openAiSafetyIdentifier } from "@/lib/ai-usage";
import {
  createOrReuseCourseIllustration,
} from "@/lib/course-illustrations";
import {
  buildLessonIllustrationPrompt,
  lessonIllustrationFingerprintMaterial,
} from "@/lib/course-illustration-prompt";
import { budgetTierForAccount } from "@/lib/course-illustration-budget";
import type { Course } from "@/lib/course-types";
import { publicationContentFingerprint } from "@/lib/publication-content";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ courseId: string; lessonId: string }> };

async function handlePOST(request: Request, { params }: RouteParams) {
  const { courseId, lessonId } = await params;
  try {
    assertTrustedMutation(request);
    const account = await requireAcceptedAccount(request);
    if (!/^\d+-\d+$/.test(lessonId)) {
      return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
    }

    const course = await getCourse(courseId) as (Course & Record<string, unknown>) | null;
    if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    if (course.authorId !== account.uid && !account.isOwner) {
      return NextResponse.json({ error: "You do not own this course." }, { status: 403 });
    }
    if (!account.isOwner && account.plan !== "pro") {
      return NextResponse.json({ error: "Per-lesson illustrations require Pro." }, { status: 403 });
    }

    const lesson = await getLesson(courseId, lessonId);
    if (!lesson) return NextResponse.json({ error: "Generate the lesson before requesting its illustration." }, { status: 409 });
    if (lesson.illustration) {
      return NextResponse.json({ success: true, generated: false, skipped: true });
    }
    const expectedContentFingerprint = publicationContentFingerprint(lesson);

    const [moduleIndexText, lessonIndexText] = lessonId.split("-");
    const moduleIndex = Number(moduleIndexText);
    const lessonIndex = Number(lessonIndexText);
    const courseModule = course.modules?.[moduleIndex];
    const outlineLesson = courseModule?.lessons?.[lessonIndex];
    if (!courseModule || !outlineLesson) {
      return NextResponse.json({ error: "Lesson not found in this course outline." }, { status: 404 });
    }

    const promptInput = {
      courseTopic: String(course.topic ?? ""),
      moduleTitle: String(courseModule.title ?? `Module ${moduleIndex + 1}`),
      lessonTitle: String(outlineLesson.title ?? lesson.title ?? "Lesson"),
      lessonConcept: typeof lesson.learningObjective === "string" ? lesson.learningObjective : undefined,
      learningObjective: typeof outlineLesson.objective === "string" ? outlineLesson.objective : undefined,
      keyTakeaways: Array.isArray(lesson.keyTakeaways)
        ? lesson.keyTakeaways.filter((takeaway): takeaway is string => typeof takeaway === "string").slice(0, 3)
        : [],
    };
    const safetyIdentifier = await openAiSafetyIdentifier(account.uid);
    const captured = await captureAccountGeneration(account.uid);
    const illustrationResult = await runWithAccountGeneration(captured, () =>
      createOrReuseCourseIllustration(aiClient(), account, {
        kind: "lesson",
        subjectKey: `lesson:${lessonId}`,
        prompt: buildLessonIllustrationPrompt(promptInput),
        fingerprintMaterial: lessonIllustrationFingerprintMaterial(promptInput),
        safetyIdentifier,
        courseId,
        budgetTier: budgetTierForAccount(account.plan, account.isOwner),
      }),
    );
    const illustration = illustrationResult?.illustration;
    if (illustration && "kind" in illustration && illustration.kind === "lesson") {
      const updated = await runWithAccountGeneration(captured, () =>
        setLessonIllustration(courseId, lessonId, illustration, expectedContentFingerprint),
      );
      if (!updated) {
        return NextResponse.json({ success: true, generated: Boolean(illustrationResult.generated), skipped: true, reason: "lesson_changed" });
      }
    }

    return NextResponse.json({
      success: true,
      generated: Boolean(illustrationResult?.generated),
      skipped: !illustrationResult,
    });
  } catch (error: unknown) {
    const requestError = apiRequestErrorResponse(error);
    if (requestError) return requestError;
    const authError = authorizationResponse(error);
    if (authError) return authError;
    console.error("Lesson illustration generation failed:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "The lesson illustration could not be generated." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

export const POST = withAccountRequest(handlePOST);
