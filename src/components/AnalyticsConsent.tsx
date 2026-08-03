"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  readAnalyticsConsent,
  setAnalyticsConsent,
  subscribeAnalyticsConsent,
  type AnalyticsConsent as AnalyticsConsentValue,
} from "@/lib/product-analytics";

function serverConsentSnapshot() { return "loading" as const; }

export default function AnalyticsConsent() {
  const choice = useSyncExternalStore(
    subscribeAnalyticsConsent,
    readAnalyticsConsent,
    serverConsentSnapshot,
  );

  const choose = (value: AnalyticsConsentValue) => {
    setAnalyticsConsent(value);
  };

  if (choice !== null) return null;

  return (
    <aside className="analytics-consent" aria-labelledby="analytics-consent-title">
      <div>
        <p className="overline">Your privacy choice</p>
        <h2 id="analytics-consent-title">Help improve the learning experience?</h2>
        <p>Optional first-party analytics show which learning paths are useful. They are off until you choose, contain no lesson text, and can be withdrawn from <Link href="/privacy-center">Privacy choices</Link>.</p>
      </div>
      <div className="analytics-consent-actions">
        <button className="button button-secondary" type="button" onClick={() => choose("declined")}>Continue without analytics</button>
        <button className="button button-primary" type="button" onClick={() => choose("accepted")}>Allow optional analytics</button>
      </div>
    </aside>
  );
}
