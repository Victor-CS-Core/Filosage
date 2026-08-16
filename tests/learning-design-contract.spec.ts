import { expect, test } from "@playwright/test";
import {
  COURSE_LEARNING_BRIEF_VERSION,
  LEARNING_DESIGN_CONTRACT_VERSION,
  LESSON_DESIGN_PLAN_VERSION,
  canonicalCourseLearningBriefV1,
  canonicalLearningDesignData,
  canonicalLessonDesignPlanV1,
  buildLearningDesignContractV1,
  buildPublicLearningDesignSummaryV1,
  capabilityIdForObjective,
  courseLearningBriefIssues,
  deriveCourseLearningBriefV1,
  lessonDesignPlanIssues,
  lessonDesignPlanV1Schema,
  normalizeCapabilityObjective,
  normalizeObjectiveId,
  normalizeObjectiveIds,
  objectiveIdForCapability,
  learningDesignContractIssues,
  lessonDesignOutputIssues,
} from "../src/lib/learning-design";

const referenceA = "reference-0123456789abcdef";
const referenceB = "reference-fedcba9876543210";
type BriefInput = Parameters<typeof canonicalCourseLearningBriefV1>[0];
type LessonPlanInput = Parameters<typeof canonicalLessonDesignPlanV1>[0];

function validBrief(): BriefInput {
  return {
    version: COURSE_LEARNING_BRIEF_VERSION,
    source: "explicit" as const,
    topic: "Decision quality",
    desiredOutcome: "Defend a bounded product decision with evidence.",
    applicationContext: "A quarterly product portfolio review.",
    priorKnowledge: "Can read basic product metrics but has not written a decision record.",
    proofOfSkill: "A one-page decision memo with an evidence table and rollback condition.",
    successCriteria: ["States a rollback condition", "Separates evidence from inference"],
    constraints: ["Two hours each week", "Use an existing product decision"],
    exclusions: ["Advanced causal inference"],
    timeBudgetMinutes: 480,
    language: "English",
  };
}

function validPlan(): LessonPlanInput {
  return {
    version: LESSON_DESIGN_PLAN_VERSION,
    lessonId: "0-1",
    scopeBudget: {
      version: LESSON_DESIGN_PLAN_VERSION,
      primaryObjectiveId: "objective-m0-l1",
      singleWin: "Classify one claim as an observation or inference.",
      estimatedMinutes: 18,
      newConceptLimit: 2,
      explanationWordLimit: 500,
      practiceMinutes: 9,
    },
    prerequisites: {
      objectiveIds: ["module-0", "objective-m0-l0"],
      connectionStrategy: "Recall the earlier evidence distinction before classifying the new claim.",
    },
    retrieval: {
      required: true,
      targets: [{ objectiveId: "objective-m0-l0", mode: "discriminate", spacing: "spaced" }],
    },
    misconception: {
      id: "misconception-confidence-is-evidence",
      statement: "A confident explanation is the same as an observation.",
      correctionTarget: "Confidence does not change whether a claim reports an observation.",
      assessmentStrategy: "diagnostic-distractor" as const,
      assessmentIds: ["assessment-claim-check"],
    },
    feedback: {
      mode: "auto-scored" as const,
      timing: "after-commitment" as const,
      assessmentIds: ["assessment-claim-check"],
      criterionIds: [],
      revisionRequiredOnMiss: true,
      completionEvidence: "demonstrated" as const,
    },
    resources: {
      status: "available" as const,
      evidenceSourceIds: ["source-primary"],
      furtherReadingIds: [referenceA],
      rationale: "Use claim evidence for the lesson and keep the book as optional further study.",
    },
  };
}

test("publishes stable independent learning-design contract versions", () => {
  expect(LEARNING_DESIGN_CONTRACT_VERSION).toBe("learning-design-v1.0.0");
  expect(COURSE_LEARNING_BRIEF_VERSION).toBe("course-learning-brief-v1.0.0");
  expect(LESSON_DESIGN_PLAN_VERSION).toBe("lesson-design-plan-v1.0.0");
});

