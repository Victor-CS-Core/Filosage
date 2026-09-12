const steps = [
  { title: "Find a course that interests you.", copy: "Read the outline, see the lessons, and check the level and time. No account needed." },
  { title: "Create your free account.", copy: "When you’re ready, sign up to open the lessons and save your work." },
  { title: "Learn a little. Try it yourself.", copy: "Work through an explanation, put it into practice, and return when you’re ready for more." },
];

export default function HowItWorks() {
  return (
    <section className="marketing-section visitor-steps" id="how-it-works" aria-labelledby="how-title">
      <h2 id="how-title">Start with a course.</h2>
      <ol>
        {steps.map(({ title, copy }, index) => (
          <li key={title}>
            <span className="visitor-step-number" aria-hidden="true">0{index + 1}</span>
            <div><h3>{title}</h3><p>{copy}</p></div>
          </li>
        ))}
      </ol>
    </section>
  );
}
