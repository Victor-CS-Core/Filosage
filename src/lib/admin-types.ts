import type { AccountStatus, LearnerPlan } from "@/lib/course-types";
import type { AiFeature } from "@/lib/ai-usage";
import type { AcquisitionChannel, ProductEventName } from "@/lib/product-events";

export interface AdminFeatureUsage {
  feature: AiFeature;
  requests: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
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
  cacheWriteTokens: number;
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
    cacheWriteTokens: number;
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
    pools: Array<{
      pool: "free" | "paid" | "owner";
      limitUsd: number;
      spentUsd: number;
      reservedUsd: number;
      percentUsed: number;
    }>;
  };
  monetization: {
    waitlistCount: number;
    plannedMonthlyPriceUsd: number;
    plannedAnnualPriceUsd: number;
    paymentFeeEstimateUsd: number;
    modeledAiCostPerSubscriberUsd: number;
    modeledContributionPerSubscriberUsd: number;
    modeledContributionMarginPercent: number;
  };
  growth: {
    uniqueActors: number;
    events: number;
    funnel: Array<{
      event: ProductEventName;
      label: string;
      events: number;
      uniqueActors: number;
      conversionFromPrevious: number | null;
    }>;
    acquisition: Array<{
      channel: AcquisitionChannel;
      events: number;
      uniqueActors: number;
      courseStarts: number;
    }>;
  };
  outcomeValidation: {
    diagnosticCompleters: number;
    firstPracticeCompleters: number;
    diagnosticToPracticePercent: number;
    medianMinutesToFirstPractice: number | null;
    comparableCapstones: number;
    improvedCapstones: number;
    improvementRatePercent: number;
    evidenceReportViews: number;
    openContentReports: number;
    usefulnessResponses: number;
    usefulnessPercent: number;
  };
  retentionValidation: {
    day7Eligible: number;
    day7Returned: number;
    day7RetentionPercent: number;
    day28Eligible: number;
    day28Returned: number;
    day28RetentionPercent: number;
    reviewDueActors: number;
    reviewCompleters: number;
    reviewCompletionPercent: number;
    missionViewers: number;
    missionStarters: number;
    missionStartPercent: number;
    delayedCheckCompleters: number;
    appliedCriterionPercent: number;
  };
  paidLaunch: {
    referralLinksCopied: number;
    referredVisitors: number;
    referredCourseStarts: number;
    referralToCoursePercent: number;
    activeSubscribers: number;
    pastDueSubscribers: number;
    canceledSubscribers: number;
    failedWebhookEvents: number;
  };
  launchReadiness: {
    mode: "closed" | "open";
    billingLockActive: boolean;
    paymentProviderConfigured: boolean;
    activityReceiptsConfigured: boolean;
    operationsAlertsConfigured: boolean;
    managedBackupsConfigured: boolean;
    productionHealthMonitorConfigured: boolean;
    supportChannelConfigured: boolean;
    lifecycleMessagingConfigured: boolean;
    openContentReports: number;
    pricingIntent: {
      total: number;
      readyNow: number;
      within30Days: number;
      researching: number;
      monthlyPreferred: number;
      annualPreferred: number;
    };
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
    cacheWriteTokens: number;
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
  contentReports: Array<{
    id: string;
    courseId: string;
    lessonId: string;
    topic: string;
    lessonTitle?: string;
    category: "accuracy" | "outdated" | "source" | "clarity" | "safety" | "copyright" | "other";
    note?: string;
    contentVersion?: string;
    status: "open" | "resolved" | "dismissed";
    createdAt?: string;
    reviewedAt?: string;
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
