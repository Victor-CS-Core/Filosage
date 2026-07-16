"use client";

import { useEffect, useState } from "react";
import { KeyRound, LockKeyhole, X } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { OWNER_EMAIL } from "@/lib/auth-constants";

interface AuthModalProps {
  onClose: () => void;
}

export default function AuthModal({ onClose }: AuthModalProps) {
  const { signInWithGoogle, error, clearError } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
        <p className="overline">Private workspace</p>
        <h2 id="auth-title">Enter Teach Studio</h2>
        <p className="auth-copy">
          Course generation, publishing, and the AI tutor are reserved for the owner. Public learning stays open to everyone.
        </p>

        <div className="auth-identity">
          <LockKeyhole size={16} />
          <span>{OWNER_EMAIL}</span>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <button className="button button-primary auth-submit" onClick={handleGoogle} disabled={submitting}>
          <span className="google-mark" aria-hidden="true">G</span>
          {submitting ? "Connecting…" : "Continue with Google"}
        </button>
        <button className="button button-quiet" onClick={onClose}>Return to public learning</button>
      </section>
    </div>
  );
}
