"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Cloud, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import ErudozaMark from "@/components/ErudozaMark";

interface AuthModalProps { onClose: () => void; }

export default function AuthModal({ onClose }: AuthModalProps) {
  const { signInWithGoogle, acceptLegalTerms, error, clearError } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [acceptanceError, setAcceptanceError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
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
  }, [onClose]);

  const handleGoogle = async () => {
    setSubmitting(true);
    setAcceptanceError(null);
    clearError();
    try {
      const user = await signInWithGoogle();
      await acceptLegalTerms("signup", user);
      onClose();
    } catch {
      setAcceptanceError("Sign-in or acceptance could not be completed. Please try again.");
    } finally { setSubmitting(false); }
  };

  return <div className="modal-layer" role="presentation" onMouseDown={onClose}>
    <section ref={dialogRef} className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title" aria-describedby="auth-description" onMouseDown={(event) => event.stopPropagation()}>
      <button className="icon-button auth-close" onClick={onClose} aria-label="Close sign-in dialog"><X size={18} /></button>
      <div className="auth-symbol" aria-hidden="true"><ErudozaMark /></div>
      <p className="overline">Learner account</p>
      <h2 id="auth-title">Keep your learning in sync</h2>
      <p id="auth-description" className="auth-copy">Sign in to save progress, notes, courses, and review dates across devices. You can still read published courses without an account.</p>
      <div className="auth-identity"><Cloud size={16} /><span>Progress · reviews · saved courses</span></div>
      {(error || acceptanceError) && <p className="form-error" role="alert">{error ?? acceptanceError}</p>}
      <label className="legal-check">
        <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
        <span>I confirm I am at least 13 and, if I am not yet the age of legal majority where I live, that my parent or guardian has reviewed and agreed to the <Link href="/terms" target="_blank">Terms of Service</Link>. I acknowledge the <Link href="/privacy" target="_blank">Privacy Notice</Link>.</span>
      </label>
      <button className="button button-primary auth-submit" onClick={handleGoogle} disabled={submitting || !agreed}>
        <span className="google-mark" aria-hidden="true">G</span>{submitting ? "Signing in…" : "Continue with Google"}
      </button>
      <button className="button button-quiet" onClick={onClose}>Continue without an account</button>
    </section>
  </div>;
}
