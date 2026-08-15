import { ArrowRight, BookOpenCheck, CalendarCheck2, Check, FileCheck2, Target } from "lucide-react";

export default function FeatureGrid() {
  return (
    <section className="marketing-section marketing-story" id="features" aria-labelledby="features-title">
      <header className="marketing-story-heading"><h2 id="features-title">See the learning task—not a generic dashboard.</h2><p>Filosage keeps the professional outcome, the next useful practice, and the evidence record connected without pretending they are the same thing.</p></header>
      <p className="marketing-story-note">Illustrative product views · Course content and learner status vary.</p>
      <article className="marketing-story-row">
        <div><Target size={24} aria-hidden="true" /><h3>Define what useful looks like.</h3><p>Record the work context, the capability to build, and the artifact or decision that would demonstrate it.</p></div>
        <div className="marketing-outcome-fragment" aria-label="Illustrative outcome definition fields"><span><small>Outcome</small><strong>Design a defensible product experiment</strong></span><span><small>Use it for</small><strong>A live roadmap decision</strong></span><span><small>Evidence</small><strong>Experiment brief and decision memo</strong></span></div>
      </article>
      <article className="marketing-story-row is-reversed">
        <div><BookOpenCheck size={24} aria-hidden="true" /><h3>Practice until the idea travels.</h3><p>Explanations and examples lead into retrieval, guided reasoning, and independent transfer—not passive completion alone.</p></div>
        <ol className="marketing-practice-fragment" aria-label="Illustrative lesson sequence"><li><Check size={15} /> Explain the concept</li><li><Check size={15} /> Work through an example</li><li><FileCheck2 size={15} /> Retrieve it without the example</li><li><ArrowRight size={15} /> Apply it in a new situation</li></ol>
      </article>
      <article className="marketing-story-row">
        <div><CalendarCheck2 size={24} aria-hidden="true" /><h3>Return to one useful next step.</h3><p>Saved progress, reviews that are due, and a weekly milestone shape the return path. Paused plans resume without punitive catch-up.</p></div>
        <div className="marketing-return-fragment"><small>Recommended next action</small><strong>One review ready</strong><span>Strengthen the concept before it becomes fragile.</span><i><b /></i><em>Weekly milestone · 2 of 5 lessons</em></div>
      </article>
    </section>
  );
}
