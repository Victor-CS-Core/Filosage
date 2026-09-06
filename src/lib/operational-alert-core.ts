export type OperationalAlertSeverity = "info" | "warning" | "critical" | "recovery";

export type OperationalAlertContext = Record<string, string | number | boolean | null | undefined>;

export interface OperationalAlertEvent {
  severity: OperationalAlertSeverity;
  code: string;
  message: string;
  context?: OperationalAlertContext;
  deduplicationKey?: string;
}

export interface OperationalAlertEnvelope {
  schemaVersion: 1;
  id: string;
  service: "filosage";
  environment: string;
  version: string | null;
  occurredAt: string;
  severity: OperationalAlertSeverity;
  code: string;
  message: string;
  context: Record<string, string | number | boolean | null>;
}

export interface OperationalAlertDeliveryResult {
  ok: boolean;
  alertId: string;
  occurredAt: string;
  attempts: number;
  status: number | null;
  error: string | null;
}

const DEFAULT_DEDUPLICATION_MS = 5 * 60_000;

export function operationalAlertSenderObservation(evidence: Record<string, unknown> | null) {
  // Legacy sender tests called HTTP acceptance "succeeded". Preserve failed or
  // running observations, but never promote a transport result to receiver health.
  return evidence?.status === "succeeded"
    ? { ...evidence, status: "transport_accepted" }
    : evidence;
}

function sanitizedContext(context: OperationalAlertContext | undefined) {
  return Object.fromEntries(
    Object.entries(context ?? {})
      .slice(0, 20)
      .flatMap(([key, value]) => {
        const safeKey = key.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 60);
        if (!safeKey || value === undefined) return [];
        return [[safeKey, typeof value === "string" ? value.slice(0, 240) : value] as const];
      }),
  );
}

async function sha256(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function operationalAlertSignature(body: string, secret: string) {
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

export async function createOperationalAlertEnvelope(
  event: OperationalAlertEvent,
  environment: { name?: string; version?: string | null },
  occurredAt = new Date(),
  deduplicationMs = DEFAULT_DEDUPLICATION_MS,
): Promise<OperationalAlertEnvelope> {
  const environmentName = environment.name?.trim().slice(0, 40) || "unknown";
  const code = event.code.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80) || "operations.unknown";
  const deduplicationBucket = Math.floor(occurredAt.getTime() / deduplicationMs);
  const deduplicationMaterial = [
    "filosage",
    environmentName,
    code,
    event.deduplicationKey?.slice(0, 160) || code,
    String(deduplicationBucket),
  ].join(":");
  const id = `fa_${(await sha256(deduplicationMaterial)).slice(0, 32)}`;
  return {
    schemaVersion: 1,
    id,
    service: "filosage",
    environment: environmentName,
    version: environment.version?.trim().slice(0, 80) || null,
    occurredAt: occurredAt.toISOString(),
    severity: event.severity,
    code,
    message: event.message.slice(0, 300),
    context: sanitizedContext(event.context),
  };
}

function retryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryDelay(response: Response | null, attempt: number) {
  const header = response?.headers.get("Retry-After")?.trim();
  const retryAfter = header ? Number(header) : Number.NaN;
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(2_000, retryAfter * 1_000);
  return Math.min(2_000, 250 * (2 ** (attempt - 1)));
}

export async function deliverOperationalAlert(options: {
  webhookUrl: string;
  secret: string;
  event: OperationalAlertEvent;
  environment: { name?: string; version?: string | null };
  maxAttempts?: number;
  timeoutMs?: number;
  occurredAt?: Date;
  fetchImplementation?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}): Promise<OperationalAlertDeliveryResult> {
  const envelope = await createOperationalAlertEnvelope(options.event, options.environment, options.occurredAt);
  const body = JSON.stringify(envelope);
  const signature = await operationalAlertSignature(body, options.secret);
  const maximumAttempts = Math.max(1, Math.min(5, options.maxAttempts ?? 3));
  const timeoutMs = Math.max(250, Math.min(15_000, options.timeoutMs ?? 3_000));
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let lastStatus: number | null = null;
  let lastError: string | null = null;
  let attemptsMade = 0;

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    attemptsMade = attempt;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response | null = null;
    try {
      response = await fetchImplementation(options.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": envelope.id,
          "X-Filosage-Alert-Id": envelope.id,
          "X-Filosage-Alert-Timestamp": envelope.occurredAt,
          "X-Filosage-Signature": signature,
          "X-Filosage-Signature-Version": "v1",
        },
        body,
        signal: controller.signal,
      });
      lastStatus = response.status;
      if (response.ok) {
        return {
          ok: true,
          alertId: envelope.id,
          occurredAt: envelope.occurredAt,
          attempts: attempt,
          status: response.status,
          error: null,
        };
      }
      lastError = `receiver_http_${response.status}`;
      if (!retryableStatus(response.status)) break;
    } catch (error) {
      lastError = error instanceof Error && error.name === "AbortError"
        ? "receiver_timeout"
        : "receiver_unreachable";
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < maximumAttempts) await sleep(retryDelay(response, attempt));
  }

  return {
    ok: false,
    alertId: envelope.id,
    occurredAt: envelope.occurredAt,
    attempts: attemptsMade,
    status: lastStatus,
    error: lastError ?? "delivery_failed",
  };
}
