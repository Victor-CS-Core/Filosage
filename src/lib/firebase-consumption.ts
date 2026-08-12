import "server-only";

import { isLocalMode } from "@/lib/local-mode";
import { serverEnvironment } from "@/lib/runtime-environment";
import { FIRESTORE_PRICING, estimateFirestoreCost } from "@/lib/firebase-pricing";

const METRICS = {
  reads: "firestore.googleapis.com/document/read_count",
  writes: "firestore.googleapis.com/document/write_count",
  deletes: "firestore.googleapis.com/document/delete_count",
  dataStorage: "firestore.googleapis.com/storage/data_and_index_storage_bytes",
  backupStorage: "firestore.googleapis.com/storage/backups_storage_bytes",
  pitrStorage: "firestore.googleapis.com/storage/pitr_storage_bytes",
} as const;

interface MonitoringPoint {
  interval?: { endTime?: string };
  value?: { int64Value?: string; doubleValue?: number };
}

interface MonitoringTimeSeries {
  metric?: { type?: string };
  resource?: { labels?: Record<string, string> };
  points?: MonitoringPoint[];
}

interface MonitoringResponse {
  timeSeries?: MonitoringTimeSeries[];
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

export interface FirebaseConsumption {
  generatedAt: string;
  period: { month: string; from: string; to: string; elapsedDays: number; daysInMonth: number };
  source: "cloud_monitoring" | "unavailable" | "local";
  status: "available" | "permission_required" | "unavailable" | "local";
  location?: string;
  estimatedCostUsd: number | null;
  firestore: {
    reads: number | null;
    writes: number | null;
    deletes: number | null;
    dataStorageBytes: number | null;
    backupStorageBytes: number | null;
    pitrStorageBytes: number | null;
    estimatedCostUsd: number | null;
    freeQuota: {
      readsPerDay: number;
      writesPerDay: number;
      deletesPerDay: number;
      storageBytes: number;
    };
    rates: {
      readPer100kUsd: number;
      writePer100kUsd: number;
      deletePer100kUsd: number;
      dataStoragePerGibMonthUsd: number;
      backupStoragePerGibMonthUsd: number;
      pitrStoragePerGibMonthUsd: number;
    };
  };
  authentication: {
    method: "Google social sign-in";
    measuredAccounts: number;
    estimatedCostUsd: 0;
    detail: string;
  };
  appStorage: {
    configured: boolean;
    applicationSdkUsed: false;
    estimatedCostUsd: null;
    detail: string;
  };
  managedBackups: {
    configured: boolean;
    storageBytes: number | null;
    estimatedCostUsd: number | null;
    detail: string;
  };
  hosting: {
    provider: "Codex Sites";
    firebaseHostingUsed: false;
    estimatedFirebaseCostUsd: 0;
    detail: string;
  };
  limitations: string[];
}

let monitoringToken: { value: string; expiresAt: number } | null = null;
let monitoringTokenRequest: Promise<string> | null = null;

function requiredServiceAccount() {
  const projectId = serverEnvironment.FIREBASE_PROJECT_ID;
  const clientEmail = serverEnvironment.FIREBASE_CLIENT_EMAIL;
  const privateKey = serverEnvironment.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) throw new Error("Firebase server credentials are not configured.");
  return { projectId, clientEmail, privateKey };
}

