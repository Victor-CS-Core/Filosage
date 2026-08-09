"use client";

import { LifeBuoy, RefreshCw } from "lucide-react";
import FilosageMark from "@/components/FilosageMark";
import { SUPPORT_CONTACT } from "@/lib/legal";

export default function ErrorPage({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <main className="center-state release-fallback" id="main-content" role="alert">
      <FilosageMark className="brand-mark" />
      <p className="overline">Something interrupted this page</p>
      <h1>Your learning record is still safe.</h1>
      <p>Try loading this part of Filosage again. If the problem continues, return to the library or contact support.</p>
      <div className="fallback-actions" aria-label="Error recovery options">
        <button className="button button-primary" type="button" onClick={() => unstable_retry()}>
          <RefreshCw size={16} aria-hidden="true" /> Try again
        </button>
        <button className="button button-secondary" type="button" onClick={() => window.location.assign("/library")}>Browse courses</button>
      </div>
      <a className="fallback-support" href={`mailto:${SUPPORT_CONTACT}`}>
        <LifeBuoy size={15} aria-hidden="true" /> {SUPPORT_CONTACT}
      </a>
    </main>
  );
}