test("public learning-design summary cannot echo private brief context", () => {
  const privateNeedle = "Private Client Incorporated account 123456789";
  const course = {
    topic: "Decision quality",
    outcome: "Defend a bounded decision.",
    estimatedMinutes: 30,
    artifact: { title: "Decision memo", description: "A bounded decision memo", format: "Memo" },
    capstone: { deliverable: "Decision memo", successCriteria: ["States a boundary"] },
    modules: [{ lessons: [{ title: "Bound the decision", concept: "Decision boundaries", objective: "State one decision boundary." }] }],
  };
  const contract = buildLearningDesignContractV1(course, canonicalCourseLearningBriefV1({
    ...validBrief(),
    applicationContext: privateNeedle,
    priorKnowledge: privateNeedle,
    constraints: [privateNeedle],
    exclusions: [privateNeedle],
  }));
  const summary = buildPublicLearningDesignSummaryV1(course, contract);
  expect(JSON.stringify(summary)).not.toContain(privateNeedle);
  expect(summary).toMatchObject({
    desiredOutcome: "Defend a bounded decision.",
    proofOfSkill: "A bounded decision memo",
    lessonWins: [expect.objectContaining({ singleWin: "State one decision boundary." })],
  });
});

test("derives a complete V1 learning brief from a schema-v5 course without changing evidence data", () => {
  const course = {
    topic: "Systems thinking",
    outcome: "Diagnose a feedback loop and defend one intervention.",
    mission: "Make a better systems decision.",
    estimatedMinutes: 240,
    language: "English",
    prerequisites: ["Basic process mapping"],
    instructionalContext: {
      goal: "Diagnose a real feedback loop and defend one intervention.",
      application: "A product adoption problem at work.",
      background: "Can draw a basic process map.",
      artifactPreference: "An annotated loop map with an intervention rationale.",
    },
    capstone: {
      deliverable: "An intervention memo",
      successCriteria: ["Names the loop", "Defends the intervention"],
    },
    sourcePolicyVersion: "source-integrity-v5.0.0",
    sourcePack: [{ id: "source-primary", evidenceClaims: [{ id: "evidence-one", claim: "Bounded claim" }] }],
    evidenceProfile: { mode: "hybrid" },
  };
  const before = structuredClone(course);
  const brief = deriveCourseLearningBriefV1(course);

  expect(brief).toMatchObject({
    version: COURSE_LEARNING_BRIEF_VERSION,
    source: "compatibility-derived",
    topic: "Systems thinking",
    desiredOutcome: "Diagnose a real feedback loop and defend one intervention.",
    applicationContext: "A product adoption problem at work.",
    priorKnowledge: "Can draw a basic process map.",
    proofOfSkill: "An annotated loop map with an intervention rationale.",
    successCriteria: ["Defends the intervention", "Names the loop"],
    timeBudgetMinutes: 240,
  });
  expect(brief).not.toHaveProperty("sourcePack");
  expect(brief).not.toHaveProperty("evidenceProfile");
  expect(course).toEqual(before);
});

test("uses an existing explicit brief and canonicalizes fingerprint-relevant sets", () => {
  const brief = canonicalCourseLearningBriefV1({
    ...validBrief(),
    desiredOutcome: "  Defend   a bounded product decision with evidence. ",
    constraints: ["Use an existing product decision", "Two hours each week"],
  });
  const restored = deriveCourseLearningBriefV1({ courseLearningBrief: brief });

  expect(restored).toEqual(brief);
  expect(restored.desiredOutcome).toBe("Defend a bounded product decision with evidence.");
  expect(restored.constraints).toEqual(["Two hours each week", "Use an existing product decision"]);
});

test("normalizes legacy mastery aliases into the current objective namespace", () => {
  expect(normalizeObjectiveId("module-0")).toBe("objective-m0");
  expect(normalizeObjectiveId("objective-m01-l002")).toBe("objective-m1-l2");
  expect(normalizeObjectiveId("unsupported id")).toBeNull();
  expect(normalizeObjectiveIds(["module-0", "objective-m0", "objective-m0-l0"]))
    .toEqual(["objective-m0", "objective-m0-l0"]);
  expect(capabilityIdForObjective("module-2")).toBe("capability-m2");
  expect(objectiveIdForCapability("capability-m2-l1")).toBe("objective-m2-l1");
  expect(normalizeCapabilityObjective({
    objectiveId: "module-2",
    description: "  Defend   the selected action. ",
    kind: "skill",
  })).toEqual({
    objectiveId: "objective-m2",
    capabilityId: "capability-m2",
    kind: "skill",
    description: "Defend the selected action.",
  });
});

