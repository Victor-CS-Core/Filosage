import { ArrowRight, BrainCircuit, Route, Target } from "lucide-react";

const steps = [
  { icon: BrainCircuit, title: "Name the capability you need", copy: "Start with a real outcome and what you already know. Filosage uses that context to keep the path focused." },
  { icon: Route, title: "Build understanding in stages", copy: "Move through concise teaching, worked examples, retrieval, guided reasoning, and independent transfer." },
  { icon: Target, title: "Return with evidence", copy: "Saved results determine which review or course step appears next." },
];

export default function HowItWorks() {
  return (
    <section className="marketing-section marketing-how" id="how-it-works" aria-labelledby="how-title">
      <div className="marketing-how-intro"><h2 id="how-title">A learning loop for skills you need to use.</h2><p>Start with a real question, then practice until you can apply the idea without the example.</p></div>
      <ol>
        {steps.map(({ icon: Icon, title, copy }, index) => (
          <li key={title}>
            <div className="marketing-step-marker">
              <span className="marketing-step-number">0{index + 1}</span>
              <span className="marketing-step-icon"><Icon size={22} aria-hidden="true" /></span>
            </div>
            <div className="marketing-step-copy"><h3>{title}</h3><p>{copy}</p></div>
            {index < steps.length - 1 && <ArrowRight className="marketing-step-arrow" size={18} aria-hidden="true" />}
          </li>
        ))}
      </ol>
    </section>
  );
}
