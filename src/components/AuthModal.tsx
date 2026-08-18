"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Cloud, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import FilosageMark from "@/components/FilosageMark";
import { trackProductEvent } from "@/lib/product-analytics";

interface AuthModalProps {
  onClose: () => void;
  returnFocus?: HTMLElement | null;
}

export default function AuthModal({ onClose, returnFocus }: AuthModalProps) {
  const {
    authentication,
    signInWithRedirect,
    useExistingGoogleSignIn: beginExistingGoogleSignIn,
    error,
    clearError,
  } = useAuth();
  const [redirecting, setRedirecting] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [acceptanceError, setAcceptanceError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const redirectingRef = useRef(false);
  const externalEntryAvailable = authentication.primaryProvider === "filosage"
    && authentication.externalIdAvailable;
  const googleEntryAvailable = authentication.primaryProvider === "google"
    && authentication.legacyGoogleAvailable;
  const primaryAvailable = externalEntryAvailable || googleEntryAvailable;

  useEffect(() => {
    const previousFocus = returnFocus?.isConnected
      ? returnFocus
      : document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ) ?? []);
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); previousFocus?.focus(); };
  }, [onClose, returnFocus]);

  const beginRedirect = async (action: () => Promise<void>, failureMessage: string) => {
    if (redirectingRef.current) return;
    redirectingRef.current = true;
    setRedirecting(true);
    setAcceptanceError(null);
    clearError();
    try {
      trackProductEvent("signup_started", {
        experimentId: window.location.pathname === "/" ? "EXP-001-professional-outcome" : undefined,
        oncePerSession: true,
      });
      await action();
    } catch {
      setAcceptanceError(failureMessage);
      redirectingRef.current = false;
      setRedirecting(false);
    }
  };

  const handleSecureContinue = () => beginRedirect(
    signInWithRedirect,
    "Secure sign-in could not be started. Your learning data has not changed. Please try again.",
  );

  const handleExistingGoogle = () => beginRedirect(
    () => beginExistingGoogleSignIn(),
    "The existing Google sign-in could not be opened. Your learning data has not changed.",
  );

  return <div className="modal-layer" role="presentation" onMouseDown={onClose}>
    <section ref={dialogRef} className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title" aria-describedby="auth-description" onMouseDown={(event) => event.stopPropagation()}>
      <button className="icon-button auth-close" onClick={onClose} aria-label="Close sign-in dialog"><X size={18} /></button>
      <div className="auth-symbol" aria-hidden="true"><FilosageMark /></div>
      <h2 id="auth-title">Keep your learning in sync</h2>
      <p id="auth-description" className="auth-copy">Create a free account to open lessons and save progress, notes, courses, and review dates across devices. You can browse published topics and inspect every course outline without an account.</p>
      <div className="auth-identity"><Cloud size={16} /><span>{externalEntryAvailable
        ? "Choose Google or a private email code on the next secure Filosage screen"
        : googleEntryAvailable
          ? "Continue with Google on the next secure screen"
          : "Secure sign-in is temporarily unavailable"}</span></div>
      {(error || acceptanceError) && <p className="form-error" role="alert">{error ?? acceptanceError}</p>}
      <label className="legal-check">
        <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
        <span>I confirm I am at least 13 and, if I am not yet the age of legal majority where I live, that my parent or guardian has reviewed and agreed to the <Link href="/terms" target="_blank">Terms of Service</Link>. I acknowledge the <Link href="/privacy" target="_blank">Privacy Notice</Link>.</span>
      </label>
      <button className="button button-primary auth-submit" onClick={() => void handleSecureContinue()} disabled={redirecting || !agreed || !primaryAvailable}>
        {redirecting ? "Opening secure sign-in…" : externalEntryAvailable ? "Continue securely" : googleEntryAvailable ? "Continue with Google" : "Sign-in unavailable"}
      </button>
      <p className="auth-redirect-help">{externalEntryAvailable
        ? "Microsoft securely manages sign-in. Filosage never sees your password or one-time code."
        : googleEntryAvailable
          ? "Microsoft securely manages sign-in. Filosage never sees your Google password."
          : "Your learning data has not changed. You can keep browsing published course outlines."}</p>
      {externalEntryAvailable && authentication.legacyGoogleAvailable && (
        <button className="button button-secondary auth-redirect" onClick={() => void handleExistingGoogle()} disabled={redirecting}>
          Use my existing Google sign-in
        </button>
      )}
      <button className="button button-quiet" onClick={onClose}>Continue browsing course outlines</button>
    </section>
  </div>;
}
