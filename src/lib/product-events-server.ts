import "server-only";

import { createStoredDocument, putStoredDocument } from "@/lib/document-store";
import {
  PRODUCT_EVENT_SCHEMA_VERSION,
  type ProductEventRoute,
  type ServerRecordedProductEventName,
} from "@/lib/product-events";
import type { BillingInterval, PaidLearnerPlan } from "@/lib/membership-plans";

export async function recordServerProductEvent(
  event: ServerRecordedProductEventName,
  details: {
    route: ProductEventRoute;
    actorId?: string;
    courseId?: string;
    lessonId?: string;
    referralCode?: string;
    score?: number;
    eventId?: string;
    planId?: PaidLearnerPlan;
    billingInterval?: BillingInterval;
    offerVersion?: string;
  },
) {
  const now = new Date().toISOString();
  const data = {
    schemaVersion: PRODUCT_EVENT_SCHEMA_VERSION,
    date: now.slice(0, 10),
    route: details.route,
    source: "internal",
    channel: "internal",
    trust: "server_verified",
    event,
    actorId: details.actorId,
    courseId: details.courseId,
    lessonId: details.lessonId,
    referralCode: details.referralCode,
    score: details.score,
    planId: details.planId,
    billingInterval: details.billingInterval,
    offerVersion: details.offerVersion,
    createdAt: now,
  };
  if (details.eventId) {
    await putStoredDocument(`productEvents/${details.eventId}`, data);
    return;
  }
  await createStoredDocument("productEvents", data);
}
