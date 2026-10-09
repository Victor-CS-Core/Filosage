"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import type { SparkAttemptRequest, SparkBlock, SparkManifest, SparkSuggestedAction, SparkTurnResponse } from "@/lib/spark/contracts";
import type { LearnerStorageUser } from "@/lib/learner-storage";
import { learnerRequest } from "@/lib/learner-storage";

interface SparkCourseState {
  featureEnabled: boolean;
  availability: "live" | "practice_only" | "saved_only";
  course: { id: string; topic: string };
  lesson: { id: string; title: string; version: string; content: string };
  currentStage: SparkTurnResponse["stage"];
  manifest: SparkManifest | null;
  preparation: "ready" | "not_prepared";
  evidence: { records: number; demonstrated: number };
  review: { due: boolean; nextReviewAt: string | null };
  entitlement: { questionsRemaining: number | null; resetAt: string | null };
}

interface SparkSession {
  id: string;
  lessonVersion: string;
  stage: SparkTurnResponse["stage"];
}

interface SparkAttemptResult {
  attempt: { id: string };
  grade: {
    state: "demonstrated" | "needs_revision" | "self_checked" | "needs_review";
    gradingMethod: "deterministic" | "self_check" | "pending_ai" | "pending_project_review";
    verified: boolean;
    feedback: string;
  };
  assessmentStatus?: "not_required" | "completed" | "pending";
  assessment?: {
    outcome: "demonstrated" | "needs_revision" | "needs_review";
    summary: string;
    criteria: Array<{ criterionIndex: number; met: boolean; feedback: string }>;
  } | null;
}

interface SparkTurnView {
  id: string;
  message: string;
  response: SparkTurnResponse;
}

interface ApiErrorBody {
  error?: string;
  code?: string;
}

const ACTION_LABELS: Record<SparkSuggestedAction, string> = {
  explain_differently: "Explain differently",
  give_example: "Give an example",
  practice: "Practice this",
  revise: "Help me revise",
  transfer: "Try a new context",
  review: "Review the idea",
};

const STAGE_LABELS: Array<{ id: SparkTurnResponse["stage"]; label: string }> = [
  { id: "define", label: "Focus" },
  { id: "activate", label: "Recall" },
  { id: "practice", label: "Practice" },
  { id: "feedback", label: "Feedback" },
  { id: "transfer", label: "Transfer" },
  { id: "return", label: "Return" },
];

async function apiJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & ApiErrorBody;
  if (!response.ok) throw new Error(body.error || `Spark request failed with ${response.status}.`);
  return body;
}

function locale() {
  return typeof navigator === "undefined" ? "en" : navigator.language || "en";
}

