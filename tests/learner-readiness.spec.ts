import { expect, test } from "@playwright/test";
import type { Course } from "../src/lib/course-types";
import {
  buildCourseObjectiveRelationshipIndex,
  projectLearnerReadiness,
  type ReadinessSignal,
} from "../src/lib/learner-readiness";

const course: Pick<Course, "modules"> = {
  modules: [{
    title: "Reasoning",
    lessons: [
      { title: "Frame the evidence", concept: "Evidence", objectiveId: "objective-evidence" },
      {
        title: "Make the decision",
        concept: "Decision",
        objectiveId: "objective-decision",
        buildsOn: ["Frame the evidence"],
      },
      {
        title: "Audit the result",
        concept: "Audit",
        objectiveId: "objective-audit",
        buildsOn: ["A missing prerequisite"],
      },
    ],
  }],
};

test("builds a fail-closed prerequisite index without mutating the course", () => {
  const snapshot = JSON.stringify(course);
  const relationships = buildCourseObjectiveRelationshipIndex(course);

  expect(relationships).toEqual({
    objectiveIds: ["objective-evidence", "objective-decision", "objective-audit"],
    prerequisitesByObjectiveId: {
      "objective-evidence": [],
      "objective-decision": ["objective-evidence"],
      "objective-audit": [],
    },
    unresolvedPrerequisitesByObjectiveId: {
      "objective-evidence": [],
      "objective-decision": [],
      "objective-audit": ["A missing prerequisite"],
    },
  });
  expect(JSON.stringify(course)).toBe(snapshot);
});

test("keeps self-report and observed completion below receipt-backed readiness", () => {
  const relationships = buildCourseObjectiveRelationshipIndex(course);
  const signals: ReadinessSignal[] = [
    {
      id: "self-evidence",
      objectiveId: "objective-evidence",
      kind: "self-report",
      level: "independent",
      observedAt: "2026-08-01T10:00:00.000Z",
      evidenceConfidence: "self-reported",
    },
    {
      evidence: {
        id: "lesson-evidence",
        objectiveId: "objective-evidence",
        type: "lesson",
        result: "passed",
        observedAt: "2026-08-02T10:00:00.000Z",
      },
      evidenceConfidence: "activity-observed",
    },
  ];

  const projected = projectLearnerReadiness({ relationships, signals });
  expect(projected["objective-evidence"]).toMatchObject({
    state: "exposed",
    band: "foundation",
    evidenceConfidence: "activity-observed",
    satisfiesPrerequisite: false,
  });
  expect(projected["objective-decision"]).toMatchObject({
    prerequisitesSatisfied: false,
    reasonCodes: ["prerequisite-not-demonstrated"],
  });
  expect(projected["objective-audit"]).toMatchObject({
    prerequisitesSatisfied: false,
    reasonCodes: ["unresolved-prerequisite"],
  });
});

test("promotes only verified retrieval and assessed transfer, then respects a newer verified gap", () => {
  const relationships = buildCourseObjectiveRelationshipIndex(course);
  const initialSignals: ReadinessSignal[] = [
    {
      evidence: {
        id: "retrieval-evidence",
        objectiveId: "objective-evidence",
        type: "retrieval",
        result: "passed",
        score: 0.9,
        observedAt: "2026-08-03T10:00:00.000Z",
      },
      evidenceConfidence: "receipt-verified",
      receiptVerifiedAt: "2026-08-03T10:00:01.000Z",
    },
    {
      evidence: {
        id: "delayed-decision",
        objectiveId: "objective-decision",
        type: "retrieval",
        result: "passed",
        score: 1,
        observedAt: "2026-08-10T10:00:00.000Z",
      },
      evidenceConfidence: "receipt-verified",
      receiptVerifiedAt: "2026-08-10T10:00:01.000Z",
      reviewKind: "delayed-7",
    },
    {
      evidence: {
        id: "transfer-decision",
        objectiveId: "objective-decision",
        type: "transfer",
        result: "passed",
        observedAt: "2026-08-11T10:00:00.000Z",
      },
      evidenceConfidence: "criterion-assessed",
      assessmentVersion: "transfer-rubric-v1",
    },
  ];

  const beforeGap = projectLearnerReadiness({ relationships, signals: initialSignals });
  expect(beforeGap["objective-evidence"]).toMatchObject({
    state: "practicing",
    band: "guided",
    satisfiesPrerequisite: true,
  });
  expect(beforeGap["objective-decision"]).toMatchObject({
    state: "transferable",
    band: "independent",
    evidenceConfidence: "criterion-assessed",
    prerequisitesSatisfied: true,
  });

  const afterGap = projectLearnerReadiness({
    relationships,
    signals: [...initialSignals, {
      evidence: {
        id: "new-gap",
        objectiveId: "objective-decision",
        type: "retrieval",
        result: "needs_work",
        score: 0.4,
        observedAt: "2026-08-12T10:00:00.000Z",
      },
      evidenceConfidence: "receipt-verified",
      receiptVerifiedAt: "2026-08-12T10:00:01.000Z",
    }],
  });
  expect(afterGap["objective-decision"]).toMatchObject({
    state: "needs-review",
    band: "guided",
    satisfiesPrerequisite: false,
    reasonCodes: ["newer-verified-gap"],
  });

  const afterRecovery = projectLearnerReadiness({
    relationships,
    signals: [...initialSignals, {
      evidence: {
        id: "temporary-gap",
        objectiveId: "objective-decision",
        type: "retrieval",
        result: "needs_work",
        score: 0.4,
        observedAt: "2026-08-12T10:00:00.000Z",
      },
      evidenceConfidence: "receipt-verified",
      receiptVerifiedAt: "2026-08-12T10:00:01.000Z",
    }, {
      evidence: {
        id: "verified-recovery",
        objectiveId: "objective-decision",
        type: "retrieval",
        result: "passed",
        score: 0.9,
        observedAt: "2026-08-13T10:00:00.000Z",
      },
      evidenceConfidence: "receipt-verified",
      receiptVerifiedAt: "2026-08-13T10:00:01.000Z",
    }],
  });
  expect(afterRecovery["objective-decision"]).toMatchObject({
    state: "transferable",
    satisfiesPrerequisite: true,
  });
});

test("keeps downstream readiness blocked when an evidenced prerequisite is itself unready", () => {
  const relationships = {
    objectiveIds: ["objective-foundation", "objective-middle", "objective-transfer"],
    prerequisitesByObjectiveId: {
      "objective-foundation": [],
      "objective-middle": ["objective-foundation"],
      "objective-transfer": ["objective-middle"],
    },
    unresolvedPrerequisitesByObjectiveId: {
      "objective-foundation": [],
      "objective-middle": [],
      "objective-transfer": [],
    },
  };
  const signals: ReadinessSignal[] = [{
    evidence: {
      id: "middle-retrieval",
      objectiveId: "objective-middle",
      type: "retrieval",
      result: "passed",
      observedAt: "2026-08-14T10:00:00.000Z",
    },
    evidenceConfidence: "receipt-verified",
    receiptVerifiedAt: "2026-08-14T10:00:01.000Z",
  }];

  const projected = projectLearnerReadiness({ relationships, signals });

  expect(projected["objective-middle"]).toMatchObject({
    satisfiesPrerequisite: true,
    prerequisitesSatisfied: false,
    reasonCodes: ["retrieval-receipt-verified", "prerequisite-not-demonstrated"],
  });
  expect(projected["objective-transfer"]).toMatchObject({
    prerequisitesSatisfied: false,
    reasonCodes: ["prerequisite-not-demonstrated"],
  });
});
