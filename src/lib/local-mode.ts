import "server-only";

import { serverEnvironment } from "@/lib/runtime-environment";

export const LOCAL_OWNER_UID = "local-owner";
export const LOCAL_OWNER_EMAIL = "owner@filosage.local";

/**
 * Local mode lets the whole app run without Azure or Stripe credentials:
 * a file-backed document store replaces Azure PostgreSQL, explicitly allowlisted
 * development tokens resolve to isolated local test identities, and AI calls
 * are stubbed unless OPENAI_API_KEY is set. It is hard-gated to development so
 * it can never activate in a deployed environment, whatever else is misconfigured.
 */
export function isLocalMode() {
  return serverEnvironment.NODE_ENV !== "production"
    && !serverEnvironment.DATABASE_URL?.trim();
}
