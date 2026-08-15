const questions = [
  { question: "Can I inspect a course before creating an account?", answer: "Yes. Published outcomes, modules, lesson titles, prerequisites, time estimates, and assessment structure remain public. An account is required to open lesson bodies and save work." },
  { question: "What does a free learner account include?", answer: "A free account opens published lessons and keeps progress, notes, practice, review timing, and learning evidence connected to the learner." },
  { question: "How does Filosage use AI?", answer: "AI assists with explanations, examples, practice, tutoring, and course creation. Generated material still passes structure, safety, language, and teaching-quality controls before it is stored or published." },
  { question: "Is an evidence report a credential?", answer: "No. It separates self-report, observed practice, and assessed criteria. It is a learning record and progression signal, not a certification or guarantee of mastery." },
  { question: "Are paid memberships open?", answer: "Plans and availability are shown on the pricing page. Paid checkout remains closed unless the published page explicitly says otherwise." },
];

export default function MarketingFAQ() {
  return (
    <section className="marketing-section marketing-faq" aria-labelledby="marketing-faq-title">
      <div><h2 id="marketing-faq-title">Know what happens before you join.</h2><p>Clear answers about access, AI, evidence, and availability.</p></div>
      <div className="marketing-faq-list">
        {questions.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}
      </div>
    </section>
  );
}
