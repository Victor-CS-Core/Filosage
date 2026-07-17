"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BrainCircuit, CheckCircle2, Clock3, LoaderCircle, ShieldCheck, Sparkles, Target } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";

const examples = ["Understand personal finance from first principles", "Build intuition for statistics", "Learn the foundations of music theory"];

export default function CreateCoursePage() {
  const router = useRouter();
  const { user, isPro, account } = useAuth();
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [background, setBackground] = useState("");
  const [level, setLevel] = useState<"Foundations" | "Intermediate" | "Advanced">("Foundations");
  const [weeklyMinutes, setWeeklyMinutes] = useState(120);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const outlineQuota = account?.quotas.find((quota) => quota.feature === "course_outline");

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !isPro || !topic.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/generate-course", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ topic, goal, background, level, weeklyMinutes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The learning path could not be created.");
      window.dispatchEvent(new Event("erudoza:courses-changed"));
      router.push(`/course/${encodeURIComponent(topic.trim())}?id=${data.courseId}`);
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : "The learning path could not be created.");
      setSubmitting(false);
    }
  };

  if (!isPro) {
    return <AppShell><div className="center-state"><Sparkles size={26} /><p className="overline">Erudoza Pro</p><h1>Craft a private course around your goal.</h1><p>Course creation is a metered Pro feature. Published courses remain open to everyone.</p><button className="button button-primary" onClick={() => router.push("/pricing")}>View Pro</button></div></AppShell>;
  }

  return (
    <AppShell>
      <div className="create-page">
        <header className="create-intro"><p className="overline">Course studio</p><h1>What do you want to master?</h1><p>Give Erudoza enough context to build a deliberate sequence. One outline is generated only after you review and submit this form.</p></header>
        <div className="create-layout">
          <form className="course-brief" onSubmit={create}>
            <div className="form-section"><label htmlFor="course-topic"><span>Subject or skill</span><small>Keep it focused enough to practice.</small></label><input id="course-topic" value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={120} placeholder="e.g. Systems thinking for product decisions" required /><div className="example-prompts">{examples.map((example) => <button type="button" key={example} onClick={() => setTopic(example)}>{example}</button>)}</div></div>
            <div className="form-section"><label htmlFor="course-goal"><span>What should you be able to do?</span><small>An observable outcome makes the course more useful.</small></label><textarea id="course-goal" value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={500} rows={3} placeholder="I want to analyze a real situation, identify feedback loops, and explain the likely second-order effects." /></div>
            <div className="form-section"><label htmlFor="course-background"><span>What do you already know?</span><small>Optional. This prevents repetition and sets the right starting point.</small></label><textarea id="course-background" value={background} onChange={(event) => setBackground(event.target.value)} maxLength={500} rows={2} placeholder="I understand the basic vocabulary but have not applied it to real cases." /></div>
            <div className="brief-row"><div className="form-section"><label htmlFor="course-level"><span>Starting level</span></label><select id="course-level" value={level} onChange={(event) => setLevel(event.target.value as typeof level)}><option>Foundations</option><option>Intermediate</option><option>Advanced</option></select></div><div className="form-section"><label htmlFor="weekly-minutes"><span>Weekly study time</span></label><select id="weekly-minutes" value={weeklyMinutes} onChange={(event) => setWeeklyMinutes(Number(event.target.value))}><option value={60}>1 hour</option><option value={120}>2 hours</option><option value={180}>3 hours</option><option value={300}>5 hours</option></select></div></div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="create-submit"><span><ShieldCheck size={17} /> Creates a private draft</span><button className="button button-primary" type="submit" disabled={!topic.trim() || submitting}>{submitting ? <><LoaderCircle className="spin" size={17} /> Crafting your sequence…</> : <>Create learning path <ArrowRight size={17} /></>}</button></div>
          </form>
          <aside className="course-brief-guide"><div><BrainCircuit size={22} /><h2>What Erudoza will build</h2></div><ul><li><CheckCircle2 size={17} /><span><strong>A prerequisite-aware sequence</strong><small>Foundational ideas arrive before concepts that depend on them.</small></span></li><li><Target size={17} /><span><strong>Observable lesson outcomes</strong><small>Every lesson is scoped around something you can explain or apply.</small></span></li><li><Clock3 size={17} /><span><strong>A realistic workload</strong><small>The path respects your starting level and available time.</small></span></li></ul><div className="credit-note"><Sparkles size={16} /><span><strong>{outlineQuota?.remaining ?? "Unlimited"} outline credit{outlineQuota?.remaining === 1 ? "" : "s"} remaining</strong><small>A credit is reserved only when generation begins.</small></span></div></aside>
        </div>
      </div>
    </AppShell>
  );
}
