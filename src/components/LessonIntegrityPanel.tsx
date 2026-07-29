"use client";

import { useState } from "react";
import { CheckCircle2, Flag, LoaderCircle, ShieldCheck } from "lucide-react";
import type { LessonData } from "@/lib/course-types";
import { trackProductEvent } from "@/lib/product-analytics";

export default function LessonIntegrityPanel({
  courseId,
  lessonId,
  provenance,
  getAuthToken,
}: {
  courseId: string;
  lessonId: string;
  provenance: LessonData["provenance"];
  getAuthToken?: () => Promise<string | null>;
}) {
  const [reporting, setReporting] = useState(false);
  const [category, setCategory] = useState<"accuracy" | "outdated" | "source" | "clarity" | "safety" | "copyright" | "other">("accuracy");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const token = await getAuthToken?.();
      const response = await fetch("/api/content-reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          courseId,
          lessonId,
          category,
          note,
          contentVersion: provenance?.contentVersion,
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "The report could not be sent.");
      setSent(true);
      trackProductEvent("content_reported", {
        route: "/lesson",
        courseId,
        lessonId,
        contentVersion: provenance?.contentVersion,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The report could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="lesson-integrity" aria-labelledby="lesson-integrity-title">
      <div className="lesson-integrity-heading">
        <ShieldCheck size={18} />
        <div>
          <strong id="lesson-integrity-title">Content record</strong>
          <span>{provenance?.contentVersion ?? "lesson-v1"}{provenance?.generatedAt ? ` · ${new Date(provenance.generatedAt).toLocaleDateString()}` : ""}</span>
        </div>
      </div>
      <p>
        {provenance?.sources.length
          ? `${provenance.sources.length} source ${provenance.sources.length === 1 ? "reference is" : "references are"} attached to this version.`
          : "No external source pack is attached to this lesson. Verify consequential claims before relying on them."}
      </p>
      {provenance?.sources.length ? (
        <ul>{provenance.sources.map((source) => <li key={`${source.label}-${source.url ?? ""}`}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.label}</a> : source.label}</li>)}</ul>
      ) : null}
      {!reporting && !sent && (
        <button className="text-button" type="button" onClick={() => setReporting(true)}><Flag size={14} /> Report a content issue</button>
      )}
      {sent ? (
        <div className="content-report-sent" role="status"><CheckCircle2 size={16} /><span><strong>Report received</strong><small>It is now in the content review queue.</small></span></div>
      ) : reporting ? (
        <form className="content-report-form" onSubmit={submit}>
          <label htmlFor="content-report-category">Issue type</label>
          <select id="content-report-category" value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
            <option value="accuracy">Possible factual error</option>
            <option value="outdated">Outdated information</option>
            <option value="source">Missing or weak source</option>
            <option value="clarity">Unclear explanation</option>
            <option value="safety">Unsafe or inappropriate content</option>
            <option value="copyright">Copyright or ownership concern</option>
            <option value="other">Other issue</option>
          </select>
          <label htmlFor="content-report-note">What should be reviewed? <small>Optional</small></label>
          <textarea id="content-report-note" rows={3} maxLength={1_000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Point to the claim or section and explain the concern." />
          <div>
            <button className="button button-secondary button-small" type="button" onClick={() => setReporting(false)}>Cancel</button>
            <button className="button button-primary button-small" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={14} /> : <Flag size={14} />}{busy ? "Sending…" : "Send report"}</button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      ) : null}
    </aside>
  );
}
