"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, MessageSquareText } from "lucide-react";
import { createClientId, deferClientTask } from "@/lib/browser-compat";
import { useAuth } from "@/components/AuthProvider";
import { isCurrentLearnerSession, learnerRequest, learnerSessionSnapshot } from "@/lib/learner-storage";
import { outcomeFeedbackStorageKey } from "@/lib/local-course-data";
import { trackProductEvent } from "@/lib/product-analytics";

export default function OutcomeUsefulness({
  courseId,
}: {
  courseId: string;
  getAuthToken?: () => Promise<string | null>;
}) {
  const { user } = useAuth();
  const storageKey = outcomeFeedbackStorageKey(courseId);
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    deferClientTask(() => {
      try {
        setSent(Boolean(storageKey && localStorage.getItem(storageKey) === "sent"));
      } catch {
        setSent(false);
      }
    });
  }, [storageKey]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rating || busy || !user) return;
    const session = learnerSessionSnapshot();
    setBusy(true);
    setError(null);
    try {
      const response = await learnerRequest(user, "/api/outcome-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ feedbackId: createClientId(), courseId, rating, note }),
      });
      const data = await response.json() as { error?: string };
      if (!isCurrentLearnerSession(session)) return;
      if (!response.ok) throw new Error(data.error || "Your feedback could not be recorded.");
      setSent(true);
      try {
        if (storageKey) localStorage.setItem(storageKey, "sent");
      } catch {
        // The thank-you state can remain session-only when storage is unavailable.
      }
      trackProductEvent("pathway_usefulness_rated", {
        route: "/evidence",
        courseId,
        score: rating,
      });
    } catch (submitError) {
      if (!isCurrentLearnerSession(session)) return;
      setError(submitError instanceof Error ? submitError.message : "Your feedback could not be recorded.");
    } finally {
      if (isCurrentLearnerSession(session)) setBusy(false);
    }
  };

  return (
    <section className="outcome-usefulness" aria-labelledby="outcome-usefulness-title">
      {sent ? (
        <div className="outcome-feedback-thanks" role="status"><CheckCircle2 size={19} /><span><strong>Feedback recorded</strong><small>It will be reviewed with the pathway’s learning evidence.</small></span></div>
      ) : (
        <>
          <header><MessageSquareText size={19} /><div><p className="overline">Outcome feedback</p><h2 id="outcome-usefulness-title">How useful was this pathway for your real goal?</h2></div></header>
          <form onSubmit={submit}>
            <fieldset>
              <legend>Usefulness rating</legend>
              <div>
                {[1, 2, 3, 4, 5].map((value) => (
                  <label className={rating === value ? "is-selected" : ""} key={value}>
                    <input type="radio" name="usefulness" value={value} checked={rating === value} onChange={() => setRating(value)} />
                    <strong>{value}</strong><span>{value === 1 ? "Not useful" : value === 5 ? "Very useful" : ""}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label htmlFor="outcome-feedback-note">What made it useful or limited? <small>Optional</small></label>
            <textarea id="outcome-feedback-note" rows={3} maxLength={1_000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Name the part that helped your work outcome, or what was missing." />
            <button className="button button-primary" type="submit" disabled={!rating || busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <MessageSquareText size={15} />}{busy ? "Recording…" : "Submit feedback"}</button>
            {error && <p className="form-error" role="alert">{error}</p>}
          </form>
        </>
      )}
    </section>
  );
}
