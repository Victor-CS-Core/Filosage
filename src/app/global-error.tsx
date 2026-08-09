"use client";

import { LifeBuoy, RefreshCw } from "lucide-react";
import { SUPPORT_CONTACT } from "@/lib/legal";
import "@/styles/brand/tokens.css";
import "./globals.css";

export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="center-state release-fallback" id="main-content" role="alert">
          <div className="global-error-mark" aria-hidden="true">E</div>
          <p className="overline">Filosage needs a fresh start</p>
          <h1>The application could not finish loading.</h1>
          <p>Retry the application. If it still does not open, contact support and include what you were trying to do.</p>
          <div className="fallback-actions" aria-label="Application recovery options">
            <button className="button button-primary" type="button" onClick={() => unstable_retry()}>
              <RefreshCw size={16} aria-hidden="true" /> Retry Filosage
            </button>
            <button className="button button-secondary" type="button" onClick={() => window.location.assign("/")}>Return home</button>
          </div>
          <a className="fallback-support" href={`mailto:${SUPPORT_CONTACT}`}>
            <LifeBuoy size={15} aria-hidden="true" /> {SUPPORT_CONTACT}
          </a>
        </main>
      </body>
    </html>
  );
}
