"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  FileCheck2,
  LoaderCircle,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { createClientId } from "@/lib/browser-compat";
import { isSafePublicSourceUrl } from "@/lib/source-safety";
import styles from "./create.module.css";

const examples = [
  "Run a causal analysis for a product decision",
  "Build a reliable forecasting model in Python",
  "Design an experiment stakeholders can trust",
];

const courseStyles = [
  { value: "Balanced", title: "Balanced", description: "Move between concise explanations, worked examples, and practice." },
  { value: "Concept-first", title: "Concept-first", description: "Build a durable mental model before applying it to realistic work." },
  { value: "Project-led", title: "Project-led", description: "Use one concrete deliverable to organize the learning sequence." },
] as const;

const steps = [
  { label: "Outcome", description: "Define success", icon: Target },
  { label: "Pace", description: "Fit the work", icon: Clock3 },
  { label: "Teaching plan", description: "Shape the course", icon: FileCheck2 },
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
  const [activeStep, setActiveStep] = useState(0);
  const [visitedSteps, setVisitedSteps] = useState([true, false, false]);
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
  const [error, setError] = useState<string | null>(null);
  const requestIdentityRef = useRef<{ signature: string; key: string } | null>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
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

  const goToStep = (nextStep: number) => {
    setVisitedSteps((current) => current.map((visited, index) => visited || index === nextStep));
    setActiveStep(nextStep);
    window.requestAnimationFrame(() => stepHeadingRef.current?.focus());
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !isPro || !topic.trim() || !goal.trim() || !background.trim()) return;
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
    return <AppShell><div className="center-state"><Sparkles size={26} /><p className="overline">Filosage Pro</p><h1>Create a private course for your goal.</h1><p>Course creation uses monthly Pro credits. Published outlines are public to browse; a free account is required to open their lessons.</p><button className="button button-primary" onClick={() => router.push("/pricing")}>View Pro</button></div></AppShell>;
  }

  const plannedHours = Math.max(1, Math.round((weeklyMinutes * targetWeeks) / 60));
  const weeklySessions = Math.max(1, Math.round(weeklyMinutes / 30));
  const outcomeComplete = topic.trim().length >= 2 && Boolean(goal.trim());
  const paceComplete = Boolean(background.trim() && level && targetWeeks >= 2 && weeklyMinutes >= 30);
  const enteredSourceCount = sources.filter((source) => source.label.trim() || source.url.trim() || source.note.trim()).length;
  const referencesComplete = sources.every((source) => {
    const label = source.label.trim();
    const url = source.url.trim();
    const note = source.note.trim();
    if (!label && !url && !note) return true;
    return label.length >= 2 && Boolean(url || note) && (!url || isSafePublicSourceUrl(url));
  });
  const teachingComplete = Boolean(courseStyle) && referencesComplete;
  const formReady = outcomeComplete && paceComplete && teachingComplete;
  const contextCount = [application, artifactPreference, scenarioPreference, background].filter((value) => value.trim()).length;
  const stepValidity = [outcomeComplete, paceComplete, teachingComplete];
  const stepComplete = stepValidity.map((valid, index) => valid && visitedSteps[index]);
  const creditLabel = outlineQuota?.remaining == null
    ? "Course creation available"
    : `${outlineQuota.remaining} course credit${outlineQuota.remaining === 1 ? "" : "s"} left this month`;

  return (
    <AppShell>
      <div className={styles.page}>
        <header className={styles.intro}>
          <div>
            <p className={styles.studioLabel}><Sparkles size={15} /> Course studio</p>
            <h1>Build toward a real outcome.</h1>
            <p>Give Filosage the result you need, the time you have, and how you learn best. You’ll get a private course map to review before any lesson is published.</p>
          </div>
          <div className={styles.introMeta} aria-label="Course creation details">
            <span><LockKeyhole size={15} /> Private draft</span>
            <span>{creditLabel}</span>
          </div>
        </header>

        <div className={styles.workspace}>
          <div className={styles.formPanel}>
            <nav className={styles.stepNav} aria-label="Course creation steps">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <button
                    className={index === activeStep ? styles.activeStep : ""}
                    type="button"
                    key={step.label}
                    onClick={() => goToStep(index)}
                    disabled={submitting}
                    aria-current={index === activeStep ? "step" : undefined}
                    data-complete={stepComplete[index] ? "true" : "false"}
                  >
                    <span className={styles.stepIcon}>{stepComplete[index] && index !== activeStep ? <Check size={16} /> : <Icon size={16} />}</span>
                    <span><strong>{step.label}</strong><small>{step.description}</small></span>
                  </button>
                );
              })}
            </nav>

            <form onSubmit={create}>
              <fieldset className={styles.formFieldset} disabled={submitting}>
                {activeStep === 0 && (
                  <section className={styles.stepSection} aria-labelledby="outcome-step-title">
                    <div className={styles.sectionHeading}>
                      <p>Step 1 of 3</p>
                      <h2 id="outcome-step-title" ref={stepHeadingRef} tabIndex={-1}>What needs to change when you finish?</h2>
                      <span>Start with a capability you can demonstrate, not a broad topic you can only describe.</span>
                    </div>

                    <div className={styles.field}>
                      <label htmlFor="course-topic"><span>Subject or skill</span><small>{topic.length}/120</small></label>
                      <input id="course-topic" value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={120} placeholder="e.g. Systems thinking for product decisions" required />
                      <div className={styles.examples} aria-label="Topic examples">
                        {examples.map((example) => <button type="button" key={example} onClick={() => setTopic(example)}>{example}</button>)}
                      </div>
                    </div>

                    <div className={styles.field}>
                      <label htmlFor="course-goal"><span>What will you be able to do?</span><small>{goal.length}/500</small></label>
                      <textarea id="course-goal" value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={500} rows={4} placeholder="Analyze a real situation, identify the important forces, and explain a defensible recommendation." required />
                      <p className={styles.fieldHint}>Use an action such as analyze, build, diagnose, design, or explain.</p>
                    </div>

                    <div className={styles.field}>
                      <label htmlFor="course-artifact"><span>What work will prove it?</span><small>Recommended · {artifactPreference.length}/500</small></label>
                      <textarea id="course-artifact" value={artifactPreference} onChange={(event) => setArtifactPreference(event.target.value)} maxLength={500} rows={3} placeholder="A decision memo, working model, experiment plan, portfolio piece, or another concrete artifact." />
                    </div>

                    <details className={styles.optionalDetails}>
                      <summary><span><strong>Add work context</strong><small>Optional · makes examples more relevant</small></span><Plus size={17} /></summary>
                      <div className={styles.optionalContent}>
                        <div className={styles.field}>
                          <label htmlFor="course-application"><span>Where will you use this?</span><small>{application.length}/500</small></label>
                          <textarea id="course-application" value={application} onChange={(event) => setApplication(event.target.value)} maxLength={500} rows={3} placeholder="For product strategy reviews and clearer decisions with my team." />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="course-scenario"><span>Should the course follow a specific situation?</span><small>{scenarioPreference.length}/500</small></label>
                          <textarea id="course-scenario" value={scenarioPreference} onChange={(event) => setScenarioPreference(event.target.value)} maxLength={500} rows={3} placeholder="A realistic project or decision that becomes more complex as the course progresses." />
                        </div>
                      </div>
                    </details>
                  </section>
                )}

                {activeStep === 1 && (
                  <section className={styles.stepSection} aria-labelledby="pace-step-title">
                    <div className={styles.sectionHeading}>
                      <p>Step 2 of 3</p>
                      <h2 id="pace-step-title" ref={stepHeadingRef} tabIndex={-1}>Make the course fit your actual week.</h2>
                      <span>Your starting point controls explanation depth. Your time budget controls the size and rhythm of the plan.</span>
                    </div>

                    <div className={styles.field}>
                      <label htmlFor="course-background"><span>What do you already know?</span><small>Required · {background.length}/500</small></label>
                      <textarea id="course-background" value={background} onChange={(event) => setBackground(event.target.value)} maxLength={500} rows={4} placeholder="I understand the basic vocabulary but have not yet applied it to a real case." required />
                      <p className={styles.fieldHint}>Mention adjacent skills, tools, or concepts Filosage can build on.</p>
                    </div>

                    <div className={styles.scheduleGrid}>
                      <div className={styles.field}>
                        <label htmlFor="course-level"><span>Starting level</span></label>
                        <select id="course-level" value={level} onChange={(event) => setLevel(event.target.value as typeof level)} required><option>Foundations</option><option>Intermediate</option><option>Advanced</option></select>
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="target-weeks"><span>Target length</span></label>
                        <select id="target-weeks" value={targetWeeks} onChange={(event) => setTargetWeeks(Number(event.target.value))} required><option value={2}>2 weeks</option><option value={4}>4 weeks</option><option value={6}>6 weeks</option><option value={8}>8 weeks</option></select>
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="weekly-minutes"><span>Weekly study time</span></label>
                        <select id="weekly-minutes" value={weeklyMinutes} onChange={(event) => setWeeklyMinutes(Number(event.target.value))} required><option value={60}>1 hour</option><option value={120}>2 hours</option><option value={180}>3 hours</option><option value={300}>5 hours</option></select>
                      </div>
                    </div>

                    <div className={styles.rhythmPreview} aria-label="Planned course rhythm">
                      <Clock3 size={18} />
                      <div><strong>{targetWeeks} weeks · about {weeklySessions} sessions a week</strong><span>Roughly {plannedHours} focused hours from start to finish.</span></div>
                    </div>
                  </section>
                )}

                {activeStep === 2 && (
                  <section className={styles.stepSection} aria-labelledby="teaching-step-title">
                    <div className={styles.sectionHeading}>
                      <p>Step 3 of 3</p>
                      <h2 id="teaching-step-title" ref={stepHeadingRef} tabIndex={-1}>Choose how the learning should unfold.</h2>
                      <span>Filosage will still combine explanation, practice, retrieval, and transfer. This choice sets the emphasis.</span>
                    </div>

                    <div className={styles.approachGroup} role="radiogroup" aria-label="Teaching approach">
                      {courseStyles.map((style) => (
                        <label key={style.value} className={courseStyle === style.value ? styles.selectedApproach : ""}>
                          <input type="radio" name="course-style" value={style.value} checked={courseStyle === style.value} onChange={() => setCourseStyle(style.value)} required />
                          <span className={styles.radioMark}>{courseStyle === style.value && <Check size={14} />}</span>
                          <span><strong>{style.title}</strong><small>{style.description}</small></span>
                        </label>
                      ))}
                    </div>

                    <details className={styles.optionalDetails}>
                      <summary><span><strong>Trusted references</strong><small>{enteredSourceCount ? `${enteredSourceCount} added` : "Optional · add up to five"}</small></span><Plus size={17} /></summary>
                      <div className={styles.optionalContent}>
                        <p className={styles.referenceIntro}>Add sources when accuracy or attribution depends on them. References improve the brief, but they do not replace your review of the generated course.</p>
                        <div className={styles.sourceList}>
                          {sources.map((source, index) => {
                            const updateSource = (change: Partial<SourceDraft>) => setSources((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...change } : item));
                            return (
                              <fieldset className={styles.sourceDraft} key={`source-draft-${index}`}>
                                <legend>Reference {index + 1}</legend>
                                {sources.length > 1 && <button className={styles.removeSource} type="button" onClick={() => setSources((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /> Remove</button>}
                                <div className={styles.field}>
                                  <label htmlFor={`source-label-${index}`}><span>Source name</span></label>
                                  <input id={`source-label-${index}`} value={source.label} onChange={(event) => updateSource({ label: event.target.value })} maxLength={120} placeholder="e.g. NIST AI Risk Management Framework" />
                                </div>
                                <div className={styles.field}>
                                  <label htmlFor={`source-url-${index}`}><span>Secure source URL</span><small>Public HTTPS only</small></label>
                                  <input id={`source-url-${index}`} type="url" inputMode="url" value={source.url} onChange={(event) => updateSource({ url: event.target.value })} maxLength={500} placeholder="https://..." />
                                </div>
                                <div className={styles.sourceMetaGrid}>
                                  <div className={styles.field}><label htmlFor={`source-kind-${index}`}><span>Source type</span></label><select id={`source-kind-${index}`} value={source.kind} onChange={(event) => updateSource({ kind: event.target.value as SourceDraft["kind"] })}><option value="official">Official</option><option value="primary">Primary</option><option value="licensed">Licensed</option><option value="author-provided">Your material</option></select></div>
                                  <div className={styles.field}><label htmlFor={`source-rights-${index}`}><span>Usage basis</span></label><select id={`source-rights-${index}`} value={source.rights} onChange={(event) => updateSource({ rights: event.target.value as SourceDraft["rights"] })}><option value="link-only">Link only</option><option value="public-domain">Public domain</option><option value="licensed">Licensed</option><option value="author-owned">I own it</option></select></div>
                                </div>
                                <div className={styles.field}>
                                  <label htmlFor={`source-note-${index}`}><span>Relevant note</span><small>{source.note.length}/800</small></label>
                                  <textarea id={`source-note-${index}`} value={source.note} onChange={(event) => updateSource({ note: event.target.value })} maxLength={800} rows={3} placeholder="Summarize the specific idea this source supports in your own words." />
                                </div>
                              </fieldset>
                            );
                          })}
                        </div>
                        {sources.length < 5 && <button className={`button button-secondary button-small ${styles.addSource}`} type="button" onClick={() => setSources((current) => [...current, emptySource()])}><Plus size={15} /> Add another reference</button>}
                        <p className={styles.rightsNote}><ShieldCheck size={16} /> Do not paste full articles or material you cannot reuse. A link is treated as a citation, not proof that the generator read the page.</p>
                      </div>
                    </details>

                    <div className={styles.reviewNote}>
                      <CheckCircle2 size={18} />
                      <div><strong>Your first result is a private course map.</strong><span>Lessons unlock in sequence. Review their accuracy and rights before publishing.</span></div>
                    </div>
                  </section>
                )}
              </fieldset>

              {submitting && (
                <div className={styles.generationProgress} role="status" aria-live="polite">
                  <div><span>{generationStage}</span><strong>{generationProgress}%</strong></div>
                  <div className={styles.progressTrack} role="progressbar" aria-label="Course creation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={generationProgress} aria-valuetext={generationStage}><span style={{ transform: `scaleX(${generationProgress / 100})` }} /></div>
                  <p>Creating an AI-assisted private draft from this brief. Review it before relying on or publishing it.</p>
                </div>
              )}
              {error && <p className={styles.formError} role="alert">{error}</p>}

              <footer className={styles.formActions}>
                <div>
                  {activeStep > 0 && <button className={`button button-quiet ${styles.backButton}`} type="button" onClick={() => goToStep(activeStep - 1)} disabled={submitting}><ArrowLeft size={17} /> Back</button>}
                </div>
                {activeStep < steps.length - 1 ? (
                  <button
                    key="wizard-continue"
                    className="button button-primary"
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      goToStep(activeStep + 1);
                    }}
                    disabled={!stepValidity[activeStep]}
                  >
                    Continue <ArrowRight size={17} />
                  </button>
                ) : (
                  <button key="wizard-create-course" className="button button-primary" type="submit" disabled={!formReady || submitting}>{submitting ? <><LoaderCircle className="spin" size={17} /> Creating your course…</> : <>Create private course <ArrowRight size={17} /></>}</button>
                )}
              </footer>
            </form>
          </div>

          <aside className={styles.snapshot} aria-label="Course snapshot">
            <div className={styles.snapshotHeader}>
              <span><LockKeyhole size={14} /> Private course map</span>
              <h2>{topic.trim() || "Your course takes shape here"}</h2>
              <p>{goal.trim() || "Define a specific outcome and this snapshot will keep the course anchored to it."}</p>
            </div>
            <dl className={styles.snapshotDetails}>
              <div><dt>Starting point</dt><dd>{level}</dd></div>
              <div><dt>Rhythm</dt><dd>{targetWeeks} weeks · {weeklySessions} sessions/week</dd></div>
              <div><dt>Teaching style</dt><dd>{courseStyle}</dd></div>
              <div><dt>Evidence</dt><dd>{artifactPreference.trim() || "Add a concrete deliverable"}</dd></div>
            </dl>
            <div className={styles.snapshotReadiness}>
              <div><strong>{formReady ? "Ready to build" : outcomeComplete ? "Complete the course brief" : "Start with the outcome"}</strong><span>{activeStep + 1} of {steps.length}</span></div>
              <ul>
                <li className={topic.trim() ? styles.ready : ""}><CheckCircle2 size={16} /> Clear capability</li>
                <li className={goal.trim() ? styles.ready : ""}><CheckCircle2 size={16} /> Observable outcome</li>
                <li className={artifactPreference.trim() ? styles.ready : ""}><CheckCircle2 size={16} /> Evidence of skill</li>
              </ul>
              {outcomeComplete && contextCount === 0 && <p>Add one context detail to make the examples feel closer to your work.</p>}
              {contextCount > 0 && <p>{contextCount} context detail{contextCount === 1 ? "" : "s"} will help tailor the course.</p>}
            </div>
            <div className={styles.creditNote}><Sparkles size={16} /><span><strong>{creditLabel}</strong><small>A credit is reserved only when generation begins.</small></span></div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
