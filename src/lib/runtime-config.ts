import "server-only";

import { evaluateBillingConfiguration } from "@/lib/billing-lock";
import { serverEnvironment } from "@/lib/runtime-environment";

const requiredInProduction = [
  "NEXT_PUBLIC_SITE_URL",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "OPENAI_API_KEY",
  "OWNER_EMAIL",
  "ACTIVITY_RECEIPT_SECRET",
  "FIRESTORE_BACKUP_BUCKET",
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
