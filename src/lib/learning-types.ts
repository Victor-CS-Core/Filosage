import type { LessonMode } from "@/lib/course-types";
import type { InteractionEvidence } from "@/lib/lesson-interactions";

export type Confidence = "low" | "medium" | "high";
export type ReviewKind = "spaced" | "delayed-7" | "delayed-28";
export type ConfidenceCalibration = "calibrated" | "overconfident" | "underconfident";
export type PerformanceBand = "fragile" | "developing" | "secure";

export interface ReviewRecord {
  kind: ReviewKind;
  observedAt: string;
  score: number;
  confidence: Confidence;
  calibration: ConfidenceCalibration;
  performanceBand: PerformanceBand;
  intervalStage: number;
  retrievalVariantId?: string;
  evidenceAuthority?: "activity-observed" | "receipt-verified" | "criterion-assessed";
  assessmentIds?: string[];
  criterionIds?: string[];
}

export interface DelayedCheck {
  dueAt: string;
  completedAt?: string;
}

export interface LessonProgress {
  lessonId: string;
  lessonTitle: string;
  objectiveId?: string;
  prerequisiteObjectiveIds?: string[];
  status: "started" | "learned" | "mastered";
  evidenceAuthority?: "activity-observed" | "receipt-verified" | "criterion-assessed";
  attempts: number;
  totalQuestions: number;
  firstAttemptCorrect: number;
  score?: number;
  confidence: Confidence;
  calibration?: ConfidenceCalibration;
  performanceBand?: PerformanceBand;
  intervalStage: number;
  nextReviewAt: string;
  lastStudiedAt: string;
  completedAt?: string;
  delayedChecks?: {
    day7: DelayedCheck;
    day28: DelayedCheck;
  };
  reviewHistory?: ReviewRecord[];
  retrievalVariantExposures?: Array<{ variantId: string; seenAt: string }>;
  retrievalVariantBank?: Array<{ id: string; objectiveId: string; contextKey: string }>;
  assessmentIds?: string[];
  criterionIds?: string[];
  estimatedMinutes?: number;
  /** The misconception this lesson corrects, recorded at completion. */
  misconception?: string;
  experienceEvidence?: ExperienceEvidence;
  interactionEvidence?: InteractionEvidence;
}

export interface ExperienceEvidence {
  type: LessonMode;
  response: string;
  completed: true;
}

export interface CapstoneRevision {
  status: "passed" | "needs_revision";
  summary: string;
  criteria: Array<{ criterion: string; met: boolean; feedback: string }>;
  assessedAt: string;
  attempt: number;
}

export interface CapstoneAssessment {
  status: "passed" | "needs_revision";
  summary: string;
  criteria: Array<{ criterion: string; met: boolean; feedback: string }>;
  assessedAt: string;
  attempts: number;
  history?: CapstoneRevision[];
}

export interface BaselineAssessment {
  summary: string;
  criteria: Array<{ criterion: string; met: boolean; feedback: string }>;
  assessedAt: string;
  score: number;
}

export interface CourseProgress {
  id?: string;
  courseId: string;
  topic: string;
  lastLessonId: string;
  lastLessonTitle: string;
  nextLessonId?: string | null;
  nextLessonTitle?: string | null;
  completedLessonIds: string[];
  lessons: Record<string, LessonProgress>;
  totalLessons?: number;
  lastActivityAt: string;
  startedAt: string;
  studyMinutes?: number;
  capstone?: CapstoneAssessment;
  recentOperations?: Array<{
    id: string;
    fingerprint: string;
    observedAt: string;
    response: {
      nextReviewAt: string;
      calibration: ConfidenceCalibration;
      performanceBand: PerformanceBand;
      intervalDays: number;
    };
  }>;
}

export interface ProgressUpdate {
  courseId: string;
  topic: string;
  lessonId: string;
  lessonTitle: string;
  objectiveId?: string;
  prerequisiteObjectiveIds?: string[];
  retrievalVariantId?: string;
  retrievalVariantIds?: string[];
  retrievalVariantBank?: Array<{ id: string; objectiveId: string; contextKey: string }>;
  totalQuestions: number;
  firstAttemptCorrect: number;
  attempts: number;
  confidence: Confidence;
  review?: boolean;
  reviewKind?: ReviewKind;
  totalLessons?: number;
  estimatedMinutes?: number;
  nextLessonId?: string | null;
  nextLessonTitle?: string | null;
  misconception?: string;
  activityEvidence?: {
    quizResults: Array<{
      quizIndex: number;
      attempts: number;
      firstAttemptCorrect: boolean;
      confidence: Confidence;
      receipt?: string;
    }>;
    transferResponse?: string;
    experienceEvidence?: ExperienceEvidence;
    interactionEvidence?: InteractionEvidence;
  };
}
