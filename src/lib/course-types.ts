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
  authorId?: string;
  authorName?: string;
  authorPhoto?: string;
  isPublic?: boolean;
  level?: "Foundations" | "Intermediate" | "Advanced";
  estimatedMinutes?: number;
  outcome?: string;
  prerequisites?: string[];
  category?: string;
  updatedAt?: string;
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
  email?: string;
  displayName?: string;
  photoURL?: string;
  subscriptionStatus?: "none" | "trialing" | "active" | "past_due" | "canceled";
  currentPeriodEnd?: string;
  quotas: AiQuotaSummary[];
}
