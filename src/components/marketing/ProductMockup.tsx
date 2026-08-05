import { ArrowRight, BookOpenCheck, CheckCircle2, Circle, Clock3 } from "lucide-react";

export default function ProductMockup() {
  return (
    <div className="marketing-browser" aria-label="Example of the Erudoza browser learning workspace">
      <div className="marketing-browser-bar" aria-hidden="true"><span /><span /><span /><b>erudoza.com</b></div>
      <div className="marketing-browser-body">
        <aside aria-label="Illustrative workspace navigation">
          <strong>Today</strong><span>Explore</span><span>Review</span><span>Progress</span>
        </aside>
        <section>
          <div className="mock-session-label"><Clock3 size={14} /> Focused session · about 18 min</div>
          <h2>Make the idea usable.</h2>
          <p>Explain it, practice it, then apply it to a real decision.</p>
          <div className="mock-next-step">
            <small>Today&apos;s next step</small>
            <strong><BookOpenCheck size={20} /> Test the concept from memory</strong>
            <span>One retrieval prompt, then one transfer task.</span>
            <b>Start practice <ArrowRight size={14} /></b>
          </div>
          <div className="mock-evidence">
            <strong>Evidence of understanding</strong>
            <div className="mock-progress-track"><span /></div>
            <ol aria-label="Illustrative learning evidence sequence">
              <li><CheckCircle2 size={15} /> Recall checked</li>
              <li><CheckCircle2 size={15} /> Guided practice</li>
              <li><Circle size={15} /> Transfer next</li>
            </ol>
          </div>
        </section>
      </div>
    </div>
  );
}
