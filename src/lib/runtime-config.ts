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
  "BILLING_ROLLOUT_MODE",
  "STRIPE_TAX_READY",
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
  const configuration = evaluateBillingConfiguration(environment);
  const issues: string[] = [];
  if (!configuration.enabledValid) issues.push("BILLING_ENABLED must be exactly true or false");
  if (!configuration.rolloutModeValid) {
    issues.push("BILLING_ROLLOUT_MODE must be closed, configured, canary, or open");
  }
  if (!configuration.taxReadyValid) issues.push("STRIPE_TAX_READY must be exactly true or false");
  if (configuration.rolloutMode === "closed" && configuration.enabled) {
    issues.push("BILLING_ENABLED must be false while BILLING_ROLLOUT_MODE is closed");
  }
  if (configuration.rolloutMode === "configured" && configuration.enabled) {
    issues.push("BILLING_ENABLED must be false while BILLING_ROLLOUT_MODE is configured");
  }
  if ((configuration.rolloutMode === "canary" || configuration.rolloutMode === "open")
    && !configuration.enabled) {
    issues.push(`BILLING_ENABLED must be true while BILLING_ROLLOUT_MODE is ${configuration.rolloutMode}`);
  }
  if (configuration.rolloutMode !== "closed" && !configuration.configured) {
    issues.push("The selected billing rollout mode requires complete provider, catalog, legal, and tax readiness");
  }
  return issues;
}

const requiredForProductionOperations = [
  "OPERATIONS_ALERT_WEBHOOK_URL",
  "OPERATIONS_ALERT_WEBHOOK_SECRET",
] as const;

function operationsReadinessIssues(environment: RuntimeEnvironment) {
  const deploymentEnvironment = environment.DEPLOYMENT_ENVIRONMENT?.trim().toLowerCase() ?? "";
  const operationsEnvironment = environment.OPERATIONS_ENVIRONMENT?.trim().toLowerCase() ?? "";
  const issues: string[] = [];
  if (deploymentEnvironment && !["qa", "production"].includes(deploymentEnvironment)) {
    issues.push("DEPLOYMENT_ENVIRONMENT must be qa or production");
  }
  if (operationsEnvironment && !["qa", "production"].includes(operationsEnvironment)) {
    issues.push("OPERATIONS_ENVIRONMENT must be qa or production");
  }
  if (deploymentEnvironment === "production" && operationsEnvironment !== "production") {
    issues.push("OPERATIONS_ENVIRONMENT must be production when DEPLOYMENT_ENVIRONMENT is production");
  }
  if (deploymentEnvironment !== "production" && operationsEnvironment !== "production") return issues;

  issues.push(...requiredForProductionOperations
    .filter((name) => !environment[name]?.trim())
    .map((name) => `${name} is required for production operations`));
  const webhook = environment.OPERATIONS_ALERT_WEBHOOK_URL?.trim();
  const secret = environment.OPERATIONS_ALERT_WEBHOOK_SECRET?.trim();
  if (webhook && !validHttpsUrl(webhook)) {
    issues.push("OPERATIONS_ALERT_WEBHOOK_URL must be a valid HTTPS URL");
  }
  if (secret && secret.length < 32) {
    issues.push("OPERATIONS_ALERT_WEBHOOK_SECRET must contain at least 32 characters");
  }
  return issues;
}

export const optionalRuntimeConfiguration = [
  "LANDING_FEATURED_COURSE_ID",
] as const;

export function missingRuntimeConfiguration() {
  if (serverEnvironment.NODE_ENV !== "production") return [] as string[];
  const issues: string[] = requiredInProduction
    .filter((name) => !serverEnvironment[name]?.trim());
  issues.push(...operationsReadinessIssues(serverEnvironment));
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
    BILLING_ROLLOUT_MODE: serverEnvironment.BILLING_ROLLOUT_MODE,
    BILLING_CANARY_UIDS: serverEnvironment.BILLING_CANARY_UIDS,
    STRIPE_TAX_READY: serverEnvironment.STRIPE_TAX_READY,
    STRIPE_SECRET_KEY: serverEnvironment.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: serverEnvironment.STRIPE_WEBHOOK_SECRET,
    STRIPE_PORTAL_CONFIGURATION_ID: serverEnvironment.STRIPE_PORTAL_CONFIGURATION_ID,
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