export function useSparkCourseState(user: LearnerStorageUser | null, courseId: string | null, lessonId: string) {
  const [revision, setRevision] = useState(0);
  const requestKey = `${user?.uid ?? "guest"}:${courseId ?? "none"}:${lessonId}:${revision}`;
  const [record, setRecord] = useState<{
    key: string;
    state: SparkCourseState | null;
    error: string | null;
  }>({ key: "", state: null, error: null });

  useEffect(() => {
    if (!user || !courseId) return;
    const controller = new AbortController();
    void learnerRequest(
      user,
      `/api/spark/courses/${encodeURIComponent(courseId)}/state?lessonId=${encodeURIComponent(lessonId)}&locale=${encodeURIComponent(locale())}`,
      { cache: "no-store", signal: controller.signal },
    ).then(apiJson<SparkCourseState>)
      .then((value) => setRecord({ key: requestKey, state: value, error: null }))
      .catch((reason) => {
        if (!controller.signal.aborted) setRecord({ key: requestKey, state: null, error: reason instanceof Error ? reason.message : "Spark is temporarily unavailable." });
      });
    return () => controller.abort();
  }, [courseId, lessonId, requestKey, user]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const current = record.key === requestKey ? record : null;
  return {
    state: user && courseId ? current?.state ?? null : null,
    loading: Boolean(user && courseId && !current),
    error: user && courseId ? current?.error ?? null : null,
    reload,
  };
}

function Provenance({ block }: { block: SparkBlock }) {
  const grounded = block.evidenceStatus === "course_supported" && block.sourceRefs.length > 0;
  return (
    <span className={`spark-provenance ${grounded ? "is-grounded" : ""}`}>
      {grounded ? <Check size={13} /> : <CircleAlert size={13} />}
      {grounded ? "Grounded in this lesson" : "General explanation, not course evidence"}
    </span>
  );
}

function ExplanationBlock({ block }: { block: Extract<SparkBlock, { type: "explanation" }> }) {
  return (
    <section className="spark-block spark-explanation" aria-labelledby={`spark-${block.id}-title`}>
      <header>
        <span>Explanation</span>
        <Provenance block={block} />
      </header>
      <h3 id={`spark-${block.id}-title`}>{block.title}</h3>
      <div className="spark-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{block.text}</ReactMarkdown></div>
      {block.steps?.length ? <ol>{block.steps.map((step) => <li key={step}>{step}</li>)}</ol> : null}
    </section>
  );
}

function StepThroughBlock({ block }: { block: Extract<SparkBlock, { type: "step_through" }> }) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = block.steps[stepIndex];
  return (
    <section className="spark-block spark-step-through" aria-labelledby={`spark-${block.id}-title`}>
      <header><span>Step through</span><Provenance block={block} /></header>
      <h3 id={`spark-${block.id}-title`}>{block.title}</h3>
      <div className="spark-step-track" role="progressbar" aria-label="Explanation progress" aria-valuemin={1} aria-valuemax={block.steps.length} aria-valuenow={stepIndex + 1}>
        <span style={{ transform: `scaleX(${(stepIndex + 1) / block.steps.length})` }} />
      </div>
      <div className="spark-step-content" aria-live="polite">
        <small>Step {stepIndex + 1} of {block.steps.length}</small>
        <strong>{step.label}</strong>
        <p>{step.detail}</p>
      </div>
      <div className="spark-step-actions">
        <button className="button button-secondary button-small" type="button" disabled={stepIndex === 0} onClick={() => setStepIndex((value) => value - 1)}><ChevronLeft size={15} /> Previous</button>
        <button className="button button-secondary button-small" type="button" disabled={stepIndex === block.steps.length - 1} onClick={() => setStepIndex((value) => value + 1)}>Next <ChevronRight size={15} /></button>
      </div>
      <details><summary>Read the text equivalent</summary><p>{block.textEquivalent}</p></details>
    </section>
  );
}

function RangeControl({ id, label, value, minimum, maximum, step, onChange }: {
  id: string;
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="spark-range" htmlFor={id}>
      <span>{label}<output htmlFor={id}>{Number(value.toFixed(4))}</output></span>
      <input id={id} type="range" min={minimum} max={maximum} step={step} value={value} onChange={(event) => onChange(event.currentTarget.valueAsNumber)} />
    </label>
  );
}

function ParameterExplorer({ block }: { block: Extract<SparkBlock, { type: "parameter_explorer" }> }) {
  if (block.template === "neuron-v1") return <NeuronExplorer block={block} />;
  if (block.template === "linear-v1") return <LinearExplorer block={block} />;
  return <CompoundExplorer block={block} />;
}

function ExplorerShell({ block, formula, output, children }: {
  block: Extract<SparkBlock, { type: "parameter_explorer" }>;
  formula: string;
  output: string;
  children: React.ReactNode;
}) {
  return (
    <section className="spark-block spark-explorer" aria-labelledby={`spark-${block.id}-title`}>
      <header><span>Interactive model</span><Provenance block={block} /></header>
      <h3 id={`spark-${block.id}-title`}>{block.title}</h3>
      <p>{block.prompt}</p>
      <div className="spark-explorer-layout">
        <div className="spark-controls">{children}</div>
        <div className="spark-output" aria-live="polite"><small>{formula}</small><strong>{output}</strong></div>
      </div>
    </section>
  );
}

