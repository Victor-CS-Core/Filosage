const questions = [
  { question: "Can I inspect a course before creating an account?", answer: "Yes. Published outcomes, modules, lesson titles, prerequisites, time estimates, and assessment structure remain public. An account is required to open lesson bodies and save work." },
  { question: "What does a free learner account include?", answer: "A free account opens every published lesson and saves your progress, notes, practice, and review schedule across devices." },
  { question: "How does Filosage use AI?", answer: "AI helps draft explanations, examples, practice, tutoring, and courses. New courses are checked for structure, safety, language, and teaching quality. Course pages distinguish verified sources, AI general knowledge, and further reading." },
  { question: "Are paid memberships open?", answer: "Not yet — paid plans are in final testing. Leave your email on the pricing page and we'll tell you when they open." },
];

export default function MarketingFAQ() {
  return (
    <section className="marketing-section marketing-faq" aria-labelledby="marketing-faq-title">
      <div><h2 id="marketing-faq-title">Before you sign up.</h2><p>What you can see, what an account changes, and how AI is used.</p></div>
      <div className="marketing-faq-list">
        {questions.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}
      </div>
    </section>
  );
}
