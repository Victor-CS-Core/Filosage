import type { Metadata } from "next";
import { FileCheck2, ShieldCheck } from "lucide-react";
import { readEvidenceShare } from "@/lib/evidence-shares";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shared learning evidence",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

interface PageProps {
  params: Promise<{ token: string }>;
}
export default async function SharedEvidencePage({ params }: PageProps) {
  const { token } = await params;
  const report = await readEvidenceShare(token);
  if (!report) {
    return <main className="shared-evidence-page"><section className="shared-evidence-unavailable"><FileCheck2 size={28} /><p className="overline">Shared evidence</p><h1>This report is unavailable.</h1><p>The link may have expired or been revoked.</p></section></main>;
  }
  return (
    <main className="shared-evidence-page">
      <article className="shared-evidence-report">
        <header>
          <p className="overline">Filosage · Shared evidence report v{report.version}</p>
          <h1>{report.course.topic}</h1>
          <p>{report.learningGoal.desiredOutcome ?? report.course.outcome}</p>
          <small>Snapshot generated {new Date(report.generatedAt).toLocaleDateString()}</small>
        </header>
        <section className="shared-evidence-metrics" aria-label="Evidence summary">
          <div><small>Course progress</small><strong>{report.summary.completedLessons}/{report.summary.totalLessons}</strong></div>
          <div><small>Observed objective evidence</small><strong>{report.summary.observedMasteryPercent}%</strong></div>
          <div><small>Verified improvement</small><strong>{report.summary.verifiedImprovementPoints === null ? "Pending" : `${report.summary.verifiedImprovementPoints >= 0 ? "+" : ""}${report.summary.verifiedImprovementPoints} pts`}</strong></div>
        </section>
        <section className="shared-evidence-objectives">
          <div className="section-heading"><div><p className="overline">Objective record</p><h2>What the evidence shows</h2></div></div>
          <ol>{report.objectives.map((objective) => <li key={objective.objectiveId}><div><strong>{objective.title}</strong><p>{objective.objective}</p></div><span>{objective.state.replaceAll("_", " ")} · {objective.evidenceCount} records</span></li>)}</ol>
        </section>
        {report.capstone && <section className="shared-evidence-capstone"><p className="overline">Latest capstone</p><h2>{report.capstone.status === "passed" ? "Passed" : "Needs revision"}</h2><p>{report.capstone.summary}</p><ol>{report.capstone.criteria.map((criterion) => <li key={criterion.criterion} className={criterion.met ? "is-met" : ""}><strong>{criterion.met ? "Met" : "Not met"}: {criterion.criterion}</strong><p>{criterion.feedback}</p></li>)}</ol></section>}
        {report.advancedCapstoneAnalysis && report.advancedCapstoneAnalysis.attempts.length > 1 && <section className="shared-evidence-analysis"><p className="overline">Criterion progression</p><h2>{report.advancedCapstoneAnalysis.attempts.length} assessed attempts</h2>{report.advancedCapstoneAnalysis.nextRevisionPriorities.length ? <><h3>Next revision priorities</h3><ol>{report.advancedCapstoneAnalysis.nextRevisionPriorities.map((criterion) => <li key={criterion}>{criterion}</li>)}</ol></> : <p>Every latest criterion is met.</p>}</section>}
        <footer className="shared-evidence-method"><ShieldCheck size={20} /><div><strong>How to read this report</strong>{report.methodology.map((item) => <p key={item}>{item}</p>)}</div></footer>
      </article>
    </main>
  );
}
