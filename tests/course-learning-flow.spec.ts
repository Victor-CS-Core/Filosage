import { expect, test, type Page } from "@playwright/test";
import type { Course, LessonData } from "../src/lib/course-types";
import type { CapstoneAssessment, CourseProgress, ProgressUpdate } from "../src/lib/learning-types";
import type { LearningOutcomePlan, MasteryEvidence } from "../src/lib/mastery";
import { mockFreeLearnerAccount, restoreLocalLearner } from "./fixtures/local-learner";

const courseId = "published-course-flow";
const topic = "Decision quality";
const assessedAt = "2026-08-03T14:00:00.000Z";

const course: Course = {
  id: courseId,
  courseId,
  topic,
  mission: "Make a defensible decision from incomplete evidence.",
  outcome: "Diagnose a decision and defend the next action with evidence.",
  level: "Foundations",
  estimatedMinutes: 35,
  category: "Product",
  audience: "Product practitioners making consequential decisions with incomplete evidence.",
  artifact: {
    title: "Evidence-backed decision brief",
    description: "A concise decision record that separates observations from interpretation and defines a reversible action.",
    format: "One-page decision memo",
  },
  scenario: {
    title: "Onboarding release review",
    context: "A product team must decide how to respond to weaker onboarding completion after a release.",
    stakes: "Acting too broadly wastes effort, while waiting too long leaves a real user problem unresolved.",
  },
  sourcePack: [{
    id: "source-1",
    label: "Decision quality field guide",
    url: "https://example.com/decision-quality",
    author: "A. Researcher",
    publisher: "Evidence Institute",
    publicationDate: "2026-07-15",
    accessedAt: "2026-08-13",
    kind: "author-provided",
    rights: "link-only",
    reviewStatus: "verified",
    reviewedAt: assessedAt,
  }],
  isPublic: true,
  aiAssisted: true,
  modules: [{
    title: "Evidence and action",
    description: "Move from observation to a defensible action.",
    objective: "Separate evidence from inference and choose a proportionate action.",
    challenge: {
      title: "Decision checkpoint",
      prompt: "Explain which evidence changes the decision.",
      successCriteria: ["Names the evidence", "Explains the tradeoff"],
    },
    milestone: {
      title: "Evidence and action checkpoint",
      deliverable: "A classified evidence record and bounded next action",
      evidence: "Every claim is labeled as observation or interpretation, with a rollback condition.",
    },
    lessons: [
      {
        title: "Evidence before inference",
        concept: "Separate what was observed from what it might mean.",
        objective: "Classify evidence and inference in a decision record.",
        estimatedMinutes: 12,
        lessonMode: "worked-example",
        practiceType: "classify",
        misconception: "A plausible explanation is the same as an observation.",
        activityPreview: "Trace an expert as they separate a measured change from the story attached to it.",
        artifactContribution: "Produces the evidence section of the final decision brief.",
        sourceIds: ["source-1"],
      },
      {
        title: "Choose the next action",
        concept: "Match the action to the strength of the evidence.",
        objective: "Choose a reversible action under uncertainty.",
        estimatedMinutes: 12,
        lessonMode: "case-study",
        practiceType: "decide",
        misconception: "Every uncertain decision needs more research before acting.",
        activityPreview: "Review an evidence packet, compare competing interpretations, and choose a bounded action.",
        artifactContribution: "Produces the recommendation and rollback section of the final decision brief.",
      },
    ],
  }],
  capstone: {
    title: "Decision brief",
    brief: "Use a real decision to distinguish evidence, inference, and the next reversible action.",
    deliverable: "A one-page decision brief",
    successCriteria: [
      "Separates observations from interpretations",
      "Explains the material tradeoff",
      "Defends a proportionate next action",
    ],
  },
};

const lessonOne: LessonData = {
  aiAssisted: true,
  learningObjective: "Classify evidence and inference in a decision record.",
  connection: "This distinction prevents a plausible story from being treated as proof.",
  interactions: [{
    id: "interaction-classification-test",
    type: "classification",
    title: "Sort the decision record",
    summary: "Separate direct observations from explanations added to them.",
    version: 1,
    prompt: "Classify each statement before continuing.",
    groups: ["Evidence", "Inference"],
    items: [
      { label: "Three users abandoned the flow", groupIndex: 0, explanation: "This is a recorded observation." },
      { label: "The copy caused abandonment", groupIndex: 1, explanation: "This adds a causal explanation." },
      { label: "Support contacts rose by 12%", groupIndex: 0, explanation: "This is a measurable record." },
    ],
  }],
  experience: {
    type: "worked-example",
    scenario: "A support queue grew immediately after a release, and the team is ready to blame the new workflow.",
    steps: [
      { title: "Record the observation", reasoning: "Use only what the queue record can verify.", output: "The queue increased from 20 to 34 items." },
      { title: "Isolate the inference", reasoning: "Name the causal story that has not yet been tested.", output: "The release caused the increase." },
      { title: "Choose the next check", reasoning: "Look for evidence that could distinguish the release from other explanations.", output: "Compare arrival volume, handling time, and affected issue types." },
    ],
    fadingPrompt: "A second team reports slower handoffs after the same release. Complete the classification and name the next discriminating check without using the worked labels.",
  },
  content: "## Inspect the record\n\nEvidence reports what was observed. An inference explains what that observation may mean.\n\n## Test the explanation\n\nLook for a second observation that could distinguish the plausible stories.",
  guidedPractice: {
    prompt: "A support queue grew from 20 to 34 items after a release. Classify the observation and the interpretation.",
    steps: ["Underline the measured change.", "Name the explanation that still needs support."],
    modelAnswer: "The queue increase is observed; the claim that the release caused it is an inference.",
  },
  keyTakeaways: [
    "Observations can be checked against a record.",
    "Inferences add meaning to observations.",
    "Decisions should keep the distinction visible.",
  ],
  transferTask: {
    prompt: "Apply the distinction to a product decision you could make this week.",
    successCriteria: ["Names an observation", "Names the interpretation"],
    modelResponse: "Three users abandoned the flow is observed; confusing copy caused it is an interpretation to test.",
  },
  quizzes: [
    {
      question: "Which statement is direct evidence?",
      options: [
        "The release confused customers",
        "Three of ten users abandoned the flow",
        "The team should redesign onboarding",
        "The metric will recover next week",
      ],
      correctIndex: 1,
      explanation: "A recorded count is directly observable.",
      optionFeedback: [
        "This proposes a cause rather than reporting an observation.",
        "This is the recorded observation.",
        "This recommends an action.",
        "This predicts a future result.",
      ],
    },
    {
      question: "What should happen before accepting an inference?",
      options: [
        "Check whether the evidence supports it",
        "Rewrite it as a metric",
        "Ask whether it sounds confident",
        "Remove every uncertainty",
      ],
      correctIndex: 0,
      explanation: "An inference earns confidence from supporting evidence.",
      optionFeedback: [
        "Evidence should support the interpretation.",
        "A rewrite does not validate the claim.",
        "Confidence is not evidence.",
        "Useful decisions rarely eliminate every uncertainty.",
      ],
    },
  ],
  citations: [{
    id: "citation-1",
    sourceId: "source-1",
    claim: "Evidence reports what was observed.",
    section: "content",
    objectiveIds: ["objective-m0-l0"],
    reviewStatus: "verified",
    reviewedAt: assessedAt,
  }],
  provenance: {
    contentVersion: "lesson-v5",
    citations: [{
      id: "citation-1",
      sourceId: "source-1",
      claim: "Evidence reports what was observed.",
      section: "content",
      objectiveIds: ["objective-m0-l0"],
      reviewStatus: "verified",
      reviewedAt: assessedAt,
    }],
    sources: [{
      id: "source-1",
      label: "Decision quality field guide",
      url: "https://example.com/decision-quality",
      author: "A. Researcher",
      publisher: "Evidence Institute",
      publicationDate: "2026-07-15",
      accessedAt: "2026-08-13",
      kind: "author-provided",
      rights: "link-only",
      reviewStatus: "verified",
      reviewedAt: assessedAt,
    }],
  },
};

