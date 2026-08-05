import type { LessonVisual } from "@/lib/lesson-visuals";
import type { LessonInteraction } from "@/lib/lesson-interactions";

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

export type SourceKind = "primary" | "official" | "licensed" | "author-provided";
export type SourceRights = "link-only" | "public-domain" | "licensed" | "author-owned";

export interface CourseSource {
  id: string;
  label: string;
  url?: string;
  kind: SourceKind;
  rights: SourceRights;
  note?: string;
}

export type LessonExperience =
  | { type: "concept"; predictionPrompt: string; mentalModel: { title: string; parts: Array<{ label: string; role: string }> }; misconceptionCheck: { claim: string; correction: string } }
  | { type: "worked-example"; scenario: string; steps: Array<{ title: string; reasoning: string; output: string }>; fadingPrompt: string }
  | { type: "comparison"; options: string[]; criteria: Array<{ criterion: string; first: string; second: string }>; boundaryCase: { prompt: string; resolution: string } }
  | { type: "case-study"; brief: string; evidence: Array<{ label: string; detail: string }>; interpretations: string[]; decisionPrompt: string }
  | { type: "practice-lab"; brief: string; materials: string[]; tasks: string[]; artifactPrompt: string; successCriteria: string[] }
  | { type: "synthesis"; challenge: string; connections: Array<{ concept: string; contribution: string }>; capstoneContribution: string; reflectionPrompt: string };

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
  activityPreview?: string;
  artifactContribution?: string;
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
  milestone?: {
    title: string;
    deliverable: string;
    evidence: string;
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
  audience?: string;
  artifact?: { title: string; description: string; format: string };
  scenario?: { title: string; context: string; stakes: string };
  sourcePack?: CourseSource[];
  banner?: CourseBanner;
  canRegenerateBanner?: boolean;
  generatedLessonIds?: string[];
  moderationStatus?: "approved" | "quarantined";
  publicationReview?: {
    status: "approved" | "owner_override";
    reviewedAt?: string;
    moderationModel?: string;
    reviewVersion?: string;
    factualReviewStatus?: "unverified";
    safetyReviewBasis?: string;
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
  milestone?: {
    title: string;
    deliverable: string;
    evidence: string;
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
  experience?: LessonExperience;
  /**
   * Curated, structured visual explanations. Legacy diagram fields are
   * intentionally excluded: lessons now render only this safe visual grammar.
   */
  visuals?: LessonVisual[];
  /** Safe, optional practice widgets selected from the app's interaction grammar. */
  interactions?: LessonInteraction[];
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
    interactionQualityGateVersion?: string;
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
