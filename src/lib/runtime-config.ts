import "server-only";

import {
  authenticationConfigurationIssues,
  authenticationRuntimeConfiguration,
} from "@/lib/auth-runtime";
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
  "AZURE_POSTGRES_SERVER_NAME",
  "AZURE_RESOURCE_GROUP",
] as const;

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
  issues.push(...authenticationConfigurationIssues(authenticationRuntimeConfiguration())
    .map((issue) => `authentication: ${issue}`));
  const identityLinkHmacSecret = serverEnvironment.IDENTITY_LINK_HMAC_SECRET?.trim();
  if (identityLinkHmacSecret && identityLinkHmacSecret.length < 32) {
    issues.push("IDENTITY_LINK_HMAC_SECRET must contain at least 32 characters");
  }
  return issues;
}

export type AuthenticationMode = "direct-google" | "external-id" | "migration-dual" | "unavailable";

export function authenticationMode(): AuthenticationMode {
  const config = authenticationRuntimeConfiguration();
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
