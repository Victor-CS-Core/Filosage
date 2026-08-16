import type { Metadata } from "next";
import Link from "next/link";
import { FileCheck2, ShieldCheck } from "lucide-react";
import { readEvidenceShareDetails } from "@/lib/evidence-shares";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared learning evidence",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

interface PageProps {
  params: Promise<{ token: string }>;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const EVIDENCE_TYPE_LABELS = {
  lesson: "Lesson completion",
  retrieval: "Retrieval practice",
  transfer: "Transfer practice",
  capstone: "Capstone assessment",
} as const;

const EVIDENCE_RESULT_LABELS = {
  attempted: "Attempt recorded",
  passed: "Passed",
  needs_work: "Needs further work",
} as const;

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : DATE_FORMATTER.format(date);
}

function recordCount(count: number) {
  return `${count} ${count === 1 ? "record" : "records"}`;
}

function latestEvidenceAt(values: Array<{ observedAt: string }>) {
  return values.reduce<string | null>((latest, item) => {
    const observedAt = Date.parse(item.observedAt);
    if (Number.isNaN(observedAt)) return latest;
    return !latest || observedAt > Date.parse(latest) ? item.observedAt : latest;
  }, null);
}

export default async function SharedEvidencePage({ params }: PageProps) {
  const { token } = await params;
  const share = await readEvidenceShareDetails(token);
  if (!share) {
    return (
      <main className="shared-evidence-page">
        <section className="shared-evidence-unavailable">
          <FileCheck2 aria-hidden="true" size={28} />
          <h1>This report is no longer available.</h1>
          <p>Ask the learner to create a new evidence link. For privacy, Filosage does not disclose whether this link expired or was revoked.</p>
          <Link className="button button-secondary" href="/support/articles/read-evidence-report">How evidence reports work</Link>
        </section>
      </main>
    );
  }

  const { report } = share;
  const latestEvidence = latestEvidenceAt(report.evidence);
  const baseline = report.summary.assessedBaselinePercent;
  const final = report.summary.assessedFinalPercent;

  return (
    <main className="shared-evidence-page">
      <article className="shared-evidence-report">
        <header>
          <h1>{report.course.topic}</h1>
          <p>{report.learningGoal.desiredOutcome ?? report.course.outcome}</p>
        </header>

        <aside className="shared-evidence-trust" aria-labelledby="shared-evidence-trust-title">
          <ShieldCheck aria-hidden="true" size={22} />
          <div>
            <h2 id="shared-evidence-trust-title">Privacy-preserving learning snapshot</h2>
            <p>This is learning evidence, not an accredited credential. Identity, private notes, and raw responses are omitted.</p>
          </div>
          <dl>
            <div><dt>Generated</dt><dd><time dateTime={report.generatedAt}>{formatDate(report.generatedAt)}</time></dd></div>
            <div><dt>Available until</dt><dd><time dateTime={share.expiresAt}>{formatDate(share.expiresAt)}</time></dd></div>
            <div><dt>Latest evidence</dt><dd>{latestEvidence ? <time dateTime={latestEvidence}>{formatDate(latestEvidence)}</time> : "No dated record"}</dd></div>
          </dl>
        </aside>

        <section className="shared-evidence-metrics" aria-labelledby="shared-evidence-summary-title">
          <h2 className="sr-only" id="shared-evidence-summary-title">Evidence summary</h2>
          <div>
            <span>Course progress</span>
            <strong>{report.summary.completedLessons}/{report.summary.totalLessons}</strong>
            <p>Lessons completed when this snapshot was created.</p>
          </div>
          <div>
            <span>Observed objective evidence</span>
            <strong>{report.summary.observedMasteryPercent}%</strong>
            <p>A progression signal derived from saved practice and assessment evidence.</p>
          </div>
          <div>
            <span>Verified improvement</span>
            <strong>{report.summary.verifiedImprovementPoints === null ? "Pending" : `${report.summary.verifiedImprovementPoints >= 0 ? "+" : ""}${report.summary.verifiedImprovementPoints} pts`}</strong>
            <p>{baseline !== null && final !== null
              ? `Comparable assessment moved from ${baseline}% to ${final}%.`
              : "Appears after comparable baseline and final capstone criteria are assessed."}</p>
          </div>
        </section>

        <section className="shared-evidence-objectives" aria-labelledby="shared-evidence-objectives-title">
          <div className="shared-evidence-section-heading">
            <h2 id="shared-evidence-objectives-title">What the evidence shows</h2>
            <p>Objective states summarize the records included in this snapshot.</p>
          </div>
          <ol>{report.objectives.map((objective) => (
            <li key={objective.objectiveId}>
              <div><strong>{objective.title}</strong><p>{objective.objective}</p></div>
              <span>{objective.state.replaceAll("_", " ")} · {recordCount(objective.evidenceCount)}</span>
            </li>
          ))}</ol>
        </section>

        <section className="shared-evidence-ledger" aria-labelledby="shared-evidence-ledger-title">
          <div className="shared-evidence-section-heading">
            <h2 id="shared-evidence-ledger-title">Evidence behind these results</h2>
            <p>These privacy-safe records support the objective states above. Notes and raw responses are never included.</p>
          </div>
          {report.evidence.length > 0 ? <ol>{report.evidence.map((item, index) => (
            <li key={`${item.type}-${item.observedAt}-${index}`}>
              <div>
                <strong>{item.label}</strong>
                {item.criterion && <p>{item.criterion}</p>}
              </div>
              <dl>
                <div><dt>Type</dt><dd>{EVIDENCE_TYPE_LABELS[item.type]}</dd></div>
                <div><dt>Result</dt><dd>{EVIDENCE_RESULT_LABELS[item.result]}</dd></div>
                <div><dt>Authority</dt><dd>{item.authority === "server-verified" ? "Server-verified" : "Learner-reported"}</dd></div>
                <div><dt>Observed</dt><dd><time dateTime={item.observedAt}>{formatDate(item.observedAt)}</time></dd></div>
              </dl>
            </li>
          ))}</ol> : <p className="shared-evidence-ledger-empty">No privacy-safe evidence records are included in this snapshot.</p>}
        </section>

        {report.capstone && (
          <section className="shared-evidence-capstone" aria-labelledby="shared-evidence-capstone-title">
            <h2 id="shared-evidence-capstone-title">Latest capstone assessment</h2>
            <div className="shared-evidence-capstone-verdict">
              <strong>{report.capstone.status === "passed" ? "Passed" : "Needs revision"}</strong>
              <span>Assessed <time dateTime={report.capstone.assessedAt}>{formatDate(report.capstone.assessedAt)}</time> · {report.capstone.attempts === 1 ? "First attempt" : `Attempt ${report.capstone.attempts}`}</span>
            </div>
            <p>{report.capstone.summary}</p>
            <ol>{report.capstone.criteria.map((criterion) => (
              <li key={criterion.criterion} className={criterion.met ? "is-met" : ""}>
                <strong>{criterion.met ? "Met" : "Not met"}: {criterion.criterion}</strong>
                <p>{criterion.feedback}</p>
              </li>
            ))}</ol>
          </section>
        )}

        {report.advancedCapstoneAnalysis && report.advancedCapstoneAnalysis.attempts.length > 1 && (
          <section className="shared-evidence-analysis" aria-labelledby="shared-evidence-analysis-title">
            <h2 id="shared-evidence-analysis-title">Criterion progression across {report.advancedCapstoneAnalysis.attempts.length} assessed attempts</h2>
            {report.advancedCapstoneAnalysis.nextRevisionPriorities.length ? <>
              <h3>Next revision priorities</h3>
              <ol>{report.advancedCapstoneAnalysis.nextRevisionPriorities.map((criterion) => <li key={criterion}>{criterion}</li>)}</ol>
            </> : <p>Every criterion in the latest assessment is met.</p>}
          </section>
        )}

        <footer className="shared-evidence-method">
          <ShieldCheck aria-hidden="true" size={20} />
          <div>
            <h2>How to read this report</h2>
            {report.methodology.map((item) => <p key={item}>{item}</p>)}
          </div>
        </footer>
      </article>
    </main>
  );
}
