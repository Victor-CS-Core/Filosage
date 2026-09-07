"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

export default function LegalConsentModal() {
  const { account, acceptLegalTerms, signOut } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isInitialSetup = account?.applicationAccountExists === false;
  const blocked = !account?.identityLinkRequired;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!blocked || !dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();
    dialog.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
      ));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    dialog.addEventListener("keydown", onKeyDown);
    return () => {
      dialog.removeEventListener("keydown", onKeyDown);
      if (dialog.open) dialog.close();
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [blocked]);

  if (account?.identityLinkRequired) return null;

  const accept = async () => {
    setSaving(true); setError(null);
    try {
      await acceptLegalTerms(isInitialSetup ? "signup" : "terms-update");
      window.location.reload();
    }
    catch { setError("Your acceptance could not be saved. Check your connection and try again."); }
    finally { setSaving(false); }
  };

  const leave = async () => {
    setError(null);
    try {
      await signOut();
      window.location.replace("/");
    } catch {
      setError("You could not be signed out. Check your connection and try again.");
    }
  };

  return <div className="modal-layer legal-consent-layer">
    <dialog ref={dialogRef} tabIndex={-1} className="auth-dialog legal-consent-dialog" aria-labelledby="legal-consent-title" aria-describedby="legal-consent-description" onCancel={(event) => event.preventDefault()}>
      <span className="legal-consent-icon" aria-hidden="true"><ShieldCheck size={22} /></span>
      <p className="overline">{isInitialSetup ? "Account setup" : "Terms update"}</p>
      <h2 id="legal-consent-title">{isInitialSetup ? "Review before creating your account" : "Review before continuing"}</h2>
      <p id="legal-consent-description" className="auth-copy">{isInitialSetup ? "Review the rules and data practices that apply before Filosage creates your learning account." : "We updated the rules for using Filosage or how account and learning data are handled."}</p>
      <label className="legal-check"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /><span>I confirm I am at least 13 and, if I am not yet the age of legal majority where I live, that my parent or guardian has reviewed and agreed to the <Link href="/terms">Terms of Service</Link>. I acknowledge the <Link href="/privacy">Privacy Notice</Link> and <Link href="/acceptable-use">Acceptable Use Policy</Link>.</span></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-primary auth-submit" disabled={!agreed || saving} onClick={accept}>{saving ? "Saving…" : "Accept and continue"}</button>
      <button className="button button-quiet" onClick={() => void leave()}>Sign out</button>
    </dialog>
  </div>;
}
