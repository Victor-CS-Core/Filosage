export const PRODUCT_EVENT_SCHEMA_VERSION = 1 as const;

export const PRODUCT_EVENT_NAMES = [
  "landing_viewed",
  "course_discovered",
  "course_started",
  "outcome_defined",
  "diagnostic_started",
  "diagnostic_completed",
  "plan_created",
  "baseline_assessed",
  "first_practice_completed",
  "lesson_started",
  "lesson_completed",
  "retrieval_attempted",
  "transfer_attempted",
  "criterion_demonstrated",
  "review_due",
  "review_completed",
  "daily_mission_viewed",
  "daily_mission_started",
  "weekly_milestone_completed",
  "delayed_check_completed",
  "confidence_calibrated",
  "outcome_paused",
  "outcome_resumed",
  "outcome_rescheduled",
  "reminder_preferences_updated",
  "second_outcome_started",
  "capstone_submitted",
  "capstone_criterion_passed",
  "evidence_report_viewed",
  "evidence_report_shared",
  "pathway_usefulness_rated",
  "pricing_viewed",
  "pricing_interest",
  "waitlist_joined",
  "checkout_started",
  "subscription_started",
  "subscription_canceled",
  "content_reported",
  "signup_started",
  "signup_completed",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];

export const PRODUCT_EVENT_ROUTES = [
  "/",
  "/lesson",
  "/course",
  "/library",
  "/pricing",
  "/progress",
  "/evidence",
  "/review",
  "/create",
  "/profile",
  "/privacy-center",
  "/terms",
  "/privacy",
  "/acceptable-use",
  "/copyright",
  "/other",
] as const;

export type ProductEventRoute = (typeof PRODUCT_EVENT_ROUTES)[number];

export const ACQUISITION_CHANNELS = [
  "direct",
  "internal",
  "search",
  "social",
  "email",
  "partner",
  "campaign",
  "referral",
] as const;

export type AcquisitionChannel = (typeof ACQUISITION_CHANNELS)[number];

export interface AcquisitionContext {
  channel: AcquisitionChannel;
  campaign?: string;
  medium?: string;
  referrerHost?: string;
  landingPath: string;
}
