"use client";

import Link from "next/link";
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
    detail: "Each lesson identifies a consequential misconception about its concept and teaches against it directly. Progress records the material you completed without claiming what you personally believed.",
  },
  {
    icon: BookOpenCheck,
    title: "Guided practice with visible reasoning",
    detail: "Worked steps show how the method reaches an answer, with at least one explicit reasoning step instead of an unexplained result.",
  },
  {
    icon: Waypoints,
    title: "A visual or an accessible fallback",
    detail: "When a lesson marks a visual as essential, publication requires a supported visual or an equivalent text or table explanation. A merely helpful visual may be absent when the fallback still teaches the relationship.",
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
    detail: "Completed concepts return on scheduled intervals: sooner after fragile performance or overconfidence, and later after stronger review performance.",
  },
];

export default function TeachingStandardPage() {
  return (
    <AppShell>
      <div className="standard-page">
        <header className="standard-header">
          <p className="overline">The Filosage teaching standard</p>
          <h1>Generated is not good enough.<br />Every lesson is held to a standard.</h1>
          <p>
            There are plenty of AI course generators out there. Filosage works differently: every published lesson has
            to help learners build understanding that lasts. Automated checks reject or rebuild drafts that fall short,
            and authors review their work before publication. Here is the standard each published lesson must pass.
          </p>
        </header>

        <section className="standard-list" aria-label="Published lesson review checks">
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
            <h2>Lesson completion and assessed work stay separate</h2>
            <p>
              Courses end in a capstone with clear success criteria. Finishing the lessons completes the instructional
              sequence; the capstone is assessed separately and only passes when its criteria are met.
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
          <Link className="button button-primary" href="/library">See courses held to this standard <ArrowRight size={16} /></Link>
        </div>
      </div>
    </AppShell>
  );
}
