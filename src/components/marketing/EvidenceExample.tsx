import Link from "next/link";
import { ArrowRight, Check, Circle, FileCheck2, ShieldCheck } from "lucide-react";

const exampleEvidence = [
  {
    label: "Self-report",
    title: "Starting estimate",
    detail: "The fictional learner reports some familiarity. This chooses a starting route; it does not prove mastery.",
    state: "Context only",
    complete: false,
  },
  {
    label: "Observed practice",
    title: "A worked comparison was completed",
    detail: "The record shows that an attempt was completed and revised against visible criteria.",
    state: "Recorded",
    complete: true,
  },
  {
    label: "Assessed criterion",
    title: "Uses two relevant observations",
    detail: "The fictional submission met this criterion in the assessed practice artifact.",
    state: "Met",
    complete: true,
  },
  {
    label: "Unresolved",
    title: "Explains the main limitation",
    detail: "No checked result supports this criterion yet, so the demonstration keeps it unresolved.",
    state: "Pending",
    complete: false,
  },
] as const;

export default function EvidenceExample() {
  return (
    <main className="evidence-example-page">
      <header className="evidence-example-header">
        <span className="evidence-example-notice"><ShieldCheck size={16} aria-hidden="true" /> Demonstration data — not a learner result</span>
        <p className="overline">Portable evidence example</p>
        <h1>A fictional learning evidence record</h1>
        <p>This fixed example shows how Filosage separates what someone reports, what the app observes, what criteria are assessed, and what remains unsupported.</p>
      </header>

      <section className="evidence-example-summary" aria-labelledby="evidence-example-outcome">
        <div><small>Fictional goal</small><h2 id="evidence-example-outcome">Compare two options and explain a careful choice</h2><p>Example artifact: a one-page comparison with observations, a decision, and a limitation.</p></div>
        <dl><div><dt>Observed practice</dt><dd>1 completed</dd></div><div><dt>Criteria met</dt><dd>1 of 2</dd></div><div><dt>Unresolved</dt><dd>1 criterion</dd></div></dl>
      </section>

      <section className="evidence-example-ledger" aria-labelledby="evidence-example-ledger-title">
        <div className="section-heading"><div><p className="overline">Example ledger</p><h2 id="evidence-example-ledger-title">What this fictional record supports</h2></div><p>Each row names its evidence basis. A pending item stays pending.</p></div>
        <ol>{exampleEvidence.map((item) => (
          <li key={item.label}>
            <span className={item.complete ? "is-complete" : "is-pending"}>{item.complete ? <Check size={16} /> : <Circle size={15} />}</span>
            <div><small>{item.label}</small><strong>{item.title}</strong><p>{item.detail}</p></div>
            <em>{item.state}</em>
          </li>
        ))}</ol>
      </section>

      <footer className="evidence-example-limitations">
        <FileCheck2 size={21} aria-hidden="true" />
        <div><strong>How to read this example</strong><p>This is demonstration data, not a credential, certification, transcript, or claim about a real person. Real reports reflect only the evidence actually recorded for that learner.</p></div>
        <Link className="button button-primary" href="/library">Explore published courses <ArrowRight size={16} /></Link>
      </footer>
    </main>
  );
}
