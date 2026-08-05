import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { LESSON_QUALITY_GATE_VERSION } from "../src/lib/lesson-quality";
import { inspectCoursePublishReadiness } from "../src/lib/publication-readiness";
import { restoreLocalLearner } from "./fixtures/local-learner";

function schemaValidLesson(content: string) {
  return {
    id: "0-0",
    schemaVersion: 4,
    qualityGateVersion: "legacy-quality-gate",
    learningObjective: "Classify evidence and inference in a decision record.",
    connection: "This distinction supports a defensible product decision.",
    keyTakeaways: ["Evidence is observed.", "Inference explains observations.", "Confidence follows support."],
    content,
    guidedPractice: {
      prompt: "Classify each statement.",
      steps: ["Record what was directly observed.", "Label the explanation added to the observation."],
      modelAnswer: "The measured count is evidence, while the proposed cause is an inference.",
    },
    transferTask: {
      prompt: "Classify a new product claim.",
      successCriteria: ["Names the direct evidence", "Names the inference"],
      modelResponse: "The usage count is evidence, while the explanation for the change is an inference.",
    },
    quizzes: [0, 1].map((index) => ({
      question: `Which statement is directly supported in case ${index + 1}?`,
      options: ["Observed count", "Proposed cause", "Future prediction", "Unstated preference"],
      correctIndex: 0,
      explanation: "The observed count is the only direct evidence.",
      optionFeedback: ["Correct.", "This is an inference.", "This is a prediction.", "This is not stated."],
    })),
  };
}

test("publication readiness marks schema failures as non-overridable and teaching failures as overridable", () => {
  const malformed = inspectCoursePublishReadiness(
    [{ id: "0-0", content: "Incomplete legacy data." }],
    ["0-0"],
    "Decision quality",
  );
  expect(malformed.invalidLessons[0]).toMatchObject({ category: "structure", overridable: false });

  const qualityFailure = inspectCoursePublishReadiness(
    [schemaValidLesson("A concrete explanation. ".repeat(45))],
    ["0-0"],
    "Decision quality",
  );
  expect(qualityFailure.invalidLessons[0]).toMatchObject({ category: "quality", overridable: true });
  expect(qualityFailure.legacyLessonIds).toEqual(["0-0"]);
  expect(qualityFailure.invalidLessons[0]?.currentQualityGate).toBe(LESSON_QUALITY_GATE_VERSION);
});

test("owner override remains a dedicated, recently authenticated, audited quality-only path", async () => {
  const [routeSource, reviewSource, storageSource, generationSource] = await Promise.all([
    readFile("src/app/api/admin/courses/[courseId]/publication-override/route.ts", "utf8"),
    readFile("src/lib/publication-review.ts", "utf8"),
    readFile("src/lib/firebase-server.ts", "utf8"),
    readFile("src/app/api/generate-lesson/route.ts", "utf8"),
  ]);

  expect(routeSource).toContain("requireRecentlyAuthenticatedOwner(request)");
  expect(routeSource).toContain('z.literal("PUBLISH WITH QUALITY OVERRIDE")');
  expect(routeSource).toContain('course.moderationStatus === "quarantined"');
  expect(reviewSource).toContain("Safety is deliberately evaluated before any quality override is accepted.");
  expect(reviewSource).toContain("ownerOverride.expectedAssessmentHash !== assessmentHash");
  expect(storageSource).toContain('action: "course_quality_override_published"');
  expect(storageSource).toContain("lessonContentHashes");
  expect(generationSource).toContain("shouldRunPublicationPreflight");
  expect(generationSource).toContain("publicationReadiness");
});

