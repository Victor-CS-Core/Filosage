"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { createClientId } from "@/lib/browser-compat";
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

type CourseCreationResponse = {
  courseId?: string;
  error?: string;
  evaluation?: {
    issues?: string[];
    providerError?: {
      name?: string;
      status?: string | number;
      code?: string;
      type?: string;
      param?: string;
      requestId?: string;
    };
  };
};

export default function CreateCoursePage() {
  const { user, canCreateCourses, account } = useAuth();
  const [activeStep, setActiveStep] = useState(0);
  const [visitedSteps, setVisitedSteps] = useState([true, false, false]);
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [application, setApplication] = useState("");
  const [background, setBackground] = useState("");
  const [artifactPreference, setArtifactPreference] = useState("");
  const [scenarioPreference, setScenarioPreference] = useState("");
  const [language, setLanguage] = useState("English");
  const [level, setLevel] = useState<"Foundations" | "Intermediate" | "Advanced">("Foundations");
  const [weeklyMinutes, setWeeklyMinutes] = useState(120);
  const [targetWeeks, setTargetWeeks] = useState(4);
  const [courseStyle, setCourseStyle] = useState<(typeof courseStyles)[number]["value"]>("Balanced");
  const [submitting, setSubmitting] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStage, setGenerationStage] = useState("Researching released, reputable sources");
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
    if (!user || !canCreateCourses || account?.courseCapacity?.remaining === 0 || !topic.trim() || !goal.trim() || !background.trim()) return;
    setSubmitting(true);
    setGenerationProgress(8);
    setGenerationStage("Researching released, reputable sources");
    setError(null);
    try {
      const token = await user.getIdToken();
      const requestBody = { topic, goal, application, background, artifactPreference, scenarioPreference, level, weeklyMinutes, targetWeeks, courseStyle, language };
      const signature = JSON.stringify(requestBody);
      if (requestIdentityRef.current?.signature !== signature) {
        requestIdentityRef.current = { signature, key: createClientId() };
      }
      const response = await fetch("/api/generate-course", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": requestIdentityRef.current.key,
          ...(account?.isOwner ? { "x-filosage-model-evaluation": "1" } : {}),
        },
        body: signature,
      });
      const responseText = await response.text();
      let data: CourseCreationResponse = {};
      try {
        data = responseText ? JSON.parse(responseText) as CourseCreationResponse : {};
      } catch {
        throw new Error(responseText.toLowerCase().includes("timeout")
          ? "Course creation took too long to confirm. Retry the same request to reopen it if the server finished, or start it again safely."
          : "The course service returned an unreadable response. No unconfirmed course will be opened.");
      }
      if (!response.ok) {
        const providerError = data?.evaluation?.providerError;
        const providerDiagnostic = providerError && typeof providerError === "object"
          ? [providerError.name, providerError.status, providerError.code, providerError.type, providerError.param, providerError.requestId].filter(Boolean).join(" · ")
          : "";
        const issueDiagnostic = account?.isOwner && Array.isArray(data.evaluation?.issues)
          ? data.evaluation.issues.filter((issue): issue is string => typeof issue === "string").slice(0, 3).join(" · ")
          : "";
        throw new Error(`${data.error || "The course could not be created."}${providerDiagnostic ? ` Provider diagnostic: ${providerDiagnostic}.` : ""}${issueDiagnostic ? ` Validation diagnostic: ${issueDiagnostic}.` : ""}`);
      }
      if (typeof data.courseId !== "string" || !data.courseId) throw new Error("The course was saved, but its destination was missing. Retry to reopen the saved course.");
      setGenerationProgress(100);
      setGenerationStage("Your course map is ready");
      window.dispatchEvent(new Event("filosage:courses-changed"));
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      window.location.assign(`/course/${encodeURIComponent(topic.trim())}?id=${encodeURIComponent(data.courseId)}`);
    } catch (creationError) {
      setError(creationError instanceof Error ? creationError.message : "The course could not be created.");
      setSubmitting(false);
      setGenerationProgress(0);
    }
  };

  if (!canCreateCourses) {
    return <AppShell><div className="center-state"><Sparkles size={26} /><h1>Create a private course for your goal.</h1><p>Filosage Plus and Pro include private AI-assisted course creation with clearly stated monthly limits.</p><Link className="button button-primary" href="/pricing">Compare plans</Link></div></AppShell>;
  }

  if (account?.courseCapacity?.remaining === 0) {
    return <AppShell><div className="center-state"><Sparkles size={26} /><h1>Your current plan already has its active private course.</h1><p>Your existing work remains available. Delete a course you no longer need or upgrade to Pro before creating another.</p><div className="state-actions"><Link className="button button-secondary" href="/library">Open my courses</Link><Link className="button button-primary" href="/pricing">Compare plans</Link></div></div></AppShell>;
  }

  const plannedHours = Math.max(1, Math.round((weeklyMinutes * targetWeeks) / 60));
  const weeklySessions = Math.max(1, Math.round(weeklyMinutes / 30));
  const outcomeComplete = topic.trim().length >= 2 && Boolean(goal.trim());
  const paceComplete = Boolean(background.trim() && level && targetWeeks >= 2 && weeklyMinutes >= 30);
  const teachingComplete = Boolean(courseStyle);
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
            <h1>Build toward a real outcome.</h1>
            <p>Give Filosage the result you need, the time you have, and how you learn best. Filosage researches reputable released sources, builds a private course map, and checks lesson claims automatically.</p>
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
                      <input id="course-topic" name="topic" value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={120} placeholder="e.g. Systems thinking for product decisions" required />
                      <div className={styles.examples} aria-label="Topic examples">
                        {examples.map((example) => <button type="button" key={example} onClick={() => setTopic(example)}>{example}</button>)}
                      </div>
                    </div>

                    <div className={styles.field}>
                      <label htmlFor="course-goal"><span>What will you be able to do?</span><small>{goal.length}/500</small></label>
                      <textarea id="course-goal" name="goal" value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={500} rows={4} placeholder="Analyze a real situation, identify the important forces, and explain a defensible recommendation." required />
                      <p className={styles.fieldHint}>Use an action such as analyze, build, diagnose, design, or explain.</p>
                    </div>

                    <div className={styles.field}>
                      <label htmlFor="course-artifact"><span>What work will prove it?</span><small>Recommended · {artifactPreference.length}/500</small></label>
                      <textarea id="course-artifact" name="artifactPreference" value={artifactPreference} onChange={(event) => setArtifactPreference(event.target.value)} maxLength={500} rows={3} placeholder="A decision memo, working model, experiment plan, portfolio piece, or another concrete artifact." />
                    </div>

                    <details className={styles.optionalDetails}>
                      <summary><span><strong>Add work context</strong><small>Optional · makes examples more relevant</small></span><Plus size={17} /></summary>
                      <div className={styles.optionalContent}>
                        <div className={styles.field}>
                          <label htmlFor="course-application"><span>Where will you use this?</span><small>{application.length}/500</small></label>
                          <textarea id="course-application" name="application" value={application} onChange={(event) => setApplication(event.target.value)} maxLength={500} rows={3} placeholder="For product strategy reviews and clearer decisions with my team." />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="course-scenario"><span>Should the course follow a specific situation?</span><small>{scenarioPreference.length}/500</small></label>
                          <textarea id="course-scenario" name="scenarioPreference" value={scenarioPreference} onChange={(event) => setScenarioPreference(event.target.value)} maxLength={500} rows={3} placeholder="A realistic project or decision that becomes more complex as the course progresses." />
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
                      <textarea id="course-background" name="background" value={background} onChange={(event) => setBackground(event.target.value)} maxLength={500} rows={4} placeholder="I understand the basic vocabulary but have not yet applied it to a real case." required />
                      <p className={styles.fieldHint}>Mention adjacent skills, tools, or concepts Filosage can build on.</p>
                    </div>

                    <div className={styles.scheduleGrid}>
                      <div className={styles.field}>
                        <label htmlFor="course-level"><span>Starting level</span></label>
                        <select id="course-level" name="level" value={level} onChange={(event) => setLevel(event.target.value as typeof level)} required><option>Foundations</option><option>Intermediate</option><option>Advanced</option></select>
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="target-weeks"><span>Target length</span></label>
                        <select id="target-weeks" name="targetWeeks" value={targetWeeks} onChange={(event) => setTargetWeeks(Number(event.target.value))} required><option value={2}>2 weeks</option><option value={4}>4 weeks</option><option value={6}>6 weeks</option><option value={8}>8 weeks</option></select>
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="weekly-minutes"><span>Weekly study time</span></label>
                        <select id="weekly-minutes" name="weeklyMinutes" value={weeklyMinutes} onChange={(event) => setWeeklyMinutes(Number(event.target.value))} required><option value={60}>1 hour</option><option value={120}>2 hours</option><option value={180}>3 hours</option><option value={300}>5 hours</option></select>
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

                    <div className={styles.field}>
                      <label htmlFor="course-language"><span>Course language</span><small>Editable default</small></label>
                      <input id="course-language" name="language" value={language} onChange={(event) => setLanguage(event.target.value)} minLength={2} maxLength={80} autoComplete="language" required />
                      <p className={styles.fieldHint}>Use a specific language or bilingual pairing, such as English, Spanish, or Greek and English.</p>
                    </div>

                    <div className={styles.reviewNote}>
                      <ShieldCheck size={18} />
                      <div><strong>Research and source validation are automatic.</strong><span>Filosage searches released material from reputable institutions, verifies API-cited deep links, and checks each lesson claim against its evidence before saving.</span></div>
                    </div>

                    <div className={styles.reviewNote}>
                      <CheckCircle2 size={18} />
                      <div><strong>Your first result is a private course map.</strong><span>Lessons become available in sequence after automatic source and claim-support checks pass.</span></div>
                    </div>
                  </section>
                )}
              </fieldset>

              {submitting && (
                <div className={styles.generationProgress}>
                  <div><span role="status" aria-live="polite" aria-atomic="true">{generationStage}</span><strong aria-hidden="true">{generationProgress}%</strong></div>
                  <div className={styles.progressTrack} role="progressbar" aria-label="Course creation is in progress"><span style={{ transform: `scaleX(${generationProgress / 100})` }} /></div>
                  <p>Researching, generating, and checking the private course against its cited evidence.</p>
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
              <div><dt>Language</dt><dd>{language}</dd></div>
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
