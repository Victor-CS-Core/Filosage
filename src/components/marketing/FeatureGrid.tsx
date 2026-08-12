import Image from "next/image";

const features = [
  { title: "AI that supports the learning task", copy: "Filosage uses AI to shape explanations, examples, practice, and tutoring around a defined outcome. Generated work must pass safety, structure, and teaching-quality checks before it is saved.", image: "/brand/illustrations/ai-explanations.svg", className: "feature-wide" },
  { title: "Sources stay visible", copy: "Each lesson shows its source-pack status and distinguishes author-supplied references from material that was actually used, so confidence is never implied by a link alone.", image: "/brand/illustrations/topic-exploration.svg", className: "" },
  { title: "Progress you can inspect", copy: "See recall, guided practice, independent transfer, and capstone evidence as separate signals—not one vague completion score.", image: "/brand/illustrations/progress-tracking.svg", className: "" },
];

export default function FeatureGrid() {
  return (
    <section className="marketing-section marketing-features" id="features" aria-labelledby="features-title">
      <div className="marketing-section-heading">
        <h2 id="features-title">Understanding is more than finishing a lesson.</h2>
        <p>Filosage keeps AI-assisted teaching, lesson source status, and evidence records in the same workspace.</p>
      </div>
      <div className="marketing-feature-grid">
        {features.map((feature) => (
          <article className={feature.className} key={feature.title}>
            <Image
              src={feature.image}
              alt=""
              width={640}
              height={480}
              sizes="(max-width: 620px) calc(100vw - 40px), (max-width: 820px) 38vw, 50vw"
              loading="lazy"
              aria-hidden="true"
            />
            <div><h3>{feature.title}</h3><p>{feature.copy}</p></div>
          </article>
        ))}
      </div>
    </section>
  );
}
