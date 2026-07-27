import "server-only";

export const LOCAL_OWNER_UID = "local-owner";
export const LOCAL_OWNER_EMAIL = "owner@erudoza.local";

/**
 * Local mode lets the whole app run without Firebase or Stripe credentials:
 * a file-backed document store replaces Firestore, any bearer token resolves
 * to a local owner account, and AI calls are stubbed unless OPENAI_API_KEY is
 * set. It is hard-gated to development so it can never activate in a deployed
 * environment, whatever else is misconfigured.
 */
export function isLocalMode() {
  return process.env.NODE_ENV !== "production"
    && (!process.env.FIREBASE_PROJECT_ID
      || !process.env.FIREBASE_CLIENT_EMAIL
      || !process.env.FIREBASE_PRIVATE_KEY);
}