test("an owner can confirm a quality override only after the normal review fails", async ({ page }) => {
  await restoreLocalLearner(page);
  const courseId = "quality-override-course";
  const course = {
    id: courseId,
    courseId,
    topic: "Mobile development",
    mission: "Build a dependable mobile feature.",
    level: "Foundations",
    isPublic: false,
    canManage: true,
    generatedLessonIds: ["0-0"],
    modules: [{
      title: "Delivery",
      description: "Build and test one feature.",
      lessons: [{ title: "Test the feature", concept: "Verification" }],
    }],
  };
  let overrideBody: Record<string, unknown> | null = null;
  await page.route(`**/api/courses/${courseId}`, (route) => {
    if (route.request().method() === "PATCH") {
      return route.fulfill({
        status: 409,
        json: {
          error: "The course needs review before publication.",
          code: "PUBLICATION_REVIEW_FAILED",
          overrideEligible: true,
          assessmentHash: "a".repeat(64),
          invalidLessons: [],
          assessment: {
            overrideEligible: true,
            overridableIssues: [{
              code: "course.quality.1",
              category: "quality",
              message: "The course needs more teaching-mode variety.",
              overridable: true,
            }],
          },
        },
      });
    }
    return route.fulfill({ json: course });
  });
  await page.route(`**/api/progress?courseId=${courseId}`, (route) => route.fulfill({ json: { progress: null } }));
  await page.route(`**/api/admin/courses/${courseId}/publication-override`, async (route) => {
    overrideBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ json: { success: true, isPublic: true, publicationReview: { status: "owner_override" } } });
  });

  await page.goto(`/course/Mobile%20development?id=${courseId}`);
  await page.locator("details.course-owner-controls > summary").click();
  await page.getByLabel(/I reviewed every lesson/).check();
  await page.getByRole("button", { name: "Review and publish" }).click();
  await page.getByRole("button", { name: "Review owner override" }).click();

  const dialog = page.getByRole("dialog", { name: "Publish with quality warnings?" });
  await expect(dialog.getByText("Quality only, never safety or structure")).toBeVisible();
  await dialog.getByLabel("Reason for overriding these warnings").fill("The warning is understood and the scoped course remains instructionally appropriate.");
  await dialog.getByLabel(/I confirm that I reviewed the warnings/).check();
  await dialog.getByRole("button", { name: "Publish this exact version" }).click();

  expect(overrideBody).toMatchObject({
    assessmentHash: "a".repeat(64),
    confirmation: "PUBLISH WITH QUALITY OVERRIDE",
  });
  await expect(page.getByText(/Published with an audited owner quality override/)).toBeVisible();
});

test("repair all regenerates each rejected lesson and applies the returned preflight", async ({ page }) => {
  await restoreLocalLearner(page);
  const courseId = "repair-all-course";
  const failures = ["0-0", "0-1"].map((lessonId) => ({
    lessonId,
    issues: ["The lesson needs a stronger transfer task."],
    category: "quality",
    overridable: true,
    currentQualityGate: LESSON_QUALITY_GATE_VERSION,
  }));
  const calls: string[] = [];
  await page.route(`**/api/courses/${courseId}`, (route) => {
    if (route.request().method() === "PATCH") {
      return route.fulfill({ status: 409, json: { error: "Two lessons need repair.", invalidLessons: failures } });
    }
    return route.fulfill({ json: {
      id: courseId,
      courseId,
      topic: "Mobile development",
      mission: "Build and test a mobile feature.",
      level: "Foundations",
      isPublic: false,
      canManage: true,
      generatedLessonIds: ["0-0", "0-1"],
      modules: [{
        title: "Delivery",
        description: "Build and test.",
        lessons: [
          { title: "Build the feature", concept: "Implementation" },
          { title: "Test the feature", concept: "Verification" },
        ],
      }],
    } });
  });
  await page.route(`**/api/progress?courseId=${courseId}`, (route) => route.fulfill({ json: { progress: null } }));
  await page.route("**/api/generate-lesson", async (route) => {
    const body = route.request().postDataJSON() as { lessonId: string };
    calls.push(body.lessonId);
    const remaining = body.lessonId === "0-0" ? [failures[1]] : [];
    await route.fulfill({ json: {
      content: "Replacement lesson",
      publicationReadiness: {
        ready: remaining.length === 0,
        readyCount: 2 - remaining.length,
        totalCount: 2,
        missingLessonIds: [],
        invalidLessonIds: remaining.map((failure) => failure.lessonId),
        invalidLessons: remaining,
        legacyLessonIds: [],
      },
    } });
  });

  await page.goto(`/course/Mobile%20development?id=${courseId}`);
  await page.locator("details.course-owner-controls > summary").click();
  await page.getByLabel(/I reviewed every lesson/).check();
  await page.getByRole("button", { name: "Review and publish" }).click();
  await page.getByRole("button", { name: "Repair all 2 lessons" }).click();

  await expect(page.getByText("Repair complete. Review the replacement lessons before publishing.")).toBeVisible();
  expect(calls).toEqual(["0-0", "0-1"]);
  await expect(page.getByRole("button", { name: "Regenerate lesson" })).toHaveCount(0);
});
