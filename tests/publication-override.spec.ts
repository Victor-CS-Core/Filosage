import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import type { LearnerAccount } from "../src/lib/course-types";
import { LESSON_QUALITY_GATE_VERSION } from "../src/lib/lesson-quality";
import { PRIVACY_VERSION, TERMS_VERSION } from "../src/lib/legal";
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
    [{
      ...schemaValidLesson("A concrete explanation. ".repeat(45)),
      guidedPractice: {
        ...schemaValidLesson("A concrete explanation. ".repeat(45)).guidedPractice,
        steps: ["- Record what was directly observed.", "Label the explanation added to the observation."],
      },
    }],
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
    readFile("src/lib/document-store.ts", "utf8"),
    readFile("src/app/api/generate-lesson/route.ts", "utf8"),
  ]);

  expect(routeSource).toContain("requireRecentlyAuthenticatedOwner(request)");
  expect(routeSource).toContain("IDEMPOTENCY_KEY_REQUIRED");
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
  const ownerAccount = {
    access: "owner",
    plan: "pro",
    isOwner: true,
    accountStatus: "active",
    displayName: "Playwright Owner",
    subscriptionStatus: "none",
    capabilities: {
      createCourse: true,
      generateLesson: true,
      flashcardDecksEnabled: true,
      createCustomFlashcardDeck: true,
      publishCourse: true,
      advancedCapstoneAnalysis: true,
      exportEvidenceReport: true,
      shareEvidenceReport: true,
    },
    courseCredits: { balance: null, monthlyAllocation: null, balanceCap: null, nextAccrualAt: null, frozenUntil: null },
    acceptedTermsVersion: TERMS_VERSION,
    acceptedPrivacyVersion: PRIVACY_VERSION,
    legalAcceptanceRequired: false,
    applicationAccountExists: true,
    identityLinkRequired: false,
    currentTermsVersion: TERMS_VERSION,
    currentPrivacyVersion: PRIVACY_VERSION,
    quotas: [
      { feature: "tutor", limit: null, used: 0, remaining: null, resetAt: "2026-09-01T00:00:00.000Z" },
      { feature: "flashcard_generation", limit: null, used: 0, remaining: null, resetAt: "2026-09-01T00:00:00.000Z" },
    ],
  } satisfies LearnerAccount & { currentTermsVersion: string; currentPrivacyVersion: string };
  await page.route(
    (url) => url.pathname === "/api/account" && url.search === "",
    (route) => {
      expect(route.request().method()).toBe("GET");
      return route.fulfill({ json: ownerAccount });
    },
  );
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
  let overrideIdempotencyKey: string | null = null;
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
    overrideIdempotencyKey = route.request().headers()["idempotency-key"] ?? null;
    await route.fulfill({ json: { success: true, isPublic: true, publicationReview: { status: "owner_override" } } });
  });

  await page.goto(`/course/Mobile%20development?id=${courseId}`);
  await page.locator("details.course-owner-controls > summary").click();
  const publishButton = page.getByRole("button", { name: "Publish course" });
  await expect(publishButton).toBeEnabled();
  await publishButton.click();
  await expect(page.getByRole("button", { name: "Review owner override" })).toBeVisible();

  await page.reload();
  const ownerControls = page.locator("details.course-owner-controls");
  await expect(ownerControls).toHaveAttribute("open", "");
  const overrideButton = page.getByRole("button", { name: "Review owner override" });
  await expect(overrideButton).toBeVisible();
  await overrideButton.click();

  const dialog = page.getByRole("dialog", { name: "Publish with quality warnings?" });
  await expect(dialog).toHaveAttribute("data-state", "open");
  await expect(dialog.getByText("Quality only, never safety or structure")).toBeVisible();
  await dialog.getByLabel("Reason for overriding these warnings").fill("The warning is understood and the scoped course remains instructionally appropriate.");
  const overrideConfirmation = dialog.getByLabel(/I confirm that I reviewed the warnings/);
  await overrideConfirmation.check();
  await expect(overrideConfirmation).toBeChecked();
  await dialog.getByRole("button", { name: "Publish this exact version" }).click();

  expect(overrideBody).toMatchObject({
    assessmentHash: "a".repeat(64),
    confirmation: "PUBLISH WITH QUALITY OVERRIDE",
  });
  expect(typeof overrideIdempotencyKey).toBe("string");
  expect(String(overrideIdempotencyKey).length).toBeGreaterThanOrEqual(12);
  await expect(page.getByText(/Published with an audited owner quality override/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Publication review needs attention" })).toHaveCount(0);
});

