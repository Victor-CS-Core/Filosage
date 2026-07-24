"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

export default function LegalConsentModal() {
  const { acceptLegalTerms, signOut } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => { dialogRef.current?.focus(); }, []);

  const accept = async () => {
    setSaving(true); setError(null);
    try { await acceptLegalTerms("terms-update"); }
    catch { setError("Your acceptance could not be saved. Check your connection and try again."); }
    finally { setSaving(false); }
  };

  return <div className="modal-layer legal-consent-layer">
    <section ref={dialogRef} tabIndex={-1} className="auth-dialog legal-consent-dialog" role="dialog" aria-modal="true" aria-labelledby="legal-consent-title">
      <span className="legal-consent-icon" aria-hidden="true"><ShieldCheck size={22} /></span>
      <p className="overline">Terms update</p>
      <h2 id="legal-consent-title">Review before continuing</h2>
      <p className="auth-copy">We have documented the rules for using Erudoza and how account and learning data are handled.</p>
      <label className="legal-check"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /><span>I confirm I am at least 13 and, if I am not yet the age of legal majority where I live, that my parent or guardian has reviewed and agreed to the <Link href="/terms">Terms of Service</Link>. I acknowledge the <Link href="/privacy">Privacy Notice</Link> and <Link href="/acceptable-use">Acceptable Use Policy</Link>.</span></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-primary auth-submit" disabled={!agreed || saving} onClick={accept}>{saving ? "Saving…" : "Accept and continue"}</button>
      <button className="button button-quiet" onClick={() => void signOut()}>Sign out</button>
    </section>
  </div>;
}
