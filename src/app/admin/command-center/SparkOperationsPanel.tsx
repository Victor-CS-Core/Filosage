"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Activity, AlertTriangle, Bot, CircleDollarSign, Gauge, LoaderCircle, RefreshCw, Save, ShieldAlert } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import styles from "./spark-operations.module.css";

type SparkMode = "live" | "conserve" | "practice_only" | "halted";
type Category = "tutoring" | "preparation" | "assessment" | "summary" | "embedding";

interface SparkOperationsState {
  month: {
    month_key: string;
    configuration_version: number;
    ai_cap_microusd: number;
    committed_microusd: number;
    reserved_microusd: number;
    unknown_microusd: number;
    mode: SparkMode;
    live_ai_enabled: number;
    preparation_enabled: number;
    concurrency_limit: number;
  };
  categories: Array<{
    category: Category;
    cap_microusd: number;
    committed_microusd: number;
    reserved_microusd: number;
    unknown_microusd: number;
  }>;
  usage: Array<{
    request_id: string;
    category: Category;
    model: string;
    status: string;
    reserved_microusd: number;
    actual_microusd: number | null;
    owner_pseudonym: string;
    input_tokens: number | null;
    cached_input_tokens: number | null;
    output_tokens: number | null;
    created_at: string;
    updated_at: string;
  }>;
  runtime: {
    sparkEnabled: boolean;
    liveAiEnabled: boolean;
    prepareEnabled: boolean;
    semanticRetrievalEnabled: boolean;
    model: string;
    provider: string;
    priceVersion: string;
    limits: { maximumInputTokens: number; maximumOutputTokens: number; globalConcurrency: number; turnsPerMinute: number };
  };
  preparation: {
    total: number;
    ready: number;
    pending: number;
    failed: number;
    truncated: boolean;
    recent: Array<{ id: string; courseId: string; lessonId: string; state: string; attempts: number; errorCode: string | null; updatedAt: string }>;
  };
}

const CATEGORY_LABELS: Record<Category, string> = {
  tutoring: "Tutoring",
  preparation: "Preparation",
  assessment: "Assessment",
  summary: "Summaries",
  embedding: "Embeddings",
};

function dollars(micros: number) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(micros / 1_000_000);
}

