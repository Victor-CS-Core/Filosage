import { ArrowRight, BookOpenCheck, CalendarCheck2, Check, FileCheck2, Target } from "lucide-react";

export default function FeatureGrid() {
  return (
    <section className="marketing-section marketing-story" id="features" aria-labelledby="features-title">
      <header className="marketing-story-heading"><h2 id="features-title">Know what to do next.</h2><p>Your goal, current lesson, and saved progress stay connected, from the first practice attempt to the final project.</p></header>
      <p className="marketing-story-note">Examples shown below. Your course and progress will vary.</p>
      <article className="marketing-story-row">
        <div><Target size={24} aria-hidden="true" /><h3>Start with a clear finish line.</h3><p>Each course names the skill you are building and the work you will make to show it.</p></div>
        <div className="marketing-outcome-fragment" aria-label="Example course goal"><span><small>Learn</small><strong>Explain a system and choose a useful intervention</strong></span><span><small>Use it for</small><strong>A study, personal, career, or work goal</strong></span><span><small>Finish with</small><strong>A model, critique, plan, or portfolio piece</strong></span></div>
      </article>
      <article className="marketing-story-row is-reversed">
        <div><BookOpenCheck size={24} aria-hidden="true" /><h3>Practice, then revise.</h3><p>Short explanations lead into an attempt. Feedback arrives after you commit, so there is something real to improve.</p></div>
        <ol className="marketing-practice-fragment" aria-label="Example lesson sequence"><li><FileCheck2 size={15} /> Recall or predict</li><li><Check size={15} /> Try it yourself</li><li><Check size={15} /> Revise with feedback</li><li><ArrowRight size={15} /> Use it somewhere new</li></ol>
      </article>
      <article className="marketing-story-row">
        <div><CalendarCheck2 size={24} aria-hidden="true" /><h3>Come back at the right time.</h3><p>Filosage saves where you stopped and brings back ideas that are due for review. If you take a break, you simply continue.</p></div>
        <div className="marketing-return-fragment"><small>Up next</small><strong>One review is ready</strong><span>Strengthen the idea before moving on.</span><i><b /></i><em>This week · 2 of 5 lessons</em></div>
      </article>
    </section>
  );
}
