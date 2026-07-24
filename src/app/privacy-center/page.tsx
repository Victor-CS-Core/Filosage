"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteUser, GoogleAuthProvider, reauthenticateWithPopup } from "firebase/auth";
import { Download, LoaderCircle, LockKeyhole, ShieldCheck, Trash2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { LEGAL_CONTACT, SUPPORT_CONTACT } from "@/lib/legal";

export default function PrivacyCenterPage() {
  const router = useRouter();
  const { user, isOwner, loading, signInWithGoogle } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const downloadData = async () => {
    if (!user || exporting) return;
    setExporting(true);
    setMessage(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/account/data", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Your export could not be prepared.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `erudoza-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage("Your Erudoza data export has been downloaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your export could not be prepared.");
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    if (!user || deleting || confirmation !== "DELETE MY ACCOUNT") return;
    setDeleting(true);
    setMessage(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await reauthenticateWithPopup(user, provider);
      const token = await user.getIdToken(true);
      const response = await fetch("/api/account/data", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Your account data could not be deleted.");
      await deleteUser(user);
      router.replace("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your account could not be deleted.");
      setDeleting(false);
    }
  };

  return (
    <AppShell>
      <article className="privacy-center-page">
        <header>
          <span className="privacy-center-icon" aria-hidden="true"><ShieldCheck size={24} /></span>
          <p className="overline">Privacy center</p>
          <h1>Your information, under your control.</h1>
          <p>Review how Erudoza handles learning data, download a portable copy, or permanently close your account.</p>
        </header>

        <section className="privacy-center-grid" aria-label="Privacy controls">
          <article>
            <Download size={20} />
            <div><h2>Download your data</h2><p>Get your profile, preferences, notes, bookmarks, progress, legal acceptances, courses, and AI usage records as JSON.</p></div>
            {user ? (
              <button className="button button-secondary" onClick={() => void downloadData()} disabled={exporting}>
                {exporting ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />} Download my data
              </button>
            ) : (
              <button className="button button-secondary" onClick={() => void signInWithGoogle()}>Sign in to export</button>
            )}
          </article>

          <article>
            <LockKeyhole size={20} />
            <div><h2>Privacy requests</h2><p>Ask for access, correction, deletion, portability, restriction, or another privacy right. Requests are verified before disclosure or deletion.</p></div>
            <a className="button button-secondary" href={`mailto:${LEGAL_CONTACT}?subject=Erudoza%20privacy%20request`}>Email privacy team</a>
          </article>

          <article className="privacy-danger-zone">
            <Trash2 size={20} />
            <div><h2>Delete your account</h2><p>This permanently removes your Erudoza learning data and private courses. This cannot be undone. Some records may be retained only when required by law.</p></div>
            {!user ? (
              <button className="button button-secondary" onClick={() => void signInWithGoogle()}>Sign in to manage account</button>
            ) : isOwner ? (
              <p className="privacy-owner-note">The owner account cannot be deleted automatically because it controls published courses. Contact <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a> for a documented transfer or shutdown.</p>
            ) : !deleteArmed ? (
              <button className="button button-danger" onClick={() => setDeleteArmed(true)}><Trash2 size={16} /> Start account deletion</button>
            ) : (
              <div className="privacy-delete-confirmation">
                <label htmlFor="delete-confirmation">Type <strong>DELETE MY ACCOUNT</strong> to confirm</label>
                <input id="delete-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
                <div><button className="button button-quiet" onClick={() => { setDeleteArmed(false); setConfirmation(""); }}>Cancel</button><button className="button button-danger" disabled={confirmation !== "DELETE MY ACCOUNT" || deleting} onClick={() => void deleteAccount()}>{deleting ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />} Permanently delete</button></div>
              </div>
            )}
          </article>
        </section>

        {message && <p className="privacy-center-message" role="status">{message}</p>}
        {loading && <p className="privacy-center-message" role="status">Loading account controls…</p>}

        <footer>
          <p>Read the <Link href="/privacy">Privacy Notice</Link>, or contact <a href={`mailto:${SUPPORT_CONTACT}`}>{SUPPORT_CONTACT}</a> for account help.</p>
        </footer>
      </article>
    </AppShell>
  );
}
