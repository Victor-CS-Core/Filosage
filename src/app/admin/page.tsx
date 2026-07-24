"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Ban,
  BookOpenCheck,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Coins,
  Crown,
  Gauge,
  Globe2,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  TriangleAlert,
  Users,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import type { AdminOverview, AdminUserSummary } from "@/lib/admin-types";

type AdminTab = "overview" | "users" | "ai" | "safety";

const featureLabels = {
  course_outline: "Course outline",
  lesson_generation: "Lesson",
  tutor: "Tutor",
} as const;

const routeLabels: Record<string, string> = {
  "/": "Home",
  "/lesson": "Lesson reader",
  "/course": "Course overview",
  "/library": "Library",
  "/pricing": "Plans",
  "/progress": "Progress",
  "/review": "Review",
  "/create": "Course creation",
  "/profile": "Profile",
  "/other": "Other",
};

function compactNumber(value: number) {
  return new Intl.NumberFormat("en", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
}

function currency(value: number) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD", minimumFractionDigits: value < 1 ? 3 : 2, maximumFractionDigits: value < 1 ? 3 : 2 }).format(value);
}

function shortDate(value?: string, includeTime = false) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en", includeTime
    ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function SeriesBars({
  values,
  label,
  tone = "blue",
}: {
  values: Array<{ date: string; value: number }>;
  label: string;
  tone?: "blue" | "teal";
}) {
  const maximum = Math.max(1, ...values.map((point) => point.value));
  return (
    <div className={`admin-series tone-${tone}`} role="img" aria-label={label}>
      {values.map((point, index) => (
        <span className="admin-series-column" key={point.date} title={`${point.date}: ${point.value}`}>
          <i style={{ height: `${Math.max(point.value ? 5 : 1, (point.value / maximum) * 100)}%` }} />
          {(index === 0 || index === values.length - 1 || (values.length <= 30 && index % 7 === 0)) && (
            <small>{new Date(`${point.date}T12:00:00`).toLocaleDateString("en", { month: "short", day: "numeric" })}</small>
          )}
        </span>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { user, isOwner, loading: authLoading } = useAuth();
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<AdminTab>("overview");
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [suspensionReason, setSuspensionReason] = useState("");
  const [proDuration, setProDuration] = useState<7 | 30 | 90 | "permanent">(30);

  const load = useCallback(async () => {
    if (!user || !isOwner) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/admin/overview?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "The control room could not be loaded.");
      }
      const next = await response.json() as AdminOverview;
      setData(next);
      setSelectedUid((current) => current && next.users.some((candidate) => candidate.uid === current)
        ? current
        : next.users.find((candidate) => !candidate.isOwner)?.uid ?? next.users[0]?.uid ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The control room could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [days, isOwner, user]);

  useEffect(() => {
    if (authLoading) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [authLoading, load]);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!data) return [];
    return data.users.filter((candidate) => !normalized
      || candidate.displayName.toLowerCase().includes(normalized)
      || candidate.email?.toLowerCase().includes(normalized));
  }, [data, query]);
  const selectedUser = data?.users.find((candidate) => candidate.uid === selectedUid) ?? null;
  const selectedRequests = data?.recentGenerations.filter((request) => request.uid === selectedUid).slice(0, 8) ?? [];
  const selectedSafety = data?.safetyEvents.filter((event) => event.uid === selectedUid).slice(0, 6) ?? [];

  const mutateUser = async (
    target: AdminUserSummary,
    body: Record<string, unknown>,
    confirmation?: string,
  ) => {
    if (!user || target.isOwner) return;
    if (confirmation && !window.confirm(confirmation)) return;
    setActionBusy(true);
    setActionMessage(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/admin/users/${encodeURIComponent(target.uid)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The account could not be updated.");
      setActionMessage("Account updated and audit entry recorded.");
      setSuspensionReason("");
      await load();
    } catch (actionError) {
      setActionMessage(actionError instanceof Error ? actionError.message : "The account could not be updated.");
    } finally {
      setActionBusy(false);
    }
  };

  if (authLoading) {
    return <AppShell><div className="center-state"><LoaderCircle className="spin" size={25} /><h1>Verifying owner access</h1></div></AppShell>;
  }
  if (!user || !isOwner) {
    return (
      <AppShell>
        <div className="center-state">
          <ShieldCheck size={28} />
          <p className="overline">Private workspace</p>
          <h1>This page is not available.</h1>
          <p>The control room is restricted to the verified Erudoza owner account.</p>
          <button className="button button-primary" onClick={() => router.push("/")}>Return home</button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="admin-page">
        <header className="admin-header">
          <div>
            <span className="admin-eyebrow"><ShieldCheck size={15} /> Owner workspace</span>
            <h1>Control room</h1>
            <p>Traffic, learning operations, AI capacity, and account safety in one private view.</p>
          </div>
          <div className="admin-header-actions">
            <label>
              <span>Reporting window</span>
              <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </label>
            <button className="button button-secondary" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={loading ? "spin" : ""} size={16} /> Refresh
            </button>
          </div>
        </header>

        <nav className="admin-tabs" aria-label="Control room sections">
          {([
            ["overview", Activity, "Overview"],
            ["users", Users, "Users"],
            ["ai", Bot, "AI operations"],
            ["safety", ShieldCheck, "Safety"],
          ] as const).map(([value, Icon, label]) => (
            <button key={value} className={tab === value ? "is-active" : ""} onClick={() => setTab(value)}>
              <Icon size={16} /> {label}
              {value === "safety" && data?.summary.safetyBlocks ? <span>{data.summary.safetyBlocks}</span> : null}
            </button>
          ))}
        </nav>

        {error && <div className="admin-alert is-error"><TriangleAlert size={18} /><span>{error}</span><button onClick={() => void load()}>Try again</button></div>}
        {loading && !data ? <div className="admin-loading"><span /><span /><span /><span /></div> : null}

        {data && tab === "overview" && (
          <div className="admin-workspace">
            <section className="admin-ledger" aria-label="Operating summary">
              <article><Globe2 size={17} /><span>Page views</span><strong>{compactNumber(data.summary.pageViews)}</strong><small>{days}-day total</small></article>
              <article><Users size={17} /><span>Active learners</span><strong>{compactNumber(data.summary.activeUsers)}</strong><small>{data.summary.totalUsers} accounts</small></article>
              <article><Bot size={17} /><span>AI requests</span><strong>{compactNumber(data.summary.generations)}</strong><small>{data.summary.failedRequests} failed</small></article>
              <article><Gauge size={17} /><span>Tokens</span><strong>{compactNumber(data.summary.inputTokens + data.summary.outputTokens)}</strong><small>{compactNumber(data.summary.cachedInputTokens)} cached input</small></article>
              <article><Coins size={17} /><span>Estimated cost</span><strong>{currency(data.summary.estimatedCostUsd)}</strong><small>{data.budget.percentUsed.toFixed(1)}% monthly capacity</small></article>
              <article className={data.summary.safetyBlocks ? "has-warning" : ""}><ShieldCheck size={17} /><span>Safety blocks</span><strong>{data.summary.safetyBlocks}</strong><small>{data.summary.safetyBlocks ? "Review activity" : "No blocked requests"}</small></article>
            </section>

            <div className="admin-overview-grid">
              <section className="admin-panel admin-engagement-panel">
                <header><div><p className="overline">Learner engagement</p><h2>Completed learning activity</h2></div><span>Based on saved course progress</span></header>
                <div className="admin-engagement-body">
                  <dl>
                    <div><dt>Courses started</dt><dd>{data.summary.coursesStarted}</dd></div>
                    <div><dt>Lessons completed</dt><dd>{data.summary.lessonsCompleted}</dd></div>
                    <div><dt>Study time</dt><dd>{Math.floor(data.summary.studyMinutes / 60)}h {data.summary.studyMinutes % 60}m</dd></div>
                    <div><dt>Retrieval sessions</dt><dd>{data.summary.retrievalSessions}</dd></div>
                    <div><dt>Review sessions</dt><dd>{data.summary.reviewSessions}</dd></div>
                    <div><dt>First-try accuracy</dt><dd>{data.summary.quizAccuracy ? `${data.summary.quizAccuracy}%` : "—"}</dd></div>
                  </dl>
                  <SeriesBars
                    tone="teal"
                    values={data.engagementSeries.map((point) => ({ date: point.date, value: point.lessonsCompleted + point.reviewSessions }))}
                    label={`${data.summary.lessonsCompleted} completed lessons and ${data.summary.reviewSessions} reviews over ${days} days`}
                  />
                </div>
              </section>

              <section className="admin-panel admin-traffic-panel">
                <header><div><p className="overline">Traffic</p><h2>Visits by day</h2></div><span>First-party aggregate</span></header>
                <SeriesBars values={data.trafficSeries.map((point) => ({ date: point.date, value: point.views }))} label={`${data.summary.pageViews} page views over ${days} days`} />
                <div className="admin-route-list">
                  {data.topRoutes.length ? data.topRoutes.map((route) => {
                    const maximum = Math.max(1, data.topRoutes[0]?.views ?? 1);
                    return <div key={route.route}><span>{routeLabels[route.route] ?? route.route}</span><i><b style={{ width: `${(route.views / maximum) * 100}%` }} /></i><strong>{route.views}</strong></div>;
                  }) : <p>No traffic has been recorded for this window yet.</p>}
                </div>
              </section>

              <section className="admin-panel admin-capacity-panel">
                <header><div><p className="overline">AI capacity</p><h2>{data.budget.month}</h2></div><Gauge size={21} /></header>
                <strong>{currency(data.budget.spentUsd + data.budget.reservedUsd)} <small>of {currency(data.budget.limitUsd)}</small></strong>
                <div className="admin-budget-track"><span style={{ width: `${data.budget.percentUsed}%` }} /></div>
                <dl>
                  <div><dt>Settled usage</dt><dd>{currency(data.budget.spentUsd)}</dd></div>
                  <div><dt>In progress</dt><dd>{currency(data.budget.reservedUsd)}</dd></div>
                  <div><dt>Remaining</dt><dd>{currency(Math.max(0, data.budget.limitUsd - data.budget.spentUsd - data.budget.reservedUsd))}</dd></div>
                </dl>
              </section>

              <section className="admin-panel admin-activity-panel">
                <header><div><p className="overline">Generation volume</p><h2>Requests by day</h2></div><button onClick={() => setTab("ai")}>Open AI log <ChevronRight size={14} /></button></header>
                <SeriesBars tone="teal" values={data.generationSeries.map((point) => ({ date: point.date, value: point.courseOutlines + point.lessons + point.tutor }))} label={`${data.summary.generations} AI requests over ${days} days`} />
                <div className="admin-generation-key">
                  <span><i /> Course outlines <strong>{data.generationSeries.reduce((sum, point) => sum + point.courseOutlines, 0)}</strong></span>
                  <span><i /> Lessons <strong>{data.generationSeries.reduce((sum, point) => sum + point.lessons, 0)}</strong></span>
                  <span><i /> Tutor <strong>{data.generationSeries.reduce((sum, point) => sum + point.tutor, 0)}</strong></span>
                </div>
              </section>

              <section className="admin-panel admin-course-log">
                <header><div><p className="overline">Course work</p><h2>Recent courses</h2></div><span>{data.summary.publicCourses} public · {data.summary.privateCourses} private</span></header>
                <div className="admin-compact-list">
                  {data.recentCourses.slice(0, 6).map((course) => (
                    <div key={course.id}>
                      <span className="admin-list-icon"><BookOpenCheck size={16} /></span>
                      <span><strong>{course.topic}</strong><small>{course.userLabel} · {course.lessonCount} lessons</small></span>
                      <em className={course.isPublic ? "status-public" : ""}>{course.isPublic ? "Published" : "Private"}</em>
                    </div>
                  ))}
                  {!data.recentCourses.length && <p>No course work has been recorded yet.</p>}
                </div>
              </section>
            </div>
          </div>
        )}

        {data && tab === "users" && (
          <div className="admin-users-layout">
            <section className="admin-panel admin-user-directory">
              <header>
                <div><p className="overline">Accounts</p><h2>User directory</h2></div>
                <label className="admin-user-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" aria-label="Search users" /></label>
              </header>
              <div className="admin-user-table" role="table" aria-label="Erudoza users">
                <div className="admin-user-table-head" role="row"><span>User</span><span>Access</span><span>Last seen</span><span>Tokens</span><span>Cost</span></div>
                {filteredUsers.map((candidate) => (
                  <button key={candidate.uid} className={selectedUid === candidate.uid ? "is-selected" : ""} onClick={() => { setSelectedUid(candidate.uid); setActionMessage(null); }} role="row">
                    <span className="admin-user-identity">{candidate.photoURL ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={candidate.photoURL} alt="" referrerPolicy="no-referrer" />
                    ) : <i>{candidate.displayName.slice(0, 1).toUpperCase()}</i>}<span><strong>{candidate.isOwner ? "Owner account" : candidate.displayName}</strong><small>{candidate.isOwner ? "Private owner identity" : candidate.email ?? "No email"}</small></span></span>
                    <span><em className={`admin-status status-${candidate.accountStatus}`}>{candidate.accountStatus}</em><small>{candidate.plan === "pro" ? "Pro" : "Free"}</small></span>
                    <span>{shortDate(candidate.lastSeenAt)}</span>
                    <span>{compactNumber(candidate.inputTokens + candidate.outputTokens)}</span>
                    <span>{currency(candidate.costUsd)}</span>
                  </button>
                ))}
                {!filteredUsers.length && <p className="admin-empty-row">No users match this search.</p>}
              </div>
            </section>

            <aside className="admin-panel admin-user-inspector">
              {selectedUser ? (
                <>
                  <header>
                    <div><p className="overline">Account detail</p><h2>{selectedUser.isOwner ? "Owner account" : selectedUser.displayName}</h2><span>{selectedUser.isOwner ? "Verified owner access" : selectedUser.email}</span></div>
                    <em className={`admin-status status-${selectedUser.accountStatus}`}>{selectedUser.accountStatus}</em>
                  </header>
                  <dl className="admin-user-stats">
                    <div><dt>Total tokens</dt><dd>{compactNumber(selectedUser.inputTokens + selectedUser.outputTokens)}</dd></div>
                    <div><dt>Estimated cost</dt><dd>{currency(selectedUser.costUsd)}</dd></div>
                    <div><dt>AI requests</dt><dd>{selectedUser.requestCount}</dd></div>
                    <div><dt>Courses</dt><dd>{selectedUser.courseCount}</dd></div>
                    <div><dt>Safety blocks</dt><dd>{selectedUser.safetyBlocks}</dd></div>
                    <div><dt>Joined</dt><dd>{shortDate(selectedUser.createdAt)}</dd></div>
                  </dl>

                  <section className="admin-inspector-section">
                    <h3>Learning engagement</h3>
                    <div className="admin-feature-usage">
                      <div><span><strong>Completed learning</strong><small>{selectedUser.coursesStarted} courses started · {selectedUser.lessonsCompleted} lessons completed</small></span><span><strong>{Math.floor(selectedUser.studyMinutes / 60)}h {selectedUser.studyMinutes % 60}m</strong><small>tracked study time</small></span></div>
                      <div><span><strong>Retrieval and review</strong><small>{selectedUser.retrievalSessions} retrieval sessions · {selectedUser.reviewSessions} scheduled reviews</small></span><span><strong>{selectedUser.quizAccuracy ? `${selectedUser.quizAccuracy}%` : "—"}</strong><small>first-try accuracy</small></span></div>
                      <div><span><strong>Last learning activity</strong><small>{selectedUser.lastLearningActivityAt ? selectedUser.displayName : "No saved activity"}</small></span><span><strong>{shortDate(selectedUser.lastLearningActivityAt, true)}</strong><small>most recent progress sync</small></span></div>
                    </div>
                  </section>

                  <section className="admin-inspector-section">
                    <h3>Usage by feature</h3>
                    <div className="admin-feature-usage">
                      {selectedUser.featureUsage.length ? selectedUser.featureUsage.map((usage) => (
                        <div key={usage.feature}><span><strong>{featureLabels[usage.feature]}</strong><small>{usage.requests} requests · {compactNumber(usage.cachedInputTokens)} cached input</small></span><span><strong>{compactNumber(usage.inputTokens + usage.outputTokens)} tokens</strong><small>{currency(usage.costUsd)}</small></span></div>
                      )) : <p>No AI usage recorded.</p>}
                    </div>
                  </section>

                  <section className="admin-inspector-section">
                    <h3>Recent generation activity</h3>
                    <div className="admin-mini-log">
                      {selectedRequests.map((request) => <div key={request.id}><Bot size={15} /><span><strong>{featureLabels[request.feature]}</strong><small>{request.model ? `${request.model} · ` : ""}{shortDate(request.createdAt, true)}</small></span><em>{compactNumber(request.inputTokens + request.outputTokens)} tokens</em></div>)}
                      {!selectedRequests.length && <p>No recent requests in the retained activity log.</p>}
                    </div>
                  </section>

                  {!selectedUser.isOwner && (
                    <section className="admin-account-controls">
                      <h3>Account controls</h3>
                      <p>Changes apply to protected features and are recorded in the owner audit log.</p>
                      {selectedUser.accountStatus === "active" ? (
                        <div className="admin-suspend-form">
                          <input value={suspensionReason} onChange={(event) => setSuspensionReason(event.target.value)} placeholder="Reason for pausing access" maxLength={200} />
                          <button className="button button-danger" disabled={actionBusy || suspensionReason.trim().length < 3} onClick={() => void mutateUser(selectedUser, { action: "suspend", reason: suspensionReason.trim() }, `Pause protected access for ${selectedUser.displayName}?`)}><Ban size={15} /> Pause account</button>
                        </div>
                      ) : (
                        <button className="button button-secondary" disabled={actionBusy} onClick={() => void mutateUser(selectedUser, { action: "restore" }, `Restore protected access for ${selectedUser.displayName}?`)}><RotateCcw size={15} /> Restore account</button>
                      )}
                      <div className="admin-pro-controls">
                        <select value={proDuration} onChange={(event) => setProDuration(event.target.value === "permanent" ? "permanent" : Number(event.target.value) as 7 | 30 | 90)}>
                          <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option><option value="permanent">No expiry</option>
                        </select>
                        <button className="button button-primary" disabled={actionBusy} onClick={() => void mutateUser(selectedUser, { action: "grant_pro", duration: proDuration })}><Crown size={15} /> Grant Pro</button>
                        {selectedUser.manualProUntil && <button className="button button-quiet" disabled={actionBusy} onClick={() => void mutateUser(selectedUser, { action: "revoke_pro" }, `Remove the owner-granted Pro access for ${selectedUser.displayName}?`)}>Remove grant</button>}
                      </div>
                      {actionMessage && <p className="admin-action-message" role="status">{actionMessage}</p>}
                    </section>
                  )}

                  {selectedSafety.length > 0 && <section className="admin-inspector-section"><h3>Recent safety activity</h3><div className="admin-mini-log">{selectedSafety.map((event) => <div key={event.id}><TriangleAlert size={15} /><span><strong>{event.categories[0] ?? "Blocked request"}</strong><small>{shortDate(event.createdAt, true)}</small></span><em>{event.stage}</em></div>)}</div></section>}
                </>
              ) : <div className="admin-inspector-empty"><Users size={22} /><p>Select a user to inspect access and usage.</p></div>}
            </aside>
          </div>
        )}

        {data && tab === "ai" && (
          <div className="admin-workspace">
            <section className="admin-ai-summary">
              <div className="admin-capacity-inline"><span><Gauge size={19} /> Monthly capacity</span><strong>{currency(data.budget.spentUsd + data.budget.reservedUsd)} / {currency(data.budget.limitUsd)}</strong><i><b style={{ width: `${data.budget.percentUsed}%` }} /></i><small>{data.budget.percentUsed.toFixed(1)}% used in {data.budget.month}</small></div>
              <div><span>Input tokens</span><strong>{compactNumber(data.summary.inputTokens)}</strong><small>{compactNumber(data.summary.cachedInputTokens)} cached</small></div>
              <div><span>Output tokens</span><strong>{compactNumber(data.summary.outputTokens)}</strong><small>{currency(data.summary.estimatedCostUsd)} estimated</small></div>
              <div><span>Completion rate</span><strong>{data.summary.generations ? `${Math.round(((data.summary.generations - data.summary.failedRequests) / data.summary.generations) * 100)}%` : "—"}</strong><small>{data.summary.failedRequests} failed requests</small></div>
            </section>
            <section className="admin-panel admin-log-panel">
              <header><div><p className="overline">AI ledger</p><h2>Recent generation requests</h2></div><span>Prompts and generated text are not shown here</span></header>
              <div className="admin-log-table">
                <div><span>Time</span><span>User</span><span>Feature</span><span>Status</span><span>Input</span><span>Output</span><span>Cost</span></div>
                {data.recentGenerations.map((request) => <div key={request.id}><span>{shortDate(request.createdAt, true)}</span><span>{request.userLabel}</span><span>{featureLabels[request.feature]}{request.model && <small>{request.model}</small>}</span><span><em className={`admin-status status-${request.status}`}>{request.status}</em></span><span>{compactNumber(request.inputTokens)}<small>{request.cachedInputTokens ? ` ${compactNumber(request.cachedInputTokens)} cached` : ""}</small></span><span>{compactNumber(request.outputTokens)}</span><span>{currency(request.costUsd)}</span></div>)}
                {!data.recentGenerations.length && <p className="admin-empty-row">No AI requests have been recorded.</p>}
              </div>
            </section>
          </div>
        )}

        {data && tab === "safety" && (
          <div className="admin-workspace">
            <section className="admin-safety-posture">
              <article><CheckCircle2 size={18} /><span><strong>Input screening</strong><small>OpenAI moderation plus focused abuse patterns</small></span></article>
              <article><CheckCircle2 size={18} /><span><strong>Output screening</strong><small>Courses and generated lessons are checked before saving</small></span></article>
              <article><CheckCircle2 size={18} /><span><strong>Repeated abuse control</strong><small>Three blocked requests in 24 hours trigger a cooldown</small></span></article>
              <article><CheckCircle2 size={18} /><span><strong>Data minimization</strong><small>Blocked text is replaced with category labels and a one-way fingerprint</small></span></article>
            </section>
            <div className="admin-safety-grid">
              <section className="admin-panel admin-log-panel">
                <header><div><p className="overline">Policy enforcement</p><h2>Blocked requests</h2></div><span>{data.summary.safetyBlocks} in this window</span></header>
                <div className="admin-safety-log">
                  {data.safetyEvents.map((event) => <div key={event.id}><span className="admin-list-icon"><TriangleAlert size={16} /></span><span><strong>{event.categories.join(", ") || "Moderation flagged"}</strong><small>{event.userLabel} · {featureLabels[event.feature]} · {event.stage}</small></span><em>{event.cooldownApplied ? "Cooldown applied" : shortDate(event.createdAt, true)}</em></div>)}
                  {!data.safetyEvents.length && <p>No blocked requests are present in the retained log.</p>}
                </div>
              </section>
              <section className="admin-panel admin-audit-log">
                <header><div><p className="overline">Owner accountability</p><h2>Account action log</h2></div><Clock3 size={18} /></header>
                <div className="admin-compact-list">
                  {data.adminEvents.map((event) => <div key={event.id}><span className="admin-list-icon"><ShieldCheck size={15} /></span><span><strong>{event.action.replaceAll("_", " ")}</strong><small>{event.targetLabel}{event.reason ? ` · ${event.reason}` : ""}</small></span><em>{shortDate(event.createdAt, true)}</em></div>)}
                  {!data.adminEvents.length && <p>No owner account actions have been recorded.</p>}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
