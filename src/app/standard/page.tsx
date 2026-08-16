"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  CalendarCheck2,
  CheckCircle2,
  Flag,
  ShieldCheck,
  Target,
  Waypoints,
} from "lucide-react";
import AppShell from "@/components/AppShell";

const capabilityCycle = [
  {
    icon: Target,
    stage: "Define",
    title: "Start with one observable win",
    detail: "The course begins with a real outcome and proof of skill. Each lesson then receives one focused capability, a practical time budget, and a clear result the learner can demonstrate in one sitting.",
  },
  {
    icon: BrainCircuit,
    stage: "Activate",
    title: "Bring the right prior knowledge forward",
    detail: "Later lessons name the capabilities they build on and begin with recall, discrimination, or prediction when it is useful. The sequence does not manufacture prerequisite work for an opening lesson.",
  },
  {
    icon: BookOpenCheck,
    stage: "Practice",
    title: "Use only the explanation the attempt requires",
    detail: "Concise explanation, worked reasoning, and a named misconception prepare the learner for one central activity and guided attempt. Essential visuals require an accessible text or table equivalent.",
  },
  {
    icon: CheckCircle2,
    stage: "Feedback",
    title: "Commit before feedback appears",
    detail: "Feedback stays hidden until the learner commits, uses criteria bound to the saved task, and asks for revision when the attempt misses the target. A self-check records an attempt without overstating what it proved.",
  },
  {
    icon: ArrowRight,
    stage: "Transfer",
    title: "Use the capability in a different context",
    detail: "The transfer task changes the situation instead of repeating guided practice. Its success criteria make the difference between exposure, an attempt, and demonstrated work visible.",
  },
  {
    icon: CalendarCheck2,
    stage: "Return",
    title: "Review when the capability is ready",
    detail: "Completed work returns through spaced or interleaved retrieval. Prerequisites, due time, and verified activity determine what enters the queue; a self-report never becomes demonstrated mastery by itself.",
  },
];

export default function TeachingStandardPage() {
  return (
    <AppShell>
      <div className="standard-page">
        <header className="standard-header">
          <h1>The Filosage Capability Cycle turns a goal into usable skill.</h1>
          <p>
            Every private course starts with the outcome, context, prior knowledge, proof of skill, and time available.
            Its lessons then follow one repeatable cycle so explanation, practice, feedback, transfer, and review work
            together instead of becoming a collection of generated articles.
          </p>
        </header>

        <ol className="standard-list" aria-label="The six stages of the Filosage Capability Cycle">
          {capabilityCycle.map(({ icon: Icon, stage, title, detail }) => (
            <li key={stage}>
              <span><Icon size={20} /></span>
              <div><small>{stage}</small><h2>{title}</h2><p>{detail}</p></div>
            </li>
          ))}
        </ol>

        <section className="standard-mastery">
          <Flag size={20} />
          <div>
            <h2>Completion, attempts, and demonstrated capability stay separate</h2>
            <p>
              Finishing a lesson completes part of the instructional sequence. A self-check records an attempt, verified
              practice can demonstrate a lesson criterion, and the capstone is assessed separately against its own success
              criteria. Filosage does not turn exposure or confidence into an invented mastery score.
            </p>
          </div>
        </section>

        <section className="standard-mastery standard-sources">
          <Waypoints size={20} />
          <div>
            <h2>Source status says only what the evidence can support</h2>
            <p>
              Source-backed statements retain claim-level grounding to the current lesson version. When suitable evidence
              cannot be retained, the lesson may continue with clearly disclosed AI general knowledge and no invented
              citations. Further reading remains optional study material, not proof that a book or page supported a claim.
            </p>
          </div>
        </section>

        <section className="standard-honesty">
          <ShieldCheck size={20} />
          <div>
            <h2>Private creation is automatic; public publication is reviewed</h2>
            <p>
              A private course map and its lessons do not wait for a person. They are generated with automated safety,
              language, structure, evidence, accessibility, and Capability Cycle checks. Making a course public is a
              separate action that requires review of the exact draft. These controls reduce mistakes but cannot guarantee
              factual accuracy; consequential claims still require current authoritative guidance. Reports can trigger
              review, restriction, or removal.
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
