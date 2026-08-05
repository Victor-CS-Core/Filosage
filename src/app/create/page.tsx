"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BrainCircuit, CheckCircle2, LoaderCircle, Plus, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { createClientId } from "@/lib/browser-compat";

const examples = ["Understand personal finance from first principles", "Build intuition for statistics", "Learn the foundations of music theory"];
const courseStyles = [
  { value: "Balanced", title: "Balanced", description: "Explanations, examples, and practice in equal measure." },
  { value: "Concept-first", title: "Concept-first", description: "Explain the core ideas before moving into application." },
  { value: "Project-led", title: "Project-led", description: "Organize the course around a concrete result." },
] as const;

type SourceDraft = {
  label: string;
  url: string;
  note: string;
  kind: "primary" | "official" | "licensed" | "author-provided";
  rights: "link-only" | "public-domain" | "licensed" | "author-owned";
};

const emptySource = (): SourceDraft => ({ label: "", url: "", note: "", kind: "official", rights: "link-only" });

export default function CreateCoursePage() {
  const router = useRouter();
  const { user, isPro, account } = useAuth();
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [application, setApplication] = useState("");
  const [background, setBackground] = useState("");
  const [artifactPreference, setArtifactPreference] = useState("");
  const [scenarioPreference, setScenarioPreference] = useState("");
  const [sources, setSources] = useState<SourceDraft[]>([emptySource()]);
  const [level, setLevel] = useState<"Foundations" | "Intermediate" | "Advanced">("Foundations");
  const [weeklyMinutes, setWeeklyMinutes] = useState(120);
  const [targetWeeks, setTargetWeeks] = useState(4);
  const [courseStyle, setCourseStyle] = useState<(typeof courseStyles)[number]["value"]>("Balanced");
  const [submitting, setSubmitting] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStage, setGenerationStage] = useState("Checking your course brief");
  const requestIdentityRef = useRef<{ signature: string; key: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const outlineQuota = account?.quotas.find((quota) => quota.feature === "course_outline");

  useEffect(() => {
    if (!submitting) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setGenerationProgress((current) => current >= 100 ? current : Math.min(95, 8 + Math.round(elapsed / 420)));
      if (elapsed > 28_000) setGenerationStage("Finalizing your course map");
      else if (elapsed > 18_000) setGenerationStage("Curating the course banner");
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
      const enteredSources = sources.filter((source) => source.label.trim() || source.url.trim() || source.note.trim());
      const incompleteSource = enteredSources.find((source) => !source.label.trim() || (!source.url.trim() && !source.note.trim()));
      if (incompleteSource) throw new Error("Give every reference a name and either a secure URL or a supporting note.");
      const sourcePack = enteredSources.map((source, index) => ({
        id: `source-${index + 1}`,
        label: source.label.trim(),
        url: source.url.trim() || undefined,
        note: source.note.trim() || undefined,
        kind: source.kind,
        rights: source.rights,
      }));
      const requestBody = { topic, goal, application, background, artifactPreference, scenarioPreference, sourcePack, level, weeklyMinutes, targetWeeks, courseStyle };
      const signature = JSON.stringify(requestBody);
      if (requestIdentityRef.current?.signature !== signature) {
        requestIdentityRef.current = { signature, key: createClientId() };
      }
      const response = await fetch("/api/generate-course", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "Idempotency-Key": requestIdentityRef.current.key },
        body: signature,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The course could not be created.");
      setGenerationProgress(100);
      setGenerationStage("Your course map is ready");
      requestIdentityRef.current = null;
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
    return <AppShell><div className="center-state"><Sparkles size={26} /><p className="overline">Erudoza Pro</p><h1>Create a private course for your goal.</h1><p>Course creation uses monthly Pro credits. Published outlines are public to browse; a free account is required to open their lessons.</p><button className="button button-primary" onClick={() => router.push("/pricing")}>View Pro</button></div></AppShell>;
  }

  const plannedHours = Math.max(1, Math.round((weeklyMinutes * targetWeeks) / 60));
  const weeklySessions = Math.max(1, Math.round(weeklyMinutes / 30));
  const briefReady = Boolean(topic.trim() && goal.trim());
  const enteredSourceCount = sources.filter((source) => source.label.trim() || source.url.trim() || source.note.trim()).length;
  const briefSignals = [
    { label: "Specific subject", ready: topic.trim().length >= 8 },
    { label: "Observable outcome", ready: goal.trim().length >= 24 },
    { label: "Real application", ready: application.trim().length >= 16 || scenarioPreference.trim().length >= 16 },
    { label: "Artifact or proof", ready: artifactPreference.trim().length >= 12 },
    { label: "Starting context", ready: background.trim().length >= 12 },
    { label: "Trusted reference", ready: enteredSourceCount > 0 },
  ];
  const briefScore = briefSignals.filter((signal) => signal.ready).length;
  const nextBriefSignal = briefSignals.find((signal) => !signal.ready)?.label;

  return (
    <AppShell>
      <div className="create-page">
        <header className="create-intro"><p className="overline">Course studio</p><h1>Create a course for your goal.</h1><p>Define the outcome, starting point, and pace. Erudoza creates a private outline first; you build, complete, review, and optionally publish the lessons in sequence.</p></header>
        <div className="create-layout">
          <form className="course-brief" onSubmit={create}>
            <section className="form-section">
              <div className="form-section-heading"><span>1</span><div><h2>Outcome and proof</h2><p>Name the capability, where it matters, and the work that will demonstrate it.</p></div></div>
              <label htmlFor="course-topic"><span>Subject or skill</span><small>{topic.length}/120</small></label>
              <input id="course-topic" value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={120} placeholder="e.g. Systems thinking for product decisions" required />
              <div className="example-prompts" aria-label="Topic examples">{examples.map((example) => <button type="button" key={example} onClick={() => setTopic(example)}>{example}</button>)}</div>
              <label htmlFor="course-goal"><span>What should you be able to do?</span><small>{goal.length}/500</small></label>
              <textarea id="course-goal" value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={500} rows={3} placeholder="I want to analyze a real situation, identify feedback loops, and explain the likely second-order effects." required />
              <label htmlFor="course-application"><span>Where will you use this?</span><small>Optional · {application.length}/500</small></label>
              <textarea id="course-application" value={application} onChange={(event) => setApplication(event.target.value)} maxLength={500} rows={2} placeholder="For product strategy reviews and clearer decisions with my team." />
              <label htmlFor="course-artifact"><span>What should the course help you produce?</span><small>Optional · {artifactPreference.length}/500</small></label>
              <textarea id="course-artifact" value={artifactPreference} onChange={(event) => setArtifactPreference(event.target.value)} maxLength={500} rows={2} placeholder="A decision memo, working analysis, annotated portfolio piece, or another artifact that proves the skill." />
              <label htmlFor="course-scenario"><span>Is there a situation the course should follow?</span><small>Optional · {scenarioPreference.length}/500</small></label>
              <textarea id="course-scenario" value={scenarioPreference} onChange={(event) => setScenarioPreference(event.target.value)} maxLength={500} rows={2} placeholder="A realistic project or decision that can become more complex as the course progresses." />
            </section>

            <section className="form-section">
              <div className="form-section-heading"><span>2</span><div><h2>Learner and constraints</h2><p>Set the starting point and a pace that can survive a real week.</p></div></div>
              <label htmlFor="course-background"><span>What do you already know?</span><small>Optional · {background.length}/500</small></label>
              <textarea id="course-background" value={background} onChange={(event) => setBackground(event.target.value)} maxLength={500} rows={2} placeholder="I understand the basic vocabulary but have not applied it to real cases." />
              <div className="brief-row brief-row-three">
                <div><label htmlFor="course-level"><span>Starting level</span></label><select id="course-level" value={level} onChange={(event) => setLevel(event.target.value as typeof level)}><option>Foundations</option><option>Intermediate</option><option>Advanced</option></select></div>
                <div><label htmlFor="target-weeks"><span>Target length</span></label><select id="target-weeks" value={targetWeeks} onChange={(event) => setTargetWeeks(Number(event.target.value))}><option value={2}>2 weeks</option><option value={4}>4 weeks</option><option value={6}>6 weeks</option><option value={8}>8 weeks</option></select></div>
                <div><label htmlFor="weekly-minutes"><span>Weekly study time</span></label><select id="weekly-minutes" value={weeklyMinutes} onChange={(event) => setWeeklyMinutes(Number(event.target.value))}><option value={60}>1 hour</option><option value={120}>2 hours</option><option value={180}>3 hours</option><option value={300}>5 hours</option></select></div>
              </div>
            </section>

            <section className="form-section source-pack-form">
              <div className="form-section-heading"><span>3</span><div><h2>Teaching plan</h2><p>Choose the instructional rhythm, then add references when accuracy or attribution depends on them.</p></div></div>
              <div className="course-style-options" role="radiogroup" aria-label="Teaching approach">
                {courseStyles.map((style) => (
                  <label key={style.value} className={courseStyle === style.value ? "is-selected" : ""}>
                    <input type="radio" name="course-style" value={style.value} checked={courseStyle === style.value} onChange={() => setCourseStyle(style.value)} />
                    <span><strong>{style.title}</strong><small>{style.description}</small></span>
                  </label>
                ))}
              </div>
              <details className="source-pack-disclosure">
                <summary><span><strong>Trusted references</strong><small>{enteredSourceCount ? `${enteredSourceCount} added` : "Optional · add up to five"}</small></span><Plus size={17} /></summary>
                <p className="source-pack-intro">Use sources you can legally link to or use. References improve attribution but do not replace your review of the generated course.</p>
                <div className="source-draft-list">
                {sources.map((source, index) => {
                  const updateSource = (change: Partial<SourceDraft>) => setSources((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...change } : item));
                  return <fieldset className="source-draft" key={`source-draft-${index}`}>
                    <legend>Reference {index + 1}</legend>
                    {sources.length > 1 && <button className="text-button source-remove" type="button" onClick={() => setSources((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /> Remove</button>}
                    <label htmlFor={`source-label-${index}`}><span>Source name</span><small>Optional</small></label>
                    <input id={`source-label-${index}`} value={source.label} onChange={(event) => updateSource({ label: event.target.value })} maxLength={120} placeholder="e.g. NIST AI Risk Management Framework" />
                    <label htmlFor={`source-url-${index}`}><span>Secure source URL</span><small>Public HTTPS address only</small></label>
                    <input id={`source-url-${index}`} type="url" inputMode="url" value={source.url} onChange={(event) => updateSource({ url: event.target.value })} maxLength={500} placeholder="https://..." />
                    <div className="brief-row">
                      <div><label htmlFor={`source-kind-${index}`}><span>Source type</span></label><select id={`source-kind-${index}`} value={source.kind} onChange={(event) => updateSource({ kind: event.target.value as SourceDraft["kind"] })}><option value="official">Official</option><option value="primary">Primary</option><option value="licensed">Licensed</option><option value="author-provided">Your material</option></select></div>
                      <div><label htmlFor={`source-rights-${index}`}><span>Usage basis</span></label><select id={`source-rights-${index}`} value={source.rights} onChange={(event) => updateSource({ rights: event.target.value as SourceDraft["rights"] })}><option value="link-only">Link only</option><option value="public-domain">Public domain</option><option value="licensed">Licensed</option><option value="author-owned">I own it</option></select></div>
                    </div>
                    <label htmlFor={`source-note-${index}`}><span>Relevant note</span><small>Optional · {source.note.length}/800</small></label>
                    <textarea id={`source-note-${index}`} value={source.note} onChange={(event) => updateSource({ note: event.target.value })} maxLength={800} rows={3} placeholder="Summarize the specific idea this source supports in your own words." />
                  </fieldset>;
                })}
                </div>
                {sources.length < 5 && <button className="button button-secondary button-small source-add" type="button" onClick={() => setSources((current) => [...current, emptySource()])}><Plus size={15} /> Add another reference</button>}
                <p className="source-rights-note"><ShieldCheck size={16} /> Do not paste full articles or material you cannot reuse. A URL is treated as a citation link, not proof that the generator read the page.</p>
              </details>
            </section>

            {submitting && (
              <div className="generation-progress" role="status" aria-live="polite">
                <div><span>{generationStage}</span><strong>{generationProgress}%</strong></div>
                <div className="progress-track" role="progressbar" aria-label="Course creation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={generationProgress} aria-valuetext={generationStage}><span style={{ transform: `scaleX(${generationProgress / 100})` }} /></div>
                <p>Creating an AI-assisted private draft from this brief. Review it before relying on or publishing it.</p>
              </div>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="create-mobile-readiness" aria-label="Course brief quality"><span><strong>{briefScore} of {briefSignals.length} brief signals</strong><small>{nextBriefSignal ? `Strengthen next: ${nextBriefSignal}` : "Ready for a detailed course map"}</small></span><i><b style={{ width: `${(briefScore / briefSignals.length) * 100}%` }} /></i></div>
            <div className="create-submit"><span><ShieldCheck size={17} /> Creates a private draft</span><button className="button button-primary" type="submit" disabled={!briefReady || submitting}>{submitting ? <><LoaderCircle className="spin" size={17} /> Creating your course…</> : <>Create course <ArrowRight size={17} /></>}</button></div>
          </form>

          <aside className="course-blueprint" aria-label="Course brief quality">
            <div className="blueprint-header"><BrainCircuit size={22} /><div><span>Course brief</span><h2>{topic.trim() || "Name the capability"}</h2><p>{goal.trim() || "Your intended outcome will appear here as you write."}</p></div></div>
            <div className="blueprint-quality"><div><span>Brief quality</span><strong>{briefScore} / {briefSignals.length}</strong></div><i><b style={{ width: `${(briefScore / briefSignals.length) * 100}%` }} /></i><p>{nextBriefSignal ? `Best next improvement: ${nextBriefSignal}.` : "The brief gives the generator strong outcome, context, evidence, and source signals."}</p></div>
            <dl className="blueprint-metrics">
              <div><dt>Plan</dt><dd>{targetWeeks} weeks</dd></div>
              <div><dt>Weekly rhythm</dt><dd>~{weeklySessions} sessions</dd></div>
              <div><dt>Study budget</dt><dd>~{plannedHours} hours</dd></div>
              <div><dt>Approach</dt><dd>{courseStyle}</dd></div>
            </dl>
            <div className="blueprint-readiness"><div><strong>Generation signals</strong><span>{briefReady ? "Can create" : "Needs input"}</span></div><ul>{briefSignals.map((signal) => <li className={signal.ready ? "is-ready" : ""} key={signal.label}><CheckCircle2 size={16} /> {signal.label}</li>)}</ul></div>
            <div className="blueprint-note"><strong>How authoring works</strong><p>Erudoza sends your brief to its AI provider to shape the outline. Lesson generation unlocks one lesson at a time after you complete the current activities. Review every lesson for accuracy and rights before publishing.</p></div>
            <div className="credit-note"><Sparkles size={16} /><span><strong>{outlineQuota?.remaining ?? "Unlimited"} outline credit{outlineQuota?.remaining === 1 ? "" : "s"} remaining</strong><small>A credit is reserved only when generation begins.</small></span></div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