function base64Url(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function monitoringAccessToken() {
  if (monitoringToken && monitoringToken.expiresAt > Date.now() + 60_000) return monitoringToken.value;
  if (monitoringTokenRequest) return monitoringTokenRequest;

  monitoringTokenRequest = (async () => {
    const { clientEmail, privateKey } = requiredServiceAccount();
    const now = Math.floor(Date.now() / 1_000);
    const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64Url(JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/monitoring.read",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3_600,
    }));
    const keyBody = privateKey
      .replace("-----BEGIN PRIVATE KEY-----", "")
      .replace("-----END PRIVATE KEY-----", "")
      .replace(/\s/g, "");
    const keyBytes = Uint8Array.from(atob(keyBody), (character) => character.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      "pkcs8",
      keyBytes,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const unsigned = `${header}.${payload}`;
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${unsigned}.${base64Url(new Uint8Array(signature))}`,
      }),
    });
    if (!response.ok) throw new Error(`Monitoring token request failed (${response.status}).`);
    const token = (await response.json()) as TokenResponse;
    monitoringToken = { value: token.access_token, expiresAt: Date.now() + token.expires_in * 1_000 };
    return token.access_token;
  })();

  try {
    return await monitoringTokenRequest;
  } finally {
    monitoringTokenRequest = null;
  }
}

function pointValue(point: MonitoringPoint) {
  const value = point.value?.int64Value ?? point.value?.doubleValue ?? 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function monitoringMetric(metric: string, from: string, to: string, gauge = false) {
  const { projectId } = requiredServiceAccount();
  const token = await monitoringAccessToken();
  const query = new URLSearchParams({
    filter: `metric.type="${metric}"`,
    "interval.startTime": from,
    "interval.endTime": to,
    view: "FULL",
    "aggregation.alignmentPeriod": "86400s",
    "aggregation.perSeriesAligner": gauge ? "ALIGN_MEAN" : "ALIGN_SUM",
    "aggregation.crossSeriesReducer": "REDUCE_SUM",
  });
  const response = await fetch(`https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/timeSeries?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const error = new Error(`Cloud Monitoring request failed (${response.status}).`);
    Object.assign(error, { status: response.status });
    throw error;
  }
  return (await response.json()) as MonitoringResponse;
}

function total(response: MonitoringResponse) {
  return (response.timeSeries ?? []).reduce(
    (sum, series) => sum + (series.points ?? []).reduce((pointSum, point) => pointSum + pointValue(point), 0),
    0,
  );
}

function latest(response: MonitoringResponse) {
  const points = (response.timeSeries ?? []).flatMap((series) => series.points ?? []);
  return points.sort((a, b) => Date.parse(b.interval?.endTime ?? "") - Date.parse(a.interval?.endTime ?? ""))[0];
}

function location(response: MonitoringResponse) {
  return (response.timeSeries ?? []).map((series) => series.resource?.labels?.location_id).find(Boolean);
}

function unavailableConsumption(
  generatedAt: string,
  period: FirebaseConsumption["period"],
  measuredAccounts: number,
  status: FirebaseConsumption["status"],
): FirebaseConsumption {
  const local = status === "local";
  const managedBackupsConfigured = Boolean(serverEnvironment.FIRESTORE_BACKUP_BUCKET?.trim());
  return {
    generatedAt,
    period,
    source: local ? "local" : "unavailable",
    status,
    estimatedCostUsd: null,
    firestore: {
      reads: null, writes: null, deletes: null,
      dataStorageBytes: null, backupStorageBytes: null, pitrStorageBytes: null,
      estimatedCostUsd: null,
      freeQuota: {
        readsPerDay: FIRESTORE_PRICING.dailyFreeReads,
        writesPerDay: FIRESTORE_PRICING.dailyFreeWrites,
        deletesPerDay: FIRESTORE_PRICING.dailyFreeDeletes,
        storageBytes: FIRESTORE_PRICING.freeStorageBytes,
      },
      rates: FIRESTORE_PRICING,
    },
    authentication: {
      method: "Google social sign-in",
      measuredAccounts,
      estimatedCostUsd: 0,
      detail: "The app uses Google social sign-in, which is a no-cost Firebase Authentication option unless Identity Platform or phone authentication is enabled separately.",
    },
    appStorage: {
      configured: Boolean(serverEnvironment.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim()),
      applicationSdkUsed: false,
      estimatedCostUsd: null,
      detail: "A bucket name is configured, but the application does not import or call the Firebase Storage SDK. Existing bucket objects, if any, require Cloud Billing export for invoice-level cost.",
    },
    managedBackups: {
      configured: managedBackupsConfigured,
      storageBytes: null,
      estimatedCostUsd: null,
      detail: managedBackupsConfigured
        ? "A managed export bucket is configured. Export reads and separate Cloud Storage charges require billing-report evidence because Firebase usage does not show managed-export reads."
        : "No managed backup bucket is configured.",
    },
    hosting: {
      provider: "Codex Sites",
      firebaseHostingUsed: false,
      estimatedFirebaseCostUsd: 0,
      detail: "The application is packaged for Codex Sites, not Firebase Hosting.",
    },
    limitations: [
      local
        ? "Cloud Monitoring is intentionally unavailable in local mode."
        : "Grant the runtime Firebase service account the Monitoring Viewer role to load project usage metrics.",
      "Exact billed cost, network egress, index-entry reads, credits, discounts, taxes, and Cloud Storage bucket charges require Google Cloud Billing export data.",
      "Managed exports bill one document read per exported document, but those export reads do not appear in Firebase's usage panel.",
    ],
  };
}

export async function firebaseConsumption(measuredAccounts: number, now = new Date()): Promise<FirebaseConsumption> {
  const generatedAt = now.toISOString();
  const fromDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const period: FirebaseConsumption["period"] = {
    month: generatedAt.slice(0, 7),
    from: fromDate.toISOString(),
    to: generatedAt,
    elapsedDays: now.getUTCDate(),
    daysInMonth,
  };
  if (isLocalMode()) return unavailableConsumption(generatedAt, period, measuredAccounts, "local");

  try {
    const [readsResponse, writesResponse, deletesResponse, dataStorageResponse, backupStorageResponse, pitrStorageResponse] = await Promise.all([
      monitoringMetric(METRICS.reads, period.from, period.to),
      monitoringMetric(METRICS.writes, period.from, period.to),
      monitoringMetric(METRICS.deletes, period.from, period.to),
      monitoringMetric(METRICS.dataStorage, period.from, period.to, true),
      monitoringMetric(METRICS.backupStorage, period.from, period.to, true),
      monitoringMetric(METRICS.pitrStorage, period.from, period.to, true),
    ]);
    const reads = total(readsResponse);
    const writes = total(writesResponse);
    const deletes = total(deletesResponse);
    const dataStorageBytes = pointValue(latest(dataStorageResponse) ?? {});
    const backupStorageBytes = pointValue(latest(backupStorageResponse) ?? {});
    const pitrStorageBytes = pointValue(latest(pitrStorageResponse) ?? {});
    const estimatedCostUsd = estimateFirestoreCost({
      reads, writes, deletes, dataStorageBytes, backupStorageBytes, pitrStorageBytes,
      elapsedDays: period.elapsedDays, daysInMonth,
    });
    const managedBackupsConfigured = Boolean(serverEnvironment.FIRESTORE_BACKUP_BUCKET?.trim());
    return {
      generatedAt,
      period,
      source: "cloud_monitoring",
      status: "available",
      location: location(readsResponse) ?? location(dataStorageResponse),
      estimatedCostUsd,
      firestore: {
        reads, writes, deletes, dataStorageBytes, backupStorageBytes, pitrStorageBytes, estimatedCostUsd,
        freeQuota: {
          readsPerDay: FIRESTORE_PRICING.dailyFreeReads,
          writesPerDay: FIRESTORE_PRICING.dailyFreeWrites,
          deletesPerDay: FIRESTORE_PRICING.dailyFreeDeletes,
          storageBytes: FIRESTORE_PRICING.freeStorageBytes,
        },
        rates: FIRESTORE_PRICING,
      },
      authentication: {
        method: "Google social sign-in",
        measuredAccounts,
        estimatedCostUsd: 0,
        detail: "The app uses Google social sign-in, a no-cost Firebase Authentication option unless Identity Platform or phone authentication is enabled separately.",
      },
      appStorage: {
        configured: Boolean(serverEnvironment.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim()),
        applicationSdkUsed: false,
        estimatedCostUsd: null,
        detail: "The application does not import or call the Firebase Storage SDK. Existing bucket objects, if any, are outside this estimate.",
      },
      managedBackups: {
        configured: managedBackupsConfigured,
        storageBytes: backupStorageBytes,
        estimatedCostUsd: managedBackupsConfigured ? null : 0,
        detail: managedBackupsConfigured
          ? "Firestore-native backup bytes are shown above. Managed exports also bill document reads and separate Cloud Storage, which require Billing export for exact cost."
          : "No managed backup bucket is configured; Firestore-native backup bytes are still measured separately.",
      },
      hosting: {
        provider: "Codex Sites",
        firebaseHostingUsed: false,
        estimatedFirebaseCostUsd: 0,
        detail: "The application is packaged for Codex Sites, not Firebase Hosting.",
      },
      limitations: [
        "This is a month-to-date operational estimate from delayed Cloud Monitoring metrics, not the Google Cloud invoice.",
        "Exact network egress, index-entry reads, credits, discounts, taxes, and separate Cloud Storage bucket charges require Google Cloud Billing export data.",
        "Managed exports incur one billed document read per exported document, but those reads are excluded from Firebase's usage panel.",
        "Free operation allowance is estimated across elapsed days; Google applies it daily around midnight Pacific time.",
      ],
    };
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
    console.error("Firebase consumption metrics unavailable:", error instanceof Error ? error.message : error);
    return unavailableConsumption(generatedAt, period, measuredAccounts, status === 403 ? "permission_required" : "unavailable");
  }
}
