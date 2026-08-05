import Image from "next/image";
import { CheckCircle2 } from "lucide-react";

export default function PersonalizedLearningSection() {
  return (
    <section className="marketing-personalized" aria-labelledby="personalized-title">
      <div>
        <h2 id="personalized-title">Practice changes as understanding changes.</h2>
        <p>Erudoza keeps the learner&apos;s current evidence in view, so practice can reinforce a fragile idea or move forward when the foundation is ready.</p>
        <ul>
          <li><CheckCircle2 size={18} /> Recall before recognition</li>
          <li><CheckCircle2 size={18} /> Guidance before independent transfer</li>
          <li><CheckCircle2 size={18} /> Review timed around learning evidence</li>
        </ul>
      </div>
      <Image
        src="/brand/illustrations/personalized-practice.svg"
        alt="A learning path branching toward two personalized practice steps"
        width={640}
        height={480}
        sizes="(max-width: 820px) calc(100vw - 40px), 52vw"
        loading="lazy"
      />
    </section>
  );
}