const lessonTwo: LessonData = {
  aiAssisted: true,
  learningObjective: "Choose a reversible action under uncertainty.",
  connection: "Once evidence and inference are separate, the next action can match what is actually known.",
  experience: {
    type: "case-study",
    brief: "Onboarding completion fell after new copy shipped, but the release also changed eligibility and traffic mix.",
    evidence: [
      { label: "Completion", detail: "Completion fell from 72% to 65% in the first week." },
      { label: "Traffic mix", detail: "The share of first-time mobile visitors rose by 18%." },
      { label: "Support", detail: "Questions about eligibility increased, while copy-related questions did not." },
    ],
    interpretations: [
      "The copy may contribute, but the traffic and eligibility changes prevent a confident causal claim.",
      "A segmented pilot can distinguish the copy effect while limiting downside.",
    ],
    decisionPrompt: "Choose a next action and identify which evidence makes it proportionate.",
  },
  content: "## Match action to evidence\n\nPrefer a reversible step when the evidence is incomplete and the cost of learning is low.",
  guidedPractice: {
    prompt: "A new workflow may reduce handoff time, but only one team has tried it.",
    steps: ["Name what the pilot established.", "Choose a reversible next step."],
    modelAnswer: "Expand to one comparable team with a clear rollback point before a company-wide change.",
  },
  keyTakeaways: [
    "Reversible actions create evidence.",
    "The size of the action should match confidence.",
    "A rollback point limits downside.",
  ],
  transferTask: {
    prompt: "Choose a reversible next step for a decision with incomplete evidence.",
    successCriteria: ["Names the uncertainty", "Defines a rollback point"],
    modelResponse: "Run the change with one team for two weeks and revert if handoff time or error rate worsens.",
  },
  quizzes: [
    {
      question: "Which action best matches weak but promising evidence?",
      options: [
        "Roll it out everywhere",
        "Wait until uncertainty disappears",
        "Run a bounded pilot with a rollback point",
        "Ignore the evidence",
      ],
      correctIndex: 2,
      explanation: "A bounded pilot learns while limiting downside.",
      optionFeedback: [
        "A full rollout exceeds the strength of the evidence.",
        "Waiting for certainty can prevent useful learning.",
        "A bounded pilot matches the evidence and remains reversible.",
        "Ignoring evidence does not improve the decision.",
      ],
    },
    {
      question: "What makes an action reversible?",
      options: [
        "It has a clear rollback condition",
        "It has executive sponsorship",
        "It is described confidently",
        "It affects every customer",
      ],
      correctIndex: 0,
      explanation: "A rollback condition defines when and how to undo the action.",
      optionFeedback: [
        "A clear rollback condition makes reversal operational.",
        "Sponsorship does not make an action reversible.",
        "Tone does not change reversibility.",
        "Broad impact usually makes reversal harder.",
      ],
    },
  ],
};

async function completeQuiz(
  page: Page,
  options: {
    recall: string;
    correctAnswer: string;
    confidence: "Unsure" | "Mostly sure" | "Certain";
    wrongAnswer?: string;
    continueToNext?: boolean;
  },
) {
  const check = page.locator(".knowledge-check");
  await expect(check).toHaveCount(1);
  await check.getByLabel("Start from memory").fill(options.recall);
  await check.getByRole("button", { name: "Reveal answer choices" }).click();
  await expect(check.getByText(options.recall)).toBeVisible();
  if (options.wrongAnswer) {
    await check.getByRole("button", { name: options.wrongAnswer, exact: false }).click();
    await expect(check.getByText("Not quite")).toBeVisible();
    await check.getByRole("button", { name: "Try again" }).click();
  }
  await check.getByRole("button", { name: options.correctAnswer, exact: false }).click();
  await expect(check.getByText("Correct", { exact: true })).toBeVisible();
  await check.getByRole("button", { name: options.confidence, exact: true }).click();
  if (options.continueToNext) {
    await check.getByRole("button", { name: /Continue to practice/ }).click();
  }
}

async function completeTransfer(page: Page, response: string, modelResponse: string) {
  const transfer = page.locator(".transfer-practice");
  await transfer.getByLabel("Your response").fill(response);
  await transfer.getByRole("button", { name: "Compare response" }).click();
  await expect(transfer.getByText(modelResponse)).toBeVisible();
}

