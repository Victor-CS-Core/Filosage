import "server-only";

import { authenticationRuntimeConfiguration } from "@/lib/auth-runtime";
import { evaluateBillingConfiguration } from "@/lib/billing-lock";
import { serverEnvironment } from "@/lib/runtime-environment";

const requiredInProduction = [
  "NEXT_PUBLIC_SITE_URL",
  "DATABASE_URL",
  "AZURE_EASY_AUTH_ENABLED",
  "AZURE_STORAGE_ACCOUNT_URL",
  "AZURE_STORAGE_BANNER_CONTAINER",
  "OPENAI_API_KEY",
  "OWNER_EMAIL",
  "ACTIVITY_RECEIPT_SECRET",
  "IDENTITY_LINK_HMAC_SECRET",
  "DIRECT_GOOGLE_AUTH_ENABLED",
  "EXTERNAL_ID_AUTH_ENABLED",
  "EXTERNAL_ID_NEW_ACCOUNTS_ENABLED",
  "BILLING_ENABLED",
  "AZURE_POSTGRES_SERVER_NAME",
  "AZURE_RESOURCE_GROUP",
] as const;

const authenticationBooleanNames = [
  "AZURE_EASY_AUTH_ENABLED",
  "DIRECT_GOOGLE_AUTH_ENABLED",
  "EXTERNAL_ID_AUTH_ENABLED",
  "EXTERNAL_ID_NEW_ACCOUNTS_ENABLED",
] as const;

type RuntimeEnvironment = Record<string, string | undefined>;

function exactBoolean(value: string | undefined) {
  const normalized = value?.trim();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
}

function validHttpsUrl(value: string | undefined) {
  try {
    return new URL(value ?? "").protocol === "https:";
  } catch {
    return false;
  }
}

export function authenticationReadinessIssues(
  environment: RuntimeEnvironment = serverEnvironment,
) {
  const issues: string[] = [];
  const parsed = Object.fromEntries(authenticationBooleanNames.map((name) => {
    const value = exactBoolean(environment[name]);
    if (value === null) issues.push(`${name} must be exactly true or false`);
    return [name, value];
  })) as Record<(typeof authenticationBooleanNames)[number], boolean | null>;

  if (parsed.AZURE_EASY_AUTH_ENABLED === false) {
    issues.push("AZURE_EASY_AUTH_ENABLED must be exactly true");
  }
  if (parsed.DIRECT_GOOGLE_AUTH_ENABLED !== null
    && parsed.EXTERNAL_ID_AUTH_ENABLED !== null
    && !parsed.DIRECT_GOOGLE_AUTH_ENABLED
    && !parsed.EXTERNAL_ID_AUTH_ENABLED) {
    issues.push("At least one production authentication provider must be enabled.");
  }
  if (parsed.EXTERNAL_ID_NEW_ACCOUNTS_ENABLED === true
    && parsed.EXTERNAL_ID_AUTH_ENABLED !== true) {
    issues.push("EXTERNAL_ID_NEW_ACCOUNTS_ENABLED requires EXTERNAL_ID_AUTH_ENABLED.");
  }
  if (parsed.EXTERNAL_ID_AUTH_ENABLED === true) {
    if (!environment.EXTERNAL_ID_CLIENT_ID?.trim()) {
      issues.push("EXTERNAL_ID_CLIENT_ID is required when External ID is enabled");
    }
    for (const name of ["EXTERNAL_ID_ISSUER", "EXTERNAL_ID_WELL_KNOWN_CONFIGURATION"] as const) {
      if (!validHttpsUrl(environment[name]?.trim())) {
        issues.push(`${name} must be a valid HTTPS URL`);
      }
    }
  }
  if ((environment.IDENTITY_LINK_HMAC_SECRET?.trim().length ?? 0) < 32) {
    issues.push("IDENTITY_LINK_HMAC_SECRET must contain at least 32 characters");
  }
  return issues;
}

function billingReadinessIssues(environment: RuntimeEnvironment) {
  const value = exactBoolean(environment.BILLING_ENABLED);
  if (value === null) return ["BILLING_ENABLED must be exactly true or false"];
  return value ? ["BILLING_ENABLED must be exactly false"] : [];
}

const requiredForProductionOperations = [
  "OPERATIONS_ALERT_WEBHOOK_URL",
  "OPERATIONS_ALERT_WEBHOOK_SECRET",
] as const;

export function missingRuntimeConfiguration() {
  if (serverEnvironment.NODE_ENV !== "production") return [] as string[];
  const required = serverEnvironment.OPERATIONS_ENVIRONMENT?.trim() === "production"
    ? [...requiredInProduction, ...requiredForProductionOperations]
    : requiredInProduction;
  const issues: string[] = required.filter((name) => !serverEnvironment[name]?.trim());
  issues.push(...authenticationReadinessIssues(serverEnvironment)
    .map((issue) => issue.startsWith("IDENTITY_LINK_HMAC_SECRET") ? issue : `authentication: ${issue}`));
  issues.push(...billingReadinessIssues(serverEnvironment));
  return issues;
}

export type AuthenticationMode = "direct-google" | "external-id" | "migration-dual" | "unavailable";

export function authenticationMode(
  environment: RuntimeEnvironment = serverEnvironment,
): AuthenticationMode {
  if (authenticationReadinessIssues(environment).length) return "unavailable";
  const config = authenticationRuntimeConfiguration(environment);
  if (config.directGoogleEnabled && config.externalIdEnabled) return "migration-dual";
  if (config.externalIdEnabled) return "external-id";
  if (config.directGoogleEnabled) return "direct-google";
  return "unavailable";
}

export function billingConfiguration() {
  return evaluateBillingConfiguration({
    BILLING_PROVIDER: serverEnvironment.BILLING_PROVIDER,
    BILLING_ENABLED: serverEnvironment.BILLING_ENABLED,
    STRIPE_SECRET_KEY: serverEnvironment.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: serverEnvironment.STRIPE_WEBHOOK_SECRET,
    STRIPE_PLUS_MONTHLY_PRICE_ID: serverEnvironment.STRIPE_PLUS_MONTHLY_PRICE_ID,
    STRIPE_PLUS_ANNUAL_PRICE_ID: serverEnvironment.STRIPE_PLUS_ANNUAL_PRICE_ID,
    STRIPE_PRO_MONTHLY_PRICE_ID: serverEnvironment.STRIPE_PRO_MONTHLY_PRICE_ID,
    STRIPE_PRO_ANNUAL_PRICE_ID: serverEnvironment.STRIPE_PRO_ANNUAL_PRICE_ID,
    LEGAL_OPERATOR_NAME: serverEnvironment.LEGAL_OPERATOR_NAME,
    LEGAL_BUSINESS_ADDRESS: serverEnvironment.LEGAL_BUSINESS_ADDRESS,
    GOVERNING_JURISDICTION: serverEnvironment.GOVERNING_JURISDICTION,
    SUPPORT_EMAIL: serverEnvironment.SUPPORT_EMAIL,
  });
}