function NeuronExplorer({ block }: { block: Extract<SparkBlock, { type: "parameter_explorer"; template: "neuron-v1" }> }) {
  const [values, setValues] = useState(block.config);
  const total = values.x1 * values.weight1 + values.x2 * values.weight2 + values.bias;
  const output = 1 / (1 + Math.exp(-total));
  const set = (key: "x1" | "x2" | "weight1" | "weight2" | "bias", value: number) => setValues((current) => ({ ...current, [key]: value }));
  return (
    <ExplorerShell block={block} formula="σ(x₁w₁ + x₂w₂ + b)" output={output.toFixed(3)}>
      <RangeControl id={`${block.id}-x1`} label={values.x1Label} value={values.x1} minimum={values.minimum} maximum={values.maximum} step={values.step} onChange={(value) => set("x1", value)} />
      <RangeControl id={`${block.id}-x2`} label={values.x2Label} value={values.x2} minimum={values.minimum} maximum={values.maximum} step={values.step} onChange={(value) => set("x2", value)} />
      <RangeControl id={`${block.id}-w1`} label="Weight 1" value={values.weight1} minimum={values.minimum} maximum={values.maximum} step={values.step} onChange={(value) => set("weight1", value)} />
      <RangeControl id={`${block.id}-w2`} label="Weight 2" value={values.weight2} minimum={values.minimum} maximum={values.maximum} step={values.step} onChange={(value) => set("weight2", value)} />
      <RangeControl id={`${block.id}-bias`} label="Bias" value={values.bias} minimum={values.minimum} maximum={values.maximum} step={values.step} onChange={(value) => set("bias", value)} />
    </ExplorerShell>
  );
}

function LinearExplorer({ block }: { block: Extract<SparkBlock, { type: "parameter_explorer"; template: "linear-v1" }> }) {
  const [values, setValues] = useState(block.config);
  const output = values.slope * values.x + values.intercept;
  const set = (key: "x" | "slope" | "intercept", value: number) => setValues((current) => ({ ...current, [key]: value }));
  return (
    <ExplorerShell block={block} formula={`${values.yLabel} = m${values.xLabel} + b`} output={`${values.yLabel} = ${Number(output.toFixed(3))}`}>
      <RangeControl id={`${block.id}-x`} label={values.xLabel} value={values.x} minimum={values.minimum} maximum={values.maximum} step={values.step} onChange={(value) => set("x", value)} />
      <RangeControl id={`${block.id}-slope`} label="Slope" value={values.slope} minimum={values.minimum} maximum={values.maximum} step={values.step} onChange={(value) => set("slope", value)} />
      <RangeControl id={`${block.id}-intercept`} label="Intercept" value={values.intercept} minimum={values.minimum} maximum={values.maximum} step={values.step} onChange={(value) => set("intercept", value)} />
    </ExplorerShell>
  );
}

function CompoundExplorer({ block }: { block: Extract<SparkBlock, { type: "parameter_explorer"; template: "compound-growth-v1" }> }) {
  const [values, setValues] = useState(block.config);
  const rate = values.ratePercent / 100;
  const growth = values.principal * ((1 + rate) ** values.periods)
    + (rate === 0 ? values.contribution * values.periods : values.contribution * ((((1 + rate) ** values.periods) - 1) / rate));
  const set = (key: "principal" | "ratePercent" | "periods" | "contribution", value: number) => setValues((current) => ({ ...current, [key]: value }));
  return (
    <ExplorerShell block={block} formula="P(1 + r)ᵗ + recurring contributions" output={`${Number(growth.toFixed(2)).toLocaleString()} ${values.currencyLabel}`}>
      <RangeControl id={`${block.id}-principal`} label="Starting amount" value={values.principal} minimum={0} maximum={Math.max(1_000, values.principal * 5)} step={10} onChange={(value) => set("principal", value)} />
      <RangeControl id={`${block.id}-rate`} label="Rate percent" value={values.ratePercent} minimum={-20} maximum={30} step={0.25} onChange={(value) => set("ratePercent", value)} />
      <RangeControl id={`${block.id}-periods`} label="Periods" value={values.periods} minimum={1} maximum={Math.min(600, Math.max(40, block.config.periods * 2))} step={1} onChange={(value) => set("periods", value)} />
      <RangeControl id={`${block.id}-contribution`} label="Contribution" value={values.contribution} minimum={0} maximum={Math.max(500, values.contribution * 5)} step={5} onChange={(value) => set("contribution", value)} />
      <small className="spark-disclaimer">{values.disclaimer}</small>
    </ExplorerShell>
  );
}