test("starts one resilient generation request for an owner-only lesson", async ({ page }) => {
  await restoreLocalLearner(page);
  await page.route("**/api/account", (route) => route.fulfill({
    json: {
      access: "pro",
      plan: "pro",
      isOwner: true,
      accountStatus: "active",
      displayName: "Playwright Owner",
      legalAcceptanceRequired: false,
      quotas: [],
    },
  }));
  await page.route("**/api/courses?scope=mine", (route) => route.fulfill({ json: { courses: [] } }));
  await page.route(`**/api/courses/${courseId}`, (route) => route.fulfill({
    json: { ...course, isPublic: false, canManage: true },
  }));

  let generated = false;
  let generationRequests = 0;
  await page.route(`**/api/courses/${courseId}/lessons/0-0`, (route) => generated
    ? route.fulfill({ json: lessonOne })
    : route.fulfill({ status: 404, json: { error: "This lesson has not been published yet." } }));
  await page.route("**/api/generate-lesson", async (route) => {
    generationRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 450));
    generated = true;
    return route.fulfill({ json: lessonOne });
  });

  await page.goto(`/course/${encodeURIComponent(topic)}/lesson/0-0?id=${courseId}`);
  await expect(page.getByText("Preparing your next lesson")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evidence before inference" })).toBeVisible();
  expect(generationRequests).toBe(1);
});

test("opens and generates the next lesson in a fresh document", async ({ page }) => {
  await restoreLocalLearner(page);
  await page.route("**/api/account", (route) => route.fulfill({
    json: {
      access: "pro",
      plan: "pro",
      isOwner: true,
      accountStatus: "active",
      displayName: "Playwright Owner",
      legalAcceptanceRequired: false,
      quotas: [],
    },
  }));
  await page.route("**/api/courses?scope=mine", (route) => route.fulfill({ json: { courses: [] } }));
  await page.route(`**/api/courses/${courseId}`, (route) => route.fulfill({
    json: { ...course, isPublic: false, canManage: true },
  }));

  let generated = false;
  let generationRequests = 0;
  await page.route(`**/api/courses/${courseId}/lessons/0-0`, (route) => route.fulfill({ json: lessonOne }));
  await page.route(`**/api/courses/${courseId}/lessons/0-1`, (route) => generated
    ? route.fulfill({ json: lessonTwo })
    : route.fulfill({ status: 404, json: { error: "This lesson has not been published yet." } }));
  await page.route("**/api/generate-lesson", async (route) => {
    generationRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 1_800));
    generated = true;
    return route.fulfill({ json: lessonTwo });
  });

  await page.goto(`/course/${encodeURIComponent(topic)}/lesson/0-0?id=${courseId}`);
  await expect(page.getByRole("heading", { name: "Evidence before inference" })).toBeVisible();
  await page.getByRole("link", { name: /Next lesson Choose the next action/ }).click();

  await expect(page.getByText("Preparing your next lesson")).toBeVisible();
  await expect.poll(async () => Number(await page.getByRole("progressbar", { name: "Lesson generation progress" }).getAttribute("aria-valuenow"))).toBeGreaterThan(8);
  await expect(page.getByRole("heading", { name: "Choose the next action" })).toBeVisible();
  expect(generationRequests).toBe(1);
  expect(await page.evaluate(() => (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming).name)).toContain("/lesson/0-1");
});

test("explains a short-lived generation lock instead of hiding the 429", async ({ page }) => {
  await restoreLocalLearner(page);
  await page.route("**/api/account", (route) => route.fulfill({
    json: {
      access: "pro",
      plan: "pro",
      isOwner: true,
      accountStatus: "active",
      displayName: "Playwright Owner",
      legalAcceptanceRequired: false,
      quotas: [],
    },
  }));
  await page.route("**/api/courses?scope=mine", (route) => route.fulfill({ json: { courses: [] } }));
  await page.route(`**/api/courses/${courseId}`, (route) => route.fulfill({
    json: { ...course, isPublic: false, canManage: true },
  }));
  await page.route(`**/api/courses/${courseId}/lessons/0-0`, (route) => route.fulfill({
    status: 404,
    json: { error: "This lesson has not been published yet." },
  }));
  await page.route("**/api/generate-lesson", (route) => route.fulfill({
    status: 429,
    json: {
      error: "Another AI request is already in progress for this feature.",
      code: "GENERATION_IN_PROGRESS",
      resetAt: new Date(Date.now() + 30_000).toISOString(),
    },
  }));

  await page.goto(`/course/${encodeURIComponent(topic)}/lesson/0-0?id=${courseId}`);
  await expect(page.getByText(/A previous lesson attempt is still closing\. Try again in about \d+ seconds\./)).toBeVisible();
});

