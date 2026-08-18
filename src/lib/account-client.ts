import type { AiQuotaSummary, LearnerAccount } from "@/lib/course-types";

const REQUIRED_ACCOUNT_KEYS = [
  "access", "plan", "isOwner", "accountStatus", "subscriptionStatus", "capabilities",
  "courseCredits", "legalAcceptanceRequired", "applicationAccountExists",
  "identityLinkRequired", "currentTermsVersion", "currentPrivacyVersion", "quotas",
] as const;
const OPTIONAL_ACCOUNT_KEYS = [
  "suspensionReason", "displayName", "photoURL", "billingInterval", "currentPeriodEnd",
  "acceptedTermsVersion", "acceptedPrivacyVersion",
] as const;
const CAPABILITY_KEYS = [
  "createCourse", "generateLesson", "flashcardDecksEnabled", "createCustomFlashcardDeck",
  "publishCourse", "advancedCapstoneAnalysis", "exportEvidenceReport", "shareEvidenceReport",
] as const;
const CREDIT_KEYS = ["balance", "monthlyAllocation", "balanceCap", "nextAccrualAt", "frozenUntil"] as const;
const QUOTA_KEYS = ["feature", "limit", "used", "remaining", "resetAt"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactAllowedKeys(value: Record<string, unknown>) {
  const allowed = new Set<string>([...REQUIRED_ACCOUNT_KEYS, ...OPTIONAL_ACCOUNT_KEYS]);
  return REQUIRED_ACCOUNT_KEYS.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => allowed.has(key));
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function boundedString(value: unknown, maximum = 2_048) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function optionalBoundedString(value: Record<string, unknown>, key: string, maximum = 2_048) {
  return !Object.hasOwn(value, key) || boundedString(value[key], maximum);
}

function nullableCount(value: unknown) {
  return value === null || (Number.isSafeInteger(value) && Number(value) >= 0);
}

function validDate(value: unknown) {
  return typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value));
}

function validNullableDate(value: unknown) {
  return value === null || validDate(value);
}

function parseQuota(value: unknown): AiQuotaSummary | null {
  if (!isRecord(value) || !hasExactKeys(value, QUOTA_KEYS)) return null;
  const feature = value.feature;
  if (!(["course_outline", "course_banner", "lesson_generation", "tutor", "flashcard_generation"] as unknown[]).includes(feature)
    || !nullableCount(value.limit)
    || !Number.isSafeInteger(value.used) || Number(value.used) < 0
    || !nullableCount(value.remaining)
    || !validDate(value.resetAt)) return null;
  return value as unknown as AiQuotaSummary;
}

export function parseLearnerAccount(value: unknown): LearnerAccount | null {
  if (!isRecord(value) || !hasExactAllowedKeys(value)) return null;
  if (!(["free", "plus", "pro", "owner"] as unknown[]).includes(value.access)
    || !(["free", "plus", "pro"] as unknown[]).includes(value.plan)
    || typeof value.isOwner !== "boolean"
    || !(["active", "suspended"] as unknown[]).includes(value.accountStatus)
    || !(["none", "trialing", "active", "past_due", "canceled"] as unknown[]).includes(value.subscriptionStatus)
    || typeof value.legalAcceptanceRequired !== "boolean"
    || typeof value.applicationAccountExists !== "boolean"
    || typeof value.identityLinkRequired !== "boolean"
    || !boundedString(value.currentTermsVersion, 128)
    || !boundedString(value.currentPrivacyVersion, 128)
    || !optionalBoundedString(value, "suspensionReason", 500)
    || !optionalBoundedString(value, "displayName", 200)
    || !optionalBoundedString(value, "photoURL", 2_048)
    || !optionalBoundedString(value, "currentPeriodEnd", 64)
    || !optionalBoundedString(value, "acceptedTermsVersion", 128)
    || !optionalBoundedString(value, "acceptedPrivacyVersion", 128)
    || (Object.hasOwn(value, "billingInterval") && value.billingInterval !== "monthly" && value.billingInterval !== "annual")) return null;
  if (Object.hasOwn(value, "currentPeriodEnd") && !validDate(value.currentPeriodEnd)) return null;

  const capabilities = value.capabilities;
  const courseCredits = value.courseCredits;
  if (!isRecord(capabilities) || !hasExactKeys(capabilities, CAPABILITY_KEYS)
    || !CAPABILITY_KEYS.every((key) => typeof capabilities[key] === "boolean")) return null;
  if (!isRecord(courseCredits) || !hasExactKeys(courseCredits, CREDIT_KEYS)
    || !nullableCount(courseCredits.balance)
    || !nullableCount(courseCredits.monthlyAllocation)
    || !nullableCount(courseCredits.balanceCap)
    || !validNullableDate(courseCredits.nextAccrualAt)
    || !validNullableDate(courseCredits.frozenUntil)) return null;
  if (!Array.isArray(value.quotas) || value.quotas.length > 5) return null;
  const quotas = value.quotas.map(parseQuota);
  if (quotas.some((quota) => quota === null)) return null;

  return {
    access: value.access as LearnerAccount["access"],
    plan: value.plan as LearnerAccount["plan"],
    isOwner: value.isOwner,
    accountStatus: value.accountStatus as LearnerAccount["accountStatus"],
    subscriptionStatus: value.subscriptionStatus as LearnerAccount["subscriptionStatus"],
    capabilities: Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, capabilities[key]])) as unknown as LearnerAccount["capabilities"],
    courseCredits: Object.fromEntries(CREDIT_KEYS.map((key) => [key, courseCredits[key]])) as unknown as LearnerAccount["courseCredits"],
    legalAcceptanceRequired: value.legalAcceptanceRequired,
    applicationAccountExists: value.applicationAccountExists,
    identityLinkRequired: value.identityLinkRequired,
    quotas: quotas as AiQuotaSummary[],
    ...Object.fromEntries(OPTIONAL_ACCOUNT_KEYS.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]])),
  };
}

export function isZeroCapabilityLinkRequiredAccount(account: LearnerAccount) {
  return account.access === "free"
    && account.plan === "free"
    && account.isOwner === false
    && account.accountStatus === "active"
    && account.subscriptionStatus === "none"
    && account.applicationAccountExists === false
    && account.legalAcceptanceRequired === false
    && account.identityLinkRequired === true
    && CAPABILITY_KEYS.every((key) => account.capabilities[key] === false)
    && account.courseCredits.balance === 0
    && account.courseCredits.monthlyAllocation === 0
    && account.courseCredits.balanceCap === 0
    && account.courseCredits.nextAccrualAt === null
    && account.courseCredits.frozenUntil === null
    && account.quotas.length === 0;
}
