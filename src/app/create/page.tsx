"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BrainCircuit, CheckCircle2, Clock3, LoaderCircle, ShieldCheck, Sparkles, Target } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { createClientId } from "@/lib/browser-compat";

const examples = ["Understand personal finance from first principles", "Build intuition for statistics", "Learn the foundations of music theory"];
const courseStyles = [
  { value: "Balanced", title: "Balanced", description: "Explanations, examples, and practice in equal measure." },
  { value: "Concept-first", title: "Concept-first", description: "Explain the core ideas before moving into application." },
  { value: "Project-led", title: "Project-led", description: "Organize the course around a concrete result." },
] as const;

export default function CreateCoursePage() {
  const router = useRouter();
  const { user, isPro, account } = useAuth();
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [application, setApplication] = useState("");
  const [background, setBackground] = useState("");
  const [level, setLevel] = useState<"Foundations" | "Intermediate" | "Advanced">("Foundations");
  const [weeklyMinutes, setWeeklyMinutes] = useState(120);
  const [targetWeeks, setTargetWeeks] = useState(4);
  const [courseStyle, setCourseStyle] = useState<(typeof courseStyles)[number]["value"]>("Balanced");
  const [submitting, setSubmitting] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStage, setGenerationStage] = useState("Checking your course brief");
  const [error, setError] = useState<string | null>(null);
  const outlineQuota = account?.quotas.find((quota) => quota.feature === "course_outline");

  useEffect(() => {
    if (!submitting) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setGenerationProgress((current) => current >= 100 ? current : Math.min(92, 8 + Math.round(elapsed / 420)));
      if (elapsed > 18_000) setGenerationStage("Finalizing your course map");
      else if (elapsed > 10_000) setGenerationStage("Balancing practice and workload");
      else if (elapsed > 4_000) setGenerationStage("Shaping the lesson sequence");
      else if (elapsed > 1_500) setGenerationStage("Mapping prerequisites");
    }, 450);
    return () => window.clearInterval(timer);
  }, [submitting]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !isPro || !topic.trim() || !goal.trim()) return;
    setSubmitting(true);
    setGenerationProgress(8);
    setGenerationStage("Checking your course brief");
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/generate-course", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "Idempotency-Key": createClientId() },
        body: JSON.stringify({ topic, goal, application, background, level, weeklyMinutes, targetWeeks, courseStyle }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The course could not be created.");
      setGenerationProgress(100);
      setGenerationStage("Your course map is ready");
      window.dispatchEvent(new Event("erudoza:courses-changed"));
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      router.push(`/course/${encodeURIComponent(topic.trim())}?id=${data.courseId}`);
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : "The course could not be created.");
      setSubmitting(false);
      setGenerationProgress(0);
    }
  };

  if (!isPro) {
    return <AppShell><div className="center-state"><Sparkles size={26} /><p className="overline">Erudoza Pro</p><h1>Create a private course for your goal.</h1><p>Course creation uses monthly Pro credits. Published courses remain open to everyone.</p><button className="button button-primary" onClick={() => router.push("/pricing")}>View Pro</button></div></AppShell>;
  }

  const plannedHours = Math.max(1, Math.round((weeklyMinutes * targetWeeks) / 60));
  const weeklySessions = Math.max(1, Math.round(weeklyMinutes / 30));
  const briefReady = Boolean(topic.trim() && goal.trim());

  return (
    <AppShell>
      <div className="create-page">
        <header className="create-intro"><p className="overline">Course studio</p><h1>Create a course for your goal.</h1><p>Define the outcome, starting point, and pace. Erudoza uses AI to create a private draft for you to review.</p></header>
        <div className="create-layout">
          <form className="course-brief" onSubmit={create}>
            <section className="form-section">
              <div className="form-section-heading"><span>1</span><div><h2>Choose the subject</h2><p>Specific topics produce stronger explanations and practice.</p></div></div>
              <label htmlFor="course-topic"><span>Subject or skill</span><small>{topic.length}/120</small></label>
              <input id="course-topic" value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={120} placeholder="e.g. Systems thinking for product decisions" required />
              <div className="example-prompts" aria-label="Topic examples">{examples.map((example) => <button type="button" key={example} onClick={() => setTopic(example)}>{example}</button>)}</div>
            </section>

            <section className="form-section">
              <div className="form-section-heading"><span>2</span><div><h2>Define mastery</h2><p>Describe what success looks like in the real world.</p></div></div>
              <label htmlFor="course-goal"><span>What should you be able to do?</span><small>{goal.length}/500</small></label>
              <textarea id="course-goal" value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={500} rows={3} placeholder="I want to analyze a real situation, identify feedback loops, and explain the likely second-order effects." required />
              <label htmlFor="course-application"><span>Where will you use this?</span><small>Optional · {application.length}/500</small></label>
              <textarea id="course-application" value={application} onChange={(event) => setApplication(event.target.value)} maxLength={500} rows={2} placeholder="For product strategy reviews and clearer decisions with my team." />
            </section>

            <section className="form-section">
              <div className="form-section-heading"><span>3</span><div><h2>Set the starting point</h2><p>Skip what you know and surface the prerequisites you need.</p></div></div>
              <label htmlFor="course-background"><span>What do you already know?</span><small>Optional · {background.length}/500</small></label>
              <textarea id="course-background" value={background} onChange={(event) => setBackground(event.target.value)} maxLength={500} rows={2} placeholder="I understand the basic vocabulary but have not applied it to real cases." />
              <div className="brief-row brief-row-three">
                <div><label htmlFor="course-level"><span>Starting level</span></label><select id="course-level" value={level} onChange={(event) => setLevel(event.target.value as typeof level)}><option>Foundations</option><option>Intermediate</option><option>Advanced</option></select></div>
                <div><label htmlFor="target-weeks"><span>Target length</span></label><select id="target-weeks" value={targetWeeks} onChange={(event) => setTargetWeeks(Number(event.target.value))}><option value={2}>2 weeks</option><option value={4}>4 weeks</option><option value={6}>6 weeks</option><option value={8}>8 weeks</option></select></div>
                <div><label htmlFor="weekly-minutes"><span>Weekly study time</span></label><select id="weekly-minutes" value={weeklyMinutes} onChange={(event) => setWeeklyMinutes(Number(event.target.value))}><option value={60}>1 hour</option><option value={120}>2 hours</option><option value={180}>3 hours</option><option value={300}>5 hours</option></select></div>
              </div>
            </section>

            <section className="form-section">
              <div className="form-section-heading"><span>4</span><div><h2>Choose the teaching approach</h2><p>The same topic can be sequenced for intuition, balance, or application.</p></div></div>
              <div className="course-style-options" role="radiogroup" aria-label="Teaching approach">
                {courseStyles.map((style) => (
                  <label key={style.value} className={courseStyle === style.value ? "is-selected" : ""}>
                    <input type="radio" name="course-style" value={style.value} checked={courseStyle === style.value} onChange={() => setCourseStyle(style.value)} />
                    <span><strong>{style.title}</strong><small>{style.description}</small></span>
                  </label>
                ))}
              </div>
            </section>

            {submitting && (
              <div className="generation-progress" role="status" aria-live="polite">
                <div><span>{generationStage}</span><strong>{generationProgress}%</strong></div>
                <div className="progress-track" role="progressbar" aria-label="Course creation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={generationProgress} aria-valuetext={generationStage}><span style={{ transform: `scaleX(${generationProgress / 100})` }} /></div>
                <p>Creating an AI-assisted private draft from this brief. Review it before relying on or publishing it.</p>
              </div>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="create-submit"><span><ShieldCheck size={17} /> Creates a private draft</span><button className="button button-primary" type="submit" disabled={!briefReady || submitting}>{submitting ? <><LoaderCircle className="spin" size={17} /> Creating your course…</> : <>Create course <ArrowRight size={17} /></>}</button></div>
          </form>

          <aside className="course-blueprint" aria-label="Course summary">
            <div className="blueprint-header"><BrainCircuit size={22} /><div><span>Course summary</span><h2>{topic.trim() || "Untitled course"}</h2></div></div>
            <dl className="blueprint-metrics">
              <div><dt>Plan</dt><dd>{targetWeeks} weeks</dd></div>
              <div><dt>Weekly rhythm</dt><dd>~{weeklySessions} sessions</dd></div>
              <div><dt>Study budget</dt><dd>~{plannedHours} hours</dd></div>
              <div><dt>Approach</dt><dd>{courseStyle}</dd></div>
            </dl>
            <div className="blueprint-readiness"><div><strong>Required information</strong><span>{briefReady ? "Ready" : "Needs input"}</span></div><ul><li className={topic.trim() ? "is-ready" : ""}><CheckCircle2 size={16} /> Specific subject</li><li className={goal.trim() ? "is-ready" : ""}><Target size={16} /> Observable outcome</li><li className={background.trim() ? "is-ready" : ""}><Clock3 size={16} /> Starting context <small>optional</small></li></ul></div>
            <div className="blueprint-note"><strong>How your brief is used</strong><p>Erudoza sends it to its AI provider to choose prerequisites, examples, practice, and lesson scope. Review the result for accuracy.</p></div>
            <div className="credit-note"><Sparkles size={16} /><span><strong>{outlineQuota?.remaining ?? "Unlimited"} outline credit{outlineQuota?.remaining === 1 ? "" : "s"} remaining</strong><small>A credit is reserved only when generation begins.</small></span></div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