test("completes a published course from discovery through evidence", async ({ page }) => {
  test.slow();
  await restoreLocalLearner(page);
  await mockFreeLearnerAccount(page);

  let masteryPlan: LearningOutcomePlan | null = null;
  const masteryEvidence: MasteryEvidence[] = [];
  const progressUpdates: ProgressUpdate[] = [];
  const completedLessonIds: string[] = [];
  const lessonProgress: CourseProgress["lessons"] = {};
  const baselineSubmissions: string[] = [];
  const capstoneSubmissions: string[] = [];
  const tutorQuestions: string[] = [];
  const sourceReports: Array<{ sourceId: string; category: string; note: string }> = [];
  let capstoneAssessment: CapstoneAssessment | undefined;

  const currentProgress = (): CourseProgress | null => completedLessonIds.length || capstoneAssessment
    ? {
      courseId,
      topic,
      lastLessonId: completedLessonIds.at(-1) ?? "0-0",
      lastLessonTitle: completedLessonIds.at(-1) === "0-1" ? "Choose the next action" : "Evidence before inference",
      nextLessonId: completedLessonIds.includes("0-1") ? null : "0-1",
      nextLessonTitle: completedLessonIds.includes("0-1") ? null : "Choose the next action",
      completedLessonIds: [...completedLessonIds],
      lessons: lessonProgress,
      totalLessons: 2,
      studyMinutes: completedLessonIds.length * 12,
      lastActivityAt: assessedAt,
      startedAt: assessedAt,
      capstone: capstoneAssessment,
    }
    : null;

  await page.route("**/api/course-banners/**", (route) => route.fulfill({
    contentType: "image/svg+xml",
    body: "<svg xmlns='http://www.w3.org/2000/svg' width='1536' height='1024'><rect width='100%' height='100%' fill='#0D1B3D'/></svg>",
  }));
  await page.route("**/api/courses?scope=public", (route) => route.fulfill({ json: { courses: [course] } }));
  await page.route(`**/api/courses/${courseId}`, (route) => route.fulfill({ json: course }));
  await page.route(`**/api/courses/${courseId}/lessons/*`, (route) => {
    const requestedLesson = route.request().url().split("/").at(-1);
    return route.fulfill({ json: requestedLesson === "0-1" ? lessonTwo : lessonOne });
  });
  await page.route("**/api/progress*", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      const singleCourse = new URL(request.url()).searchParams.has("courseId");
      return route.fulfill({ json: { progress: singleCourse ? currentProgress() : [currentProgress()].filter(Boolean) } });
    }
    const update = request.postDataJSON() as ProgressUpdate;
    progressUpdates.push(update);
    if (!update.review && !completedLessonIds.includes(update.lessonId)) completedLessonIds.push(update.lessonId);
    lessonProgress[update.lessonId] = {
      lessonId: update.lessonId,
      lessonTitle: update.lessonTitle,
      status: "learned",
      attempts: update.attempts,
      totalQuestions: update.totalQuestions,
      firstAttemptCorrect: update.firstAttemptCorrect,
      confidence: update.confidence,
      calibration: "calibrated",
      performanceBand: "secure",
      intervalStage: 1,
      nextReviewAt: "2026-08-10T14:00:00.000Z",
      lastStudiedAt: assessedAt,
      completedAt: assessedAt,
      estimatedMinutes: update.estimatedMinutes,
      experienceEvidence: update.activityEvidence?.experienceEvidence,
    };
    return route.fulfill({
      json: {
        progress: currentProgress(),
        nextReviewAt: "2026-08-10T14:00:00.000Z",
        calibration: "calibrated",
      },
    });
  });
  await page.route("**/api/mastery", async (route) => {
    const request = route.request();
    if (request.method() === "PUT") {
      masteryPlan = request.postDataJSON() as LearningOutcomePlan;
      return route.fulfill({ json: { plan: masteryPlan } });
    }
    const evidence = request.postDataJSON() as MasteryEvidence;
    const existingIndex = masteryEvidence.findIndex((item) => item.id === evidence.id);
    if (existingIndex >= 0) masteryEvidence[existingIndex] = evidence;
    else masteryEvidence.push(evidence);
    return route.fulfill({ json: { evidence } });
  });
  await page.route(`**/api/mastery?courseId=${courseId}`, (route) => route.fulfill({
    json: { plan: masteryPlan, evidence: masteryEvidence },
  }));
  await page.route("**/api/assess-baseline", async (route) => {
    const body = route.request().postDataJSON() as { submission: string };
    baselineSubmissions.push(body.submission);
    return route.fulfill({ json: { assessment: {
      summary: "The starting sample separates one observation but does not yet defend the tradeoff or action.",
      criteria: [
        { criterion: course.capstone!.successCriteria[0], met: true, feedback: "The observation is explicit." },
        { criterion: course.capstone!.successCriteria[1], met: false, feedback: "The tradeoff is not yet compared." },
        { criterion: course.capstone!.successCriteria[2], met: false, feedback: "The next action needs a boundary." },
      ],
      assessedAt,
      score: 33,
    } } });
  });
  await page.route("**/api/assess-capstone", async (route) => {
    const body = route.request().postDataJSON() as { submission: string };
    capstoneSubmissions.push(body.submission);
    const firstAttempt = capstoneSubmissions.length === 1;
    capstoneAssessment = firstAttempt
      ? {
        status: "needs_revision",
        summary: "The evidence is clear, but the rollback condition needs to be measurable.",
        criteria: [
          { criterion: course.capstone!.successCriteria[0], met: true, feedback: "Evidence and inference are separate." },
          { criterion: course.capstone!.successCriteria[1], met: true, feedback: "The tradeoff is explicit." },
          { criterion: course.capstone!.successCriteria[2], met: false, feedback: "Add a measurable rollback condition." },
        ],
        assessedAt,
        attempts: 1,
        history: [{
          status: "needs_revision",
          summary: "The rollback condition needs to be measurable.",
          criteria: [],
          assessedAt,
          attempt: 1,
        }],
      }
      : {
        status: "passed",
        summary: "The revised brief supports a proportionate, reversible action with explicit evidence.",
        criteria: course.capstone!.successCriteria.map((criterion) => ({ criterion, met: true, feedback: "Demonstrated in the revised brief." })),
        assessedAt: "2026-08-03T14:05:00.000Z",
        attempts: 2,
        history: [
          {
            status: "needs_revision",
            summary: "The rollback condition needs to be measurable.",
            criteria: [],
            assessedAt,
            attempt: 1,
          },
          {
            status: "passed",
            summary: "The revised action is measurable and reversible.",
            criteria: [],
            assessedAt: "2026-08-03T14:05:00.000Z",
            attempt: 2,
          },
        ],
      };
    return route.fulfill({ json: { assessment: capstoneAssessment } });
  });
  await page.route("**/api/chat", async (route) => {
    const body = route.request().postDataJSON() as { messages: Array<{ role: string; content: string }> };
    tutorQuestions.push(body.messages.at(-1)?.content ?? "");
    return route.fulfill({
      contentType: "text/plain; charset=utf-8",
      body: "Evidence is observed; an inference is the explanation added to it.",
    });
  });
  await page.route("**/api/content-reports", async (route) => {
    sourceReports.push(route.request().postDataJSON() as { sourceId: string; category: string; note: string });
    return route.fulfill({ json: { reported: true, quarantined: false } });
  });

  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Find your next course." })).toBeVisible();
  await page.getByRole("link", { name: /Open Decision quality/i }).click();
  await expect(page.getByRole("heading", { level: 1, name: topic })).toBeVisible();
  await expect(page.locator("details.course-disclosure[open]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Modules and lessons" })).toHaveCount(0);
  const artifactDisclosure = page.locator("details.course-apprenticeship");
  await expect(artifactDisclosure).not.toHaveAttribute("open", "");
  await artifactDisclosure.locator("summary").press("Enter");
  await expect(artifactDisclosure).toHaveAttribute("open", "");
  await expect(page.getByRole("heading", { name: "Evidence-backed decision brief" })).toBeVisible();
  const journey = page.getByRole("region", { name: "See what each stage produces" });
  await expect(journey).toBeVisible();
  const currentStage = journey.getByRole("button", { name: /Current stage/ });
  await expect(currentStage).toHaveAttribute("aria-expanded", "false");
  if ((page.viewportSize()?.width ?? 0) >= 900) {
    const triggerBox = await currentStage.boundingBox();
    const copyBox = await currentStage.locator(".journey-stage-copy").boundingBox();
    const progressBox = await currentStage.locator(".journey-stage-progress").boundingBox();
    expect(triggerBox?.height).toBeLessThan(150);
    expect(copyBox?.width).toBeGreaterThan(240);
    expect(progressBox?.width).toBeLessThan(190);
  }
  await expect(journey.getByText("A classified evidence record and bounded next action")).not.toBeVisible();
  await currentStage.click();
  await expect(currentStage).toHaveAttribute("aria-expanded", "true");
  await expect(journey.getByText("A classified evidence record and bounded next action")).toBeVisible();
  await expect(journey.locator(".journey-lesson-links button")).toHaveCount(2);
  const sourceLink = page.getByRole("link", { name: /Decision quality field guide/ });
  await expect(page.getByText("Course evidence")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Course references" })).toBeVisible();
  await expect(page.getByText(/Evidence Institute.*author provided.*legacy source.*link only/)).toBeVisible();
  await expect(sourceLink).toHaveAttribute("href", "https://example.com/decision-quality");
  await expect(sourceLink).toHaveAttribute("rel", "nofollow ugc noreferrer");
  await page.getByRole("button", { name: "Report source" }).click();
  await page.getByLabel("What should the owner review?").fill("Confirm that this destination still supports the author note.");
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("Source report received for owner review.")).toBeVisible();
  expect(sourceReports).toEqual([{ courseId, sourceId: "source-1", category: "source", note: "Confirm that this destination still supports the author note." }]);
  await expect(page.getByText("Complete every lesson before submitting the capstone.")).toBeVisible();
  await expect(page.getByText("Decision checkpoint")).toBeVisible();

  const outcomeDisclosure = page.locator("details.outcome-onboarding");
  await expect(outcomeDisclosure).not.toHaveAttribute("open", "");
  await outcomeDisclosure.locator("summary").press("Enter");
  await expect(outcomeDisclosure).toHaveAttribute("open", "");

  await page.getByPlaceholder("Make the capability specific and observable.").fill(
    "Diagnose a risky product decision and defend a reversible next action.",
  );
  await page.getByLabel("Where will you use it?").fill("In the launch-readiness review for a new onboarding flow.");
  await page.getByLabel("What will prove you can do it?").fill("A one-page decision brief with a rollback condition.");
  await page.getByRole("radiogroup", { name: "Current level for Evidence and action" }).getByText("I recognize it").click();
  await page.getByRole("button", { name: "Build my learning route" }).click();
  await expect(page.getByRole("heading", { name: "Diagnose a risky product decision and defend a reversible next action." })).toBeVisible();
  await expect.poll(() => masteryPlan?.applicationContext).toBe("In the launch-readiness review for a new onboarding flow.");

  const baseline = "My starting brief records that three of ten users abandoned onboarding, but it assumes the new copy caused the exits and recommends a full redesign without comparing cost, uncertainty, or a rollback condition.";
  await page.getByLabel("Starting capstone sample").fill(baseline);
  await page.getByRole("button", { name: "Assess starting point" }).click();
  await expect(page.getByText("33% of capstone criteria demonstrated before study")).toBeVisible();
  expect(baselineSubmissions).toEqual([baseline]);

  await page.getByRole("link", { name: "Start with Evidence and action" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Evidence before inference" })).toBeVisible();
  await expect(page.getByText("Evidence reports what was observed.", { exact: true })).toBeVisible();
  await expect(page.getByText("Owner verified for publication", { exact: true })).toBeVisible();
  const citationLink = page.getByRole("link", { name: /Decision quality field guide, opens example.com/ });
  await expect(citationLink).toHaveAttribute("href", "https://example.com/decision-quality");
  await expect(citationLink).toContainText("Evidence Institute");
  await expect(page.getByRole("navigation", { name: "Lesson sections" })).toBeVisible();
  const classification = page.getByRole("region", { name: "Sort the decision record" });
  await classification.getByRole("group", { name: "Classify Three users abandoned the flow" }).getByRole("button", { name: "Evidence" }).click();
  await classification.getByRole("group", { name: "Classify The copy caused abandonment" }).getByRole("button", { name: "Inference" }).click();
  await classification.getByRole("group", { name: "Classify Support contacts rose by 12%" }).getByRole("button", { name: "Evidence" }).click();
  await classification.getByRole("button", { name: "Check classification" }).click();
  await expect(classification.getByText("3 of 3 placed correctly.")).toBeVisible();
  await page.getByRole("tab", { name: /Activities/ }).click();
  await expect(page.getByRole("heading", { name: "Follow the expert reasoning" })).toBeVisible();
  await expect(page.getByText("Compare arrival volume, handling time, and affected issue types.")).toBeVisible();
  const nextActivity = page.getByRole("button", { name: "Next activity" });
  await expect(nextActivity).toBeDisabled();
  await expect(page.getByText("Complete and save this activity to continue.")).toBeVisible();
  const workedExampleEvidence = "I would compare the second team's arrival volume, handling time, and issue mix before attributing slower handoffs to the release.";
  await page.getByLabel("Your unsupported finish").fill(workedExampleEvidence);
  await page.getByRole("button", { name: "Save unsupported finish" }).click();
  await expect(page.getByText("Ready for lesson completion.")).toBeVisible();
  await expect(nextActivity).toBeEnabled();
  await expect(page.getByText("Complete and save this activity to continue.")).toHaveCount(0);
  await page.getByRole("tab", { name: /Guided practice/ }).click();
  await expect(page.getByRole("heading", { name: "Work through the idea" })).toBeVisible();
  await page.getByText("Compare with a worked response").click();
  await expect(page.getByText("The queue increase is observed; the claim that the release caused it is an inference.")).toBeVisible();
  const firstTransfer = "Three of ten users abandoned the flow is observed; confusing copy caused it is an inference I still need to test.";
  await page.getByRole("tab", { name: /Transfer task/ }).click();
  await completeTransfer(page, firstTransfer, lessonOne.transferTask!.modelResponse);
  await page.getByRole("tab", { name: /Knowledge checks/ }).click();
  await completeQuiz(page, {
    recall: "A recorded observation can be checked directly.",
    wrongAnswer: "The release confused customers",
    correctAnswer: "Three of ten users abandoned the flow",
    confidence: "Mostly sure",
    continueToNext: true,
  });
  await completeQuiz(page, {
    recall: "Test whether the available evidence supports the explanation.",
    correctAnswer: "Check whether the evidence supports it",
    confidence: "Certain",
  });
  await expect(page.locator(".completion-banner").getByText("Lesson complete")).toBeVisible();
  await expect.poll(() => progressUpdates.length).toBe(1);
  expect(progressUpdates[0]).toMatchObject({
    courseId,
    lessonId: "0-0",
    totalQuestions: 2,
    firstAttemptCorrect: 1,
    attempts: 3,
    confidence: "medium",
    activityEvidence: {
      transferResponse: firstTransfer,
      experienceEvidence: { type: "worked-example", response: workedExampleEvidence, completed: true },
      quizResults: [
        { quizIndex: 0, attempts: 2, firstAttemptCorrect: false, confidence: "medium" },
        { quizIndex: 1, attempts: 1, firstAttemptCorrect: true, confidence: "high" },
      ],
    },
  });

  await page.getByRole("button", { name: "Ask Filosage" }).click();
  const tutor = page.getByRole("dialog", { name: "Ask Filosage" });
  await tutor.getByLabel("Ask about this lesson").fill("How is an inference different from evidence?");
  await tutor.getByRole("button", { name: "Send question" }).click();
  await expect(tutor.getByText("Evidence is observed; an inference is the explanation added to it.")).toBeVisible();
  expect(tutorQuestions).toEqual(["How is an inference different from evidence?"]);
  await tutor.getByRole("button", { name: "Close tutor" }).click();

  await page.getByRole("link", { name: /Next lesson Choose the next action/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Choose the next action" })).toBeVisible();
  await page.getByRole("tab", { name: /Activities/ }).click();
  await expect(page.getByRole("heading", { name: "Make sense of the evidence" })).toBeVisible();
  const caseStudy = page.locator(".experience-case-study");
  const caseStudyEvidence = "Run a segmented copy pilot because traffic mix and eligibility changed at the same time, then roll back if completion worsens.";
  await caseStudy.getByLabel("Your decision").fill(caseStudyEvidence);
  await page.reload();
  await page.getByRole("tab", { name: /Activities/ }).click();
  await expect(page.locator(".experience-case-study").getByLabel("Your decision")).toHaveValue(caseStudyEvidence);
  const reloadedCaseStudy = page.locator(".experience-case-study");
  await reloadedCaseStudy.getByRole("button", { name: "Compare interpretations" }).click();
  await expect(reloadedCaseStudy.getByText("A segmented pilot can distinguish the copy effect while limiting downside.")).toBeVisible();
  const secondTransfer = "I would pilot the onboarding copy with one segment and roll it back if completion or support demand worsens after two weeks.";
  await page.getByRole("tab", { name: /Transfer task/ }).click();
  await completeTransfer(page, secondTransfer, lessonTwo.transferTask!.modelResponse);
  await page.getByRole("tab", { name: /Knowledge checks/ }).click();
  await completeQuiz(page, {
    recall: "Use a bounded experiment when evidence is promising but incomplete.",
    correctAnswer: "Run a bounded pilot with a rollback point",
    confidence: "Certain",
    continueToNext: true,
  });
  await completeQuiz(page, {
    recall: "Define the condition that triggers undoing the change.",
    correctAnswer: "It has a clear rollback condition",
    confidence: "Certain",
  });
  await expect(page.locator(".completion-banner").getByText("Lesson complete")).toBeVisible();
  await expect.poll(() => progressUpdates.length).toBe(2);
  expect(progressUpdates[1]).toMatchObject({
    lessonId: "0-1",
    totalQuestions: 2,
    firstAttemptCorrect: 2,
    attempts: 2,
    activityEvidence: {
      transferResponse: secondTransfer,
      experienceEvidence: { type: "case-study", response: caseStudyEvidence, completed: true },
    },
  });

  await page.locator(".lesson-toolbar nav").getByRole("link", { name: topic }).click();
  await expect(page.getByRole("progressbar", { name: "Course progress" })).toHaveAttribute("aria-valuenow", "100");
  await expect(page.getByLabel("Submit your capstone for assessment")).toBeVisible();

  const firstCapstone = "The observed evidence is that three of ten users abandoned onboarding after the release. Confusing copy is an inference. I would pilot revised copy with one segment because this limits downside, but the first draft does not yet define a measurable rollback threshold.";
  await page.getByLabel("Submit your capstone for assessment").fill(firstCapstone);
  await page.getByRole("button", { name: "Submit for assessment" }).click();
  await expect(page.getByText("Not there yet · attempt 1")).toBeVisible();
  await expect(page.getByText("Add a measurable rollback condition.")).toBeVisible();

  const revisedCapstone = "The observed evidence is that three of ten users abandoned onboarding after the release. Confusing copy is an inference. I would pilot revised copy with one segment for two weeks, compare completion and support demand, and roll back if completion falls by five percent or support demand rises by ten percent.";
  await page.getByLabel("Revise and resubmit your capstone").fill(revisedCapstone);
  await page.getByRole("button", { name: "Submit for assessment" }).click();
  const capstone = page.locator(".course-capstone");
  await expect(capstone.getByText("Capstone passed", { exact: true })).toBeVisible();
  await expect(capstone.getByText("View revision history (2 attempts)")).toBeVisible();
  expect(capstoneSubmissions).toEqual([firstCapstone, revisedCapstone]);

  await page.getByRole("link", { name: "View evidence" }).click();
  await expect(page).toHaveURL(new RegExp(`/evidence/${courseId}$`));
  await expect(page.getByRole("heading", { name: "Evidence by objective" })).toBeVisible();
  await expect(page.getByText("+67 pts")).toBeVisible();
  await expect(page.getByText("Demonstrated", { exact: true })).toBeVisible();
  await expect(page.getByText("Capstone demonstrated: Separate evidence from inference and choose a proportionate action.")).toBeVisible();

  await page.goto("/progress");
  await expect(page.getByRole("heading", { name: "How your understanding is holding up" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Work you saved while learning" })).toBeVisible();
  await expect(page.getByText(workedExampleEvidence)).toBeVisible();
});

test("recovers when the review schedule cannot be loaded", async ({ page }) => {
  await restoreLocalLearner(page);
  await mockFreeLearnerAccount(page);
  await page.route("**/api/progress*", (route) => route.fulfill({ status: 503, json: { error: "Temporarily unavailable" } }));
  await page.goto("/review");
  await expect(page.getByRole("heading", { name: "Your schedule is safe." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore courses" })).toBeVisible();
});

test("completes every rich lesson mode and records its active evidence", async ({ page }) => {
  test.slow();
  await restoreLocalLearner(page);
  await mockFreeLearnerAccount(page);
  const richCourseId = "six-mode-course";
  const richTopic = "Applied reasoning studio";
  const experiences: Array<NonNullable<LessonData["experience"]>> = [
    { type: "concept", predictionPrompt: "Predict what changes the decision.", mentalModel: { title: "Decision model", parts: [{ label: "Evidence", role: "Constrains the claim" }, { label: "Action", role: "Matches confidence" }] }, misconceptionCheck: { claim: "More confidence means more evidence.", correction: "Confidence should follow evidence, not replace it." } },
    { type: "worked-example", scenario: "A team investigates a falling metric.", steps: [{ title: "Observe", reasoning: "Record the change.", output: "The metric fell." }, { title: "Compare", reasoning: "Check segments.", output: "One segment changed." }, { title: "Act", reasoning: "Limit downside.", output: "Run a pilot." }], fadingPrompt: "Finish the analysis for a second segment without the worked labels." },
    { type: "comparison", options: ["Pilot", "Full rollout"], criteria: [{ criterion: "Reversibility", first: "High", second: "Low" }, { criterion: "Learning", first: "Focused", second: "Confounded" }, { criterion: "Reach", first: "Limited", second: "Broad" }], boundaryCase: { prompt: "Choose when the evidence is strong but downside remains material.", resolution: "Use a staged rollout with an explicit stop condition." } },
    { type: "case-study", brief: "A release changed copy and audience eligibility together.", evidence: [{ label: "Completion", detail: "Completion fell." }, { label: "Mix", detail: "Traffic mix shifted." }, { label: "Support", detail: "Eligibility questions rose." }], interpretations: ["Copy may contribute.", "Eligibility may explain the shift."], decisionPrompt: "Choose a bounded next action and defend it." },
    { type: "practice-lab", brief: "Create a **decision record**.", materials: ["Metric **extract**", "`Release notes`"], tasks: ["Classify **claims**", "Use the timing grid. | Signal | Meaning | | --- | --- | | Dot | 1 unit | | Dash | 3 units |", "Define rollback", "artifactPrompt", "successCriteria"], artifactPrompt: "Produce **one page**.\n\n- Label evidence\n- Name the owner", successCriteria: ["Evidence is **labeled**", "Rollback is `measurable`"] },
    { type: "synthesis", challenge: "Combine the evidence, tradeoff, and rollback into one recommendation.", connections: [{ concept: "Evidence", contribution: "Bounds confidence" }, { concept: "Reversibility", contribution: "Limits downside" }], capstoneContribution: "Complete the final recommendation.", reflectionPrompt: "Explain how the combined reasoning changes the action." },
  ];
  const labels = ["Your prediction", "Your unsupported finish", "Your boundary-case decision", "Your decision", "Your artifact record", "Your reflection"];
  const submitLabels = ["Reveal the mental model", "Save unsupported finish", "Compare with the resolution", "Compare interpretations", "Save artifact evidence", "Save synthesis evidence"];
  const richCourse: Course = {
    id: richCourseId,
    courseId: richCourseId,
    topic: richTopic,
    mission: "Practice six forms of applied reasoning.",
    outcome: "Choose and defend a proportionate action.",
    isPublic: true,
    modules: [{
      title: "Reasoning modes",
      description: "Move from prediction to synthesis.",
      lessons: experiences.map((experience, index) => ({ title: `Mode ${index + 1}: ${experience.type}`, concept: `Practice ${experience.type} reasoning.`, lessonMode: experience.type, estimatedMinutes: 5 })),
    }],
  };
  const lessons = experiences.map((experience): LessonData => ({
    content: "## Apply the mode\n\nUse the activity to produce evidence of your reasoning.",
    quizzes: [],
    experience,
  }));
  const completedLessonIds: string[] = [];
  const updates: ProgressUpdate[] = [];
  const progress = (): CourseProgress | null => completedLessonIds.length ? {
    courseId: richCourseId,
    topic: richTopic,
    lastLessonId: completedLessonIds.at(-1) ?? "",
    lastLessonTitle: "Rich mode",
    completedLessonIds: [...completedLessonIds],
    lessons: {},
    lastActivityAt: assessedAt,
    startedAt: assessedAt,
  } : null;

  await page.route(`**/api/courses/${richCourseId}`, (route) => route.fulfill({ json: richCourse }));
  await page.route(`**/api/courses/${richCourseId}/lessons/*`, (route) => {
    const currentLessonId = route.request().url().split("/").at(-1) ?? "0-0";
    const currentLessonIndex = Number(currentLessonId.split("-")[1]);
    return route.fulfill({ json: lessons[currentLessonIndex] });
  });
  await page.route("**/api/progress*", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { progress: progress() } });
    const update = route.request().postDataJSON() as ProgressUpdate;
    updates.push(update);
    if (!completedLessonIds.includes(update.lessonId)) completedLessonIds.push(update.lessonId);
    return route.fulfill({ json: { progress: progress(), nextReviewAt: "2026-08-10T14:00:00.000Z", calibration: "calibrated" } });
  });
  await page.route("**/api/mastery*", (route) => route.fulfill({ json: route.request().method() === "GET" ? { plan: null, evidence: [] } : { saved: true } }));

  await page.goto(`/course/${encodeURIComponent(richTopic)}?id=${richCourseId}`);
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  await page.emulateMedia({ forcedColors: "active" });
  await expect(page.getByRole("button", { name: "Start course" })).toBeVisible();
  await page.emulateMedia({ forcedColors: "none" });
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  await page.getByRole("button", { name: "Start course" }).click();
  for (let index = 0; index < experiences.length; index += 1) {
    await expect(page.getByRole("heading", { level: 1, name: `Mode ${index + 1}: ${experiences[index].type}` })).toBeVisible();
    await page.getByRole("tab", { name: /Activities/ }).click();
    if (index === 4) {
      await expect(page.locator(".lab-layout table")).toBeVisible();
      await expect(page.locator(".lab-layout strong", { hasText: "extract" })).toBeVisible();
      await expect(page.locator(".artifact-prompt strong", { hasText: "one page" })).toBeVisible();
      await expect(page.getByText("artifactPrompt", { exact: true })).toHaveCount(0);
      await expect(page.getByText("successCriteria", { exact: true })).toHaveCount(0);
    }
    const response = `Meaningful ${experiences[index].type} evidence that explains the learner's decision boundary.`;
    await page.getByLabel(labels[index]).fill(response);
    await page.getByRole("button", { name: submitLabels[index] }).click();
    await page.getByRole("button", { name: "Mark learned" }).click();
    await expect(page.locator(".completion-banner").getByText("Lesson complete")).toBeVisible();
    if (index < experiences.length - 1) await page.getByRole("link", { name: new RegExp(`Next lesson Mode ${index + 2}:`) }).click();
  }
  expect(updates).toHaveLength(6);
  expect(updates.map((update) => update.activityEvidence?.experienceEvidence?.type)).toEqual(experiences.map((experience) => experience.type));
  await page.locator(".lesson-toolbar nav").getByRole("link", { name: richTopic }).click();
  await expect(page.getByRole("progressbar", { name: "Course progress" })).toHaveAttribute("aria-valuenow", "100");
});

test("completes a due seven-day retention check from the review queue", async ({ page }) => {
  await restoreLocalLearner(page);
  await mockFreeLearnerAccount(page);

  const reviewCourse: Course = {
    id: "retention-review-flow",
    courseId: "retention-review-flow",
    topic: "Retention decisions",
    isPublic: true,
    modules: [{
      title: "Retention",
      objective: "Recall a decision rule after a delay.",
      lessons: [{ title: "Evidence threshold", concept: "Match confidence to the evidence.", estimatedMinutes: 6 }],
    }],
  };
  const reviewLesson: LessonData = {
    content: "## Recall the rule\n\nConfidence should follow the strength of the evidence, not the force of the claim.",
    quizzes: [{
      question: "What should confidence track?",
      options: ["The strength of the evidence", "The speaker's seniority", "The cost already spent", "The number of slides"],
      correctIndex: 0,
      explanation: "Confidence should track evidence strength.",
      optionFeedback: ["Correct.", "Authority is not evidence.", "Sunk cost is not evidence.", "Presentation length is not evidence."],
    }],
  };
  const dueProgress: CourseProgress = {
    courseId: "retention-review-flow",
    topic: reviewCourse.topic,
    lastLessonId: "0-0",
    lastLessonTitle: "Evidence threshold",
    completedLessonIds: ["0-0"],
    lessons: {
      "0-0": {
        lessonId: "0-0",
        lessonTitle: "Evidence threshold",
        status: "learned",
        attempts: 1,
        totalQuestions: 1,
        firstAttemptCorrect: 1,
        score: 1,
        confidence: "high",
        calibration: "calibrated",
        performanceBand: "secure",
        intervalStage: 1,
        nextReviewAt: "2020-01-02T12:00:00.000Z",
        lastStudiedAt: "2020-01-01T12:00:00.000Z",
        completedAt: "2020-01-01T12:00:00.000Z",
        delayedChecks: {
          day7: { dueAt: "2020-01-08T12:00:00.000Z" },
          day28: { dueAt: "2099-01-29T12:00:00.000Z" },
        },
        estimatedMinutes: 6,
      },
    },
    totalLessons: 1,
    studyMinutes: 6,
    lastActivityAt: "2020-01-01T12:00:00.000Z",
    startedAt: "2020-01-01T12:00:00.000Z",
  };
  const reviewUpdates: ProgressUpdate[] = [];

  await page.route("**/api/progress*", async (route) => {
    if (route.request().method() === "GET") {
      const singleCourse = new URL(route.request().url()).searchParams.has("courseId");
      return route.fulfill({ json: { progress: singleCourse ? dueProgress : [dueProgress] } });
    }
    reviewUpdates.push(route.request().postDataJSON() as ProgressUpdate);
    return route.fulfill({
      json: {
        nextReviewAt: "2026-08-10T14:00:00.000Z",
        calibration: "calibrated",
      },
    });
  });
  await page.route("**/api/mastery*", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { plan: null, evidence: [] } });
    return route.fulfill({ json: { saved: true } });
  });
  await page.route("**/api/courses/retention-review-flow", (route) => route.fulfill({ json: reviewCourse }));
  await page.route("**/api/courses/retention-review-flow/lessons/0-0", (route) => route.fulfill({ json: reviewLesson }));

  await page.goto("/review");
  await expect(page.getByRole("heading", { name: "1 concept ready, ordered by need" })).toBeVisible();
  const dueItem = page.getByRole("button", { name: /Evidence threshold/ });
  await expect(dueItem).toContainText("7-day retention check");
  await dueItem.click();
  await expect(page).toHaveURL(/review=1&check=day7/);
  await completeQuiz(page, {
    recall: "Confidence follows the strength of the evidence.",
    correctAnswer: "The strength of the evidence",
    confidence: "Certain",
  });

  await expect(page.locator(".completion-banner").getByText("7-day check complete")).toBeVisible();
  await expect.poll(() => reviewUpdates.length).toBe(1);
  expect(reviewUpdates[0]).toMatchObject({
    courseId: "retention-review-flow",
    lessonId: "0-0",
    review: true,
    reviewKind: "delayed-7",
    totalQuestions: 1,
    firstAttemptCorrect: 1,
    attempts: 1,
    confidence: "high",
    activityEvidence: {
      quizResults: [{ quizIndex: 0, attempts: 1, firstAttemptCorrect: true, confidence: "high" }],
    },
  });
});