function AttemptFeedback({ result }: { result: SparkAttemptResult }) {
  const demonstrated = result.assessment?.outcome === "demonstrated" || result.grade.state === "demonstrated";
  const pending = result.assessmentStatus === "pending" || result.grade.state === "needs_review";
  return (
    <div className={`spark-attempt-feedback ${demonstrated ? "is-demonstrated" : pending ? "is-pending" : "is-revision"}`} role="status" aria-live="polite">
      {demonstrated ? <CircleCheck size={18} /> : pending ? <LoaderCircle size={18} /> : <RefreshCw size={18} />}
      <div>
        <strong>{demonstrated ? "Demonstrated" : pending ? "Saved for assessment" : "Revise and try again"}</strong>
        <p>{result.assessment?.summary ?? result.grade.feedback}</p>
        {result.assessment?.criteria?.length ? (
          <ul>{result.assessment.criteria.map((criterion) => <li key={criterion.criterionIndex}>{criterion.met ? "Met: " : "Revisit: "}{criterion.feedback}</li>)}</ul>
        ) : null}
      </div>
    </div>
  );
}

function TaskShell({ block, result, error, busy, canSubmit, onSubmit, children }: {
  block: Extract<SparkBlock, { taskId: string }>;
  result?: SparkAttemptResult;
  error: string | null;
  busy: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="spark-block spark-task" aria-labelledby={`spark-${block.id}-prompt`}>
      <header><span>Evidence practice</span><Provenance block={block} /></header>
      <h3 id={`spark-${block.id}-prompt`}>{block.prompt}</h3>
      {children}
      {error && <p className="spark-inline-error" role="alert"><CircleAlert size={15} /> {error}</p>}
      {result && <AttemptFeedback result={result} />}
      {(!result || result.grade.state === "needs_revision" || result.assessment?.outcome === "needs_revision") && (
        <button className="button button-primary button-small" type="button" disabled={!canSubmit || busy} onClick={onSubmit}>
          {busy ? <LoaderCircle className="spin" size={15} /> : result ? <RefreshCw size={15} /> : <Check size={15} />}
          {result ? "Commit revision" : "Commit answer"}
        </button>
      )}
    </section>
  );
}