test("keeps a lesson plan to one observable win and transforms legacy objective references", () => {
  const parsed = lessonDesignPlanV1Schema.parse(validPlan());
  expect(parsed.scopeBudget.primaryObjectiveId).toBe("objective-m0-l1");
  expect(parsed.prerequisites.objectiveIds).toEqual(["objective-m0", "objective-m0-l0"]);
  expect(lessonDesignPlanIssues(parsed, {
    knownObjectiveIds: ["objective-course", "objective-m0", "objective-m0-l0", "objective-m0-l1"],
    objectiveOrder: ["objective-course", "objective-m0", "objective-m0-l0", "objective-m0-l1"],
    knownSourceIds: ["source-primary"],
    knownFurtherReadingIds: [referenceA],
  })).toEqual([]);
});

test("rejects a non-observable brief or single win deterministically", () => {
  expect(courseLearningBriefIssues({ ...validBrief(), desiredOutcome: "Understand decision quality" }))
    .toContainEqual(expect.objectContaining({ code: "LD_BRIEF_001", severity: "error" }));
  expect(lessonDesignPlanIssues({
    ...validPlan(),
    scopeBudget: { ...validPlan().scopeBudget, singleWin: "Learn about observations" },
  }, {
    knownObjectiveIds: ["objective-m0", "objective-m0-l0", "objective-m0-l1"],
    knownSourceIds: ["source-primary"],
    knownFurtherReadingIds: [referenceA],
  })).toContainEqual(expect.objectContaining({ code: "LD_SCOPE_001", severity: "error" }));
});

test("rejects future, self-referential, and unknown objective relationships", () => {
  const plan = validPlan();
  plan.prerequisites.objectiveIds = ["objective-m0-l1"];
  plan.retrieval.targets = [{ objectiveId: "objective-m1-l0", mode: "recall", spacing: "interleaved" }];
  const issues = lessonDesignPlanIssues(plan, {
    knownObjectiveIds: ["objective-m0", "objective-m0-l0", "objective-m0-l1", "objective-m1-l0"],
    objectiveOrder: ["objective-m0", "objective-m0-l0", "objective-m0-l1", "objective-m1-l0"],
    knownSourceIds: ["source-primary"],
    knownFurtherReadingIds: [referenceA],
  });

  expect(issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: "LD_PREREQUISITE_001", message: expect.stringContaining("own prerequisite") }),
    expect.objectContaining({ code: "LD_RETRIEVAL_001", message: expect.stringContaining("must precede") }),
  ]));
});

test("binds misconception checks to feedback and rejects unknown resource identifiers", () => {
  const plan = validPlan();
  plan.feedback.assessmentIds = ["assessment-other"];
  plan.resources.evidenceSourceIds = ["source-unknown"];
  plan.resources.furtherReadingIds = [referenceB];
  const issues = lessonDesignPlanIssues(plan, {
    knownObjectiveIds: ["objective-m0", "objective-m0-l0", "objective-m0-l1"],
    knownSourceIds: ["source-primary"],
    knownFurtherReadingIds: [referenceA],
  });

  expect(issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: "LD_MISCONCEPTION_001" }),
    expect.objectContaining({ code: "LD_RESOURCE_001", message: expect.stringContaining("source-unknown") }),
    expect.objectContaining({ code: "LD_RESOURCE_001", message: expect.stringContaining(referenceB) }),
  ]));
});

test("does not let a self-check assert demonstrated mastery", () => {
  const plan = validPlan();
  plan.feedback = {
    mode: "rubric-self-check",
    timing: "after-commitment",
    assessmentIds: ["assessment-claim-check"],
    criterionIds: ["criterion-bounded-claim"],
    revisionRequiredOnMiss: true,
    completionEvidence: "demonstrated",
  };
  const issues = lessonDesignPlanIssues(plan, {
    knownObjectiveIds: ["objective-m0", "objective-m0-l0", "objective-m0-l1"],
  });
  expect(issues).toContainEqual(expect.objectContaining({
    code: "LD_SCHEMA_001",
    message: "Self-check feedback can record an attempt, but cannot independently demonstrate mastery.",
  }));
});

