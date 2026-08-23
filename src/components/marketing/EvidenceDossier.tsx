import Link from "next/link";
import { ArrowRight, CalendarCheck2, Check, Circle, Sparkles } from "lucide-react";

export default function EvidenceDossier() {
  return (
    <section className="marketing-section marketing-evidence" aria-labelledby="marketing-evidence-title">
      <div className="marketing-evidence-copy">
        <h2 id="marketing-evidence-title">See what you&apos;ve practiced and what still needs work.</h2>
        <p>Your starting estimate stays separate from work you have completed and work that has been assessed. If something has not been checked, it stays pending.</p>
        <ul>
          <li><Check size={16} aria-hidden="true" /> Finished practice is recorded as completed work.</li>
          <li><CalendarCheck2 size={16} aria-hidden="true" /> You can see what is due for review.</li>
          <li><Circle size={16} aria-hidden="true" /> Assessment stays pending until your work is checked.</li>
        </ul>
        <Link className="marketing-text-link" href="/evidence-example">View a sample evidence report <ArrowRight size={15} /></Link>
      </div>
      <div className="marketing-evidence-stack" aria-label="Illustration of the Filosage evidence model">
        <div className="marketing-assessed-sheet" aria-hidden="true"><strong>Assessed work</strong><span>Outcome</span><i /><span>Apply</span><i /><span>Evaluate</span><i /></div>
        <div className="marketing-evidence-dossier">
          <header><h3>Evidence you can inspect</h3><span>Illustrative structure</span></header>
          <dl>
            <div><dt><CalendarCheck2 size={18} aria-hidden="true" /><span><strong>Starting estimate</strong><small>Self-report</small></span></dt><dd><Circle size={19} aria-label="Not assessed" /></dd></div>
            <div><dt><Check size={18} aria-hidden="true" /><span><strong>Observed practice</strong><small>Work completed</small></span></dt><dd><Check size={18} aria-label="Recorded" /></dd></div>
            <div><dt><Sparkles size={18} aria-hidden="true" /><span><strong>Assessed criteria</strong><small>Pending until submitted</small></span></dt><dd><Sparkles size={18} aria-label="Pending" /></dd></div>
          </dl>
        </div>
      </div>
    </section>
  );
}
