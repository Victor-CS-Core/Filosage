import type { LessonVisual } from "@/lib/lesson-visuals";

export type LessonMode =
  | "concept"
  | "worked-example"
  | "comparison"
  | "case-study"
  | "practice-lab"
  | "synthesis";

export type PracticeType =
  | "explain"
  | "classify"
  | "calculate"
  | "decide"
  | "create"
  | "debug";

export interface LessonSummary {
  title: string;
  concept: string;
  estimatedMinutes?: number;
  objective?: string;
  lessonMode?: LessonMode;
  buildsOn?: string[];
  misconception?: string;
  practiceType?: PracticeType;
  masteryCriteria?: string;
}

export interface CourseModule {
  title: string;
  description?: string;
  objective?: string;
  challenge?: {
    title: string;
    prompt: string;
    successCriteria: string[];
  };
  lessons: LessonSummary[];
}

export interface CourseBanner {
  assetId: string;
  version: 1;
  generatedAt?: string;
}

export interface Course {
  id?: string;
  courseId?: string;
  topic: string;
  mission?: string;
  modules: CourseModule[];
  /** Server-side ownership field. Public API responses omit this value. */
  authorId?: string;
  authorName?: string;
  canManage?: boolean;
  isPublic?: boolean;
  level?: "Foundations" | "Intermediate" | "Advanced";
  estimatedMinutes?: number;
  outcome?: string;
  prerequisites?: string[];
  category?: string;
  banner?: CourseBanner;
  canRegenerateBanner?: boolean;
  generatedLessonIds?: string[];
  moderationStatus?: "approved" | "quarantined";
  publicationReview?: {
    status: "approved";
    reviewedAt?: string;
    moderationModel?: string;
    reviewVersion?: string;
    factualReviewStatus?: "unverified";
  };
  updatedAt?: string;
  aiAssisted?: boolean;
  schemaVersion?: number;
  capstone?: {
    title: string;
    brief: string;
    deliverable: string;
    successCriteria: string[];
  };
  contentIntegrity?: {
    repairedForDisplay: boolean;
  };
}

export interface Quiz {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  optionFeedback?: string[];
}

export interface LessonData {
  content: string;
  quizzes: Quiz[];
  aiAssisted?: boolean;
  learningObjective?: string;
  connection?: string;
  keyTakeaways?: string[];
  /**
   * Curated, structured visual explanations. Legacy diagram fields are
   * intentionally excluded: lessons now render only this safe visual grammar.
   */
  visuals?: LessonVisual[];
  guidedPractice?: {
    prompt: string;
    steps: string[];
    modelAnswer: string;
  };
  transferTask?: {
    prompt: string;
    successCriteria: string[];
    modelResponse: string;
  };
  provenance?: {
    contentVersion: string;
    generatedAt?: string;
    generationModel?: string;
    promptVersion?: string;
    qualityGateVersion?: string;
    sources: Array<{ label: string; url?: string }>;
  };
}

export type LearnerPlan = "free" | "pro";
export type AccessLevel = "anonymous" | "free" | "pro" | "owner";
export type AccountStatus = "active" | "suspended";

export interface AiQuotaSummary {
  feature: "course_outline" | "lesson_generation" | "tutor";
  limit: number | null;
  used: number;
  remaining: number | null;
  resetAt: string;
}

export interface LearnerAccount {
  access: AccessLevel;
  plan: LearnerPlan;
  isOwner: boolean;
  accountStatus: AccountStatus;
  suspensionReason?: string;
  displayName?: string;
  photoURL?: string;
  subscriptionStatus?: "none" | "trialing" | "active" | "past_due" | "canceled";
  currentPeriodEnd?: string;
  acceptedTermsVersion?: string;
  acceptedPrivacyVersion?: string;
  legalAcceptanceRequired?: boolean;
  applicationAccountExists?: boolean;
  quotas: AiQuotaSummary[];
}
