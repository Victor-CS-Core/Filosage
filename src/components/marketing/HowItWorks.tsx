import { BookOpenCheck, BrainCircuit, Route, Sparkles, Target } from "lucide-react";

const steps = [
  { icon: Target, title: "Outcome", copy: "Name the decision, deliverable, or capability that matters in your current work." },
  { icon: Route, title: "Route", copy: "Use the course structure and a diagnostic-informed starting point to focus the path." },
  { icon: BookOpenCheck, title: "Practice", copy: "Move through explanation, examples, retrieval, and guided reasoning." },
  { icon: BrainCircuit, title: "Transfer", copy: "Apply the idea in a new situation and produce work that can be reviewed." },
  { icon: Sparkles, title: "Evidence", copy: "Keep self-report, observed practice, and assessed criteria as distinct signals." },
];

export default function HowItWorks() {
  return (
    <section className="marketing-section landing-runway" id="how-it-works" aria-labelledby="how-title">
      <div className="landing-runway-intro"><h2 id="how-title">From a work outcome to evidence.</h2><p>The path is visible before you join—and each later step has a clear reason to exist.</p></div>
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
