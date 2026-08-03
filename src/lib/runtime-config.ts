import "server-only";

import { evaluateBillingConfiguration } from "@/lib/billing-lock";

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
] as const;

export function missingRuntimeConfiguration() {
  if (process.env.NODE_ENV !== "production") return [] as string[];
  return requiredInProduction.filter((name) => !process.env[name]?.trim());
}

export function billingConfiguration() {
  return evaluateBillingConfiguration({
    BILLING_PROVIDER: process.env.BILLING_PROVIDER,
    BILLING_ENABLED: process.env.BILLING_ENABLED,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_PRO_MONTHLY_PRICE_ID: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
    STRIPE_PRO_ANNUAL_PRICE_ID: process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
  });
}
