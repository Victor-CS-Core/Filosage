import { authorizationResponse, requireOwner } from "@/lib/auth-server";
import {
  countCollectionDocuments,
  getStoredDocument,
  listCollectionDocumentsByRange,
  listStoredDocumentsByField,
} from "@/lib/firebase-server";
import type {
  AdminFeatureUsage,
  AdminOverview,
  AdminUserSummary,
} from "@/lib/admin-types";
import type { AiFeature } from "@/lib/ai-usage";
import { aiBudgetLimitsUsd, type AiBudgetPool } from "@/lib/ai-usage";

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

function microsToUsd(value: unknown) {
  return numberValue(value) / 1_000_000;
}

function featureValue(value: unknown): AiFeature {
  return value === "course_outline" || value === "lesson_generation" ? value : "tutor";
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
    ] = await Promise.all([
      listCollectionDocumentsByRange("users", "updatedAt", "1970-01-01T00:00:00.000Z", nowIso, 300),
      listCollectionDocumentsByRange("userEngagement", "lastActivityAt", "1970-01-01T00:00:00.000Z", nowIso, 300),
      listCollectionDocumentsByRange("engagementDaily", "date", dates[0], dates[dates.length - 1], 2_000),
      listCollectionDocumentsByRange("trafficDaily", "date", dates[0], dates[dates.length - 1], 2_000),
      listCollectionDocumentsByRange("trafficDailyShards", "date", dates[0], dates[dates.length - 1], 2_000),
      listStoredDocumentsByField("usagePeriods", "periodKey", currentMonth, 2_000),
      listCollectionDocumentsByRange("aiRequests", "createdAt", fromIso, nowIso, 2_000),
      listCollectionDocumentsByRange("courses", "updatedAt", "1970-01-01T00:00:00.000Z", nowIso, 300),
      listCollectionDocumentsByRange("safetyEvents", "createdAt", fromIso, nowIso, 1_000),
      listCollectionDocumentsByRange("adminEvents", "createdAt", fromIso, nowIso, 300),
      listStoredDocumentsByField("systemUsageShards", "periodKey", currentMonth, 1_000),
      getStoredDocument(`systemUsage/${currentMonth}`),
      getStoredDocument(`users/${owner.uid}`),
      countCollectionDocuments("users"),
      countCollectionDocuments("courses", [{ field: "isPublic", value: true }]),
      countCollectionDocuments("courses", [{ field: "isPublic", value: false }]),
      countCollectionDocuments("waitlist"),
    ]);
    if (ownerRecord && !rawUsers.some((record) => record.id === owner.uid || record.uid === owner.uid)) {
      rawUsers.unshift(ownerRecord);
    }
    const traffic = [...legacyTraffic, ...shardedTraffic];

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
        plan: record.plan === "pro" || isOwner ? "pro" as const : "free" as const,
        accountStatus: record.accountStatus === "suspended" && !isOwner
          ? "suspended" as const
          : "active" as const,
        isOwner,
        createdAt: dateValue(record.createdAt),
        lastSeenAt: dateValue(record.updatedAt),
        manualProUntil: stringValue(record.manualProUntil),
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
    const courseCountByUser = new Map<string, number>();
    for (const course of courses) {
      const uid = stringValue(course.authorId);
      if (uid) courseCountByUser.set(uid, (courseCountByUser.get(uid) ?? 0) + 1);
    }
    const engagementByUser = new Map(userEngagement.flatMap((record) => {
      const uid = stringValue(record.uid);
      return uid ? [[uid, record] as const] : [];
    }));

    const users: AdminUserSummary[] = userRows.map((user) => {
      const featureUsage = Array.from(usageByUser.get(user.uid)?.values() ?? [])
        .sort((a, b) => a.feature.localeCompare(b.feature));
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
      lessons: 0,
      tutor: 0,
      failed: 0,
    }]));
    for (const record of requestsInRange) {
      const date = String(record.createdAt).slice(0, 10);
      const point = generationByDate.get(date);
      if (!point) continue;
      if (record.status === "failed") point.failed += 1;
      const feature = featureValue(record.feature);
      if (feature === "course_outline") point.courseOutlines += 1;
      else if (feature === "lesson_generation") point.lessons += 1;
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
    const limitUsd = poolUsage.reduce((sum, pool) => sum + pool.limitUsd, 0);
    const spentUsd = legacySpentUsd + poolUsage.reduce((sum, pool) => sum + pool.spentUsd, 0);
    const reservedUsd = legacyReservedUsd + poolUsage.reduce((sum, pool) => sum + pool.reservedUsd, 0);
    const plannedMonthlyPriceUsd = 14.99;
    const paymentFeeEstimateUsd = plannedMonthlyPriceUsd * 0.036 + 0.30;
    const modeledAiCostPerSubscriberUsd = 1.77;
    const modeledContributionPerSubscriberUsd = Math.max(
      0,
      plannedMonthlyPriceUsd - paymentFeeEstimateUsd - modeledAiCostPerSubscriberUsd,
    );

    const userLabel = (uid: string) => {
      const user = users.find((candidate) => candidate.uid === uid);
      return user ? labelForUser(user) : "Deleted account";
    };

    const overview: AdminOverview = {
      generatedAt: new Date().toISOString(),
      range: { days, from: dates[0], to: dates[dates.length - 1] },
      summary: {
        pageViews: trafficInRange.reduce((sum, record) => sum + numberValue(record.views), 0),
        activeUsers,
        totalUsers,
        generations: requestsInRange.length,
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
        pools: poolUsage,
      },
      monetization: {
        waitlistCount,
        plannedMonthlyPriceUsd,
        plannedAnnualPriceUsd: 149,
        paymentFeeEstimateUsd,
        modeledAiCostPerSubscriberUsd,
        modeledContributionPerSubscriberUsd,
        modeledContributionMarginPercent: (modeledContributionPerSubscriberUsd / plannedMonthlyPriceUsd) * 100,
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
          const uid = stringValue(course.authorId) ?? "";
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
