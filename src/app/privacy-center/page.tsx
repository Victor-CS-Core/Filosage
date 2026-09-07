"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { BarChart3, Download, LoaderCircle, LockKeyhole, ShieldCheck, Trash2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { isCurrentLearnerSession, learnerSessionSnapshot } from "@/lib/learner-storage";
import { assertLearnerSession, learnerJsonResponse } from "@/lib/learner-source";
import { acknowledgeActiveDataRemoval, downloadLearnerFile, readDeletionReceipt, subscribeDeletionReceipt } from "@/lib/learner-actions";
import AccountEntryButton from "@/components/AccountEntryButton";
import { useAuth } from "@/components/AuthProvider";
import { LEGAL_CONTACT, PAID_SUBSCRIPTION_POLICY, SUPPORT_CONTACT } from "@/lib/legal";
import {
  readAnalyticsConsent,
  setAnalyticsConsent,
  subscribeAnalyticsConsent,
  type AnalyticsConsent as AnalyticsConsentValue,
} from "@/lib/product-analytics";

function serverConsentSnapshot() { return null; }

export default function PrivacyCenterPage() {
  const { user, isOwner, loading, reauthenticate } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const receipt = useSyncExternalStore(subscribeDeletionReceipt, readDeletionReceipt, serverConsentSnapshot);
  const analyticsChoice = useSyncExternalStore(
    subscribeAnalyticsConsent,
    readAnalyticsConsent,
    serverConsentSnapshot,
  );

  const chooseAnalytics = (choice: AnalyticsConsentValue) => {
    setAnalyticsConsent(choice);
    setMessage(choice === "accepted"
      ? "Optional first-party analytics are on. No lesson text is included."
      : "Optional analytics are off and their browser identifiers were removed.");
  };

  const downloadData = async () => {
    if (!user || exporting) return;
    const session = learnerSessionSnapshot(user.uid);
    setExporting(true);
    setMessage(null);
    try {
      await downloadLearnerFile(user, "/api/account/data", `filosage-data-${new Date().toISOString().slice(0, 10)}.json`);
      assertLearnerSession(session);
      setMessage("Your Filosage data export has been downloaded.");
    } catch (error) {
      if (!isCurrentLearnerSession(session)) return;
      setMessage(error instanceof Error ? error.message : "Your export could not be prepared.");
    } finally {
      if (isCurrentLearnerSession(session)) setExporting(false);
    }
  };

  const deleteAccount = async () => {
    if (!user || deleting || confirmation !== "DELETE MY ACCOUNT") return;
    const session = learnerSessionSnapshot(user.uid);
    setDeleting(true);
    setMessage(null);
    try {
      const refreshedUser = await reauthenticate();
      assertLearnerSession(session);
      if (refreshedUser.uid !== user.uid) throw new Error("Your learning session changed. Sign in again to continue.");
      const reauthenticationToken = refreshedUser.reauthenticationToken;
      if (!reauthenticationToken) throw new Error("Sign-in confirmation did not return a deletion proof.");
      const token = await refreshedUser.getIdToken(true);
      assertLearnerSession(session);
      const result = await learnerJsonResponse<{ activeDataRemoved?: boolean; jobId?: string; message?: string; error?: string; deleted?: boolean }>({ ...refreshedUser, getIdToken: async () => token }, "/api/account/data", {
        method: "DELETE",
        headers: {
          "X-Reauthentication-Token": reauthenticationToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmation }),
      });
      assertLearnerSession(session);
      const body = result.data;
      if (body.activeDataRemoved === true || (result.ok && body.deleted === true)) { acknowledgeActiveDataRemoval(refreshedUser); return; }
      if (body.jobId) {
        setMessage(`${body.message || body.error || "Deletion is pending."} Reference: ${body.jobId}. ${body.activeDataRemoved ? "Retention and identity review remain pending." : "Retry to resume the saved request."}`);
        setDeleting(false);
        return;
      }
      throw new Error(body.error || "Your account deletion could not be confirmed.");
    } catch (error) {
      if (!isCurrentLearnerSession(session)) return;
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
          <p>Review how Filosage handles learning data, download a portable copy, or permanently close your account.</p>
        </header>

        {receipt && <p className="form-message" role="status">{receipt}</p>}
        <section className="privacy-center-grid" aria-label="Privacy controls">
          <article>
            <BarChart3 size={20} />
            <div><h2>Optional analytics</h2><p>Choose whether Filosage may store first-party identifiers and measure page and learning-feature use. This never includes lesson text and is off until you allow it.</p></div>
            <div className="privacy-analytics-actions" role="group" aria-label="Optional analytics preference">
              <button className="button button-secondary" type="button" aria-pressed={analyticsChoice === "declined"} onClick={() => chooseAnalytics("declined")}>Keep analytics off</button>
              <button className="button button-secondary" type="button" aria-pressed={analyticsChoice === "accepted"} onClick={() => chooseAnalytics("accepted")}>Allow analytics</button>
            </div>
          </article>

          <article>
            <Download size={20} />
            <div><h2>Download your data</h2><p>Get your profile, lesson activity and progress, courses, AI usage, launch preferences, account-linked product events, legal and billing consent records, reports, and safety or enforcement records as JSON.</p></div>
            {user ? (
              <button className="button button-secondary" onClick={() => void downloadData()} disabled={exporting}>
                {exporting ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />} Download my data
              </button>
            ) : (
              <AccountEntryButton className="button button-secondary" createLabel="Create an account to export" signInLabel="Sign in to export" />
            )}
          </article>

          <article>
            <LockKeyhole size={20} />
            <div><h2>Privacy requests</h2><p>Ask for access, correction, deletion, portability, restriction, or another privacy right. Requests are verified before disclosure or deletion.</p></div>
            <a className="button button-secondary" href={`mailto:${LEGAL_CONTACT}?subject=Filosage%20privacy%20request`}>Email privacy team</a>
          </article>

          <article className="privacy-danger-zone">
            <Trash2 size={20} />
            <div><h2>Delete your account</h2><p>Starting deletion closes your account to new activity and saves a resumable request to remove your active profile, learning data, authored courses, launch preferences, waitlist entry, and account-linked analytics. Limited legal-acceptance, completed billing-consent, payment-processor, safety, report, and enforcement records may be retained only for the purposes described in your export and Privacy Notice. Deletion control records, identity mappings, shared assets, and retention or hold decisions require a separate review. A pending request is not confirmation of complete erasure. This cannot be undone.</p></div>
            {!user ? (
              <AccountEntryButton className="button button-secondary" createLabel="Create an account to manage it" signInLabel="Sign in to manage account" />
            ) : isOwner ? (
              <p className="privacy-owner-note">The owner account cannot be deleted automatically because it controls published courses. Contact <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a> for a documented transfer or shutdown.</p>
            ) : !deleteArmed ? (
              <button className="button button-danger" onClick={() => setDeleteArmed(true)}><Trash2 size={16} /> Start account deletion</button>
            ) : (
              <div className="privacy-delete-confirmation">
                <p className="privacy-delete-billing-warning" role="alert"><strong>Billing consequence:</strong> Deleting now immediately ends any active, past-due, or incomplete Stripe subscription and paid access. This cannot be undone. Deletion does not automatically create or waive refund eligibility. Initial charges and annual renewals have a {PAID_SUBSCRIPTION_POLICY.refundWindowDays}-day refund window under the Terms; other charges are refundable only as stated there or required by law. Use Manage billing instead if you only want to stop renewal and keep access through the paid period. For cancellation or refund help, contact <a href={`mailto:${SUPPORT_CONTACT}?subject=Filosage%20billing%20help%20before%20account%20deletion`}>billing support</a> before deleting your account.</p>
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
