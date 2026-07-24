import "server-only";

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
] as const;

export function missingRuntimeConfiguration() {
  if (process.env.NODE_ENV !== "production") return [] as string[];
  return requiredInProduction.filter((name) => !process.env[name]?.trim());
}

export function billingConfiguration() {
  const provider = (process.env.BILLING_PROVIDER ?? "none").trim().toLowerCase();
  const configured = provider === "stripe"
    && Boolean(process.env.STRIPE_SECRET_KEY?.trim())
    && Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim())
    && Boolean(process.env.STRIPE_PRO_MONTHLY_PRICE_ID?.trim());
  return { provider, configured };
}
