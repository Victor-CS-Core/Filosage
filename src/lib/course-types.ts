export interface LessonSummary {
  title: string;
  concept: string;
  estimatedMinutes?: number;
}

export interface CourseModule {
  title: string;
  description?: string;
  lessons: LessonSummary[];
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
  updatedAt?: string;
  aiAssisted?: boolean;
}

export interface Quiz {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface LessonData {
  content: string;
  diagram: string;
  diagramSummary?: string;
  quizzes: Quiz[];
  aiAssisted?: boolean;
}

export type LearnerPlan = "free" | "pro";
export type AccessLevel = "anonymous" | "free" | "pro" | "owner";

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
  displayName?: string;
  photoURL?: string;
  subscriptionStatus?: "none" | "trialing" | "active" | "past_due" | "canceled";
  currentPeriodEnd?: string;
  acceptedTermsVersion?: string;
  acceptedPrivacyVersion?: string;
  legalAcceptanceRequired?: boolean;
  quotas: AiQuotaSummary[];
}
