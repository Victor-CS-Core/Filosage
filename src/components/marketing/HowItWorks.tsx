import { ArrowRight, BookOpenCheck, BrainCircuit, CalendarCheck2, CheckCircle2, Target } from "lucide-react";

const steps = [
  { icon: Target, title: "Define", copy: "Pick the outcome and decide what finished work will prove it." },
  { icon: BrainCircuit, title: "Activate", copy: "Recall what you know or make a prediction before the explanation." },
  { icon: BookOpenCheck, title: "Practice", copy: "Learn one idea at a time and use it in a guided attempt." },
  { icon: CheckCircle2, title: "Feedback", copy: "Check your work against clear criteria, then revise it." },
  { icon: ArrowRight, title: "Transfer", copy: "Use the same skill in a different situation." },
  { icon: CalendarCheck2, title: "Return", copy: "Review it later, before it fades." },
];

export default function HowItWorks() {
  return (
    <section className="marketing-section landing-runway" id="how-it-works" aria-labelledby="how-title">
      <div className="landing-runway-intro"><h2 id="how-title">From goal to finished work.</h2><p>Every course follows the same six-part route, so you always know what you are doing and why.</p></div>
      <ol>
        {steps.map(({ icon: Icon, title, copy }, index) => (
          <li key={title}>
            <span className="landing-runway-marker"><Icon size={21} aria-hidden="true" /></span>
            <div><small>Stage {index + 1}</small><h3>{title}</h3><p>{copy}</p></div>
          </li>
        ))}
      </ol>
    </section>
  );
}
