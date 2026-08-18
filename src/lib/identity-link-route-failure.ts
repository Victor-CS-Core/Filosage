import "server-only";

import { NextResponse } from "next/server";
import { recordAuthenticationEvent } from "@/lib/auth-audit";

type IdentityLinkFailureMessage =
  | "The secure connection could not be started."
  | "The sign-in connection could not be completed.";

export function unexpectedIdentityLinkResponse(
  message: IdentityLinkFailureMessage,
  recordEvent: typeof recordAuthenticationEvent = recordAuthenticationEvent,
) {
  const correlationId = crypto.randomUUID();
  try {
    recordEvent({
      code: "account.identity_link_failed",
      outcome: "denied",
      correlationId,
      reason: "internal_error",
    });
  } catch {
    // Audit transport failure must not expose or replace the bounded API error.
  }
  return NextResponse.json(
    { error: message, correlationId },
    { status: 503, headers: { "Cache-Control": "private, no-store" } },
  );
}
