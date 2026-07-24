import type { AccountStatus, LearnerPlan } from "@/lib/course-types";
import type { AiFeature } from "@/lib/ai-usage";

export interface AdminFeatureUsage {
  feature: AiFeature;
  requests: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AdminUserSummary {
  uid: string;
  displayName: string;
  email?: string;
  photoURL?: string;
  plan: LearnerPlan;
  accountStatus: AccountStatus;
  isOwner: boolean;
  createdAt?: string;
  lastSeenAt?: string;
  manualProUntil?: string;
  requestCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number;
  safetyBlocks: number;
  courseCount: number;
  coursesStarted: number;
  lessonsCompleted: number;
  studyMinutes: number;
  retrievalSessions: number;
  reviewSessions: number;
  quizAccuracy: number;
  lastLearningActivityAt?: string;
  featureUsage: AdminFeatureUsage[];
}

export interface AdminOverview {
  generatedAt: string;
  range: { days: number; from: string; to: string };
  summary: {
    pageViews: number;
    activeUsers: number;
    totalUsers: number;
    generations: number;
    failedRequests: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    safetyBlocks: number;
    publicCourses: number;
    privateCourses: number;
    coursesStarted: number;
    lessonsCompleted: number;
    studyMinutes: number;
    retrievalSessions: number;
    reviewSessions: number;
    quizAccuracy: number;
  };
  budget: {
    month: string;
    limitUsd: number;
    spentUsd: number;
    reservedUsd: number;
    percentUsed: number;
  };
  trafficSeries: Array<{ date: string; views: number }>;
  topRoutes: Array<{ route: string; views: number }>;
  generationSeries: Array<{
    date: string;
    courseOutlines: number;
    lessons: number;
    tutor: number;
    failed: number;
  }>;
  engagementSeries: Array<{
    date: string;
    coursesStarted: number;
    lessonsCompleted: number;
    studyMinutes: number;
    retrievalSessions: number;
    reviewSessions: number;
  }>;
  users: AdminUserSummary[];
  recentGenerations: Array<{
    id: string;
    uid: string;
    userLabel: string;
    feature: AiFeature;
    model?: string;
    status: string;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    costUsd: number;
    createdAt?: string;
  }>;
  recentCourses: Array<{
    id: string;
    topic: string;
    uid: string;
    userLabel: string;
    isPublic: boolean;
    lessonCount: number;
    updatedAt?: string;
  }>;
  safetyEvents: Array<{
    id: string;
    uid: string;
    userLabel: string;
    feature: AiFeature;
    stage: "input" | "output";
    categories: string[];
    cooldownApplied: boolean;
    createdAt?: string;
  }>;
  adminEvents: Array<{
    id: string;
    action: string;
    targetLabel: string;
    reason?: string;
    createdAt?: string;
  }>;
}
