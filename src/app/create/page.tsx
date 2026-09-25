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
import { learnerRequest, readLearnerStorage, writeLearnerStorage, removeLearnerStorage,
  learnerSessionSnapshot, isCurrentLearnerSession } from "@/lib/learner-storage";
import { retainCreationIdentity, type CreationIdentity } from "@/lib/course-creation-identity";
import { createClientId } from "@/lib/browser-compat";
import { trackProductEvent } from "@/lib/product-analytics";
import { courseLanguageModeFor } from "@/lib/product-events";
import styles from "./create.module.css";

const examples = [
  "Prepare for a calculus exam",
  "Build a personal budgeting model",
  "Create a portfolio accessibility audit",
  "Run a causal analysis for a product decision",
];

const courseStyles = [
  { value: "Balanced", title: "Balanced", description: "Move between concise explanations, worked examples, and practice." },
  { value: "Concept-first", title: "Concept-first", description: "Build a durable mental model before applying it to realistic situations." },
  { value: "Project-led", title: "Project-led", description: "Use one concrete final project to organize the learning sequence." },
] as const;

const steps = [
  { label: "Outcome", description: "Define success", icon: Target },
  { label: "Pace", description: "Fit your week", icon: Clock3 },
  { label: "Teaching plan", description: "Shape the course", icon: FileCheck2 },
] as const;

