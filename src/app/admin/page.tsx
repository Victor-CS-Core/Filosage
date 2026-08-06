"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
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
  Flag,
  Gauge,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Target,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import type { AdminOverview, AdminUserSummary } from "@/lib/admin-types";
import { matchesSearchQuery } from "@/lib/search";

type AdminTab = "overview" | "research" | "launch" | "users" | "ai" | "safety";

const featureLabels = {
  course_outline: "Course outline",
  course_banner: "Course banner",
  lesson_generation: "Lesson",
  tutor: "Tutor",
  command_center_draft: "Command-center draft",
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

function ReadinessItem({ ready, label, detail }: { ready: boolean; label: string; detail: string }) {
  return (
    <article className={ready ? "is-ready" : "needs-work"}>
      {ready ? <CheckCircle2 size={18} /> : <TriangleAlert size={18} />}
      <span><strong>{label}</strong><small>{detail}</small></span>
      <em>{ready ? "Ready" : "Action needed"}</em>
    </article>
  );
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
          <i style={{ "--bar-scale": Math.max(point.value ? 5 : 1, (point.value / maximum) * 100) / 100 } as CSSProperties} />
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
    if (!data) return [];
    return data.users.filter((candidate) => matchesSearchQuery(query, [candidate.displayName, candidate.email, candidate.plan, candidate.accountStatus]));
  }, [data, query]);
  const selectedUser = filteredUsers.find((candidate) => candidate.uid === selectedUid) ?? filteredUsers[0] ?? null;
  const selectedRequests = data?.recentGenerations.filter((request) => request.uid === selectedUser?.uid).slice(0, 8) ?? [];
  const selectedSafety = data?.safetyEvents.filter((event) => event.uid === selectedUser?.uid).slice(0, 6) ?? [];

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

  const reviewContentReport = async (reportId: string, status: "resolved" | "dismissed") => {
    if (!user || actionBusy) return;
    setActionBusy(true);
    setActionMessage(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/admin/content-reports/${encodeURIComponent(reportId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The report could not be updated.");
      await load();
    } catch (reviewError) {
      setActionMessage(reviewError instanceof Error ? reviewError.message : "The report could not be updated.");
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
            <p>Traffic, learning operations, commercial readiness, AI capacity, and account safety in one private view.</p>
          </div>
          <div className="admin-header-actions">
            <button className="button button-secondary" onClick={() => router.push("/admin/command-center")}>
              <Bot size={16} /> Agent command center
            </button>
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
            ["research", Target, "Research"],
            ["launch", LockKeyhole, "Launch readiness"],
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
              <article><Target size={17} /><span>Measured visitors</span><strong>{compactNumber(data.growth.uniqueActors)}</strong><small>{data.growth.events} outcome events</small></article>
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
                    <div><dt>First-try accuracy</dt><dd>{data.summary.quizAccuracy ? `${data.summary.quizAccuracy}%` : "N/A"}</dd></div>
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

              <section className="admin-panel admin-funnel-panel">
                <header><div><p className="overline">Outcome funnel</p><h2>From interest to demonstrated value</h2></div><span>{data.growth.uniqueActors} measured visitors</span></header>
                <div className="admin-funnel-list">
                  {data.growth.funnel.map((step, index) => (
                    <div key={step.event}>
                      <span>{index + 1}</span>
                      <p><strong>{step.label}</strong><small>{step.events} event{step.events === 1 ? "" : "s"}</small></p>
                      <b>{step.uniqueActors}</b>
                      <em>{step.conversionFromPrevious == null ? "Baseline" : `${step.conversionFromPrevious}%`}</em>
                    </div>
                  ))}
                </div>
              </section>

              <section className="admin-panel admin-capacity-panel">
                <header><div><p className="overline">AI capacity</p><h2>{data.budget.month}</h2></div><Gauge size={21} /></header>
                <strong>{currency(data.budget.spentUsd + data.budget.reservedUsd)} <small>of {currency(data.budget.limitUsd)}</small></strong>
                <div className="admin-budget-track"><span style={{ width: `${data.budget.percentUsed}%` }} /></div>
                <dl>
                  {data.budget.pools.map((pool) => (
                    <div key={pool.pool}>
                      <dt>{pool.pool === "paid" ? "Pro pool" : pool.pool === "free" ? "Free pool" : "Owner pool"}</dt>
                      <dd>{currency(pool.spentUsd + pool.reservedUsd)} / {currency(pool.limitUsd)}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section className="admin-panel admin-profit-panel">
                <header><div><p className="overline">Unit economics</p><h2>Pro contribution model</h2></div><Coins size={20} /></header>
                <strong>{currency(data.monetization.modeledContributionPerSubscriberUsd)} <small>per subscriber</small></strong>
                <dl>
                  <div><dt>Planned monthly price</dt><dd>{currency(data.monetization.plannedMonthlyPriceUsd)}</dd></div>
                  <div><dt>Payment fee estimate</dt><dd>{currency(data.monetization.paymentFeeEstimateUsd)}</dd></div>
                  <div><dt>AI and infrastructure model</dt><dd>{currency(data.monetization.modeledAiCostPerSubscriberUsd)}</dd></div>
                  <div><dt>Contribution margin</dt><dd>{data.monetization.modeledContributionMarginPercent.toFixed(1)}%</dd></div>
                </dl>
                <p>Checkout remains intentionally disabled until the billing phase.</p>
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

        {data && tab === "research" && (
          <div className="admin-research-layout">
            <section className="admin-panel admin-research-summary">
              <header><div><p className="overline">Phase 1</p><h2>Outcome validation</h2></div><span>{data.growth.events} outcome events</span></header>
              <div className="admin-research-metrics">
                <div><span>Diagnostic to practice</span><strong>{data.outcomeValidation.diagnosticToPracticePercent}%</strong><small>{data.outcomeValidation.firstPracticeCompleters} of {data.outcomeValidation.diagnosticCompleters} diagnostic completers</small></div>
                <div><span>Median time to practice</span><strong>{data.outcomeValidation.medianMinutesToFirstPractice === null ? "Pending" : `${data.outcomeValidation.medianMinutesToFirstPractice}m`}</strong><small>Target: under ten minutes</small></div>
                <div><span>Improved at capstone</span><strong>{data.outcomeValidation.improvementRatePercent}%</strong><small>{data.outcomeValidation.improvedCapstones} of {data.outcomeValidation.comparableCapstones} comparable attempts</small></div>
              </div>
              <div className="admin-acquisition-list">
                <h3>Evidence operations</h3>
                <div><span>Evidence reports viewed</span><strong>{data.outcomeValidation.evidenceReportViews}</strong><small>Learning record usage</small></div>
                <div><span>Open content reports</span><strong>{data.outcomeValidation.openContentReports}</strong><small>Owner review queue</small></div>
                <div><span>Pathway usefulness</span><strong>{data.outcomeValidation.usefulnessPercent}%</strong><small>{data.outcomeValidation.usefulnessResponses} responses · target 70%</small></div>
              </div>
              <div className="admin-acquisition-list">
                <h3>Acquisition evidence</h3>
                {data.growth.acquisition.length ? data.growth.acquisition.map((channel) => (
                  <div key={channel.channel}><span>{channel.channel}</span><strong>{channel.uniqueActors} visitors</strong><small>{channel.courseStarts} course starts</small></div>
                )) : <p>No acquisition evidence has been recorded yet.</p>}
              </div>
            </section>

            <section className="admin-panel admin-research-summary">
              <header><div><p className="overline">Phase 2</p><h2>Retention validation</h2></div><span>{data.retentionValidation.delayedCheckCompleters} delayed-check completers</span></header>
              <div className="admin-research-metrics">
                <div><span>Day 7 retention</span><strong>{data.retentionValidation.day7RetentionPercent}%</strong><small>{data.retentionValidation.day7Returned} of {data.retentionValidation.day7Eligible} eligible · target 35%</small></div>
                <div><span>Day 28 retention</span><strong>{data.retentionValidation.day28RetentionPercent}%</strong><small>{data.retentionValidation.day28Returned} of {data.retentionValidation.day28Eligible} eligible · target 20%</small></div>
                <div><span>Due-review completion</span><strong>{data.retentionValidation.reviewCompletionPercent}%</strong><small>{data.retentionValidation.reviewCompleters} of {data.retentionValidation.reviewDueActors} due-review learners · target 35%</small></div>
              </div>
              <div className="admin-acquisition-list">
                <h3>Behavior quality</h3>
                <div><span>Mission start rate</span><strong>{data.retentionValidation.missionStartPercent}%</strong><small>{data.retentionValidation.missionStarters} of {data.retentionValidation.missionViewers} mission viewers</small></div>
                <div><span>Applied criterion</span><strong>{data.retentionValidation.appliedCriterionPercent}%</strong><small>Target: at least 25% of first-practice learners</small></div>
                <div><span>Delayed checks completed</span><strong>{data.retentionValidation.delayedCheckCompleters}</strong><small>7-day and 28-day evidence checks</small></div>
              </div>
            </section>

            <section className="admin-panel admin-research-protocol">
              <header><div><p className="overline">Evidence gate</p><h2>What must be true before scaling Phase 2</h2></div><span>Engineering is active; market proof is pending</span></header>
              <ol>
                <li><span>01</span><div><strong>Activation</strong><p>At least 50% of qualified diagnostic completers reach first practice, with a median under ten minutes.</p></div></li>
                <li><span>02</span><div><strong>Learning improvement</strong><p>At least 60% of learners with comparable baseline and final capstones improve.</p></div></li>
                <li><span>03</span><div><strong>Usefulness and trust</strong><p>At least 70% find the pathway useful for their stated outcome, while critical factual errors stay below the launch threshold.</p></div></li>
                <li><span>04</span><div><strong>Decision</strong><p>Continue, narrow, or correct the course based on recorded evidence before adding retention complexity.</p></div></li>
              </ol>
            </section>

            <section className="admin-panel admin-research-summary">
              <header><div><p className="overline">Phase 4</p><h2>Controlled launch and referral growth</h2></div><span>Billing activation remains separately locked</span></header>
              <div className="admin-research-metrics">
                <div><span>Referred visitors</span><strong>{data.paidLaunch.referredVisitors}</strong><small>{data.paidLaunch.referralLinksCopied} evidence links copied</small></div>
                <div><span>Referral course starts</span><strong>{data.paidLaunch.referralToCoursePercent}%</strong><small>{data.paidLaunch.referredCourseStarts} starts from referred visitors</small></div>
                <div><span>Active subscribers</span><strong>{data.paidLaunch.activeSubscribers}</strong><small>{data.paidLaunch.pastDueSubscribers} past due · {data.paidLaunch.canceledSubscribers} canceled</small></div>
              </div>
              <div className="admin-acquisition-list">
                <h3>Launch health</h3>
                <div><span>Payment processing failures</span><strong>{data.paidLaunch.failedWebhookEvents}</strong><small>Failed Stripe webhook events in this reporting window</small></div>
                <div><span>Organic growth target</span><strong>30%</strong><small>Activated acquisition from search, referral, or partners</small></div>
                <div><span>Paid-launch gate</span><strong>{data.paidLaunch.activeSubscribers >= 50 ? "Measure churn" : "Build cohort"}</strong><small>Churn becomes decision-grade after the first 50 paid subscribers</small></div>
              </div>
            </section>

            <section className="admin-panel admin-content-reports">
              <header><div><p className="overline">Content integrity</p><h2>Learner report queue</h2></div><span>{data.contentReports.filter((report) => report.status === "open").length} open</span></header>
              <div>
                {data.contentReports.length ? data.contentReports.map((report) => (
                  <article key={report.id}>
                    <span className="admin-list-icon"><Flag size={15} /></span>
                    <div>
                      <strong>{report.topic} · {report.sourceLabel ? `Source: ${report.sourceLabel}` : report.lessonTitle ?? report.lessonId ?? "Course content"}</strong>
                      <small>{report.category.replaceAll("_", " ")} · {report.contentVersion ?? "unknown version"} · {shortDate(report.createdAt, true)}</small>
                      {report.note && <p>{report.note}</p>}
                    </div>
                    {report.status === "open" ? (
                      <span>
                        <button className="button button-quiet button-small" disabled={actionBusy} onClick={() => router.push(`/course/${encodeURIComponent(report.topic)}?id=${encodeURIComponent(report.courseId)}`)}>Open course</button>
                        <button className="button button-secondary button-small" disabled={actionBusy} onClick={() => void reviewContentReport(report.id, "dismissed")}>Dismiss</button>
                        <button className="button button-primary button-small" disabled={actionBusy} onClick={() => void reviewContentReport(report.id, "resolved")}>Resolve</button>
                      </span>
                    ) : <span><button className="button button-quiet button-small" onClick={() => router.push(`/course/${encodeURIComponent(report.topic)}?id=${encodeURIComponent(report.courseId)}`)}>Open course</button><em className={`admin-status status-${report.status}`}>{report.status}</em></span>}
                  </article>
                )) : <p>No learner content reports have been submitted.</p>}
              </div>
              {actionMessage && <p className="admin-action-message" role="status">{actionMessage}</p>}
            </section>
          </div>
        )}

        {data && tab === "launch" && (
          <div className="admin-workspace admin-launch-layout">
            <section className={`admin-launch-lock ${data.launchReadiness.billingLockActive ? "is-locked" : "is-open"}`}>
              <span><LockKeyhole size={22} /></span>
              <div>
                <p className="overline">Commercial master lock</p>
                <h2>{data.launchReadiness.mode === "closed" ? "Subscriptions are closed" : "Subscriptions are open"}</h2>
                <p>{data.launchReadiness.billingLockActive
                  ? "Phase 4B can collect evidence and prepare operations, but no checkout route can create a subscription while the billing lock remains off."
                  : "The billing lock is on. Confirm every launch gate below before sending traffic to checkout."}</p>
              </div>
              <em>{data.launchReadiness.billingLockActive ? "Protected" : "Live commerce"}</em>
            </section>

            <div className="admin-launch-grid">
              <section className="admin-panel admin-launch-panel">
                <header><div><p className="overline">Demand evidence</p><h2>Account-bound pricing intent</h2></div><span>Deduplicated by verified account</span></header>
                <div className="admin-launch-metrics">
                  <div><span>Total responses</span><strong>{data.launchReadiness.pricingIntent.total}</strong><small>Free accounts with a saved preference</small></div>
                  <div><span>Ready at launch</span><strong>{data.launchReadiness.pricingIntent.readyNow}</strong><small>Strongest stated purchase intent</small></div>
                  <div><span>Within 30 days</span><strong>{data.launchReadiness.pricingIntent.within30Days}</strong><small>Interested but not immediate</small></div>
                  <div><span>Annual preference</span><strong>{data.launchReadiness.pricingIntent.annualPreferred}</strong><small>{data.launchReadiness.pricingIntent.monthlyPreferred} prefer monthly</small></div>
                </div>
                <p className="admin-launch-note">These are stated preferences, not revenue. Treat them as directional until real checkout conversion, refunds, and churn can be measured.</p>
              </section>

              <section className="admin-panel admin-launch-panel">
                <header><div><p className="overline">Infrastructure</p><h2>Production operations</h2></div><span>Secret values are never shown</span></header>
                <div className="admin-readiness-list">
                  <ReadinessItem ready={data.launchReadiness.activityReceiptsConfigured} label="Signed activity receipts" detail="Creator progression is bound to verified lesson activity." />
                  <ReadinessItem ready={data.launchReadiness.productionHealthMonitorConfigured} label="Production health target" detail="A deployment health URL is configured for release checks." />
                  <ReadinessItem ready={data.launchReadiness.operationsAlertsConfigured} label="Operational alerts" detail="Critical health and billing failures need an external alert destination." />
                  <ReadinessItem ready={data.launchReadiness.managedBackupsConfigured} label="Managed Firestore backups" detail="A backup bucket is required before paid customer data is accepted." />
                </div>
              </section>

              <section className="admin-panel admin-launch-panel">
                <header><div><p className="overline">Commerce lifecycle</p><h2>Payments and recovery</h2></div><span>{data.launchReadiness.billingLockActive ? "Checkout disabled" : "Checkout enabled"}</span></header>
                <div className="admin-readiness-list">
                  <ReadinessItem ready={data.launchReadiness.billingLockActive} label="Closed-launch billing lock" detail="Payment routes remain unavailable during preparation." />
                  <ReadinessItem ready={data.launchReadiness.paymentProviderConfigured} label="Stripe production objects" detail="Keys, webhook secret, and both plan price IDs must be present." />
                  <ReadinessItem ready={data.paidLaunch.failedWebhookEvents === 0} label="Webhook processing" detail={`${data.paidLaunch.failedWebhookEvents} failed event${data.paidLaunch.failedWebhookEvents === 1 ? "" : "s"} in this reporting window.`} />
                  <ReadinessItem ready={data.launchReadiness.lifecycleMessagingConfigured} label="Lifecycle messaging" detail="Receipts, renewal notices, payment recovery, and suppression handling still need a delivery provider." />
                </div>
              </section>

              <section className="admin-panel admin-launch-panel">
                <header><div><p className="overline">Customer protection</p><h2>Support and content response</h2></div><span>Human review remains required</span></header>
                <div className="admin-readiness-list">
                  <ReadinessItem ready={data.launchReadiness.supportChannelConfigured} label="Support channel" detail="Account, billing, privacy, and course issues have a published contact path." />
                  <ReadinessItem ready={data.launchReadiness.openContentReports === 0} label="Content report queue" detail={`${data.launchReadiness.openContentReports} open report${data.launchReadiness.openContentReports === 1 ? "" : "s"} require owner review.`} />
                  <ReadinessItem ready={data.paidLaunch.pastDueSubscribers === 0} label="Past-due accounts" detail={`${data.paidLaunch.pastDueSubscribers} account${data.paidLaunch.pastDueSubscribers === 1 ? "" : "s"} currently require recovery handling.`} />
                </div>
                <div className="admin-launch-actions"><button className="button button-secondary" onClick={() => router.push("/support")}>Open support center</button><button className="button button-quiet" onClick={() => setTab("safety")}>Review safety activity</button></div>
              </section>
            </div>
          </div>
        )}

        {data && tab === "users" && (
          <div className="admin-users-layout">
            <section className="admin-panel admin-user-directory">
              <header>
                <div><p className="overline">Accounts</p><h2>User directory</h2></div>
                <div className="admin-user-search"><Search size={16} /><label className="sr-only" htmlFor="admin-user-search">Search users</label><input id="admin-user-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, plan, or status" autoComplete="off" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear user search"><X size={15} /></button>}</div>
              </header>
              <p className="sr-only" role="status">{filteredUsers.length} {filteredUsers.length === 1 ? "user" : "users"} found</p>
              <div className="admin-user-table" role="group" aria-label="Erudoza users">
                <div className="admin-user-table-head"><span>User</span><span>Access</span><span>Last seen</span><span>Tokens</span><span>Cost</span></div>
                {filteredUsers.map((candidate) => (
                  <button key={candidate.uid} className={selectedUser?.uid === candidate.uid ? "is-selected" : ""} onClick={() => { setSelectedUid(candidate.uid); setActionMessage(null); }}>
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
                {!filteredUsers.length && <div className="admin-empty-row" role="status"><strong>No matching users</strong><span>Try a name, email, plan, or account status.</span><button className="button button-quiet button-small" type="button" onClick={() => setQuery("")}>Clear search</button></div>}
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
                      <div><span><strong>Retrieval and review</strong><small>{selectedUser.retrievalSessions} retrieval sessions · {selectedUser.reviewSessions} scheduled reviews</small></span><span><strong>{selectedUser.quizAccuracy ? `${selectedUser.quizAccuracy}%` : "N/A"}</strong><small>first-try accuracy</small></span></div>
                      <div><span><strong>Last learning activity</strong><small>{selectedUser.lastLearningActivityAt ? selectedUser.displayName : "No saved activity"}</small></span><span><strong>{shortDate(selectedUser.lastLearningActivityAt, true)}</strong><small>most recent progress sync</small></span></div>
                    </div>
                  </section>

                  <section className="admin-inspector-section">
                    <h3>Usage by feature</h3>
                    <div className="admin-feature-usage">
                      {selectedUser.featureUsage.length ? selectedUser.featureUsage.map((usage) => (
                        <div key={usage.feature}><span><strong>{featureLabels[usage.feature]}</strong><small>{usage.requests} requests · {compactNumber(usage.cachedInputTokens)} cache reads · {compactNumber(usage.cacheWriteTokens)} writes</small></span><span><strong>{compactNumber(usage.inputTokens + usage.outputTokens)} tokens</strong><small>{currency(usage.costUsd)}</small></span></div>
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
              <div><span>Input tokens</span><strong>{compactNumber(data.summary.inputTokens)}</strong><small>{compactNumber(data.summary.cachedInputTokens)} cache reads · {compactNumber(data.summary.cacheWriteTokens)} writes</small></div>
              <div><span>Output tokens</span><strong>{compactNumber(data.summary.outputTokens)}</strong><small>{currency(data.summary.estimatedCostUsd)} estimated</small></div>
              <div><span>Completion rate</span><strong>{data.summary.generations ? `${Math.round(((data.summary.generations - data.summary.failedRequests) / data.summary.generations) * 100)}%` : "N/A"}</strong><small>{data.summary.failedRequests} failed requests</small></div>
            </section>
            <section className="admin-panel admin-log-panel">
              <header><div><p className="overline">AI ledger</p><h2>Recent generation requests</h2></div><span>Prompts and generated text are not shown here</span></header>
              <div className="admin-log-table">
                <div><span>Time</span><span>User</span><span>Feature</span><span>Status</span><span>Input</span><span>Output</span><span>Cost</span></div>
                {data.recentGenerations.map((request) => <div key={request.id}><span>{shortDate(request.createdAt, true)}</span><span>{request.userLabel}</span><span>{featureLabels[request.feature]}{request.model && <small>{request.model}</small>}</span><span><em className={`admin-status status-${request.status}`}>{request.status}</em></span><span>{compactNumber(request.inputTokens)}<small>{request.cachedInputTokens ? ` ${compactNumber(request.cachedInputTokens)} read` : ""}{request.cacheWriteTokens ? ` ${compactNumber(request.cacheWriteTokens)} written` : ""}</small></span><span>{compactNumber(request.outputTokens)}</span><span>{currency(request.costUsd)}</span></div>)}
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
