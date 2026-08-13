"use client";

import { currentEasyAuthSession } from "@/lib/identity-client";
import {
  PRODUCT_EVENT_SCHEMA_VERSION,
  type AcquisitionChannel,
  type AcquisitionContext,
  type ProductEventName,
  type ProductEventRoute,
} from "@/lib/product-events";

const ACTOR_KEY = "filosage:analytics:actor";
const SESSION_KEY = "filosage:analytics:session";
const ATTRIBUTION_KEY = "filosage:analytics:first-touch";
const CONSENT_KEY = "filosage:analytics:consent:v1";
export const ANALYTICS_CONSENT_CHANGED_EVENT = "filosage:analytics-consent-changed";

export type AnalyticsConsent = "accepted" | "declined";

export function subscribeAnalyticsConsent(onChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, onChange);
  return () => window.removeEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, onChange);
}

export function readAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === "accepted" || value === "declined" ? value : null;
  } catch {
    return null;
  }
}

function clearOptionalAnalyticsStorage() {
  try {
    localStorage.removeItem(ACTOR_KEY);
    localStorage.removeItem(ATTRIBUTION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith("filosage:event:") || key?.startsWith("filosage:traffic:")) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Consent still applies even when storage is unavailable.
  }
}

export function setAnalyticsConsent(value: AnalyticsConsent) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(CONSENT_KEY, value); } catch { /* Storage is optional. */ }
  if (value === "declined") clearOptionalAnalyticsStorage();
  window.dispatchEvent(new Event(ANALYTICS_CONSENT_CHANGED_EVENT));
}

function safeIdentifier(storage: Storage, key: string) {
  const current = storage.getItem(key);
  if (current && /^[A-Za-z0-9_-]{12,80}$/.test(current)) return current;
  const next = crypto.randomUUID();
  storage.setItem(key, next);
  return next;
}

function cleanValue(value: string | null, maximum = 80) {
  const cleaned = value?.trim().replace(/[^\p{L}\p{N}._ -]/gu, "").slice(0, maximum);
  return cleaned || undefined;
}

export function acquisitionChannelFor(url: URL, referrerHost?: string): AcquisitionChannel {
  const medium = url.searchParams.get("utm_medium")?.toLowerCase();
  if (medium === "email" || medium === "newsletter") return "email";
  if (url.searchParams.has("ref")) return "referral";
  if (url.searchParams.has("partner")) return "partner";
  if (url.searchParams.has("utm_source")) return "campaign";
  if (!referrerHost) return "direct";
  if (referrerHost === url.hostname) return "internal";
  if (/(^|\.)(google|bing|duckduckgo|yahoo)\./i.test(referrerHost)) return "search";
  if (/(^|\.)(linkedin|reddit|x|twitter|facebook|instagram|threads)\./i.test(referrerHost)) return "social";
  return "referral";
}

function currentAttribution(): AcquisitionContext {
  const url = new URL(window.location.href);
  let referrerHost: string | undefined;
  try {
    referrerHost = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : undefined;
  } catch {
    referrerHost = undefined;
  }
  return {
    channel: acquisitionChannelFor(url, referrerHost),
    referralCode: cleanValue(url.searchParams.get("ref"), 40),
    campaign: cleanValue(url.searchParams.get("utm_campaign")),
    medium: cleanValue(url.searchParams.get("utm_medium")),
    referrerHost: cleanValue(referrerHost ?? null, 120),
    landingPath: `${url.pathname}${url.searchParams.has("q") ? "?q" : ""}`.slice(0, 160),
  };
}

export function acquisitionContext() {
  try {
    const saved = localStorage.getItem(ATTRIBUTION_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as AcquisitionContext;
      if (parsed?.channel && parsed?.landingPath) return parsed;
    }
    const attribution = currentAttribution();
    localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
    return attribution;
  } catch {
    return currentAttribution();
  }
}

