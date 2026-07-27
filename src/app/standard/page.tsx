"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, BookOpenCheck, CalendarCheck2, Check, Flag, Lightbulb, ShieldCheck, Target } from "lucide-react";
import AppShell from "@/components/AppShell";

const requirements = [
  {
    icon: Target,
    title: "One observable objective",
    detail: "Every lesson states what you will be able to do afterward: something you could actually demonstrate, not a vague theme. Lessons without one are rejected and regenerated.",
  },
  {
    icon: Lightbulb,
    title: "A named misconception",
    detail: "Each lesson identifies the most consequential wrong belief about its concept and teaches against it directly. Your progress page tracks what you have stopped being wrong about.",
  },
  {
    icon: BookOpenCheck,
    title: "Guided practice with visible reasoning",
    detail: "Worked steps show how someone who understands the idea actually thinks through it, with at least two reasoning steps. No answers pulled from thin air.",
  },
  {
    icon: ArrowRight,
    title: "A transfer task",
    detail: "Understanding you can only use in the original example is not understanding. Every lesson asks you to apply the idea in a new situation, with measurable success criteria.",
  },
  {
    icon: Check,
    title: "Retrieval checks with honest feedback",
    detail: "You recall from memory before seeing the choices, and every answer option explains why it is right or wrong. Even a wrong guess teaches you something.",
  },
  {
    icon: CalendarCheck2,
    title: "A place in your review schedule",
    detail: "Completed concepts return in your daily dose right before you would forget them: sooner when an answer felt shaky, later as your understanding strengthens.",
  },
];

export default function TeachingStandardPage() {
  const router = useRouter();
  return (
    <AppShell>
      <div className="standard-page">
        <header className="standard-header">
          <p className="overline">The Erudoza teaching standard</p>
          <h1>Generated is not good enough.<br />Every lesson is held to a standard.</h1>
          <p>
            There are plenty of AI course generators out there. Erudoza works differently: every lesson has to help you
            build understanding that lasts, and any lesson that falls short is rejected and rebuilt before you ever see
            it. Here is the standard each published lesson must pass. These are the same checks the product runs on
            every lesson.
          </p>
        </header>

        <section className="standard-list" aria-label="What every lesson must contain">
          {requirements.map(({ icon: Icon, title, detail }) => (
            <article key={title}>
              <span><Icon size={20} /></span>
              <div><h2>{title}</h2><p>{detail}</p></div>
            </article>
          ))}
        </section>

        <section className="standard-mastery">
          <Flag size={20} />
          <div>
            <h2>Mastery is earned, not attended</h2>
            <p>
              Courses end in a capstone with clear success criteria. Finishing the lessons alone does not complete a
              course. Submitting capstone work that demonstrates each criterion does.
            </p>
          </div>
        </section>

        <section className="standard-honesty">
          <ShieldCheck size={20} />
          <div>
            <h2>What we are honest about</h2>
            <p>
              Lessons are AI-assisted and labeled as such. Drafts that fail the standard are revised or rejected before you
              see them, briefs and outputs are screened for safety, and published courses are curated. We would rather
              offer a small library that meets the standard than a large one that does not.
            </p>
          </div>
        </section>

        <div className="standard-cta">
          <button className="button button-primary" onClick={() => router.push("/library")}>See courses held to this standard <ArrowRight size={16} /></button>
        </div>
      </div>
    </AppShell>
  );
}
