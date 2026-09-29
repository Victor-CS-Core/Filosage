import "server-only";

import { serverEnvironment } from "@/lib/runtime-environment";
import {
  deliverOperationalAlert,
  operationalAlertLogLine,
  type OperationalAlertEvent,
} from "@/lib/operational-alert-core";

const lastAlertAt = new Map<string, number>();
const ALERT_DEDUPLICATION_MS = 5 * 60_000;

export async function reportOperationalEvent(event: OperationalAlertEvent) {
  const line = operationalAlertLogLine(event);
  if (event.severity === "critical" || event.severity === "warning") console.error(line);
  else console.info(line);
  const webhook = serverEnvironment.OPERATIONS_ALERT_WEBHOOK_URL?.trim();
  const secret = serverEnvironment.OPERATIONS_ALERT_WEBHOOK_SECRET?.trim();
  if (!webhook || !secret) {
    if (webhook || secret) console.error("Operational alert delivery is only partially configured.");
    return null;
  }
  const deduplicationKey = `${event.code}:${event.deduplicationKey ?? event.code}`;
  const previous = lastAlertAt.get(deduplicationKey) ?? 0;
  if (Date.now() - previous < ALERT_DEDUPLICATION_MS) return;
  const result = await deliverOperationalAlert({
    webhookUrl: webhook,
    secret,
    event,
    environment: {
      name: serverEnvironment.NODE_ENV ?? "unknown",
      version: serverEnvironment.SITE_VERSION || serverEnvironment.GITHUB_SHA || null,
    },
  });
  if (result.ok) {
    lastAlertAt.set(deduplicationKey, Date.now());
  } else {
    console.error("Operational alert delivery failed:", result.error, result.status ?? "no_status");
  }
  return result;
}
