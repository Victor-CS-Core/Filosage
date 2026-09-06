import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  deliverOperationalAlert,
  type OperationalAlertDeliveryResult,
  type OperationalAlertEvent,
} from "../src/lib/operational-alert-core.ts";

// A sender can observe HTTP acceptance, but cannot establish receiver durability
// or independent paging. Those require separately retained operator evidence.
export function operationalAlertTransportEvidence(result: OperationalAlertDeliveryResult, metadata: {
  resourceGroup: string | null;
  releaseSha: string | null;
}) {
  if (!result.ok || result.status === null || result.status < 200 || result.status >= 300) {
    throw new Error("Cannot record HTTP acceptance for a failed alert delivery.");
  }
  return {
    operation: "operational_alert_test",
    evidenceType: "signed_alert_http_delivery",
    status: "transport_accepted",
    ...metadata,
    completedAt: new Date().toISOString(),
    alertId: result.alertId,
    attempts: result.attempts,
    receiverStatus: result.status,
    receiverDurableAcknowledgement: "unverified",
    independentReceiverMonitoring: "unverified",
  };
}

export async function deliverScriptAlert(event: OperationalAlertEvent) {
  const webhookUrl = process.env.OPERATIONS_ALERT_WEBHOOK_URL?.trim();
  const secret = process.env.OPERATIONS_ALERT_WEBHOOK_SECRET?.trim();
  if (!webhookUrl || !secret) {
    return { ok: false, skipped: true, error: "alert_delivery_not_configured" } as const;
  }
  const result = await deliverOperationalAlert({
    webhookUrl,
    secret,
    event,
    environment: {
      name: process.env.OPERATIONS_ENVIRONMENT?.trim() || "production",
      version: process.env.SITE_VERSION?.trim() || process.env.GITHUB_SHA?.trim() || null,
    },
  });
  return { ...result, skipped: false } as const;
}

export async function writeEvidenceFile(path: string | undefined, evidence: Record<string, unknown>) {
  if (!path) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}
