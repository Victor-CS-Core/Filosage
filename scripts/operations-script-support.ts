import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  deliverOperationalAlert,
  type OperationalAlertEvent,
} from "../src/lib/operational-alert-core.ts";

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
