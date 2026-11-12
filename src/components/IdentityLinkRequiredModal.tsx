"use client";

import { ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

export default function IdentityLinkRequiredModal() {
  const {
    signOut,
    error: authenticationError,
    clearError,
  } = useAuth();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
    ) ?? []);
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, []);

  const beginAction = () => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setActionError(null);
    clearError();
    return true;
  };

  const finishFailedAction = (message: string) => {
    busyRef.current = false;
    setBusy(false);
    setActionError(message);
  };

  const leave = async () => {
    if (!beginAction()) return;
    try {
      await signOut();
    } catch {
      finishFailedAction("You could not be signed out. Check your connection and try again.");
    }
  };

  const visibleError = actionError ?? authenticationError;

  return <div className="modal-layer legal-consent-layer">
    <section
      ref={dialogRef}
      tabIndex={-1}
      className="auth-dialog legal-consent-dialog identity-link-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="identity-link-title"
      aria-describedby="identity-link-description"
    >
      <span className="legal-consent-icon" aria-hidden="true"><ShieldCheck size={22} /></span>
      <h2 id="identity-link-title">Account review required</h2>
      <p id="identity-link-description" className="auth-copy">This Google identity conflicts with an existing Filosage account record. No account data has changed. Sign out and contact Filosage support for review.</p>
      {visibleError && <p className="form-error" role="alert">{visibleError}</p>}
      <button className="button button-quiet" disabled={busy} onClick={() => void leave()}>
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </section>
  </div>;
}
