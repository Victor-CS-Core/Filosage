"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Cloud, Mail, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import FilosageMark from "@/components/FilosageMark";
import GoogleMark from "@/components/GoogleMark";
import { trackProductEvent } from "@/lib/product-analytics";

interface AuthModalProps {
  onClose: () => void;
  returnFocus?: HTMLElement | null;
  returnPath?: string;
}

export default function AuthModal({ onClose, returnFocus, returnPath }: AuthModalProps) {
  const {
    authentication,
    signInWithRedirect,
    signInWithProvider,
    useExistingGoogleSignIn: beginExistingGoogleSignIn,
    error,
    clearError,
  } = useAuth();
  const [redirecting, setRedirecting] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [acceptanceError, setAcceptanceError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const redirectingRef = useRef(false);
  const primaryProvider = authentication.primaryProvider;
  const primaryAvailable = primaryProvider === "filosage"
    ? authentication.externalIdAvailable
    : primaryProvider === "google" && authentication.legacyGoogleAvailable;
  const createsAccount = primaryProvider === "google"
    ? authentication.legacyGoogleAvailable
    : primaryProvider === "filosage" && authentication.externalIdNewAccountsAvailable;
  const externalExistingAlternate = primaryProvider === "google"
    && authentication.externalIdAvailable
    && !authentication.externalIdNewAccountsAvailable;
  const googleAlternate = primaryProvider === "filosage"
    && authentication.externalIdNewAccountsAvailable
    && authentication.legacyGoogleAvailable;
  const identityCopy = primaryProvider === "filosage"
    ? authentication.externalIdNewAccountsAvailable
      ? authentication.legacyGoogleAvailable
        ? "Choose Google or a private email code on the next secure Filosage screen"
        : "Choose a private email code on the next secure Filosage screen"
      : "Sign in to an existing Filosage account with a private email code on the next secure screen"
    : primaryProvider === "google"
      ? externalExistingAlternate
        ? "Continue with Google to create an account, or use a private email code for an existing account"
        : "Continue with Google on the next secure screen"
      : "Secure sign-in is temporarily unavailable";

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
    createsAccount
      ? () => signInWithRedirect(returnPath)
      : () => primaryProvider ? signInWithProvider(primaryProvider, returnPath) : Promise.reject(new Error("Sign-in unavailable.")),
    "Secure sign-in could not be started. Your learning data has not changed. Please try again.",
  );

  const handleExistingGoogle = () => beginRedirect(
    () => beginExistingGoogleSignIn(false, returnPath),
    "The existing Google sign-in could not be opened. Your learning data has not changed.",
  );

  const handleExistingEmail = () => beginRedirect(
    () => signInWithProvider("filosage", returnPath),
    "Email-code sign-in could not be opened. Your learning data has not changed.",
  );

  return <div className="modal-layer" role="presentation" onMouseDown={onClose}>
    <section ref={dialogRef} className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title" aria-describedby="auth-description" onMouseDown={(event) => event.stopPropagation()}>
      <button className="icon-button auth-close" onClick={onClose} aria-label="Close sign-in dialog"><X size={18} /></button>
      <div className="auth-symbol" aria-hidden="true"><FilosageMark /></div>
      <h2 id="auth-title">Keep your learning in sync</h2>
      <p id="auth-description" className="auth-copy">{createsAccount
        ? "Create a free account to open lessons and save progress, notes, courses, and review dates across devices. You can browse published topics and inspect every course outline without an account."
        : primaryAvailable
          ? "Sign in to an existing account to open lessons and keep your saved learning in sync. You can browse every published course outline without signing in."
          : "Sign-in is unavailable right now. You can still browse published topics and inspect every course outline."}</p>
      <div className="auth-identity">
        <span className="auth-identity-marks" aria-hidden="true">
          {identityCopy.includes("Google") ? <GoogleMark /> : null}
          {/email/i.test(identityCopy) ? <Mail size={16} /> : null}
          {identityCopy.includes("Google") || /email/i.test(identityCopy) ? null : <Cloud size={16} />}
        </span>
        <span className="auth-identity-copy">{identityCopy}</span>
      </div>
      {(error || acceptanceError) && <p className="form-error" role="alert">{error ?? acceptanceError}</p>}
      {createsAccount && <label className="legal-check">
        <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
        <span>I confirm I am at least 13 and, if I am not yet the age of legal majority where I live, that my parent or guardian has reviewed and agreed to the <Link href="/terms" target="_blank">Terms of Service</Link>. I acknowledge the <Link href="/privacy" target="_blank">Privacy Notice</Link>.</span>
      </label>}
      <button
        className={`button ${primaryProvider === "google" ? "button-google" : "button-primary"} auth-submit`}
        onClick={() => void handleSecureContinue()}
        disabled={redirecting || !primaryAvailable || (createsAccount && !agreed)}
      >
        {primaryProvider === "google" ? <GoogleMark /> : null}
        {redirecting ? "Opening secure sign-in…" : primaryProvider === "filosage" ? createsAccount ? "Continue securely" : "Sign in with email code" : primaryProvider === "google" ? "Continue with Google" : "Sign-in unavailable"}
      </button>
      <p className="auth-redirect-help">{primaryProvider === "filosage"
        ? "Microsoft securely manages sign-in. Filosage never sees your password or one-time code."
        : primaryProvider === "google"
          ? "Microsoft securely manages sign-in. Filosage never sees your Google password."
          : "Your learning data has not changed. You can keep browsing published course outlines."}</p>
      {googleAlternate && (
        <button className="button button-google auth-redirect" onClick={() => void handleExistingGoogle()} disabled={redirecting}>
          <GoogleMark />
          Use my existing Google sign-in
        </button>
      )}
      {externalExistingAlternate && (
        <button className="button button-secondary auth-redirect" onClick={() => void handleExistingEmail()} disabled={redirecting}>
          Use email code for an existing account
        </button>
      )}
      <button className="button button-quiet" onClick={onClose}>Continue browsing course outlines</button>
    </section>
  </div>;
}