test("an owner records a snapshot-bound manual-review decision before publishing", async ({ page }) => {
  await restoreLocalLearner(page);
  const courseId = "manual-review-course";
  const snapshotHash = "b".repeat(64);
  const contractVersion = "course-quality-v2.0.0";
  const course = {
    id: courseId,
    courseId,
    topic: "First-aid response to severe bleeding",
    mission: "Describe an approved emergency response sequence.",
    level: "Foundations",
    isPublic: false,
    canManage: true,
    generatedLessonIds: ["0-0"],
    manualReviewPolicy: { version: "course-review-policy-v1", required: true, reasonCodes: ["medical"] },
    sourcePack: [{
      id: "source-emergency-guidance",
      label: "Official emergency guidance",
      url: "https://example.org/emergency-guidance",
      kind: "official",
      rights: "link-only",
    }],
    modules: [{
      title: "Response",
      description: "Recognize and describe the response.",
      lessons: [{ title: "Severe bleeding response", concept: "Emergency response" }],
    }],
  };
  let reviewBody: Record<string, unknown> | null = null;
  let reviewKey: string | null = null;
  await page.route(`**/api/courses/${courseId}`, (route) => {
    if (route.request().method() === "PATCH") {
      return route.fulfill({ status: 409, json: {
        error: "A human evidence decision is required.",
        validationReport: {
          courseId,
          snapshotHash,
          contractVersion,
          validatedAt: "2026-08-11T12:00:00.000Z",
          publishable: false,
          requiresManualReview: true,
          issues: [{
            code: "CQ_SOURCE_002",
            severity: "error",
            category: "cq_source",
            path: "course.manualReviewPolicy",
            message: "Human review is required for: medical.",
            repairability: "manual",
            source: "source_integrity",
            contractVersion,
          }],
          warnings: [],
          passedRuleCodes: [],
        },
      } });
    }
    return route.fulfill({ json: course });
  });
  await page.route(`**/api/progress?courseId=${courseId}`, (route) => route.fulfill({ json: { progress: null } }));
  await page.route(`**/api/admin/courses/${courseId}/manual-review`, async (route) => {
    reviewBody = route.request().postDataJSON() as Record<string, unknown>;
    reviewKey = route.request().headers()["idempotency-key"] ?? null;
    await route.fulfill({ json: {
      success: true,
      manualReviewResolution: {
        status: "approved",
        snapshotHash,
        contractVersion,
        reason: "Primary emergency guidance supports the bounded sequence in this exact draft.",
        reviewedAt: "2026-08-11T12:05:00.000Z",
        reviewId: "review-1",
      },
    } });
  });

  await page.goto(`/course/First-aid%20response?id=${courseId}`);
  await page.locator("details.course-owner-controls > summary").click();
  await page.getByRole("button", { name: "Publish course" }).click();
  await expect(page.getByText("Human decision required for this snapshot")).toBeVisible();
  await expect(page.getByRole("group", { name: "Sources personally verified for this snapshot" })).toBeVisible();
  expect((await new AxeBuilder({ page }).include(".course-owner-controls").analyze()).violations).toEqual([]);
  await page.getByRole("checkbox", { name: /Official emergency guidance/ }).check();
  await page.getByLabel("Manual-review reason").fill("Primary emergency guidance supports the bounded sequence in this exact draft.");
  await page.getByRole("button", { name: "Approve exact snapshot" }).click();

  expect(reviewBody).toMatchObject({
    decision: "approved",
    snapshotHash,
    contractVersion,
    verifiedSourceIds: ["source-emergency-guidance"],
    confirmation: "APPROVE MANUAL REVIEW",
  });
  expect(typeof reviewKey).toBe("string");
  expect(String(reviewKey).length).toBeGreaterThanOrEqual(12);
  await expect(page.getByText(/Manual review approved for this exact snapshot/)).toBeVisible();
});