type CourseCreationResponse = {
  courseId?: string;
  admitted?: false;
  operationId?: string;
  status?: "running" | "pending" | "completed" | "failed";
  stage?: string;
  resultId?: string;
  topic?: string;
  code?: string;
  retryAt?: string;
  recovery?: string;
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

const GENERATION_CLIENT_REQUEST_MS = 170_000;

export default function CreateCoursePage() {
  const { user } = useAuth();
  const generation = user && "accountGeneration" in user ? String(user.accountGeneration) : "legacy";
  return <CreateCourseForm key={`${user?.uid ?? "anonymous"}:${generation}`} />;
}

function CreateCourseForm() {
  const { user, canCreateCourses, account, refreshAccount } = useAuth();
  const [activeStep, setActiveStep] = useState(0);
  const [visitedSteps, setVisitedSteps] = useState([true, false, false]);
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [application, setApplication] = useState("");
  const [background, setBackground] = useState("");
  const [constraints, setConstraints] = useState("");
  const [exclusions, setExclusions] = useState("");
  const [artifactPreference, setArtifactPreference] = useState("");
  const [scenarioPreference, setScenarioPreference] = useState("");
  const [language, setLanguage] = useState("English");
  const [level, setLevel] = useState<"Foundations" | "Intermediate" | "Advanced">("Foundations");
  const [weeklyMinutes, setWeeklyMinutes] = useState(120);
  const [targetWeeks, setTargetWeeks] = useState(4);
  const [courseStyle, setCourseStyle] = useState<(typeof courseStyles)[number]["value"]>("Balanced");
  const [submitting, setSubmitting] = useState(false);
  const [generationStage, setGenerationStage] = useState("Researching and planning your course");
  const [error, setError] = useState<string | null>(null);
  const requestIdentityRef = useRef<CreationIdentity | null>(null);
  const [recoverable, setRecoverable] = useState<CourseCreationResponse | null>(null);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [recoveryLoadFailed, setRecoveryLoadFailed] = useState(false);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    requestIdentityRef.current = null;
    if (!user) return;
    const session = learnerSessionSnapshot(user.uid);
    const stored = readLearnerStorage<CreationIdentity>(user.uid, "generation-operation");
    queueMicrotask(() => {
      if (!isCurrentLearnerSession(session)) return;
      if (stored?.key && stored.signature) {
        requestIdentityRef.current = stored;
        setRecoverable({ operationId: stored.operationId, status: "pending", stage: "Check your saved course request" });
      }
    });
    void learnerRequest(user, "/api/generation-operations", { signal: AbortSignal.timeout(10_000) })
      .then(async (response) => {
        if (!response.ok) throw new Error("Saved course requests could not be checked. You can retry the check.");
        const data = await response.json() as { operations?: CourseCreationResponse[] };
        if (!isCurrentLearnerSession(session)) return;
        const saved = data.operations?.find((item) => item.operationId === stored?.operationId)
          ?? data.operations?.find((item) => item.status === "running" || item.status === "pending");
        if (saved) setRecoverable(saved);
      }).catch((failure: unknown) => {
        if (isCurrentLearnerSession(session)) { setRecoveryLoadFailed(true); setError(failure instanceof Error ? failure.message : "Saved course requests could not be checked."); }
      }).finally(() => { if (isCurrentLearnerSession(session)) setRecoveryChecked(true); });
  }, [user]);

  useEffect(() => {
    if (!submitting || !user) return;
    const session = learnerSessionSnapshot(user.uid);
    const timer = window.setInterval(() => {
      const operationId = requestIdentityRef.current?.operationId ?? recoverable?.operationId;
      if (!operationId) return;
      void learnerRequest(user, `/api/generation-operations/${operationId}`, { signal: AbortSignal.timeout(5_000) })
        .then(async (response) => {
          if (!response.ok) return;
          const state = await response.json() as CourseCreationResponse;
          if (isCurrentLearnerSession(session) && state.stage) setGenerationStage(state.stage);
        }).catch(() => { /* The active request still supplies its final status. */ });
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [submitting, user, recoverable?.operationId]);

  const goToStep = (nextStep: number) => {
    setVisitedSteps((current) => current.map((visited, index) => visited || index === nextStep));
    setActiveStep(nextStep);
    window.requestAnimationFrame(() => stepHeadingRef.current?.focus());
  };

  const runCreation = async (identity: CreationIdentity | null, operationId?: string) => {
    if (!user) return;
    const session = learnerSessionSnapshot(user.uid);
    const assertCurrent = () => { if (!isCurrentLearnerSession(session)) throw new Error("Your account session changed. Reopen this request from the current account."); };
    // Establish recovery before dispatch: even the first response can be lost.
    setRecoverable((current) => current ?? { operationId, status: "pending", stage: "Confirming your saved course request" });
    setSubmitting(true);
    setGenerationStage("Checking your course request");
    setError(null);
    const startedAt = Date.now();
    try {
      for (let wave = 0; wave < 12 && Date.now() - startedAt < 20 * 60_000; wave += 1) {
        assertCurrent();
        const endpoint = operationId ? `/api/generation-operations/${operationId}` : "/api/generate-course";
        const response = await learnerRequest(user, endpoint, {
          method: "POST", headers: {
            "Content-Type": "application/json",
            ...(identity ? { "Idempotency-Key": identity.key } : {}),
            ...(account?.isOwner ? { "x-filosage-model-evaluation": "1" } : {}),
          },
          body: operationId ? undefined : identity?.signature,
          signal: AbortSignal.timeout(GENERATION_CLIENT_REQUEST_MS),
        });
        const responseText = await response.text();
        assertCurrent();
        let data: CourseCreationResponse;
        try { data = JSON.parse(responseText) as CourseCreationResponse; }
        catch { throw new Error("The service response could not be confirmed. Check the saved request to recover its current state."); }
        operationId = data.operationId ?? operationId;
        if (identity && operationId) {
          identity = { ...identity, operationId };
          requestIdentityRef.current = identity;
          writeLearnerStorage(user.uid, "generation-operation", "all", identity);
        }
        if (data.stage) setGenerationStage(data.stage);
        if (operationId) setRecoverable({ ...data, operationId });
        if (response.status === 202) continue;
        if (!response.ok) {
          if (data.admitted === false && !operationId) {
            removeLearnerStorage(user.uid, "generation-operation");
            requestIdentityRef.current = null;
            setRecoverable(null);
          }
          const issues = account?.isOwner ? data.evaluation?.issues?.slice(0, 3).join(" · ") : undefined;
          throw new Error(`${data.error || "The course could not be confirmed. Check its saved status."}${issues ? ` Validation diagnostic: ${issues}` : ""}`);
        }
        const courseId = data.courseId ?? data.resultId;
        if (!courseId) throw new Error("The course destination is missing. Check this saved request to reopen it.");
        setGenerationStage("Your outline is ready.");
        removeLearnerStorage(user.uid, "generation-operation");
        requestIdentityRef.current = null;
        window.dispatchEvent(new Event("filosage:courses-changed"));
        const courseTopic = data.topic ?? recoverable?.topic ?? (identity ? (JSON.parse(identity.signature) as { topic?: string }).topic : undefined) ?? topic;
        assertCurrent();
        window.location.assign(`/course/${encodeURIComponent(courseTopic || "Course")}?id=${encodeURIComponent(courseId)}`);
        return;
      }
      throw new Error("Your completed stages are saved. Resume this request when you are ready to continue.");
    } catch (creationError) {
      if (isCurrentLearnerSession(session)) {
        setError(creationError instanceof Error ? creationError.message : "The course could not be confirmed. Check its saved status.");
        setSubmitting(false);
      }
    }
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !canCreateCourses || account?.courseCredits?.balance === 0 || !topic.trim() || !goal.trim() || !background.trim()) return;
    const requestBody = { topic, goal, application, background, constraints, exclusions, artifactPreference, scenarioPreference, level, weeklyMinutes, targetWeeks, courseStyle, language };
    const signature = JSON.stringify(requestBody);
    const identity = retainCreationIdentity(requestIdentityRef.current, signature, createClientId);
    requestIdentityRef.current = identity;
    writeLearnerStorage(user.uid, "generation-operation", "all", identity);
    trackProductEvent("course_creation_started", { route: "/create", courseLanguageMode: courseLanguageModeFor(language) });
    await runCreation(identity);
  };

  const endRequest = async () => {
    if (!user || !recoverable?.operationId) return;
    const session = learnerSessionSnapshot(user.uid);
    try {
      const response = await learnerRequest(user, `/api/generation-operations/${recoverable.operationId}`, { method: "DELETE", signal: AbortSignal.timeout(15_000) });
      const result = await response.json() as CourseCreationResponse;
      if (!isCurrentLearnerSession(session)) return;
      if (!response.ok) throw new Error(result.error || "This request is still running. Check again after its current stage ends.");
      removeLearnerStorage(user.uid, "generation-operation");
      requestIdentityRef.current = null;
      setRecoverable(null);
      setError(null);
      await refreshAccount();
    } catch (failure) { if (isCurrentLearnerSession(session)) setError(failure instanceof Error ? failure.message : "The request could not be ended."); }
  };

  if (recoverable || recoveryLoadFailed || (!recoveryChecked && user)) {
    const completed = recoverable?.status === "completed";
    const failed = recoverable?.status === "failed";
    return <AppShell><div className="center-state">
      <Sparkles size={26} /><h1>{completed ? "Your course is ready to reopen." : failed ? "This course request has ended." : "Continue your saved course request."}</h1>
      <p role="status" aria-live="polite">{submitting ? generationStage : recoverable?.stage ?? "Checking saved course requests…"}</p>
      <p>{failed ? recoverable.recovery ?? "The unused course credit has been restored. You can start a new request." : "Your progress is saved — pick up where you left off and you won't spend another credit."}</p>
      {recoverable?.retryAt && !submitting && <p>The current attempt can be checked again after {new Date(recoverable.retryAt).toLocaleTimeString()}.</p>}
      {error && <p role="alert">{error}</p>}
      <div className="state-actions">
        {recoveryLoadFailed && <button className="button button-primary" onClick={() => window.location.reload()}>Check saved requests again</button>}
        {!failed && !recoveryLoadFailed && <button className="button button-primary" disabled={submitting || !recoverable} onClick={() => void runCreation(requestIdentityRef.current, recoverable?.operationId)}>{submitting ? "Working on the current stage…" : completed ? "Open course" : "Resume course request"}</button>}
        {recoverable?.operationId && !completed && <button className="button button-secondary" disabled={submitting} onClick={() => void endRequest()}>{failed ? "Start a new request" : "Cancel and get my credit back"}</button>}
      </div>
    </div></AppShell>;
  }

  if (!canCreateCourses) {
    return <AppShell><div className="center-state"><Sparkles size={26} /><h1>Create a private course for your goal.</h1><p>Plus and Pro include course credits. One credit builds one complete course: the full outline plus every lesson in it.</p><Link className="button button-primary" href="/pricing">Compare plans</Link></div></AppShell>;
  }

  if (account?.courseCredits?.balance === 0) {
    return <AppShell><div className="center-state"><Sparkles size={26} /><h1>You&apos;re out of course credits for now.</h1><p>Every existing course and all lessons in its approved outline remain available. Wait for the next monthly credit or compare Pro&apos;s larger rollover allowance.</p><div className="state-actions"><Link className="button button-secondary" href="/library">Open my courses</Link><Link className="button button-primary" href="/pricing">Compare plans</Link></div></div></AppShell>;
  }

  const plannedHours = Math.max(1, Math.round((weeklyMinutes * targetWeeks) / 60));
  const weeklySessions = Math.max(1, Math.round(weeklyMinutes / 30));
  const outcomeComplete = topic.trim().length >= 2 && Boolean(goal.trim());
  const paceComplete = Boolean(background.trim() && level && targetWeeks >= 2 && weeklyMinutes >= 30);
  const teachingComplete = Boolean(courseStyle);
  const formReady = outcomeComplete && paceComplete && teachingComplete;
  const contextCount = [application, artifactPreference, scenarioPreference, background, constraints, exclusions].filter((value) => value.trim()).length;
  const stepValidity = [outcomeComplete, paceComplete, teachingComplete];
  const stepComplete = stepValidity.map((valid, index) => valid && visitedSteps[index]);
  const creditBalance = account?.courseCredits?.balance;
  const creditLabel = creditBalance == null
    ? "Course creation available"
    : `${creditBalance} rollover course credit${creditBalance === 1 ? "" : "s"} available`;

  return (
    <AppShell>
      <div className={styles.page}>
        <header className={styles.intro}>
          <div>
            <h1>Build toward a real outcome.</h1>
            <p>Give Filosage the result you need, the time you have, and how you learn best. Filosage researches reputable released sources where available, builds a private outline around the Capability Cycle, and clearly labels any lesson that relies on AI general knowledge.</p>
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
                      <input id="course-topic" name="topic" value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={120} placeholder="e.g. Urban sketching composition" required />
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
                      <summary><span><strong>Add learning context</strong><small>Optional · makes examples more relevant</small></span><Plus size={17} /></summary>
                      <div className={styles.optionalContent}>
                        <div className={styles.field}>
                          <label htmlFor="course-application"><span>Where will you use this?</span><small>{application.length}/500</small></label>
                          <textarea id="course-application" name="application" value={application} onChange={(event) => setApplication(event.target.value)} maxLength={500} rows={3} placeholder="For an exam, personal project, portfolio, creative practice, civic goal, or work decision." />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="course-scenario"><span>Should the course follow a specific situation?</span><small>{scenarioPreference.length}/500</small></label>
                          <textarea id="course-scenario" name="scenarioPreference" value={scenarioPreference} onChange={(event) => setScenarioPreference(event.target.value)} maxLength={500} rows={3} placeholder="A realistic project or decision that becomes more complex as the course progresses." />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="course-constraints"><span>What constraints should the plan respect?</span><small>{constraints.length}/800</small></label>
                          <textarea id="course-constraints" name="constraints" value={constraints} onChange={(event) => setConstraints(event.target.value)} maxLength={800} rows={3} placeholder="One constraint per line, such as: use tools I already have; keep practice sessions under 30 minutes." />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="course-exclusions"><span>What should stay out of scope?</span><small>{exclusions.length}/800</small></label>
                          <textarea id="course-exclusions" name="exclusions" value={exclusions} onChange={(event) => setExclusions(event.target.value)} maxLength={800} rows={3} placeholder="Adjacent topics to defer so this course stays focused." />
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
                      <textarea id="course-background" name="background" value={background} onChange={(event) => setBackground(event.target.value)} maxLength={500} rows={4} placeholder="I understand the basic vocabulary but have not yet applied it in a complete example." required />
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
                      <span>Every course still follows the Capability Cycle: define, activate, practice, receive feedback, transfer, and return. This choice sets the emphasis.</span>
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
                      <div><strong>Research and source validation are automatic.</strong><span>FiloSage looks for trustworthy sources to back up its claims, and lists them for further reading. If trustworthy claim-level sources are scarce, your course is still created without invented citations.</span></div>
                    </div>

                    <div className={styles.reviewNote}>
                      <CheckCircle2 size={18} />
                      <div><strong>Your first result is a private course plan.</strong><span>The outline binds every lesson to one focused win. Source-backed lessons receive automatic claim checks; model-knowledge lessons are labeled and remain citation-free.</span></div>
                    </div>
                  </section>
                )}
              </fieldset>

              {submitting && (
                <div className={styles.generationProgress}>
                  <div><span role="status" aria-live="polite" aria-atomic="true">{generationStage}</span></div>
                  <p>Researching trusted sources and further reading where suitable, planning focused lesson wins, and validating honest evidence labels.</p>
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
              <span><LockKeyhole size={14} /> Private outline</span>
              <h2>{topic.trim() || "Your course takes shape here"}</h2>
              <p>{goal.trim() || "Define a specific outcome and this snapshot will keep the course anchored to it."}</p>
            </div>
            <dl className={styles.snapshotDetails}>
              <div><dt>Starting point</dt><dd>{level}</dd></div>
              <div><dt>Rhythm</dt><dd>{targetWeeks} weeks · {weeklySessions} sessions/week</dd></div>
              <div><dt>Teaching style</dt><dd>{courseStyle}</dd></div>
              <div><dt>Language</dt><dd>{language}</dd></div>
              <div><dt>Evidence</dt><dd>{artifactPreference.trim() || "Add a concrete final project"}</dd></div>
            </dl>
            <div className={styles.snapshotReadiness}>
              <div><strong>{formReady ? "Ready to build" : outcomeComplete ? "Complete the course brief" : "Start with the outcome"}</strong><span>{activeStep + 1} of {steps.length}</span></div>
              <ul>
                <li className={topic.trim() ? styles.ready : ""}><CheckCircle2 size={16} /> Clear capability</li>
                <li className={goal.trim() ? styles.ready : ""}><CheckCircle2 size={16} /> Observable outcome</li>
                <li className={artifactPreference.trim() ? styles.ready : ""}><CheckCircle2 size={16} /> Evidence of skill</li>
              </ul>
              {outcomeComplete && contextCount === 0 && <p>Add one context detail to make the examples feel closer to your goal.</p>}
              {contextCount > 0 && <p>{contextCount} context detail{contextCount === 1 ? "" : "s"} will help tailor the course.</p>}
            </div>
            <div className={styles.creditNote}><Sparkles size={16} /><span><strong>{creditLabel}</strong><small>A credit is reserved only when generation begins.</small></span></div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
