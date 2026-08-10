import "server-only";

import { serverEnvironment } from "@/lib/runtime-environment";

type AlertSeverity = "warning" | "critical";
type SafeContext = Record<string, string | number | boolean | null | undefined>;
const lastAlertAt = new Map<string, number>();
const ALERT_DEDUPLICATION_MS = 5 * 60_000;

function sanitizeContext(context: SafeContext | undefined) {
  return Object.fromEntries(
    Object.entries(context ?? {})
      .slice(0, 20)
      .map(([key, value]) => [
        key.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 60),
        typeof value === "string" ? value.slice(0, 240) : value,
      ]),
  );
}

async function signature(body: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return Array.from(signed, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function reportOperationalEvent(event: {
  severity: AlertSeverity;
  code: string;
  message: string;
  context?: SafeContext;
}) {
  const webhook = serverEnvironment.OPERATIONS_ALERT_WEBHOOK_URL?.trim();
  if (!webhook) return;
  const previous = lastAlertAt.get(event.code) ?? 0;
  if (Date.now() - previous < ALERT_DEDUPLICATION_MS) return;
  lastAlertAt.set(event.code, Date.now());
  const body = JSON.stringify({
    service: "filosage",
    environment: serverEnvironment.NODE_ENV ?? "unknown",
    version: serverEnvironment.SITE_VERSION || serverEnvironment.GITHUB_SHA || null,
    occurredAt: new Date().toISOString(),
    severity: event.severity,
    code: event.code.slice(0, 80),
    message: event.message.slice(0, 300),
    context: sanitizeContext(event.context),
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const secret = serverEnvironment.OPERATIONS_ALERT_WEBHOOK_SECRET?.trim();
    const response = await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-Filosage-Signature": await signature(body, secret) } : {}),
      },
      body,
      signal: controller.signal,
    });
    if (!response.ok) console.error("Operational alert delivery failed:", response.status);
  } catch (error) {
    console.error("Operational alert delivery failed:", error instanceof Error ? error.message : "unknown error");
  } finally {
    clearTimeout(timeout);
  }
}
