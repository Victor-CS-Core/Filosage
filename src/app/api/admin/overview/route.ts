import { authorizationResponse, requireOwner } from "@/lib/auth-server";
import {
  countCollectionDocuments,
  getStoredDocument,
  listAllStoredDocuments,
  listCollectionDocumentsByRange,
  listStoredDocumentsByField,
} from "@/lib/firebase-server";
import type {
  AdminFeatureUsage,
  AdminOverview,
  OperationalReadinessControl,
  AdminUserSummary,
} from "@/lib/admin-types";
import type { AiFeature } from "@/lib/ai-usage";
import { aiBudgetLimitsUsd, type AiBudgetPool } from "@/lib/ai-usage";
import { SUPPORT_CONTACT } from "@/lib/legal";
import { billingConfiguration } from "@/lib/runtime-config";
import {
  ACQUISITION_CHANNELS,
  type AcquisitionChannel,
  type ProductEventName,
} from "@/lib/product-events";
import { serverEnvironment } from "@/lib/runtime-environment";
import {
  annualMonthlyEquivalentMinor,
  annualSavingsPercent,
  MEMBERSHIP_PLANS,
  isBillingInterval,
  isPaidLearnerPlan,
  offerFor,
  type PaidLearnerPlan,
} from "@/lib/membership-plans";
import { calculateMembershipAnalytics, effectiveMembershipPlan } from "@/lib/membership-analytics";
import { azureInfrastructure } from "@/lib/azure-infrastructure";
import { courseAuthorIdsForAccount } from "@/lib/course-owner-identity";
import { buildMarketingFunnels, orderedIntentCompletion, retentionAtDay } from "@/lib/product-metrics";

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function dateValue(value: unknown) {
  const candidate = stringValue(value);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : undefined;
}

function operationalControl(options: {
  configured: boolean;
  evidence: Record<string, unknown> | null;
  healthyForHours: number;
  missingDetail: string;
  unverifiedDetail: string;
  healthyDetail: string;
}): OperationalReadinessControl {
  if (!options.configured) {
    return { configured: false, ready: false, state: "missing", detail: options.missingDetail };
  }
  if (!options.evidence) {
    return { configured: true, ready: false, state: "unverified", detail: options.unverifiedDetail };
  }
  const status = stringValue(options.evidence.status);
  const lastEventAt = dateValue(options.evidence.completedAt)
    ?? dateValue(options.evidence.failedAt)
    ?? dateValue(options.evidence.startedAt);
  const evidenceUri = stringValue(options.evidence.outputUriPrefix)
    ?? stringValue(options.evidence.inputUriPrefix);
  if (status === "failed") {
    return {
      configured: true,
      ready: false,
      state: "failed",
      detail: `The latest operation failed${lastEventAt ? ` on ${new Date(lastEventAt).toLocaleDateString("en-US")}` : ""}.`,
      lastEventAt,
      evidenceUri,
    };
  }
  if (status === "running") {
    return {
      configured: true,
      ready: false,
      state: "running",
      detail: "An operation is currently running; readiness requires successful completion.",
      lastEventAt,
      evidenceUri,
    };
  }
  if (status !== "succeeded" || !lastEventAt) {
    return { configured: true, ready: false, state: "unverified", detail: options.unverifiedDetail, lastEventAt, evidenceUri };
  }
  const fresh = Date.now() - Date.parse(lastEventAt) <= options.healthyForHours * 60 * 60_000;
  return {
    configured: true,
    ready: fresh,
    state: fresh ? "healthy" : "stale",
    detail: fresh ? options.healthyDetail : `The latest successful evidence is older than ${Math.round(options.healthyForHours / 24)} days.`,
    lastEventAt,
    evidenceUri,
  };
}

function accountSubscriptionStatus(value: unknown): AdminUserSummary["subscriptionStatus"] {
  return value === "trialing" || value === "active" || value === "past_due" || value === "canceled"
    ? value
    : "none";
}

function microsToUsd(value: unknown) {
  return numberValue(value) / 1_000_000;
}

function featureValue(value: unknown): AiFeature {
  if (value === "course_outline" || value === "course_banner" || value === "lesson_generation" || value === "tutor" || value === "command_center_draft") return value;
  return "tutor";
}

function acquisitionChannel(value: unknown): AcquisitionChannel {
  return ACQUISITION_CHANNELS.includes(value as AcquisitionChannel)
    ? value as AcquisitionChannel
    : "direct";
}

function dayKeys(days: number) {
  const today = new Date();
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() - (days - 1 - index),
    ));
    return date.toISOString().slice(0, 10);
  });
}

function labelForUser(user: { displayName: string; email?: string; isOwner: boolean }) {
  if (user.isOwner) return "Owner account";
  return user.displayName || user.email || "Learner";
}

