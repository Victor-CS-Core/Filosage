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
    lessons: [
      {
        title: "Evidence before inference",
        concept: "Separate what was observed from what it might mean.",
        objective: "Classify evidence and inference in a decision record.",
        estimatedMinutes: 12,
        lessonMode: "worked-example",
        practiceType: "classify",
        misconception: "A plausible explanation is the same as an observation.",
      },
      {
        title: "Choose the next action",
        concept: "Match the action to the strength of the evidence.",
        objective: "Choose a reversible action under uncertainty.",
        estimatedMinutes: 12,
        lessonMode: "case-study",
        practiceType: "decide",
        misconception: "Every uncertain decision needs more research before acting.",
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
  content: "## Inspect the record\n\nEvidence reports what was observed. An inference explains what that observation may mean.",
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
};

const lessonTwo: LessonData = {
  aiAssisted: true,
  learningObjective: "Choose a reversible action under uncertainty.",
  connection: "Once evidence and inference are separate, the next action can match what is actually known.",
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

  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Find your next course." })).toBeVisible();
  await page.getByRole("link", { name: /Open Decision quality/i }).click();
  await expect(page.getByRole("heading", { level: 1, name: topic })).toBeVisible();
  await expect(page.getByText("Complete every lesson to unlock capstone assessment.")).toBeVisible();
  await expect(page.getByText("Decision checkpoint")).toBeVisible();

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

  await page.getByRole("button", { name: "Start with Evidence and action" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Evidence before inference" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Work through the idea" })).toBeVisible();
  await page.getByText("Compare with a worked response").click();
  await expect(page.getByText("The queue increase is observed; the claim that the release caused it is an inference.")).toBeVisible();
  const firstTransfer = "Three of ten users abandoned the flow is observed; confusing copy caused it is an inference I still need to test.";
  await completeTransfer(page, firstTransfer, lessonOne.transferTask!.modelResponse);
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
      quizResults: [
        { quizIndex: 0, attempts: 2, firstAttemptCorrect: false, confidence: "medium" },
        { quizIndex: 1, attempts: 1, firstAttemptCorrect: true, confidence: "high" },
      ],
    },
  });

  await page.getByRole("button", { name: "Ask tutor" }).click();
  const tutor = page.getByRole("dialog", { name: "Erudoza AI Tutor" });
  await tutor.getByLabel("Ask about this lesson").fill("How is an inference different from evidence?");
  await tutor.getByRole("button", { name: "Send question" }).click();
  await expect(tutor.getByText("Evidence is observed; an inference is the explanation added to it.")).toBeVisible();
  expect(tutorQuestions).toEqual(["How is an inference different from evidence?"]);
  await tutor.getByRole("button", { name: "Close tutor" }).click();

  await page.getByRole("button", { name: /Next lesson Choose the next action/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Choose the next action" })).toBeVisible();
  const secondTransfer = "I would pilot the onboarding copy with one segment and roll it back if completion or support demand worsens after two weeks.";
  await completeTransfer(page, secondTransfer, lessonTwo.transferTask!.modelResponse);
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
    activityEvidence: { transferResponse: secondTransfer },
  });

  await page.locator(".lesson-toolbar nav").getByRole("button", { name: topic }).click();
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
  await expect(capstone.getByText("Course mastered", { exact: true })).toBeVisible();
  await expect(capstone.getByText("View revision history (2 attempts)")).toBeVisible();
  expect(capstoneSubmissions).toEqual([firstCapstone, revisedCapstone]);

  await page.getByRole("button", { name: "View evidence" }).click();
  await expect(page).toHaveURL(new RegExp(`/evidence/${courseId}$`));
  await expect(page.getByRole("heading", { name: "Evidence by objective" })).toBeVisible();
  await expect(page.getByText("+67 pts")).toBeVisible();
  await expect(page.getByText("Demonstrated", { exact: true })).toBeVisible();
  await expect(page.getByText("Capstone demonstrated: Separate evidence from inference and choose a proportionate action.")).toBeVisible();
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
