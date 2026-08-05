import Image from "next/image";

const features = [
  { title: "Clear explanations", copy: "Break complex ideas into an intelligible structure without stripping away the reasoning that makes them useful.", image: "/brand/illustrations/ai-explanations.svg", className: "feature-wide" },
  { title: "Personalized practice", copy: "Move from guided examples to an independent task selected around what the learner needs next.", image: "/brand/illustrations/personalized-practice.svg", className: "" },
  { title: "Progress you can inspect", copy: "See recall, practice, transfer, and capstone evidence as separate signals—not one vague completion score.", image: "/brand/illustrations/progress-tracking.svg", className: "" },
  { title: "Guided learning paths", copy: "Follow a focused sequence where each lesson prepares the knowledge and judgment the next one requires.", image: "/brand/illustrations/learning-paths.svg", className: "" },
  { title: "Topic exploration", copy: "Start with a question, inspect the full route, and understand how connected concepts fit together.", image: "/brand/illustrations/topic-exploration.svg", className: "" },
  { title: "Concept mastery", copy: "Build real understanding through retrieval, application, and evidence you can explain in your own words.", image: "/brand/illustrations/concept-mastery.svg", className: "feature-wide" },
];

export default function FeatureGrid() {
  return (
    <section className="marketing-section marketing-features" id="features" aria-labelledby="features-title">
      <div className="marketing-section-heading">
        <h2 id="features-title">Understanding is more than finishing a lesson.</h2>
        <p>Erudoza connects explanation, practice, and evidence in one calm web learning experience.</p>
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