function TaskBlock({ block, result, commit }: {
  block: Extract<SparkBlock, { taskId: string }>;
  result?: SparkAttemptResult;
  commit: (answer: SparkAttemptRequest["answer"], revisesAttemptId?: string) => Promise<void>;
}) {
  const [selection, setSelection] = useState<string[]>([]);
  const [numericValue, setNumericValue] = useState("");
  const [orderedItems, setOrderedItems] = useState(() => block.type === "ordering" ? block.items.map((item) => item.id) : []);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (answer: SparkAttemptRequest["answer"]) => {
    setBusy(true);
    setError(null);
    try {
      await commit(answer, result?.attempt.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This answer could not be committed.");
    } finally {
      setBusy(false);
    }
  };

  if (block.type === "single_choice" || block.type === "multiple_choice") {
    const multiple = block.type === "multiple_choice";
    const minimum = multiple ? block.minimumSelections : 1;
    const maximum = multiple ? block.maximumSelections : 1;
    return (
      <TaskShell block={block} result={result} error={error} busy={busy} canSubmit={selection.length >= minimum && selection.length <= maximum} onSubmit={() => void submit({ kind: "choice", optionIds: selection })}>
        <fieldset className="spark-options"><legend className="sr-only">Answer choices</legend>{block.options.map((option) => {
          const checked = selection.includes(option.id);
          return <label key={option.id}><input type={multiple ? "checkbox" : "radio"} name={block.id} checked={checked} onChange={() => setSelection((current) => multiple ? checked ? current.filter((id) => id !== option.id) : current.length < maximum ? [...current, option.id] : current : [option.id])} /><span>{option.text}</span></label>;
        })}</fieldset>
      </TaskShell>
    );
  }
  if (block.type === "numeric") {
    const parsed = Number(numericValue);
    return (
      <TaskShell block={block} result={result} error={error} busy={busy} canSubmit={numericValue.trim() !== "" && Number.isFinite(parsed)} onSubmit={() => void submit({ kind: "numeric", value: parsed, ...(block.unit ? { unit: block.unit } : {}) })}>
        <label className="spark-numeric" htmlFor={`${block.id}-value`}><span>{block.inputLabel}</span><span><input id={`${block.id}-value`} type="number" min={block.minimum} max={block.maximum} step={block.step ?? "any"} value={numericValue} onChange={(event) => setNumericValue(event.target.value)} />{block.unit && <small>{block.unit}</small>}</span></label>
      </TaskShell>
    );
  }
  if (block.type === "ordering") {
    const itemById = new Map(block.items.map((item) => [item.id, item]));
    const move = (index: number, offset: -1 | 1) => setOrderedItems((current) => {
      const next = [...current];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
    return (
      <TaskShell block={block} result={result} error={error} busy={busy} canSubmit={orderedItems.length === block.items.length} onSubmit={() => void submit({ kind: "ordering", itemIds: orderedItems })}>
        <ol className="spark-ordering">{orderedItems.map((itemId, index) => <li key={itemId}><span>{itemById.get(itemId)?.text}</span><span><button className="icon-button" type="button" aria-label={`Move ${itemById.get(itemId)?.text} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} /></button><button className="icon-button" type="button" aria-label={`Move ${itemById.get(itemId)?.text} down`} disabled={index === orderedItems.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /></button></span></li>)}</ol>
      </TaskShell>
    );
  }
  if (block.type === "matching") {
    return (
      <TaskShell block={block} result={result} error={error} busy={busy} canSubmit={Object.keys(matches).length === block.left.length} onSubmit={() => void submit({ kind: "matching", pairs: block.left.map((item) => ({ leftId: item.id, rightId: matches[item.id] })) })}>
        <div className="spark-matching">{block.left.map((item) => <label key={item.id} htmlFor={`${block.id}-${item.id}`}><span>{item.text}</span><select id={`${block.id}-${item.id}`} value={matches[item.id] ?? ""} onChange={(event) => setMatches((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Choose a match</option>{block.right.map((candidate) => <option key={candidate.id} value={candidate.id} disabled={Object.entries(matches).some(([leftId, rightId]) => leftId !== item.id && rightId === candidate.id)}>{candidate.text}</option>)}</select></label>)}</div>
      </TaskShell>
    );
  }
  if (block.type === "flashcard") {
    return (
      <TaskShell block={block} result={result} error={error} busy={busy} canSubmit={revealed} onSubmit={() => void submit({ kind: "self_check", recalled: true })}>
        <div className="spark-flashcard"><p>{block.front}</p><button className="button button-secondary button-small" type="button" aria-expanded={revealed} onClick={() => setRevealed(true)}>{revealed ? "Answer revealed" : block.revealLabel}</button>{revealed && <p>Use the lesson explanation to check your recall, then record your self-check.</p>}</div>
      </TaskShell>
    );
  }
  const minimum = block.type === "short_response" ? block.minimumCharacters : 1;
  const maximum = block.maximumCharacters;
  return (
    <TaskShell block={block} result={result} error={error} busy={busy} canSubmit={text.trim().length >= minimum && text.trim().length <= maximum} onSubmit={() => void submit({ kind: "text", text: text.trim() })}>
      {block.type === "project_checkpoint" && <ul className="spark-criteria">{block.criteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>}
      <label className="spark-response" htmlFor={`${block.id}-response`}><span>Your response</span><textarea id={`${block.id}-response`} rows={6} maxLength={maximum} value={text} onChange={(event) => setText(event.target.value)} /><small>{text.trim().length} / {maximum} characters{minimum > 1 ? `, minimum ${minimum}` : ""}</small></label>
    </TaskShell>
  );
}

function SparkBlockView({ block, result, commit }: {
  block: SparkBlock;
  result?: SparkAttemptResult;
  commit: (block: Extract<SparkBlock, { taskId: string }>, answer: SparkAttemptRequest["answer"], revisesAttemptId?: string) => Promise<void>;
}) {
  if (block.type === "explanation") return <ExplanationBlock block={block} />;
  if (block.type === "step_through") return <StepThroughBlock block={block} />;
  if (block.type === "parameter_explorer") return <ParameterExplorer block={block} />;
  return <TaskBlock block={block} result={result} commit={(answer, revisesAttemptId) => commit(block, answer, revisesAttemptId)} />;
}

export default function SparkWorkspace({ user, state, canPrepare, reloadState }: {
  user: LearnerStorageUser;
  state: SparkCourseState;
  canPrepare: boolean;
  reloadState: () => void;
}) {
  const [session, setSession] = useState<SparkSession | null>(null);
  const [turns, setTurns] = useState<SparkTurnView[]>([]);
  const [attempts, setAttempts] = useState<Record<string, SparkAttemptResult>>({});
  const [starting, setStarting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [action, setAction] = useState<SparkSuggestedAction>("explain_differently");
  const [suggestedActions, setSuggestedActions] = useState<SparkSuggestedAction[]>(["explain_differently", "give_example", "practice"]);
  const startedKey = useRef<string | null>(null);
  const attemptRequestIds = useRef(new Map<string, string>());
  const turnRequest = useRef<{ fingerprint: string; id: string } | null>(null);
  const startupRequest = useEffectEvent((input: string, init: RequestInit) => learnerRequest(user, input, init));

  useEffect(() => {
    const manifest = state.manifest;
    if (!state.featureEnabled || !manifest || startedKey.current === manifest.id) return;
    startedKey.current = manifest.id;
    const controller = new AbortController();
    setStarting(true);
    setError(null);
    void startupRequest("/api/spark/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId: state.course.id, lessonId: state.lesson.id, lessonVersion: manifest.lessonVersion, locale: locale() }),
      signal: controller.signal,
    }).then(apiJson<{ session: SparkSession; manifest: SparkManifest }>)
      .then(async (value) => {
        setSession(value.session);
        const historyResponse = await startupRequest(`/api/spark/sessions/${encodeURIComponent(value.session.id)}?limit=50`, { cache: "no-store", signal: controller.signal });
        const history = await apiJson<{ turns: Array<{ id: string; user?: { message?: string }; assistant?: SparkTurnResponse }> }>(historyResponse);
        setTurns(history.turns.flatMap((turn) => turn.assistant ? [{ id: turn.id, message: turn.user?.message ?? "", response: turn.assistant }] : []));
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          startedKey.current = null;
          setError(reason instanceof Error ? reason.message : "Spark could not start this lesson.");
        }
      })
      .finally(() => { if (!controller.signal.aborted) setStarting(false); });
    return () => {
      controller.abort();
      if (startedKey.current === manifest.id) startedKey.current = null;
    };
  }, [state.course.id, state.featureEnabled, state.lesson.id, state.manifest, user.accountGeneration, user.uid]);

  const prepare = async () => {
    setPreparing(true);
    setError(null);
    try {
      const response = await learnerRequest(user, `/api/spark/lessons/${encodeURIComponent(state.lesson.id)}/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: state.course.id, lessonId: state.lesson.id, locale: locale() }),
      });
      await apiJson(response);
      reloadState();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Spark preparation could not finish.");
    } finally {
      setPreparing(false);
    }
  };

  const commit = async (block: Extract<SparkBlock, { taskId: string }>, answer: SparkAttemptRequest["answer"], revisesAttemptId?: string) => {
    if (!session || !state.manifest) throw new Error("The Spark session is not ready.");
    const requestKey = `${block.taskVersion}:${revisesAttemptId ?? "first"}`;
    const requestId = attemptRequestIds.current.get(requestKey) ?? crypto.randomUUID();
    attemptRequestIds.current.set(requestKey, requestId);
    const endpoint = revisesAttemptId
      ? `/api/spark/attempts/${encodeURIComponent(revisesAttemptId)}/revisions`
      : "/api/spark/attempts";
    const response = await learnerRequest(user, endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, sessionId: session.id, lessonVersion: state.manifest.lessonVersion, taskId: block.taskId, taskVersion: block.taskVersion, answer }),
    });
    const result = await apiJson<SparkAttemptResult>(response);
    attemptRequestIds.current.delete(requestKey);
    setAttempts((current) => ({ ...current, [block.taskVersion]: result }));
  };

  const sendTurn = async () => {
    const trimmed = message.trim();
    if (!session || !state.manifest || !trimmed || sending) return;
    const fingerprint = `${session.id}:${action}:${trimmed}`;
    const requestId = turnRequest.current?.fingerprint === fingerprint ? turnRequest.current.id : crypto.randomUUID();
    turnRequest.current = { fingerprint, id: requestId };
    setSending(true);
    setError(null);
    try {
      const response = await learnerRequest(user, `/api/spark/sessions/${encodeURIComponent(session.id)}/turns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, lessonVersion: state.manifest.lessonVersion, action, message: trimmed, locale: locale() }),
      });
      const turn = await apiJson<SparkTurnResponse>(response);
      setTurns((current) => [...current, { id: requestId, message: trimmed, response: turn }]);
      setSuggestedActions(turn.suggestedActions.length ? turn.suggestedActions : suggestedActions);
      setMessage("");
      turnRequest.current = null;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Spark could not answer this turn.");
    } finally {
      setSending(false);
    }
  };

  if (!state.manifest) {
    return (
      <section className="spark-empty" aria-labelledby="spark-empty-title">
        <Sparkles size={28} />
        <p className="overline">Spark workspace</p>
        <h2 id="spark-empty-title">This lesson is available to read while Spark prepares.</h2>
        <p>Preparation creates bounded practice from the saved lesson. It does not change the lesson or publish learner work.</p>
        {error && <p className="spark-inline-error" role="alert"><CircleAlert size={15} /> {error}</p>}
        {canPrepare && <button className="button button-primary" type="button" disabled={preparing} onClick={() => void prepare()}>{preparing ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />} Prepare Spark</button>}
      </section>
    );
  }

  const currentStage = turns.at(-1)?.response.stage ?? session?.stage ?? state.currentStage;
  const questionsRemaining = turns.at(-1)?.response.usage.questionsRemaining ?? state.entitlement.questionsRemaining;
  return (
    <section className="spark-workspace" aria-labelledby="spark-workspace-title">
      <header className="spark-workspace-header">
        <div><p className="overline">Spark workspace</p><h2 id="spark-workspace-title">Learn by doing</h2><p>Course-grounded explanations, committed practice, and evidence you can inspect.</p></div>
        <div className="spark-workspace-status"><span><strong>{state.evidence.demonstrated}</strong> demonstrated</span><span><strong>{questionsRemaining ?? "—"}</strong> questions left</span></div>
      </header>

      <ol className="spark-stage-rail" aria-label="Learning cycle">{STAGE_LABELS.map((stage, index) => {
        const currentIndex = STAGE_LABELS.findIndex((candidate) => candidate.id === currentStage);
        return <li key={stage.id} className={index === currentIndex ? "is-current" : index < currentIndex ? "is-complete" : ""} aria-current={index === currentIndex ? "step" : undefined}><span>{index < currentIndex ? <Check size={13} /> : index + 1}</span>{stage.label}</li>;
      })}</ol>

      {state.availability !== "live" && <div className="spark-availability"><CircleAlert size={17} /><p><strong>Saved practice is available.</strong><span>Live tutoring is paused, so nothing here depends on a model response.</span></p></div>}
      {(starting || !session) && <div className="spark-loading" aria-live="polite"><LoaderCircle className="spin" size={19} /> Opening your private Spark session</div>}
      {error && <p className="spark-inline-error" role="alert"><CircleAlert size={15} /> {error}</p>}

      <div className="spark-block-stream">
        {state.manifest.blocks.map((block) => <SparkBlockView key={`manifest-${block.id}`} block={block} result={"taskVersion" in block ? attempts[block.taskVersion] : undefined} commit={commit} />)}
        {turns.map((turn) => (
          <section className="spark-turn" key={turn.id}>
            <div className="spark-learner-turn"><span>You</span><p>{turn.message}</p></div>
            <div className="spark-turn-blocks">{turn.response.blocks.map((block) => <SparkBlockView key={`${turn.id}-${block.id}`} block={block} result={"taskVersion" in block ? attempts[block.taskVersion] : undefined} commit={commit} />)}</div>
          </section>
        ))}
      </div>

      {state.availability === "live" && session && (
        <section className="spark-composer" aria-labelledby="spark-composer-title">
          <div><Bot size={19} /><span><strong id="spark-composer-title">Ask Spark</strong><small>One focused turn, grounded in this lesson when sources support it.</small></span></div>
          <div className="spark-action-options" role="group" aria-label="Response goal">{suggestedActions.map((candidate) => <button key={candidate} type="button" className={action === candidate ? "is-active" : ""} aria-pressed={action === candidate} onClick={() => setAction(candidate)}>{ACTION_LABELS[candidate]}</button>)}</div>
          <label className="sr-only" htmlFor="spark-message">Question for Spark</label>
          <div className="spark-composer-input"><textarea id="spark-message" rows={3} maxLength={1500} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="What should we work through next?" /><button className="button button-primary" type="button" disabled={sending || !message.trim()} onClick={() => void sendTurn()}>{sending ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />} Ask</button></div>
        </section>
      )}
    </section>
  );
}