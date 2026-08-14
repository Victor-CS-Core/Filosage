"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, Flag, LoaderCircle, ShieldCheck } from "lucide-react";
import type { LessonData } from "@/lib/course-types";
import { sourceHostname } from "@/lib/source-safety";

const sourceKindLabel = {
  primary: "Primary source",
  official: "Official source",
  licensed: "Licensed source",
  "author-provided": "Author-provided source",
} as const;

const citationSectionLabel = {
  content: "Lesson explanation",
  key_takeaway: "Key takeaway",
  guided_practice: "Guided practice",
  transfer_task: "Transfer task",
  quiz_explanation: "Retrieval feedback",
} as const;

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
  const citations = provenance?.citations ?? [];
  const sourcesById = new Map((provenance?.sources ?? []).flatMap((source) => source.id ? [[source.id, source] as const] : []));

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
        {citations.length
          ? `${citations.length} source-backed ${citations.length === 1 ? "statement is" : "statements are"} mapped to this exact lesson version.`
          : provenance?.sources.length
            ? `${provenance.sources.length} ${provenance.sources.length === 1 ? "reference is" : "references are"} attached to this lesson version without a structured claim citation.`
          : "No external source pack is attached to this lesson. Verify consequential claims before relying on them."}
      </p>
      {citations.length ? (
        <div className="lesson-citation-list" aria-label="Source-backed statements">
          {citations.map((citation) => {
            const source = sourcesById.get(citation.sourceId);
            if (!source) return null;
            return <article key={citation.id} className="lesson-citation">
              <div className="lesson-citation-status">
                {citation.supportStatus === "supported" || citation.reviewStatus === "verified" ? <CheckCircle2 size={15} /> : <ShieldCheck size={15} />}
                <span>{citation.supportStatus === "supported" ? "Automatically grounded" : citation.reviewStatus === "verified" ? "Owner verified for publication" : "Grounding record unavailable"}</span>
              </div>
              <blockquote>{citation.claim}</blockquote>
              <p>{citationSectionLabel[citation.section]}{citation.locator ? ` · ${citation.locator}` : ""}</p>
              {source.url ? <a href={source.url} target="_blank" rel="nofollow ugc noreferrer" aria-label={`${source.label}, opens ${sourceHostname(source.url)} in a new tab`}>
                <span><strong>{source.label}</strong><small>{source.author ? `${source.author} · ` : ""}{source.publisher ?? sourceHostname(source.url)}{source.publicationDate ? ` · ${source.publicationDate}` : ""}{source.kind ? ` · ${sourceKindLabel[source.kind]}` : ""}</small></span>
                <ExternalLink size={15} />
              </a> : <strong>{source.label}</strong>}
            </article>;
          })}
        </div>
      ) : provenance?.sources.length ? (
        <><strong>References attached to this version</strong><ul>{provenance.sources.map((source) => <li key={`${source.id ?? source.label}-${source.url ?? ""}`}>{source.url ? <a href={source.url} target="_blank" rel="nofollow ugc noreferrer">{source.label}</a> : source.label}</li>)}</ul></>
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
