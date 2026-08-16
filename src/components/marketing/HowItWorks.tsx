import { ArrowRight, BookOpenCheck, BrainCircuit, CalendarCheck2, CheckCircle2, Target } from "lucide-react";

const steps = [
  { icon: Target, title: "Define", copy: "Name the outcome, proof of skill, and one focused win for each lesson." },
  { icon: BrainCircuit, title: "Activate", copy: "Recall a prerequisite or make a prediction before new explanation appears." },
  { icon: BookOpenCheck, title: "Practice", copy: "Use focused instruction and guided reasoning to make one real attempt." },
  { icon: CheckCircle2, title: "Feedback", copy: "Commit first, then use criterion-linked feedback to revise the attempt." },
  { icon: ArrowRight, title: "Transfer", copy: "Apply the capability in a meaningfully different situation." },
  { icon: CalendarCheck2, title: "Return", copy: "Retrieve it later when timing and prerequisite readiness support the review." },
];

export default function HowItWorks() {
  return (
    <section className="marketing-section landing-runway" id="how-it-works" aria-labelledby="how-title">
      <div className="landing-runway-intro"><h2 id="how-title">How the Filosage Capability Cycle works.</h2><p>Every stage moves one useful capability from intention to practice, transfer, and durable recall.</p></div>
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