test("keeps unavailable reading nonblocking but prevents contradictory resource labels", () => {
  const unavailable = validPlan();
  unavailable.resources = {
    status: "unavailable",
    evidenceSourceIds: [],
    furtherReadingIds: [],
    rationale: "No suitable optional resource was available; lesson creation continues without one.",
  };
  expect(lessonDesignPlanV1Schema.safeParse(unavailable).success).toBe(true);

  unavailable.resources.evidenceSourceIds = ["source-primary"];
  expect(lessonDesignPlanV1Schema.safeParse(unavailable).success).toBe(false);
});

test("rejects duplicate relationship identifiers instead of hiding them during canonicalization", () => {
  const duplicated = validPlan();
  duplicated.feedback.assessmentIds = ["assessment-claim-check", "assessment-claim-check"];
  duplicated.resources.furtherReadingIds = [referenceA, referenceA];
  expect(lessonDesignPlanV1Schema.safeParse(duplicated).success).toBe(false);
});

test("rejects duplicate lesson plans before producing fingerprint input", () => {
  expect(() => canonicalLearningDesignData({ brief: validBrief(), lessonPlans: [validPlan(), validPlan()] }))
    .toThrow(/unique lesson identifiers/);
});

test("produces stable canonical data for fingerprinting regardless of set order and whitespace", () => {
  const leftPlan = validPlan();
  const rightPlan = validPlan();
  leftPlan.resources.furtherReadingIds = [referenceB, referenceA];
  rightPlan.resources.furtherReadingIds = [referenceA, referenceB];
  leftPlan.resources.rationale = "Use   these resources for optional study.";
  rightPlan.resources.rationale = "Use these resources for optional study.";
  const leftBrief = validBrief();
  const rightBrief = { ...validBrief(), constraints: [...validBrief().constraints].reverse() };

  expect(canonicalLessonDesignPlanV1(leftPlan)).toEqual(canonicalLessonDesignPlanV1(rightPlan));
  expect(JSON.stringify(canonicalLearningDesignData({ brief: leftBrief, lessonPlans: [leftPlan] })))
    .toBe(JSON.stringify(canonicalLearningDesignData({ brief: rightBrief, lessonPlans: [rightPlan] })));
});

test("derives a complete source-scarcity-safe contract from a related course outline", () => {
  const contract = buildLearningDesignContractV1({
    topic: "Decision quality",
    outcome: "Defend a bounded decision with evidence.",
    estimatedMinutes: 36,
    language: "English",
    artifact: { title: "Decision memo", description: "A decision memo with an evidence table." },
    capstone: { deliverable: "Decision memo", successCriteria: ["Separates observation from inference"] },
    modules: [{ lessons: [{
      title: "Evidence before inference",
      concept: "Separate observations from interpretations.",
      objective: "Classify a claim as observation or inference.",
      objectiveId: "objective-m0-l0",
      estimatedMinutes: 16,
      lessonMode: "concept",
      practiceType: "classify",
      misconception: "A confident interpretation is an observation.",
      contentBasis: "model-knowledge",
      sourceIds: [],
    }, {
      title: "Bounded action",
      concept: "Match action size to evidence.",
      objective: "Choose a bounded action from a short evidence record.",
      objectiveId: "objective-m0-l1",
      estimatedMinutes: 20,
      lessonMode: "case-study",
      practiceType: "decide",
      buildsOn: ["Evidence before inference"],
      misconception: "Every uncertain decision requires more research.",
      contentBasis: "model-knowledge",
      sourceIds: [],
    }] }],
  });

  expect(contract.lessonPlans).toHaveLength(2);
  expect(contract.lessonPlans[0]).toMatchObject({
    lessonId: "0-0",
    retrieval: { required: false, targets: [] },
    resources: { status: "unavailable", evidenceSourceIds: [] },
  });
  expect(contract.lessonPlans[1]).toMatchObject({
    lessonId: "0-1",
    prerequisites: { objectiveIds: ["objective-m0-l0"] },
    retrieval: { required: true, targets: [{ objectiveId: "objective-m0-l0" }] },
    feedback: { mode: "rubric-self-check", completionEvidence: "attempted" },
  });
  expect(learningDesignContractIssues(contract, {
    knownObjectiveIds: ["objective-course", "objective-m0", "objective-m0-l0", "objective-m0-l1"],
    objectiveOrder: ["objective-course", "objective-m0", "objective-m0-l0", "objective-m0-l1"],
    knownSourceIds: [],
    knownFurtherReadingIds: [],
  })).toEqual([]);
});

