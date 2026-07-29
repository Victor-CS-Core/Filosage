"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, BookOpenCheck, CalendarCheck2, Check, Flag, Lightbulb, ShieldCheck, Target, Waypoints } from "lucide-react";
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
    icon: Waypoints,
    title: "Purposeful visual explanation",
    detail: "When a relationship, contrast, sequence, comparison, or prerequisite is easier to understand visually, Erudoza adds one concise, structured visual explanation. It is generated from safe data and earns its place in the lesson, never decoration or an unreviewed image.",
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
            There are plenty of AI course generators out there. Erudoza works differently: every published lesson has
            to help learners build understanding that lasts. Automated checks reject or rebuild drafts that fall short,
            and authors review their work before publication. Here is the standard each published lesson must pass.
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
              Lessons are AI-assisted and labeled as such. Briefs and outputs are screened for safety, language
              consistency, structure, and teaching quality; authors must review before publishing. These controls reduce
              mistakes but cannot guarantee factual accuracy, so important claims should still be verified. Reports can
              trigger review, restriction, or removal, and the platform owner can unpublish any course.
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
