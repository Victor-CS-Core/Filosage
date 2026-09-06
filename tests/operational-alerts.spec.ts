import { expect, test } from "@playwright/test";
import {
  createOperationalAlertEnvelope,
  deliverOperationalAlert,
  operationalAlertSignature,
  operationalAlertSenderObservation,
} from "../src/lib/operational-alert-core";
import { operationalAlertTransportEvidence } from "../scripts/operations-script-support";

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

test("transient failures back off without Retry-After and bound explicit receiver delays", async () => {
  for (const [header, expectedDelays] of [
    [null, [250, 500]], ["", [250, 500]], ["invalid", [250, 500]],
    ["0", [0, 0]], ["1", [1_000, 1_000]], ["90", [2_000, 2_000]],
  ] as const) {
    const delays: number[] = [];
    const result = await deliverOperationalAlert({
      webhookUrl: "https://alerts.example/filosage", secret: "s".repeat(32), event,
      environment: { name: "fixture" },
      sleep: async (milliseconds) => { delays.push(milliseconds); },
      fetchImplementation: async () => new Response(null, {
        status: 503, headers: header === null ? {} : { "Retry-After": header },
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(3);
    expect(delays).toEqual(expectedDelays);
  }
});

test("network failures retain exponential backoff and permanent rejections never sleep", async () => {
  for (const networkFailure of [true, false]) {
    const delays: number[] = [];
    const result = await deliverOperationalAlert({
      webhookUrl: "https://alerts.example/filosage", secret: "s".repeat(32), event,
      environment: { name: "fixture" },
      sleep: async (milliseconds) => { delays.push(milliseconds); },
      fetchImplementation: async () => {
        if (networkFailure) throw new Error("offline fixture");
        return new Response(null, { status: 401 });
      },
    });
    expect(result.ok).toBe(false);
    expect(delays).toEqual(networkFailure ? [250, 500] : []);
  }
});

test("HTTP delivery evidence never attests receiver durability or independent monitoring", () => {
  const delivery = { ok: true, alertId: "fa_fixture", occurredAt: "2026-09-06T00:00:00Z", attempts: 1, status: 204, error: null };
  const evidence = operationalAlertTransportEvidence(delivery, { resourceGroup: null, releaseSha: "a".repeat(40) });
  expect(evidence).toMatchObject({
    evidenceType: "signed_alert_http_delivery", status: "transport_accepted", receiverStatus: 204,
    receiverDurableAcknowledgement: "unverified", independentReceiverMonitoring: "unverified",
  });
  for (const failure of [{ ...delivery, ok: false }, { ...delivery, status: 503 }, { ...delivery, status: null }]) {
    expect(() => operationalAlertTransportEvidence(failure, { resourceGroup: null, releaseSha: null })).toThrow(/failed alert delivery/);
  }
});

test("legacy HTTP success cannot establish receiver readiness and failure observations survive", () => {
  const legacy = { status: "succeeded", completedAt: "2026-09-06T00:00:00Z", receiverStatus: 204 };
  expect(operationalAlertSenderObservation(legacy)).toEqual({ ...legacy, status: "transport_accepted" });
  expect(legacy.status).toBe("succeeded");
  expect(operationalAlertSenderObservation(null)).toBeNull();
  for (const status of ["failed", "running", "transport_accepted"]) {
    const observation = { status, alertId: "fa_fixture" };
    expect(operationalAlertSenderObservation(observation)).toEqual(observation);
  }
});
