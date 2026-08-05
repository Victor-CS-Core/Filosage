import { ArrowRight, BrainCircuit, Route, Target } from "lucide-react";

const steps = [
  { icon: BrainCircuit, title: "Begin with what you need to understand", copy: "Name the topic or outcome. Erudoza uses the starting point and context to keep the path focused." },
  { icon: Route, title: "Move from explanation to practice", copy: "Work through concise teaching, retrieval, guided reasoning, and an independent transfer task." },
  { icon: Target, title: "Return with evidence", copy: "Track what you recalled, applied, and demonstrated so the next learning step has a reason." },
];

export default function HowItWorks() {
  return (
    <section className="marketing-section marketing-how" id="how-it-works" aria-labelledby="how-title">
      <div className="marketing-how-intro"><h2 id="how-title">A learning loop built for ideas you need to use.</h2><p>Each step reduces noise and increases independence.</p></div>
      <ol>
        {steps.map(({ icon: Icon, title, copy }, index) => (
          <li key={title}>
            <span className="marketing-step-number">0{index + 1}</span>
            <Icon size={24} aria-hidden="true" />
            <h3>{title}</h3><p>{copy}</p>
            {index < steps.length - 1 && <ArrowRight className="marketing-step-arrow" size={18} aria-hidden="true" />}
          </li>
        ))}
      </ol>
    </section>
  );
}
