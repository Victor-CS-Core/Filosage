import { expect, test } from "@playwright/test";
import {
  createOperationalAlertEnvelope,
  deliverOperationalAlert,
  operationalAlertSignature,
} from "../src/lib/operational-alert-core";

const event = {
  severity: "critical" as const,
  code: "backup.postgres_failed",
  message: "The backup failed.",
  deduplicationKey: "operation-123",
  context: { projectId: "filosage", secret: "safe operational detail" },
};

test("creates stable alert IDs within a deduplication window", async () => {
  const first = await createOperationalAlertEnvelope(
    event,
    { name: "production", version: "a".repeat(40) },
    new Date("2026-08-12T12:00:00.000Z"),
  );
  const repeated = await createOperationalAlertEnvelope(
    event,
    { name: "production", version: "a".repeat(40) },
    new Date("2026-08-12T12:04:59.000Z"),
  );
  const later = await createOperationalAlertEnvelope(
    event,
    { name: "production", version: "a".repeat(40) },
    new Date("2026-08-12T12:05:00.000Z"),
  );
  expect(repeated.id).toBe(first.id);
  expect(later.id).not.toBe(first.id);
  expect(first.schemaVersion).toBe(1);
});

test("signs the exact body and retries transient receiver failures", async () => {
  const requests: Array<{ headers: Headers; body: string }> = [];
  let attempt = 0;
  const result = await deliverOperationalAlert({
    webhookUrl: "https://alerts.example/filosage",
    secret: "s".repeat(32),
    event,
    environment: { name: "production", version: "b".repeat(40) },
    occurredAt: new Date("2026-08-12T12:00:00.000Z"),
    sleep: async () => undefined,
    fetchImplementation: async (_input, init) => {
      attempt += 1;
      requests.push({ headers: new Headers(init?.headers), body: String(init?.body) });
      return new Response(null, { status: attempt === 1 ? 503 : 204 });
    },
  });
  expect(result.ok).toBe(true);
  expect(result.attempts).toBe(2);
  expect(requests[0].headers.get("Idempotency-Key")).toBe(result.alertId);
  expect(requests[1].headers.get("X-Filosage-Alert-Id")).toBe(result.alertId);
  expect(requests[0].headers.get("X-Filosage-Signature")).toBe(
    await operationalAlertSignature(requests[0].body, "s".repeat(32)),
  );
});

test("does not retry a permanent receiver rejection", async () => {
  let attempts = 0;
  const result = await deliverOperationalAlert({
    webhookUrl: "https://alerts.example/filosage",
    secret: "s".repeat(32),
    event,
    environment: { name: "production" },
    sleep: async () => undefined,
    fetchImplementation: async () => {
      attempts += 1;
      return new Response(null, { status: 401 });
    },
  });
  expect(result.ok).toBe(false);
  expect(attempts).toBe(1);
  expect(result.status).toBe(401);
});