test("a published approved course does not present its audit report as an active publication problem", async ({ page }) => {
  await restoreLocalLearner(page);
  const courseId = "published-manual-review-course";
  const snapshotHash = "e".repeat(64);
  await page.route(`**/api/courses/${courseId}`, (route) => route.fulfill({ json: {
    id: courseId,
    courseId,
    topic: "First-aid response",
    mission: "Explain a bounded response sequence.",
    level: "Foundations",
    isPublic: true,
    canManage: true,
    pipelineStage: "published",
    generatedLessonIds: ["0-0"],
    publicationReview: { status: "approved", reviewedAt: "2026-08-12T13:00:00.000Z" },
    modules: [{ title: "Response", description: "Recognize the sequence.", lessons: [{ title: "Response sequence", concept: "Emergency response" }] }],
  } }));
  await page.route(`**/api/courses/${courseId}/validation`, (route) => route.fulfill({ json: { validationReport: {
    courseId,
    snapshotHash,
    contractVersion: "course-quality-v2.0.0",
    validatedAt: "2026-08-12T13:00:00.000Z",
    publishable: false,
    requiresManualReview: true,
    issues: [{
      code: "CQ_SEMANTIC_001",
      severity: "error",
      category: "semantic",
      path: "course",
      message: "Owner review is required before publication.",
      repairability: "manual",
      source: "semantic",
      contractVersion: "course-quality-v2.0.0",
    }],
    warnings: [],
    passedRuleCodes: [],
  } } }));
  await page.route(`**/api/progress?courseId=${courseId}`, (route) => route.fulfill({ json: { progress: null } }));

  await page.goto(`/course/First-aid%20response?id=${courseId}`);
  await expect(page.getByText("Public course", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Publication review needs attention" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Course quality contract report" })).toHaveCount(0);
});

test("targeted V2 repair applies diagnosed paths, revalidates, and offers undo", async ({ page }) => {
  await restoreLocalLearner(page);
  const courseId = "targeted-repair-course";
  const baseHash = "c".repeat(64);
  const repairedHash = "d".repeat(64);
  const contractVersion = "course-quality-v2.0.0";
  const issue = {
    code: "CQ_LAB_001",
    severity: "blocker",
    category: "cq_lab",
    path: 'lessons["0-0"].interactions[0]',
    message: "The lab type unsupported-lab is not registered.",
    repairability: "automatic",
    source: "runtime",
    contractVersion,
  };
  const report = (snapshotHash: string, issues: Array<typeof issue>) => ({
    courseId,
    snapshotHash,
    contractVersion,
    validatedAt: "2026-08-11T12:00:00.000Z",
    publishable: issues.length === 0,
    requiresManualReview: false,
    issues,
    warnings: [],
    passedRuleCodes: [],
  });
  const course = {
    id: courseId,
    courseId,
    topic: "Evidence classification",
    mission: "Classify observations and inferences.",
    level: "Foundations",
    isPublic: false,
    canManage: true,
    generatedLessonIds: ["0-0"],
    modules: [{ title: "Evidence", description: "Classify evidence.", lessons: [{ title: "Classify", concept: "Evidence" }] }],
  };
  const repairActions: string[] = [];
  await page.route(`**/api/courses/${courseId}`, (route) => {
    if (route.request().method() === "PATCH") {
      return route.fulfill({ status: 409, json: { error: "Automatic repair is available.", validationReport: report(baseHash, [issue]) } });
    }
    return route.fulfill({ json: course });
  });
  await page.route(`**/api/progress?courseId=${courseId}`, (route) => route.fulfill({ json: { progress: null } }));
  await page.route(`**/api/courses/${courseId}/repair`, async (route) => {
    const body = route.request().postDataJSON() as { action: string };
    repairActions.push(body.action);
    await route.fulfill({ json: body.action === "apply" ? {
      success: true,
      repairId: "9f179477-34da-4d75-bc4a-80f2b1d08741",
      undoAvailable: true,
      validationReport: report(repairedHash, []),
    } : {
      success: true,
      undone: true,
      repairId: "9f179477-34da-4d75-bc4a-80f2b1d08741",
      validationReport: report(baseHash, [issue]),
    } });
  });

  await page.goto(`/course/Evidence%20classification?id=${courseId}`);
  await page.locator("details.course-owner-controls > summary").click();
  await page.getByRole("button", { name: "Publish course" }).click();
  await expect(page.getByText(/accessible fallback is derived from existing lesson text/i)).toBeVisible();
  await page.getByRole("button", { name: "Apply safe fixes" }).click();
  await expect(page.getByText("Safe fix applied and the complete course was revalidated.")).toBeVisible();
  expect((await new AxeBuilder({ page }).include(".publication-contract-report").analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Undo last safe fix" }).click();
  await expect(page.getByText("Safe fix undone without overwriting newer edits.")).toBeVisible();
  expect(repairActions).toEqual(["apply", "undo"]);
});

test("publication failures preserve complete lessons and link to the affected content", async ({ page }) => {
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
  await page.getByRole("button", { name: "Publish course" }).click();
  await expect(page.getByText(/Filosage will not replace complete lessons or author edits automatically/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open affected lesson" })).toHaveCount(2);
  await expect(page.getByRole("button", { name: /Repair all|Regenerate lesson/ })).toHaveCount(0);
  expect(calls).toEqual([]);
  await expect(page.getByRole("button", { name: "Regenerate lesson" })).toHaveCount(0);
});
