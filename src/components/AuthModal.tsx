"use client";

import { useEffect, useRef, useState } from "react";
import { Cloud, KeyRound, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

interface AuthModalProps {
  onClose: () => void;
}

export default function AuthModal({ onClose }: AuthModalProps) {
  const { signInWithGoogle, error, clearError } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ) ?? []);
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
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
  }, [onClose]);

  const handleGoogle = async () => {
    setSubmitting(true);
    clearError();
    try {
      await signInWithGoogle();
      onClose();
    } catch {
      // The provider presents a specific, actionable message.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-layer" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="icon-button auth-close" onClick={onClose} aria-label="Close sign-in dialog">
          <X size={18} />
        </button>

        <div className="auth-symbol" aria-hidden="true">
          <KeyRound size={24} />
        </div>
        <p className="overline">Learner account</p>
        <h2 id="auth-title">Keep your learning in sync</h2>
        <p className="auth-copy">
          Sign in to continue across devices, revisit concepts at the right time, and keep a durable record of what you have mastered. Published courses remain open without an account.
        </p>

        <div className="auth-identity">
          <Cloud size={16} />
          <span>Cloud progress · review queue · saved learning</span>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <button className="button button-primary auth-submit" onClick={handleGoogle} disabled={submitting}>
          <span className="google-mark" aria-hidden="true">G</span>
          {submitting ? "Connecting…" : "Continue with Google"}
        </button>
        <button className="button button-quiet" onClick={onClose}>Continue without an account</button>
      </section>
    </div>
  );
}