export async function GET(request: Request) {
  try {
    const owner = await requireOwner(request);
    const requestedDays = Number(new URL(request.url).searchParams.get("days") ?? 30);
    const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
    const dates = dayKeys(days);
    const dateSet = new Set(dates);
    const fromTime = Date.parse(`${dates[0]}T00:00:00.000Z`);
    const fromIso = `${dates[0]}T00:00:00.000Z`;
    const nowIso = new Date().toISOString();
    const currentMonth = nowIso.slice(0, 7);

    const [
      rawUsers,
      userEngagement,
      dailyEngagement,
      legacyTraffic,
      shardedTraffic,
      usagePeriods,
      aiRequests,
      courses,
      safetyEvents,
      adminEvents,
      systemUsageShards,
      legacySystemUsage,
      ownerRecord,
      totalUsers,
      publicCourseCount,
      privateCourseCount,
      waitlistCount,
      productEvents,
      contentReports,
      outcomeFeedback,
      stripeEvents,
      pricingIntents,
      totalContentReportCount,
      resolvedContentReportCount,
      dismissedContentReportCount,
      backupEvidence,
      alertTestEvidence,
      restoreEvidence,
      infrastructure,
    ] = await Promise.all([
      listAllStoredDocuments("users", 10_000),
      listCollectionDocumentsByRange("userEngagement", "lastActivityAt", "1970-01-01T00:00:00.000Z", nowIso, 10_000),
      listCollectionDocumentsByRange("engagementDaily", "date", dates[0], dates[dates.length - 1], 10_000),
      listCollectionDocumentsByRange("trafficDaily", "date", dates[0], dates[dates.length - 1], 10_000),
      listCollectionDocumentsByRange("trafficDailyShards", "date", dates[0], dates[dates.length - 1], 10_000),
      listStoredDocumentsByField("usagePeriods", "periodKey", currentMonth, 10_000),
      listCollectionDocumentsByRange("aiRequests", "createdAt", fromIso, nowIso, 10_000),
      listCollectionDocumentsByRange("courses", "updatedAt", "1970-01-01T00:00:00.000Z", nowIso, 10_000),
      listCollectionDocumentsByRange("safetyEvents", "createdAt", fromIso, nowIso, 10_000),
      listCollectionDocumentsByRange("adminEvents", "createdAt", fromIso, nowIso, 10_000),
      listStoredDocumentsByField("systemUsageShards", "periodKey", currentMonth, 10_000),
      getStoredDocument(`systemUsage/${currentMonth}`),
      getStoredDocument(`users/${owner.uid}`),
      countCollectionDocuments("users"),
      countCollectionDocuments("courses", [{ field: "isPublic", value: true }]),
      countCollectionDocuments("courses", [{ field: "isPublic", value: false }]),
      countCollectionDocuments("waitlist"),
      listCollectionDocumentsByRange("productEvents", "createdAt", "1970-01-01T00:00:00.000Z", nowIso, 10_000),
      listCollectionDocumentsByRange("contentReports", "createdAt", "1970-01-01T00:00:00.000Z", nowIso, 10_000),
      listCollectionDocumentsByRange("outcomeFeedback", "createdAt", fromIso, nowIso, 10_000),
      listCollectionDocumentsByRange("stripeEvents", "claimedAt", fromIso, nowIso, 10_000),
      listCollectionDocumentsByRange("pricingIntents", "updatedAt", "1970-01-01T00:00:00.000Z", nowIso, 10_000),
      countCollectionDocuments("contentReports"),
      countCollectionDocuments("contentReports", [{ field: "status", value: "resolved" }]),
      countCollectionDocuments("contentReports", [{ field: "status", value: "dismissed" }]),
      getStoredDocument("operationalEvidence/postgres-backup-latest"),
      getStoredDocument("operationalEvidence/alert-test-latest"),
      getStoredDocument("operationalEvidence/postgres-restore-latest"),
      azureInfrastructure(),
    ]);
    if (ownerRecord && !rawUsers.some((record) => record.id === owner.uid || record.uid === owner.uid)) {
      rawUsers.unshift(ownerRecord);
    }
    const traffic = [...legacyTraffic, ...shardedTraffic];
    const alertsConfigured = Boolean(
      serverEnvironment.OPERATIONS_ALERT_WEBHOOK_URL?.trim()
      && serverEnvironment.OPERATIONS_ALERT_WEBHOOK_SECRET?.trim(),
    );
    const backupsConfigured = Boolean(
      serverEnvironment.AZURE_POSTGRES_SERVER_NAME?.trim()
      && serverEnvironment.AZURE_RESOURCE_GROUP?.trim(),
    );
    const operationsAlerts = operationalControl({
      configured: alertsConfigured,
      evidence: alertTestEvidence,
      healthyForHours: 90 * 24,
      missingDetail: "A monitored webhook URL and signing secret are both required.",
      unverifiedDetail: "Configuration exists, but no acknowledged signed test is recorded.",
      healthyDetail: "A signed test alert was acknowledged and retained as evidence.",
    });
    const managedBackups = operationalControl({
      configured: backupsConfigured,
      evidence: backupEvidence,
      healthyForHours: 36,
      missingDetail: "The Azure PostgreSQL server and resource group must be configured.",
      unverifiedDetail: "Azure backups are configured, but no retained backup evidence is recorded.",
      healthyDetail: "Recent Azure PostgreSQL backup evidence is recorded.",
    });
    const restoreDrill = operationalControl({
      configured: backupsConfigured,
      evidence: restoreEvidence,
      healthyForHours: 100 * 24,
      missingDetail: "Restore testing requires the Azure PostgreSQL backup configuration.",
      unverifiedDetail: "No successful point-in-time restore into a recovery server is recorded.",
      healthyDetail: "A successful restore operation is recorded within the last 100 days.",
    });

    const userRows = rawUsers.map((record) => {
      const uid = stringValue(record.uid) ?? record.id;
      const isOwner = uid === owner.uid;
      return {
        uid,
        displayName: isOwner
          ? "Owner"
          : stringValue(record.displayName) ?? stringValue(record.email)?.split("@")[0] ?? "Learner",
        email: isOwner ? undefined : stringValue(record.email),
        photoURL: stringValue(record.photoURL),
        plan: isOwner ? "pro" as const : effectiveMembershipPlan(record),
        accountStatus: record.accountStatus === "suspended" && !isOwner
          ? "suspended" as const
          : "active" as const,
        isOwner,
        createdAt: dateValue(record.createdAt),
        lastSeenAt: dateValue(record.updatedAt),
        manualPlan: isPaidLearnerPlan(record.manualPlan)
          ? record.manualPlan
          : stringValue(record.manualProUntil) ? "pro" as const : undefined,
        manualPlanUntil: stringValue(record.manualPlanUntil) ?? stringValue(record.manualProUntil),
        manualProUntil: stringValue(record.manualProUntil),
        billingPlan: isPaidLearnerPlan(record.billingPlan) ? record.billingPlan : undefined,
        billingInterval: isBillingInterval(record.billingInterval) ? record.billingInterval : undefined,
        subscriptionStatus: accountSubscriptionStatus(record.subscriptionStatus),
        billingRawStatus: stringValue(record.billingRawStatus),
      };
    });
    const usageByUser = new Map<string, Map<AiFeature, AdminFeatureUsage>>();
    for (const period of usagePeriods) {
      const uid = stringValue(period.uid);
      if (!uid) continue;
      const feature = featureValue(period.feature);
      const byFeature = usageByUser.get(uid) ?? new Map<AiFeature, AdminFeatureUsage>();
      const current = byFeature.get(feature) ?? {
        feature,
        requests: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      };
      current.requests += numberValue(period.requestCount);
      current.inputTokens += numberValue(period.inputTokens);
      current.cachedInputTokens += numberValue(period.cachedInputTokens);
      current.cacheWriteTokens += numberValue(period.cacheWriteTokens);
      current.outputTokens += numberValue(period.outputTokens);
      current.costUsd += microsToUsd(period.actualCostMicros);
      byFeature.set(feature, current);
      usageByUser.set(uid, byFeature);
    }

    const safetyCountByUser = new Map<string, number>();
    for (const event of safetyEvents) {
      const uid = stringValue(event.uid);
      if (uid) safetyCountByUser.set(uid, (safetyCountByUser.get(uid) ?? 0) + 1);
    }
    const ownerAuthorIds = new Set(courseAuthorIdsForAccount(owner));
    const canonicalAuthorUid = (uid: string) => ownerAuthorIds.has(uid) ? owner.uid : uid;
    const courseCountByUser = new Map<string, number>();
    for (const course of courses) {
      const rawUid = stringValue(course.authorId);
      const uid = rawUid ? canonicalAuthorUid(rawUid) : undefined;
      if (uid) courseCountByUser.set(uid, (courseCountByUser.get(uid) ?? 0) + 1);
    }
    const engagementByUser = new Map(userEngagement.flatMap((record) => {
      const uid = stringValue(record.uid);
      return uid ? [[uid, record] as const] : [];
    }));

    const users: AdminUserSummary[] = userRows.map((user) => {
      const recordedUsage = usageByUser.get(user.uid) ?? new Map<AiFeature, AdminFeatureUsage>();
      const planLimits = MEMBERSHIP_PLANS[user.plan].limits;
      const features: AiFeature[] = ["course_outline", "course_banner", "lesson_generation", "tutor", ...(user.isOwner ? ["command_center_draft" as const] : [])];
      const featureUsage = features.map((feature) => {
        const usage = recordedUsage.get(feature) ?? { feature, requests: 0, inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0, costUsd: 0 };
        const limit = user.isOwner
          ? null
          : feature === "course_outline" ? (user.plan === "free" ? 0 : null)
            : feature === "tutor" ? planLimits.tutorQuestions
              : feature === "command_center_draft" ? 0
                : null;
        return { ...usage, limit, remaining: limit === null ? null : Math.max(0, limit - usage.requests) };
      });
      const engagement = engagementByUser.get(user.uid);
      const questionsAnswered = numberValue(engagement?.questionsAnswered);
      return {
        ...user,
        requestCount: featureUsage.reduce((sum, item) => sum + item.requests, 0),
        inputTokens: featureUsage.reduce((sum, item) => sum + item.inputTokens, 0),
        cachedInputTokens: featureUsage.reduce((sum, item) => sum + item.cachedInputTokens, 0),
        cacheWriteTokens: featureUsage.reduce((sum, item) => sum + item.cacheWriteTokens, 0),
        outputTokens: featureUsage.reduce((sum, item) => sum + item.outputTokens, 0),
        costUsd: featureUsage.reduce((sum, item) => sum + item.costUsd, 0),
        safetyBlocks: safetyCountByUser.get(user.uid) ?? 0,
        courseCount: courseCountByUser.get(user.uid) ?? 0,
        coursesStarted: numberValue(engagement?.coursesStarted),
        lessonsCompleted: numberValue(engagement?.lessonsCompleted),
        studyMinutes: numberValue(engagement?.studyMinutes),
        retrievalSessions: numberValue(engagement?.retrievalSessions),
        reviewSessions: numberValue(engagement?.reviewSessions),
        quizAccuracy: questionsAnswered
          ? Math.round((numberValue(engagement?.correctAnswers) / questionsAnswered) * 100)
          : 0,
        lastLearningActivityAt: dateValue(engagement?.lastActivityAt),
        featureUsage,
      };
    }).sort((a, b) => {
      if (a.isOwner) return -1;
      if (b.isOwner) return 1;
      return Date.parse(b.lastSeenAt ?? "1970-01-01") - Date.parse(a.lastSeenAt ?? "1970-01-01");
    });

    const trafficInRange = traffic.filter((record) => dateSet.has(String(record.date ?? "")));
    const engagementInRange = dailyEngagement.filter((record) => dateSet.has(String(record.date ?? "")));
    const trafficByDate = new Map(dates.map((date) => [date, 0]));
    const routeTotals = new Map<string, number>();
    for (const record of trafficInRange) {
      const date = String(record.date);
      const views = numberValue(record.views);
      trafficByDate.set(date, (trafficByDate.get(date) ?? 0) + views);
      const route = stringValue(record.route) ?? "/other";
      routeTotals.set(route, (routeTotals.get(route) ?? 0) + views);
    }

    const requestsInRange = aiRequests.filter((record) => {
      const createdAt = dateValue(record.createdAt);
      return createdAt && Date.parse(createdAt) >= fromTime;
    });
    const generationByDate = new Map(dates.map((date) => [date, {
      date,
      courseOutlines: 0,
      courseBanners: 0,
      lessons: 0,
      tutor: 0,
      commandCenterDrafts: 0,
      failed: 0,
    }]));
    for (const record of requestsInRange) {
      const date = String(record.createdAt).slice(0, 10);
      const point = generationByDate.get(date);
      if (!point) continue;
      if (record.status === "failed") point.failed += 1;
      const feature = featureValue(record.feature);
      if (feature === "course_outline") point.courseOutlines += 1;
      else if (feature === "course_banner") point.courseBanners += 1;
      else if (feature === "lesson_generation") point.lessons += 1;
      else if (feature === "command_center_draft") point.commandCenterDrafts += 1;
      else point.tutor += 1;
    }

    const activeUserIds = new Set<string>();
    for (const user of userRows) {
      if ((user.lastSeenAt && Date.parse(user.lastSeenAt) >= fromTime)
        || (dateValue(engagementByUser.get(user.uid)?.lastActivityAt)
          && Date.parse(String(engagementByUser.get(user.uid)?.lastActivityAt)) >= fromTime)) {
        activeUserIds.add(user.uid);
      }
    }
    for (const record of engagementInRange) {
      const uid = stringValue(record.uid);
      if (uid) activeUserIds.add(uid);
    }
    const activeUsers = activeUserIds.size;
    const safetyInRange = safetyEvents.filter((event) => {
      const createdAt = dateValue(event.createdAt);
      return createdAt && Date.parse(createdAt) >= fromTime;
    });
    const poolLimits = aiBudgetLimitsUsd();
    const poolUsage = (Object.keys(poolLimits) as AiBudgetPool[]).map((pool) => {
      const records = systemUsageShards.filter((record) => record.pool === pool);
      const spentUsd = records.reduce((sum, record) => sum + microsToUsd(record.actualCostMicros), 0);
      const reservedUsd = records.reduce((sum, record) => sum + microsToUsd(record.reservedCostMicros), 0);
      const limitUsd = poolLimits[pool];
      return {
        pool,
        limitUsd,
        spentUsd,
        reservedUsd,
        percentUsed: Math.min(100, ((spentUsd + reservedUsd) / limitUsd) * 100),
      };
    });
    const legacySpentUsd = microsToUsd(legacySystemUsage?.actualCostMicros);
    const legacyReservedUsd = microsToUsd(legacySystemUsage?.reservedCostMicros);
    const budgetPools: AdminOverview["budget"]["pools"] = [
      ...poolUsage,
      ...((legacySpentUsd || legacyReservedUsd) ? [{
        pool: "legacy" as const,
        limitUsd: 0,
        spentUsd: legacySpentUsd,
        reservedUsd: legacyReservedUsd,
        percentUsed: 0,
      }] : []),
    ];
    const limitUsd = poolUsage.reduce((sum, pool) => sum + pool.limitUsd, 0);
    const spentUsd = budgetPools.reduce((sum, pool) => sum + pool.spentUsd, 0);
    const reservedUsd = budgetPools.reduce((sum, pool) => sum + pool.reservedUsd, 0);
    const monetizationPlans = (["plus", "pro"] as PaidLearnerPlan[]).map((plan) => {
      const monthlyPriceUsd = offerFor(plan, "monthly").amountMinor / 100;
      const annualPriceUsd = offerFor(plan, "annual").amountMinor / 100;
      return {
        plan,
        monthlyPriceUsd,
        annualPriceUsd,
        annualMonthlyEquivalentUsd: annualMonthlyEquivalentMinor(plan) / 100,
        annualSavingsPercent: annualSavingsPercent(plan),
      };
    });

    const userLabel = (uid: string) => {
      const user = users.find((candidate) => candidate.uid === uid);
      return user ? labelForUser(user) : "Deleted account";
    };
    const productEventsInRange = productEvents.filter((record) => {
      const createdAt = dateValue(record.createdAt);
      return createdAt && Date.parse(createdAt) >= fromTime;
    });
    const eventActors = (event: ProductEventName) => new Set(
      productEventsInRange.flatMap((record) => record.event === event && typeof record.actorId === "string"
        ? [record.actorId]
        : []),
    );
    const accountEventsInRange = productEventsInRange.filter((record) => record.actorId !== owner.uid);
    const marketingFunnels = buildMarketingFunnels(accountEventsInRange);
    const acquisition = ACQUISITION_CHANNELS.map((channel) => {
      const channelEvents = productEventsInRange.filter((record) => acquisitionChannel(record.channel ?? record.source) === channel);
      return {
        channel,
        events: channelEvents.length,
        measuredSessions: new Set(channelEvents.flatMap((record) => typeof record.sessionId === "string" ? [record.sessionId] : [])).size,
        courseStarts: channelEvents.filter((record) => record.event === "course_started").length,
      };
    }).filter((channel) => channel.events);
    const measuredSessions = new Set(productEventsInRange.flatMap((record) => (
      typeof record.sessionId === "string" ? [record.sessionId] : []
    ))).size;
    const verifiedLearners = new Set(accountEventsInRange.flatMap((record) => (
      typeof record.actorId === "string" ? [record.actorId] : []
    ))).size;
    const day7Retention = retentionAtDay(productEvents, 7, new Date(), owner.uid);
    const day28Retention = retentionAtDay(productEvents, 28, new Date(), owner.uid);
    const diagnosticActors = eventActors("diagnostic_completed");
    const practiceActors = eventActors("first_practice_completed");
    const reviewCompletion = orderedIntentCompletion(accountEventsInRange, "review_due", "review_completed");
    const criterionActors = eventActors("criterion_demonstrated");
    const diagnosticToPracticeActors = new Set(
      Array.from(practiceActors).filter((actorId) => diagnosticActors.has(actorId)),
    );
    const elapsedMinutes = productEventsInRange.flatMap((record) => (
      record.event === "first_practice_completed"
        && typeof record.elapsedMs === "number"
        && record.elapsedMs > 0
        && typeof record.actorId === "string"
        && diagnosticActors.has(record.actorId)
        ? [record.elapsedMs / 60_000]
        : []
    )).sort((left, right) => left - right);
    const medianMinutesToFirstPractice = elapsedMinutes.length
      ? elapsedMinutes.length % 2
        ? elapsedMinutes[Math.floor(elapsedMinutes.length / 2)]
        : (elapsedMinutes[elapsedMinutes.length / 2 - 1] + elapsedMinutes[elapsedMinutes.length / 2]) / 2
      : null;
    const latestScores = (event: "baseline_assessed" | "capstone_submitted") => {
      const scores = new Map<string, { score: number; createdAt: string }>();
      for (const record of productEvents) {
        if (record.event !== event || typeof record.actorId !== "string" || typeof record.score !== "number") continue;
        const createdAt = dateValue(record.createdAt) ?? "";
        const current = scores.get(record.actorId);
        if (!current || createdAt >= current.createdAt) scores.set(record.actorId, { score: record.score, createdAt });
      }
      return scores;
    };
    const baselineScores = latestScores("baseline_assessed");
    const capstoneScores = latestScores("capstone_submitted");
    const comparableActors = Array.from(capstoneScores.keys()).filter((actorId) => baselineScores.has(actorId));
    const improvedCapstones = comparableActors.filter((actorId) => (
      (capstoneScores.get(actorId)?.score ?? 0) > (baselineScores.get(actorId)?.score ?? 0)
    )).length;
    const referredEvents = productEventsInRange.filter((record) => (
      acquisitionChannel(record.channel ?? record.source) === "referral"
    ));
    const referredVisitors = new Set(referredEvents.flatMap((record) => (
      typeof record.actorId === "string" ? [record.actorId] : []
    ))).size;
    const referredCourseStarts = new Set(referredEvents.flatMap((record) => (
      record.event === "course_started" && typeof record.actorId === "string" ? [record.actorId] : []
    ))).size;
    const billing = billingConfiguration();
    const membership = calculateMembershipAnalytics(rawUsers, {
      ownerUid: owner.uid,
      totalAccountCount: totalUsers,
    });
    const freeAccountIds = new Set(userRows.filter((user) => !user.isOwner && user.plan === "free").map((user) => user.uid));
    const eligiblePricingIntents = pricingIntents.filter((record) => typeof record.uid === "string" && freeAccountIds.has(record.uid));
    const openContentReportCount = Math.max(0, totalContentReportCount - resolvedContentReportCount - dismissedContentReportCount);
    const limitedSources = [
      ["users", rawUsers], ["user engagement", userEngagement], ["daily engagement", dailyEngagement],
      ["traffic", legacyTraffic], ["traffic shards", shardedTraffic], ["usage periods", usagePeriods],
      ["AI requests", aiRequests], ["courses", courses], ["safety events", safetyEvents],
      ["owner actions", adminEvents], ["usage shards", systemUsageShards], ["product events", productEvents],
      ["content report queue", contentReports], ["outcome feedback", outcomeFeedback],
      ["Stripe events", stripeEvents], ["pricing intents", pricingIntents],
    ].flatMap(([label, records]) => (records as Array<unknown>).length >= 10_000 ? [label as string] : []);
    const pricingIntent = {
      total: eligiblePricingIntents.length,
      readyNow: eligiblePricingIntents.filter((record) => record.readiness === "ready_now").length,
      within30Days: eligiblePricingIntents.filter((record) => record.readiness === "within_30_days").length,
      researching: eligiblePricingIntents.filter((record) => record.readiness === "researching").length,
      plusPreferred: eligiblePricingIntents.filter((record) => record.planId === "plus").length,
      proPreferred: eligiblePricingIntents.filter((record) => record.planId === "pro").length,
      monthlyPreferred: eligiblePricingIntents.filter((record) => record.interval === "monthly").length,
      annualPreferred: eligiblePricingIntents.filter((record) => record.interval === "annual").length,
    };

    const overview: AdminOverview = {
      generatedAt: new Date().toISOString(),
      range: { days, from: dates[0], to: dates[dates.length - 1] },
      dataCoverage: { complete: limitedSources.length === 0, limitedSources },
      summary: {
        pageViews: trafficInRange.reduce((sum, record) => sum + numberValue(record.views), 0),
        activeUsers,
        totalUsers,
        generations: requestsInRange.length,
        completedRequests: requestsInRange.filter((record) => record.status === "completed").length,
        failedRequests: requestsInRange.filter((record) => record.status === "failed").length,
        inputTokens: requestsInRange.reduce((sum, record) => sum + numberValue(record.inputTokens), 0),
        cachedInputTokens: requestsInRange.reduce((sum, record) => sum + numberValue(record.cachedInputTokens), 0),
        cacheWriteTokens: requestsInRange.reduce((sum, record) => sum + numberValue(record.cacheWriteTokens), 0),
        outputTokens: requestsInRange.reduce((sum, record) => sum + numberValue(record.outputTokens), 0),
        estimatedCostUsd: requestsInRange.reduce((sum, record) => sum + microsToUsd(record.actualCostMicros), 0),
        safetyBlocks: safetyInRange.length,
        publicCourses: publicCourseCount,
        privateCourses: privateCourseCount,
        coursesStarted: engagementInRange.reduce((sum, record) => sum + numberValue(record.coursesStarted), 0),
        lessonsCompleted: engagementInRange.reduce((sum, record) => sum + numberValue(record.lessonsCompleted), 0),
        studyMinutes: engagementInRange.reduce((sum, record) => sum + numberValue(record.studyMinutes), 0),
        retrievalSessions: engagementInRange.reduce((sum, record) => sum + numberValue(record.retrievalSessions), 0),
        reviewSessions: engagementInRange.reduce((sum, record) => sum + numberValue(record.reviewSessions), 0),
        quizAccuracy: (() => {
          const answered = engagementInRange.reduce((sum, record) => sum + numberValue(record.questionsAnswered), 0);
          const correct = engagementInRange.reduce((sum, record) => sum + numberValue(record.correctAnswers), 0);
          return answered ? Math.round((correct / answered) * 100) : 0;
        })(),
      },
      budget: {
        month: currentMonth,
        limitUsd,
        spentUsd,
        reservedUsd,
        percentUsed: Math.min(100, ((spentUsd + reservedUsd) / limitUsd) * 100),
        pools: budgetPools,
      },
      infrastructure,
      monetization: {
        waitlistCount,
        plans: monetizationPlans,
      },
      membership,
      growth: {
        measuredSessions,
        verifiedLearners,
        events: productEventsInRange.length,
        acquisitionFunnel: marketingFunnels.acquisition,
        activationFunnel: marketingFunnels.activation,
        existingAccountActivation: marketingFunnels.existingAccountActivation,
        acquisition,
      },
      outcomeValidation: {
        diagnosticCompleters: diagnosticActors.size,
        firstPracticeCompleters: diagnosticToPracticeActors.size,
        diagnosticToPracticePercent: diagnosticActors.size
          ? Math.round((diagnosticToPracticeActors.size / diagnosticActors.size) * 1_000) / 10
          : 0,
        medianMinutesToFirstPractice: medianMinutesToFirstPractice === null
          ? null
          : Math.round(medianMinutesToFirstPractice * 10) / 10,
        comparableCapstones: comparableActors.length,
        improvedCapstones,
        improvementRatePercent: comparableActors.length
          ? Math.round((improvedCapstones / comparableActors.length) * 1_000) / 10
          : 0,
        evidenceReportViews: productEventsInRange.filter((record) => record.event === "evidence_report_viewed").length,
        openContentReports: openContentReportCount,
        usefulnessResponses: outcomeFeedback.length,
        usefulnessPercent: outcomeFeedback.length
          ? Math.round((outcomeFeedback.filter((feedback) => feedback.useful === true).length / outcomeFeedback.length) * 1_000) / 10
          : 0,
      },
      retentionValidation: {
        day7Eligible: day7Retention.eligible,
        day7Returned: day7Retention.returned,
        day7RetentionPercent: day7Retention.percent,
        day28Eligible: day28Retention.eligible,
        day28Returned: day28Retention.returned,
        day28RetentionPercent: day28Retention.percent,
        reviewDueActors: reviewCompletion.intentActors,
        reviewCompleters: reviewCompletion.completionActors,
        reviewCompletionPercent: reviewCompletion.percent,
        delayedCheckCompleters: eventActors("delayed_check_completed").size,
        appliedCriterionPercent: practiceActors.size
          ? Math.round((criterionActors.size / practiceActors.size) * 1_000) / 10
          : 0,
      },
      paidLaunch: {
        referralLinksCopied: productEventsInRange.filter((record) => record.event === "referral_link_copied").length,
        referredVisitors,
        referredCourseStarts,
        referralToCoursePercent: referredVisitors
          ? Math.round((referredCourseStarts / referredVisitors) * 1_000) / 10
          : 0,
        activeSubscribers: membership.activeSubscribers,
        pastDueSubscribers: membership.pastDueSubscribers,
        canceledSubscribers: membership.canceledSubscribers,
        failedWebhookEvents: stripeEvents.filter((record) => record.status === "failed").length,
      },
      launchReadiness: {
        mode: billing.configured ? "open" : "closed",
        billingLockActive: !billing.enabled,
        paymentProviderConfigured: billing.providerReady,
        activityReceiptsConfigured: Boolean(serverEnvironment.ACTIVITY_RECEIPT_SECRET?.trim()),
        operationsAlertsConfigured: alertsConfigured,
        managedBackupsConfigured: backupsConfigured,
        operationsAlerts,
        managedBackups,
        restoreDrill,
        productionHealthMonitorConfigured: Boolean(serverEnvironment.PRODUCTION_HEALTH_URL?.trim()),
        supportChannelConfigured: Boolean(SUPPORT_CONTACT.trim()),
        lifecycleMessagingConfigured: false,
        openContentReports: openContentReportCount,
        pricingIntent,
      },
      trafficSeries: dates.map((date) => ({ date, views: trafficByDate.get(date) ?? 0 })),
      topRoutes: Array.from(routeTotals, ([route, views]) => ({ route, views }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 8),
      generationSeries: dates.map((date) => generationByDate.get(date)!),
      engagementSeries: dates.map((date) => {
        const records = engagementInRange.filter((record) => record.date === date);
        return {
          date,
          coursesStarted: records.reduce((sum, record) => sum + numberValue(record.coursesStarted), 0),
          lessonsCompleted: records.reduce((sum, record) => sum + numberValue(record.lessonsCompleted), 0),
          studyMinutes: records.reduce((sum, record) => sum + numberValue(record.studyMinutes), 0),
          retrievalSessions: records.reduce((sum, record) => sum + numberValue(record.retrievalSessions), 0),
          reviewSessions: records.reduce((sum, record) => sum + numberValue(record.reviewSessions), 0),
        };
      }),
      users,
      recentGenerations: aiRequests
        .sort((a, b) => Date.parse(String(b.createdAt ?? 0)) - Date.parse(String(a.createdAt ?? 0)))
        .slice(0, 80)
        .map((record) => {
          const uid = stringValue(record.uid) ?? "";
          return {
            id: record.id,
            uid,
            userLabel: userLabel(uid),
            feature: featureValue(record.feature),
            model: stringValue(record.model),
            status: stringValue(record.status) ?? "unknown",
            inputTokens: numberValue(record.inputTokens),
            cachedInputTokens: numberValue(record.cachedInputTokens),
            cacheWriteTokens: numberValue(record.cacheWriteTokens),
            outputTokens: numberValue(record.outputTokens),
            costUsd: microsToUsd(record.actualCostMicros),
            createdAt: dateValue(record.createdAt),
          };
        }),
      recentCourses: courses
        .sort((a, b) => Date.parse(String(b.updatedAt ?? 0)) - Date.parse(String(a.updatedAt ?? 0)))
        .slice(0, 40)
        .map((course) => {
          const rawUid = stringValue(course.authorId) ?? "";
          const uid = canonicalAuthorUid(rawUid);
          const modules = Array.isArray(course.modules) ? course.modules : [];
          const lessonCount = modules.reduce((sum, module) => {
            if (!module || typeof module !== "object" || !("lessons" in module)) return sum;
            return sum + (Array.isArray(module.lessons) ? module.lessons.length : 0);
          }, 0);
          return {
            id: course.id,
            topic: stringValue(course.topic) ?? "Untitled course",
            uid,
            userLabel: userLabel(uid),
            isPublic: course.isPublic === true,
            lessonCount,
            updatedAt: dateValue(course.updatedAt),
          };
        }),
      contentReports: contentReports
        .sort((a, b) => Date.parse(String(b.createdAt ?? 0)) - Date.parse(String(a.createdAt ?? 0)))
        .slice(0, 80)
        .map((report) => ({
          id: report.id,
          courseId: stringValue(report.courseId) ?? "",
          lessonId: stringValue(report.lessonId),
          sourceId: stringValue(report.sourceId),
          sourceLabel: stringValue(report.sourceLabel),
          topic: stringValue(report.topic) ?? "Unknown course",
          lessonTitle: stringValue(report.lessonTitle),
          category: report.category === "outdated"
            || report.category === "source"
            || report.category === "clarity"
            || report.category === "safety"
            || report.category === "copyright"
            || report.category === "other"
            ? report.category
            : "accuracy",
          note: stringValue(report.note),
          contentVersion: stringValue(report.contentVersion),
          status: report.status === "resolved" || report.status === "dismissed" ? report.status : "open",
          createdAt: dateValue(report.createdAt),
          reviewedAt: dateValue(report.reviewedAt),
        })),
      safetyEvents: safetyEvents
        .sort((a, b) => Date.parse(String(b.createdAt ?? 0)) - Date.parse(String(a.createdAt ?? 0)))
        .slice(0, 80)
        .map((event) => {
          const uid = stringValue(event.uid) ?? "";
          return {
            id: event.id,
            uid,
            userLabel: userLabel(uid),
            feature: featureValue(event.feature),
            stage: event.stage === "output" ? "output" : "input",
            categories: Array.isArray(event.categories)
              ? event.categories.filter((value): value is string => typeof value === "string")
              : [],
            cooldownApplied: event.cooldownApplied === true,
            createdAt: dateValue(event.createdAt),
          };
        }),
      adminEvents: adminEvents
        .sort((a, b) => Date.parse(String(b.createdAt ?? 0)) - Date.parse(String(a.createdAt ?? 0)))
        .slice(0, 40)
        .map((event) => ({
          id: event.id,
          action: stringValue(event.action) ?? "account_updated",
          targetLabel: userLabel(stringValue(event.targetUid) ?? ""),
          reason: stringValue(event.reason),
          createdAt: dateValue(event.createdAt),
        })),
    };

    return Response.json(overview, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const authResponse = authorizationResponse(error);
    if (authResponse) return authResponse;
    console.error("Admin overview failed:", error);
    return Response.json({ error: "The control room is temporarily unavailable." }, { status: 500 });
  }
}
