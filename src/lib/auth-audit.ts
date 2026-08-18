import "server-only";

import { serverEnvironment } from "@/lib/runtime-environment";

export type AuthenticationEventCode =
  | "account.identity_link_started"
  | "account.identity_link_succeeded"
  | "account.identity_link_failed"
  | "account.identity_registry_backfilled"
  | "account.identity_provider_retired";

export type AuthenticationEventReason =
  | "expired"
  | "replayed"
  | "email_mismatch"
  | "mapping_conflict"
  | "recent_auth_missing"
  | "internal_error";

export interface AuthenticationAuditEvent {
  code: AuthenticationEventCode;
  outcome: "allowed" | "denied";
  correlationId: string;
  actorKey?: string;
  reason?: AuthenticationEventReason;
}

const EVENT_CODES = new Set<AuthenticationEventCode>([
  "account.identity_link_started",
  "account.identity_link_succeeded",
  "account.identity_link_failed",
  "account.identity_registry_backfilled",
  "account.identity_provider_retired",
]);
const EVENT_REASONS = new Set<AuthenticationEventReason>([
  "expired",
  "replayed",
  "email_mismatch",
  "mapping_conflict",
  "recent_auth_missing",
  "internal_error",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HMAC_KEY = /^[a-f0-9]{64}$/;

type AuthenticationEventSink = (line: string) => void;

export function recordAuthenticationEvent(
  event: AuthenticationAuditEvent,
  sink: AuthenticationEventSink = (line) => console.info(line),
) {
  if (
    !EVENT_CODES.has(event.code)
    || !["allowed", "denied"].includes(event.outcome)
    || !UUID.test(event.correlationId)
    || (event.actorKey !== undefined && !HMAC_KEY.test(event.actorKey))
    || (event.reason !== undefined && !EVENT_REASONS.has(event.reason))
  ) {
    return false;
  }
  const configuredEnvironment = serverEnvironment.OPERATIONS_ENVIRONMENT?.trim() || "local";
  const environment = /^[A-Za-z0-9_-]{1,32}$/.test(configuredEnvironment)
    ? configuredEnvironment
    : "local";
  const record = {
    type: "filosage.authentication",
    schemaVersion: 1,
    environment,
    code: event.code,
    outcome: event.outcome,
    correlationId: event.correlationId,
    ...(event.actorKey ? { actorKey: event.actorKey } : {}),
    ...(event.reason ? { reason: event.reason } : {}),
  };
  try {
    sink(JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}
