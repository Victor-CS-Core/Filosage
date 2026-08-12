import "server-only";

import { evaluateBillingConfiguration } from "@/lib/billing-lock";
import { serverEnvironment } from "@/lib/runtime-environment";

const requiredInProduction = [
  "NEXT_PUBLIC_SITE_URL",
  "DATABASE_URL",
  "NEXT_PUBLIC_ENTRA_CLIENT_ID",
  "NEXT_PUBLIC_ENTRA_AUTHORITY",
  "NEXT_PUBLIC_ENTRA_API_SCOPE",
  "NEXT_PUBLIC_ENTRA_REDIRECT_URI",
  "ENTRA_AUDIENCE",
  "ENTRA_ISSUER",
  "ENTRA_JWKS_URI",
  "AZURE_STORAGE_ACCOUNT_URL",
  "AZURE_STORAGE_BANNER_CONTAINER",
  "OPENAI_API_KEY",
  "OWNER_EMAIL",
  "ACTIVITY_RECEIPT_SECRET",
  "AZURE_POSTGRES_SERVER_NAME",
  "AZURE_RESOURCE_GROUP",
  "OPERATIONS_ALERT_WEBHOOK_URL",
  "OPERATIONS_ALERT_WEBHOOK_SECRET",
] as const;

export function missingRuntimeConfiguration() {
  if (serverEnvironment.NODE_ENV !== "production") return [] as string[];
  return requiredInProduction.filter((name) => !serverEnvironment[name]?.trim());
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