test("rejects explanation overflow and repeated practice without imposing equal wording", () => {
  const plan = canonicalLessonDesignPlanV1({
    ...validPlan(),
    scopeBudget: { ...validPlan().scopeBudget, explanationWordLimit: 150 },
  });
  const repeatedPrompt = "Classify the claim and record the evidence for your choice.";
  const issues = lessonDesignOutputIssues({
    learningObjective: "Classify one claim as an observation or inference.",
    content: "A bounded explanation supports the activity. ".repeat(55),
    guidedPractice: { prompt: repeatedPrompt },
    transferTask: { prompt: repeatedPrompt, successCriteria: ["Names the claim type"] },
    experience: { type: "concept" },
  }, plan);

  expect(issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: "LD_OUTPUT_001", path: "lesson.content" }),
    expect.objectContaining({ code: "LD_OUTPUT_002", path: "lesson.transferTask.prompt" }),
  ]));
});

test("accepts a concise one-win lesson with distinct guided and transfer work", () => {
  const plan = canonicalLessonDesignPlanV1(validPlan());
  expect(lessonDesignOutputIssues({
    learningObjective: "Classify one claim as an observation or inference.",
    content: "Use the supplied distinction to prepare for the classification activity. ".repeat(20),
    guidedPractice: { prompt: "Classify the worked claim with the supplied prompts." },
    transferTask: { prompt: "Classify a new claim without the prompts.", successCriteria: ["Names the claim type"], criterionIds: [] },
    quizzes: [{ assessmentId: "assessment-claim-check" }],
    experience: { type: "concept" },
  }, plan)).toEqual([]);
});

test("requires every feedback assessment and rubric criterion to bind exactly once", () => {
  const plan = canonicalLessonDesignPlanV1(validPlan());
  const base = {
    learningObjective: "Classify one claim as an observation or inference.",
    content: "Use the supplied distinction to prepare for classification. ".repeat(20),
    guidedPractice: { prompt: "Classify the worked claim." },
    transferTask: { prompt: "Classify a new claim.", successCriteria: ["Names the claim type"], criterionIds: [] },
    experience: { type: "concept" },
  };
  expect(lessonDesignOutputIssues({ ...base, quizzes: [] }, plan)).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: "LD_FEEDBACK_001", path: "lesson.quizzes.assessmentId" }),
  ]));
  expect(lessonDesignOutputIssues({
    ...base,
    quizzes: [{ assessmentId: "assessment-claim-check" }, { assessmentId: "assessment-claim-check" }],
  }, plan)).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: "LD_FEEDBACK_001", path: "lesson.quizzes.assessmentId" }),
  ]));
});

test("rejects a lightly reworded duplicate instead of counting it as transfer", () => {
  const plan = canonicalLessonDesignPlanV1(validPlan());
  const issues = lessonDesignOutputIssues({
    learningObjective: "Classify one claim as an observation or inference.",
    content: "Use the supplied distinction to prepare for classification. ".repeat(20),
    guidedPractice: { prompt: "Classify the claim and record the evidence for your choice." },
    transferTask: {
      prompt: "Record the evidence for your choice and classify the claim.",
      successCriteria: ["Names the claim type"],
      criterionIds: [],
    },
    quizzes: [{ assessmentId: "assessment-claim-check" }],
    experience: { type: "concept" },
  }, plan);
  expect(issues).toContainEqual(expect.objectContaining({ code: "LD_OUTPUT_002", path: "lesson.transferTask.prompt" }));
});
