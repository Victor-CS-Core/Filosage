import { createHash } from "node:crypto";

export const SHARED_EVIDENCE_TOKEN = Buffer.alloc(32, 7).toString("base64url");
export const SHARED_EVIDENCE_PRIVATE_CANARIES = [
  "PRIVATE_OWNER_EMAIL@example.test",
  "PRIVATE_LEARNER_NOTE_MUST_NOT_LEAK",
  "PRIVATE_RAW_RESPONSE_MUST_NOT_LEAK",
];

const shareId = createHash("sha256")
  .update(`filosage-evidence-share-v1:${SHARED_EVIDENCE_TOKEN}`)
  .digest("hex");

const firstAttempt = {
  status: "needs_revision",
  summary: "The recommendation needs a clearer limitation.",
  assessedAt: "2026-08-14T12:00:00.000Z",
  attempt: 1,
  criteria: [
    { criterion: "Explain the decision", met: false, feedback: "Connect the recommendation to the evidence." },
    { criterion: "Name a limitation", met: false, feedback: "State where the recommendation may not hold." },
  ],
};

const secondAttempt = {
  status: "needs_revision",
  summary: "The decision is now supported; one limitation remains.",
  assessedAt: "2026-08-16T12:00:00.000Z",
  attempt: 2,
  criteria: [
    { criterion: "Explain the decision", met: true, feedback: "The evidence now supports the recommendation." },
    { criterion: "Name a limitation", met: false, feedback: "Add the boundary that would change the decision." },
  ],
};

const snapshot = {
  version: 1,
  generatedAt: "2026-08-16T13:30:00.000Z",
  course: {
    id: "shared-evidence-course",
    topic: "Decision Architecture",
    outcome: "Make a defensible product decision from incomplete evidence.",
  },
  learningGoal: {
    desiredOutcome: "Present a product recommendation that a skeptical stakeholder can inspect.",
    applicationContext: "A roadmap prioritization review.",
    targetArtifact: "An evidence-backed recommendation with one explicit limitation.",
  },
  summary: {
    completedLessons: 3,
    totalLessons: 8,
    observedMasteryPercent: 50,
    assessedBaselinePercent: 40,
    assessedFinalPercent: 70,
    verifiedImprovementPoints: 30,
  },
  objectives: [
    {
      objectiveId: "module-0",
      title: "Frame the decision",
      objective: "Separate the decision, evidence, and uncertainty before recommending an action.",
      state: "demonstrated",
      evidenceCount: 1,
      latestEvidenceAt: "2026-08-15T10:00:00.000Z",
    },
    {
      objectiveId: "module-1",
      title: "Test the recommendation",
      objective: "Use a transfer case and capstone criteria to expose weak assumptions.",
      state: "practicing",
      evidenceCount: 3,
      latestEvidenceAt: "2026-08-16T12:00:00.000Z",
    },
  ],
  evidence: [
    {
      type: "lesson",
      result: "passed",
      label: "Decision framing lesson",
      observedAt: "2026-08-15T10:00:00.000Z",
      authority: "server-verified",
    },
    {
      type: "retrieval",
      result: "passed",
      label: "Evidence and inference retrieval",
      observedAt: "2026-08-15T16:00:00.000Z",
      authority: "server-verified",
      confidence: "medium",
    },
    {
      type: "transfer",
      result: "needs_work",
      label: "Roadmap tradeoff transfer",
      observedAt: "2026-08-16T09:30:00.000Z",
      authority: "learner-reported",
      criterion: "Name the evidence that would change the recommendation.",
    },
    {
      type: "capstone",
      result: "needs_work",
      label: "Final decision recommendation",
      observedAt: "2026-08-16T12:00:00.000Z",
      authority: "server-verified",
      criterion: "Name a limitation",
    },
  ],
  capstone: {
    status: "needs_revision",
    summary: secondAttempt.summary,
    assessedAt: secondAttempt.assessedAt,
    attempts: 2,
    criteria: secondAttempt.criteria,
  },
  advancedCapstoneAnalysis: {
    version: 1,
    attempts: [firstAttempt, secondAttempt],
    criteria: [],
    improvedSincePriorAttempt: ["Explain the decision"],
    regressedSincePriorAttempt: [],
    unresolved: ["Name a limitation"],
    addedSincePriorAttempt: [],
    removedSincePriorAttempt: [],
    nextRevisionPriorities: ["Name a limitation"],
  },
  methodology: [
    "Self-reported diagnostics describe a starting estimate and never count as demonstrated mastery.",
    "Observed mastery is a progression signal derived from saved learning evidence, not an accredited credential.",
    "Verified improvement appears only when comparable baseline and final assessment criteria are available.",
  ],
};

export function buildSharedEvidenceStore() {
  return {
    "users/shared-evidence-owner": {
      accountStatus: "active",
      email: SHARED_EVIDENCE_PRIVATE_CANARIES[0],
      privateNote: SHARED_EVIDENCE_PRIVATE_CANARIES[1],
      latestRawResponse: SHARED_EVIDENCE_PRIVATE_CANARIES[2],
    },
    "courses/shared-evidence-course": {
      topic: snapshot.course.topic,
      outcome: snapshot.course.outcome,
      modules: [],
      moderationStatus: "approved",
      isPublic: false,
    },
    [`evidenceShares/${shareId}`]: {
      version: 1,
      ownerUid: "shared-evidence-owner",
      courseId: "shared-evidence-course",
      snapshot,
      createdAt: "2026-08-16T13:30:00.000Z",
      expiresAt: "2030-01-15T13:30:00.000Z",
    },
  };
}
