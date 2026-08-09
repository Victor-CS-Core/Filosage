"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Check, CircleAlert, LoaderCircle, LockKeyhole, Send, TicketCheck } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

type SubmissionState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; ticketNumber: string }
  | { status: "error"; message: string };

export default function SupportTicketPanel() {
  const { user, isOwner, loading, signInWithGoogle } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [submission, setSubmission] = useState<SubmissionState>({ status: "idle" });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    setSubmission({ status: "submitting" });
    try {
      const form = new FormData(event.currentTarget);
      const token = await user.getIdToken();
      const response = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          category: form.get("category"),
          subject: form.get("subject"),
          message: form.get("message"),
        }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; ticketNumber?: string };
      if (!response.ok || !body.ticketNumber) throw new Error(body.error ?? "Your request could not be submitted.");
      event.currentTarget.reset();
      setSubmission({ status: "success", ticketNumber: body.ticketNumber });
    } catch (error) {
      setSubmission({ status: "error", message: error instanceof Error ? error.message : "Your request could not be submitted." });
    }
  };

  return (
    <section className="support-ticket-panel" aria-labelledby="support-ticket-title">
      <div className="support-ticket-intro">
        <span className="support-ticket-icon"><TicketCheck size={21} aria-hidden="true" /></span>
        <div>
          <h2 id="support-ticket-title">Send a support request</h2>
          <p>Signed-in learners can create a private ticket and receive a reference number. Requests go directly to the owner review queue.</p>
        </div>
        {isOwner ? (
          <Link className="button button-secondary" href="/admin/command-center">Open owner queue</Link>
        ) : user ? (
          <button className="button button-primary" type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Close form" : "Create ticket"}
          </button>
        ) : (
          <button className="button button-primary" type="button" disabled={loading} onClick={() => void signInWithGoogle()}>
            {loading ? <LoaderCircle className="spin" size={16} /> : <LockKeyhole size={16} />} Sign in to submit
          </button>
        )}
      </div>

      {user && !isOwner && expanded && (
        <form className="support-ticket-form" onSubmit={submit}>
          <div className="support-ticket-form-heading">
            <div><strong>Describe what you need</strong><span>Do not include passwords, authentication codes, payment card details, or sensitive identity documents.</span></div>
            <span><LockKeyhole size={14} /> Private request</span>
          </div>
          <div className="support-ticket-fields">
            <label>
              Request type
              <select name="category" defaultValue="support">
                <option value="support">Using Filosage</option>
                <option value="billing">Billing question</option>
                <option value="privacy">Privacy request</option>
                <option value="product_feedback">Product feedback</option>
                <option value="other">Something else</option>
              </select>
            </label>
            <label>
              Subject
              <input name="subject" minLength={5} maxLength={160} placeholder="A short description of the issue" required />
            </label>
            <label className="support-ticket-message">
              What happened?
              <textarea name="message" minLength={20} maxLength={2000} rows={5} placeholder="Tell us which page or course you were using, what you expected, and what happened instead." required />
              <small>Include exact error text when available. Your description is treated as unverified until reviewed.</small>
            </label>
          </div>
          {submission.status === "error" && <p className="support-ticket-feedback is-error" role="alert"><CircleAlert size={16} />{submission.message}</p>}
          {submission.status === "success" && <p className="support-ticket-feedback is-success" role="status"><Check size={16} />Request received. Reference <strong>{submission.ticketNumber}</strong>.</p>}
          <footer>
            <span>Up to five requests per day</span>
            <button className="button button-primary" disabled={submission.status === "submitting"}>
              {submission.status === "submitting" ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}
              {submission.status === "submitting" ? "Sending request" : "Submit request"}
            </button>
          </footer>
        </form>
      )}
    </section>
  );
}