function date(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export default function SparkOperationsPanel() {
  const { user } = useAuth();
  const [data, setData] = useState<SparkOperationsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const request = useCallback(async (init?: RequestInit) => {
    if (!user) throw new Error("Owner access is required.");
    const token = await user.getIdToken();
    const response = await fetch("/api/admin/spark/budget", {
      cache: "no-store",
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...init?.headers },
    });
    const body = await response.json().catch(() => ({})) as SparkOperationsState & { error?: string };
    if (!response.ok) throw new Error(body.error ?? "Spark operations could not be loaded.");
    return body;
  }, [user]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await request());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Spark operations could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data) return;
    const form = new FormData(event.currentTarget);
    const mode = String(form.get("mode")) as SparkMode;
    if (mode === "halted" && data.month.mode !== "halted" && !window.confirm("Halt all new Spark AI budget admission? Saved lessons and deterministic practice will remain available.")) return;
    const categoryCaps = Object.fromEntries((Object.keys(CATEGORY_LABELS) as Category[]).map((category) => [category, Math.round(Number(form.get(category)) * 1_000_000)])) as Record<Category, number>;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await request({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          liveAiEnabled: form.get("liveAiEnabled") === "on",
          preparationEnabled: form.get("preparationEnabled") === "on",
          concurrencyLimit: Number(form.get("concurrencyLimit")),
          aiCapMicros: Math.round(Number(form.get("aiCap")) * 1_000_000),
          categoryCaps,
          reason: String(form.get("reason") ?? "").trim(),
        }),
      });
      setMessage("Spark budget control saved with an owner audit record.");
      await load();
      event.currentTarget.reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Spark budget control could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <section className={styles.panel} aria-busy="true"><div className={styles.loading}><LoaderCircle className="spin" size={20} /> Loading Spark operations</div></section>;
  if (!data) return <section className={styles.panel}><p className={styles.error} role="alert"><AlertTriangle size={17} />{error}</p><button className={styles.secondaryButton} type="button" onClick={() => void load()}><RefreshCw size={16} />Retry</button></section>;

  const exposure = data.month.committed_microusd + data.month.reserved_microusd + data.month.unknown_microusd;
  const exposureRatio = data.month.ai_cap_microusd ? Math.min(1, exposure / data.month.ai_cap_microusd) : 0;
  const unknownUsage = data.usage.filter((item) => item.status === "unknown");
  const categoryById = new Map(data.categories.map((category) => [category.category, category]));
  return (
    <section className={styles.panel} aria-labelledby="spark-operations-title">
      <header className={styles.header}><div><span><Bot size={18} /> Spark</span><h3 id="spark-operations-title">Budget and runtime authority</h3><p>Atomic D1 exposure, preparation health, model state, and audited admission controls.</p></div><button className={styles.iconButton} type="button" aria-label="Refresh Spark operations" title="Refresh Spark operations" disabled={loading || saving} onClick={() => void load()}><RefreshCw className={loading ? "spin" : ""} size={17} /></button></header>

      <div className={styles.metrics}>
        <div><CircleDollarSign size={18} /><span><small>AI exposure</small><strong>{dollars(exposure)} / {dollars(data.month.ai_cap_microusd)}</strong></span></div>
        <div><Gauge size={18} /><span><small>Admission mode</small><strong>{data.month.mode.replace("_", " ")}</strong></span></div>
        <div><Activity size={18} /><span><small>Preparation</small><strong>{data.preparation.ready} ready · {data.preparation.failed} failed</strong></span></div>
        <div><Bot size={18} /><span><small>Model</small><strong>{data.runtime.model}</strong></span></div>
      </div>
      <div className={styles.exposureTrack} role="progressbar" aria-label="Spark AI budget exposure" aria-valuemin={0} aria-valuemax={data.month.ai_cap_microusd} aria-valuenow={exposure}><span style={{ transform: `scaleX(${exposureRatio})` }} /></div>

      <div className={styles.runtimeFlags} aria-label="Spark environment flags">
        <span className={data.runtime.sparkEnabled ? styles.enabled : ""}>Workspace {data.runtime.sparkEnabled ? "enabled" : "off"}</span>
        <span className={data.runtime.liveAiEnabled ? styles.enabled : ""}>Live AI {data.runtime.liveAiEnabled ? "enabled" : "off"}</span>
        <span className={data.runtime.prepareEnabled ? styles.enabled : ""}>Preparation {data.runtime.prepareEnabled ? "enabled" : "off"}</span>
        <span className={data.runtime.semanticRetrievalEnabled ? styles.enabled : ""}>Semantic retrieval {data.runtime.semanticRetrievalEnabled ? "enabled" : "off"}</span>
      </div>

      {(error || message) && <p className={error ? styles.error : styles.success} role={error ? "alert" : "status"}>{error ? <AlertTriangle size={16} /> : <CheckIcon />}{error ?? message}</p>}

      <div className={styles.layout}>
        <form className={styles.controls} onSubmit={save} key={data.month.configuration_version}>
          <header><ShieldAlert size={18} /><div><h4>Admission controls</h4><p>Changes cannot reduce a cap below current exposure.</p></div></header>
          <div className={styles.formGrid}>
            <label>Mode<select name="mode" defaultValue={data.month.mode}><option value="live">Live</option><option value="conserve">Conserve</option><option value="practice_only">Practice only</option><option value="halted">Halted</option></select></label>
            <label>Concurrent calls<input name="concurrencyLimit" type="number" min={1} max={16} defaultValue={data.month.concurrency_limit} required /></label>
            <label>AI cap, USD<input name="aiCap" type="number" min={0} max={17} step="0.01" defaultValue={data.month.ai_cap_microusd / 1_000_000} required /></label>
          </div>
          <fieldset><legend>Operational kill switches</legend><div className={styles.switchGrid}><label><input name="liveAiEnabled" type="checkbox" defaultChecked={data.month.live_ai_enabled === 1} />Allow live AI admission</label><label><input name="preparationEnabled" type="checkbox" defaultChecked={data.month.preparation_enabled === 1} />Allow lesson preparation</label></div></fieldset>
          <fieldset><legend>Category caps, USD</legend><div className={styles.categoryGrid}>{(Object.keys(CATEGORY_LABELS) as Category[]).map((category) => <label key={category}>{CATEGORY_LABELS[category]}<input name={category} type="number" min={0} step="0.01" defaultValue={(categoryById.get(category)?.cap_microusd ?? 0) / 1_000_000} required /></label>)}</div></fieldset>
          <label>Audit reason<textarea name="reason" minLength={8} maxLength={500} rows={3} placeholder="Why is this budget control changing?" required /></label>
          <button className={styles.primaryButton} type="submit" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}Save audited control</button>
        </form>

        <div className={styles.health}>
          <section><header><h4>Model health</h4><span className={unknownUsage.length ? styles.warning : styles.healthy}>{unknownUsage.length ? `${unknownUsage.length} unknown` : "Settled"}</span></header><dl><div><dt>Provider</dt><dd>{data.runtime.provider}</dd></div><div><dt>Price sheet</dt><dd>{data.runtime.priceVersion}</dd></div><div><dt>Output bound</dt><dd>{data.runtime.limits.maximumOutputTokens} tokens</dd></div><div><dt>Turn rate</dt><dd>{data.runtime.limits.turnsPerMinute}/min</dd></div></dl></section>
          <section><header><h4>Preparation queue</h4><span>{data.preparation.pending} pending</span></header>{data.preparation.recent.length ? <ul>{data.preparation.recent.slice(0, 8).map((job) => <li key={job.id}><span><strong>{job.lessonId}</strong><small>{job.state}{job.errorCode ? ` · ${job.errorCode}` : ""}</small></span><time dateTime={job.updatedAt}>{date(job.updatedAt)}</time></li>)}</ul> : <p>No preparation jobs are recorded.</p>}</section>
        </div>
      </div>

      <div className={styles.usage}><header><h4>Recent metered usage</h4><span>Latest {data.usage.length} reservations</span></header><div><table><thead><tr><th>Time</th><th>User</th><th>Category</th><th>Status</th><th>Tokens in / cached / out</th><th>Model</th><th>Cost / reserve</th></tr></thead><tbody>{data.usage.slice(0, 20).map((item) => <tr key={item.request_id}><td>{date(item.created_at)}</td><td><code>{item.owner_pseudonym.slice(0, 10)}</code></td><td>{CATEGORY_LABELS[item.category]}</td><td><span className={item.status === "unknown" ? styles.warning : ""}>{item.status}</span></td><td>{item.input_tokens ?? "—"} / {item.cached_input_tokens ?? "—"} / {item.output_tokens ?? "—"}</td><td>{item.model}</td><td>{dollars(item.actual_microusd ?? item.reserved_microusd)}</td></tr>)}</tbody></table></div></div>
    </section>
  );
}

function CheckIcon() {
  return <Activity size={16} />;
}