export function analyticsIdentity() {
  try {
    return {
      actorId: safeIdentifier(localStorage, ACTOR_KEY),
      sessionId: safeIdentifier(sessionStorage, SESSION_KEY),
    };
  } catch {
    return {
      actorId: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
    };
  }
}

export function routeBucket(pathname: string): ProductEventRoute {
  if (pathname === "/") return "/";
  if (pathname.startsWith("/course/") && pathname.includes("/lesson/")) return "/lesson";
  if (pathname.startsWith("/course/")) return "/course";
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  const known = new Set([
    "library",
    "pricing",
    "progress",
    "evidence",
    "review",
    "create",
    "profile",
    "privacy-center",
    "terms",
    "privacy",
    "acceptable-use",
    "copyright",
  ]);
  return firstSegment && known.has(firstSegment)
    ? `/${firstSegment}` as ProductEventRoute
    : "/other";
}

function sourceFor(channel: AcquisitionChannel) {
  if (channel === "direct") return "direct" as const;
  if (channel === "internal") return "internal" as const;
  return "external" as const;
}

async function sendTelemetry(payload: Record<string, unknown>) {
    const token = await currentEasyAuthSession();
  return fetch("/api/telemetry", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
    keepalive: true,
  });
}

export interface ProductEventOptions {
  route?: ProductEventRoute;
  experimentId?: string;
  courseId?: string;
  lessonId?: string;
  objectiveId?: string;
  contentVersion?: string;
  elapsedMs?: number;
  score?: number;
  exclude?: boolean;
  oncePerSession?: boolean;
}

export function trackProductEvent(event: ProductEventName, options: ProductEventOptions = {}) {
  if (options.exclude || typeof window === "undefined" || readAnalyticsConsent() !== "accepted") return;
  const route = options.route ?? routeBucket(window.location.pathname);
  const onceKey = `filosage:event:${PRODUCT_EVENT_SCHEMA_VERSION}:${event}:${route}`;
  if (options.oncePerSession) {
    try {
      if (sessionStorage.getItem(onceKey)) return;
      sessionStorage.setItem(onceKey, "1");
    } catch {
      // Measurement is best effort when browser storage is unavailable.
    }
  }
  const acquisition = acquisitionContext();
  const identity = analyticsIdentity();
  void sendTelemetry({
      schemaVersion: PRODUCT_EVENT_SCHEMA_VERSION,
      event,
      route,
      source: sourceFor(acquisition.channel),
      acquisition,
      ...identity,
      experimentId: options.experimentId,
      courseId: options.courseId,
      lessonId: options.lessonId,
      objectiveId: options.objectiveId,
      contentVersion: options.contentVersion,
      elapsedMs: options.elapsedMs,
      score: options.score,
    }).catch(() => {
    // Analytics must never interrupt learning.
  });
}

export function trackPageView(pathname: string, exclude = false) {
  if (exclude || readAnalyticsConsent() !== "accepted") return;
  const route = routeBucket(pathname);
  const day = new Date().toISOString().slice(0, 10);
  const storageKey = `filosage:traffic:${day}:${route}`;
  try {
    if (sessionStorage.getItem(storageKey)) return;
    sessionStorage.setItem(storageKey, "1");
  } catch {
    // Continue with best-effort traffic measurement.
  }
  const acquisition = acquisitionContext();
  const identity = analyticsIdentity();
  void sendTelemetry({
      schemaVersion: PRODUCT_EVENT_SCHEMA_VERSION,
      event: "page_view",
      route,
      source: sourceFor(acquisition.channel),
      acquisition,
      ...identity,
    }).catch(() => {
    // Analytics must never interrupt learning.
  });

  if (route === "/") {
    trackProductEvent("landing_viewed", {
      route,
      experimentId: "EXP-001-professional-outcome",
      exclude,
      oncePerSession: true,
    });
  }
  if (route === "/pricing") {
    trackProductEvent("pricing_viewed", { route, exclude, oncePerSession: true });
  }
}
