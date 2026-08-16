"use client";

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardCheck,
  FileText,
  Filter,
  History,
  Inbox,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tag,
  UserRoundCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import type {
  CommandCenterApproval,
  CommandCenterApprovalActionType,
  CommandCenterDraft,
  CommandCenterDraftAgentType,
  CommandCenterRisk,
  CommandCenterSnapshotCollection,
  CommandCenterSnapshotV2,
  CommandCenterTicket,
  CommandCenterTicketCategory,
  CommandCenterTicketStatus,
} from "@/lib/command-center-types";
import styles from "./command-center-v2.module.css";

type View = "work" | "reviews" | "activity" | "system";
type ReviewSelection = { kind: "draft" | "approval"; id: string };
type ReviewDecision = "accepted" | "rejected" | "approved";
type DialogState =
  | { kind: "new_ticket" }
  | { kind: "note"; ticketId: string }
  | { kind: "approval_request"; ticketId: string }
  | { kind: "review"; selection: ReviewSelection; decision: ReviewDecision }
  | { kind: "publish"; ticketId: string }
  | null;

interface PendingPublication {
  version: 1;
  ticketId: string;
  expectedVersion: number;
  body: string;
  idempotencyKey: string;
  createdAt: string;
  failure?: string;
}

interface PendingApprovalReview {
  version: 1;
  approvalId: string;
  expectedVersion: number;
  decision: "approved" | "rejected";
  reason: string;
  idempotencyKey: string;
  createdAt: string;
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const PENDING_PUBLICATION_KEY = "filosage-command-center-pending-publication-v1";
const PENDING_APPROVAL_REVIEW_KEY = "filosage-command-center-pending-approval-review-v1";
const IMPECCABLE_DIRECTION = {
  seed: "ddbdcffa",
  contract: "thesis-own-world-story-first-viewport-form-finish",
} as const;

const categoryLabels: Record<CommandCenterTicketCategory, string> = {
  support: "Support",
  legal: "Legal",
  copyright: "Copyright",
  privacy: "Privacy",
  billing: "Billing",
  content_report: "Content report",
  product_feedback: "Product feedback",
  security: "Security",
  abuse: "Abuse",
  system_alert: "System alert",
  other: "Other",
};

const statusLabels: Record<CommandCenterTicketStatus, string> = {
  new: "New",
  triaged: "Triaged",
  waiting_for_admin: "Needs decision",
  approved: "Approved",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

const sourceLabels: Record<CommandCenterTicket["source"], string> = {
  manual: "Manual",
  content_report: "Content report",
  user_support: "User support",
};

const agentLabels: Record<CommandCenterDraftAgentType, string> = {
  support: "Support",
  legal: "Legal intake",
  billing: "Billing explanation",
  productOperations: "Product operations",
  founderBrief: "Founder brief",
};

const agentContracts: Record<CommandCenterDraftAgentType, {
  purpose: string;
  inputs: string;
  output: string;
  prohibition: string;
}> = {
  support: {
    purpose: "Draft helpful responses and support guidance.",
    inputs: "Support and low-risk other cases; recorded evidence.",
    output: "Review copy or an internal summary.",
    prohibition: "No sending, commitments, account changes, or external action.",
  },
  legal: {
    purpose: "Frame legal, copyright, and privacy intake.",
    inputs: "Recorded claims, facts, references, and policy context.",
    output: "Internal intake summary for owner review.",
    prohibition: "No legal advice, filings, notices, or external action.",
  },
  billing: {
    purpose: "Draft explanations of recorded billing questions.",
    inputs: "Low-risk billing cases and approved policy context.",
    output: "Review-only explanation or internal summary.",
    prohibition: "No refunds, charges, balance changes, or billing activation.",
  },
  productOperations: {
    purpose: "Group product and content-report signals.",
    inputs: "Product feedback, content reports, plans, and recorded notes.",
    output: "Internal operational review material.",
    prohibition: "No content removal, publishing, deployment, or system change.",
  },
  founderBrief: {
    purpose: "Summarize the complete recorded open queue.",
    inputs: "Canonical queue sources plus a freshness manifest.",
    output: "Internal priorities and grouped signals for review.",
    prohibition: "No distribution, notification, commitments, or external action.",
  },
};

const futureAgentContracts = [
  { name: "Privacy executor", purpose: "Future privacy workflow capability.", inputs: "Policies and recorded assessments.", output: "None in this release.", prohibition: "No policy or data action is connected." },
  { name: "Content executor", purpose: "Future content-action capability.", inputs: "Content records and owner decisions.", output: "None in this release.", prohibition: "No removal or publishing action is connected." },
  { name: "Knowledge writer", purpose: "Future knowledge-maintenance capability.", inputs: "Approved sources and owner notes.", output: "None in this release.", prohibition: "No autonomous knowledge mutation is connected." },
] as const;

const approvalActionLabels: Record<CommandCenterApprovalActionType, string> = {
  send_response: "Send a response",
  restrict_account: "Restrict an account",
  remove_content: "Remove content",
  export_user_data: "Export user data",
  delete_user_data: "Delete user data",
  billing_adjustment: "Make a billing adjustment",
  policy_change: "Change a policy",
  publish_status: "Publish a status update",
};

const riskRank: Record<CommandCenterRisk, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const viewItems: Array<{ id: View; label: string; icon: LucideIcon }> = [
  { id: "work", label: "Work", icon: ListChecks },
  { id: "reviews", label: "Reviews", icon: ClipboardCheck },
  { id: "activity", label: "Activity", icon: History },
  { id: "system", label: "System", icon: Shield },
];

function parsePendingPublication(): PendingPublication | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_PUBLICATION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingPublication>;
    if (
      value.version !== 1
      || typeof value.ticketId !== "string"
      || typeof value.expectedVersion !== "number"
      || typeof value.body !== "string"
      || typeof value.idempotencyKey !== "string"
      || typeof value.createdAt !== "string"
    ) return null;
    return value as PendingPublication;
  } catch {
    return null;
  }
}

function savePendingPublication(value: PendingPublication | null) {
  if (value) window.sessionStorage.setItem(PENDING_PUBLICATION_KEY, JSON.stringify(value));
  else window.sessionStorage.removeItem(PENDING_PUBLICATION_KEY);
}

function parsePendingApprovalReview(): PendingApprovalReview | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_APPROVAL_REVIEW_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingApprovalReview>;
    if (
      value.version !== 1
      || typeof value.approvalId !== "string"
      || typeof value.expectedVersion !== "number"
      || (value.decision !== "approved" && value.decision !== "rejected")
      || typeof value.reason !== "string"
      || typeof value.idempotencyKey !== "string"
      || typeof value.createdAt !== "string"
    ) return null;
    return value as PendingApprovalReview;
  } catch {
    return null;
  }
}

function savePendingApprovalReview(value: PendingApprovalReview | null) {
  if (value) window.sessionStorage.setItem(PENDING_APPROVAL_REVIEW_KEY, JSON.stringify(value));
  else window.sessionStorage.removeItem(PENDING_APPROVAL_REVIEW_KEY);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Time unavailable";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function relativeTime(value: string, now: number) {
  const delta = now - Date.parse(value);
  if (!Number.isFinite(delta)) return "time unavailable";
  const minutes = Math.max(0, Math.round(delta / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function dueLabel(value: string, now: number) {
  const delta = Date.parse(value) - now;
  if (!Number.isFinite(delta)) return "Due time unavailable";
  const hours = Math.round(Math.abs(delta) / 3_600_000);
  if (delta < 0) return hours < 24 ? `${Math.max(1, hours)}h overdue` : `${Math.round(hours / 24)}d overdue`;
  if (hours < 1) return "Due within an hour";
  if (hours < 24) return `Due in ${hours}h`;
  const days = Math.round(hours / 24);
  return `Due in ${days}d`;
}

function sortWorkQueue(a: CommandCenterTicket, b: CommandCenterTicket, now: number) {
  const aDue = Date.parse(a.dueAt);
  const bDue = Date.parse(b.dueAt);
  const aOverdue = Number.isFinite(aDue) && aDue < now ? 0 : 1;
  const bOverdue = Number.isFinite(bDue) && bDue < now ? 0 : 1;
  if (aOverdue !== bOverdue) return aOverdue - bOverdue;
  if (aDue !== bDue) return aDue - bDue;
  if (riskRank[a.riskLevel] !== riskRank[b.riskLevel]) return riskRank[b.riskLevel] - riskRank[a.riskLevel];
  return a.id.localeCompare(b.id);
}

function agentForTicket(ticket: CommandCenterTicket): Exclude<CommandCenterDraftAgentType, "founderBrief"> {
  if (["legal", "copyright", "privacy"].includes(ticket.category)) return "legal";
  if (ticket.category === "billing") return "billing";
  if (ticket.category === "product_feedback" || ticket.category === "content_report") return "productOperations";
  return "support";
}

function splitLines(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function mergeById<T extends { id: string }>(current: T[], next: T[]) {
  const records = new Map(current.map((record) => [record.id, record]));
  next.forEach((record) => records.set(record.id, record));
  return [...records.values()];
}

function withLoadedSummary(snapshot: CommandCenterSnapshotV2): CommandCenterSnapshotV2 {
  const openTickets = snapshot.tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status));
  const retrievedAt = Date.parse(snapshot.retrievedAt);
  return {
    ...snapshot,
    summary: {
      openTickets: openTickets.length,
      highRiskTickets: openTickets.filter((ticket) => ticket.riskLevel === "high" || ticket.riskLevel === "critical").length,
      pendingApprovals: snapshot.approvals.filter((approval) => approval.status === "pending").length,
      overdueTickets: openTickets.filter((ticket) => Date.parse(ticket.dueAt) < retrievedAt).length,
      pendingDrafts: snapshot.drafts.filter((draft) => draft.status === "pending_review").length,
    },
    summaryCompleteness: {
      basis: "loaded_records",
      complete: snapshot.collections.tickets.complete
        && snapshot.collections.approvals.complete
        && snapshot.collections.drafts.complete,
    },
  };
}

function riskClass(risk: CommandCenterRisk) {
  return `${styles.risk} ${styles[`risk_${risk}`]}`;
}

function CollectionTruth({ data, section, label }: {
  data: CommandCenterSnapshotV2;
  section: CommandCenterSnapshotCollection;
  label: string;
}) {
  const meta = data.collections[section];
  const warningCount = data.warnings.filter((warning) => warning.section === section).length;
  return (
    <p className={styles.truthLine} aria-label={`${label} collection status`}>
      <span>{meta.loaded.toLocaleString()} of {meta.total.toLocaleString()} {label.toLowerCase()} loaded</span>
      <span aria-hidden="true">·</span>
      <strong>{meta.complete ? "Complete collection" : "Partial collection"}</strong>
      {warningCount > 0 && <><span aria-hidden="true">·</span><span>{warningCount} malformed record warning{warningCount === 1 ? "" : "s"}</span></>}
    </p>
  );
}

function EmptyState({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className={styles.emptyState}>
      <Icon aria-hidden="true" size={24} />
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

export default function CommandCenterV2() {
  const { user, isOwner, loading: authLoading, reauthenticate } = useAuth();
  const [data, setData] = useState<CommandCenterSnapshotV2 | null>(null);
  const [view, setView] = useState<View>("work");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<CommandCenterRisk | "all">("all");
  const [statusFilter, setStatusFilter] = useState<CommandCenterTicketStatus | "open" | "all">("open");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [reviewSelection, setReviewSelection] = useState<ReviewSelection | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [noteText, setNoteText] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [publicationText, setPublicationText] = useState("");
  const [publicationFailure, setPublicationFailure] = useState<string | null>(null);
  const [pendingPublication, setPendingPublication] = useState<PendingPublication | null>(() => (
    typeof window === "undefined" ? null : parsePendingPublication()
  ));
  const [pendingApprovalReview, setPendingApprovalReview] = useState<PendingApprovalReview | null>(() => (
    typeof window === "undefined" ? null : parsePendingApprovalReview()
  ));
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dossierRef = useRef<HTMLElement>(null);
  const approvalResumeStarted = useRef(false);

  const fetchSnapshot = useCallback(async (search = "") => {
    if (!user) throw new ApiError("Owner access is required.", 401);
    const token = await user.getIdToken();
    const response = await fetch(`/api/admin/command-center/v2${search}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json().catch(() => ({})) as Partial<CommandCenterSnapshotV2> & { error?: string; code?: string };
    if (!response.ok) throw new ApiError(body.error ?? "The command center could not be loaded.", response.status, body.code);
    return body as CommandCenterSnapshotV2;
  }, [user]);

  const load = useCallback(async () => {
    if (!user || !isOwner) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const snapshot = await fetchSnapshot();
      setData(snapshot);
      setNow(Date.now());
      setSelectedTicketId((current) => current && snapshot.tickets.some((ticket) => ticket.id === current)
        ? current
        : snapshot.tickets[0]?.id ?? null);
      setReviewSelection((current) => {
        if (current?.kind === "draft" && snapshot.drafts.some((draft) => draft.id === current.id)) return current;
        if (current?.kind === "approval" && snapshot.approvals.some((approval) => approval.id === current.id)) return current;
        const pendingDraft = snapshot.drafts.find((draft) => draft.status === "pending_review");
        if (pendingDraft) return { kind: "draft", id: pendingDraft.id };
        const pendingApproval = snapshot.approvals.find((approval) => approval.status === "pending");
        return pendingApproval ? { kind: "approval", id: pendingApproval.id } : null;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The command center could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [fetchSnapshot, isOwner, user]);

  useEffect(() => {
    if (authLoading) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [authLoading, load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const element = dialogRef.current;
    if (dialog && element && !element.open) {
      element.showModal();
      window.requestAnimationFrame(() => element.querySelector<HTMLElement>("input, textarea, select, button")?.focus());
    } else if (!dialog && element?.open) {
      element.close();
    }
  }, [dialog]);

  const apiRequest = useCallback(async (
    path: string,
    method: "POST" | "PATCH",
    body: Record<string, unknown>,
    extraHeaders: Record<string, string> = {},
  ) => {
    if (!user) throw new ApiError("Owner access is required.", 401);
    const token = await user.getIdToken();
    const response = await fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({})) as { error?: string; code?: string } & Record<string, unknown>;
    if (!response.ok) throw new ApiError(result.error ?? "The command-center update failed.", response.status, result.code);
    return result;
  }, [user]);

  const runMutation = useCallback(async (work: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await work();
      setMessage(success);
      await load();
      return true;
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "The command-center update failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [load]);

  useEffect(() => {
    if (authLoading || !user || approvalResumeStarted.current) return;
    if (new URL(window.location.href).searchParams.get("filosage_reauthenticated") !== "1") return;
    const pending = parsePendingApprovalReview();
    if (!pending) return;
    approvalResumeStarted.current = true;
    void (async () => {
      const saved = await runMutation(async () => {
        const recentlyAuthenticated = await reauthenticate("/admin/command-center");
        if (!recentlyAuthenticated.reauthenticationToken) {
          throw new Error("Sign-in confirmation did not return a decision proof.");
        }
        await apiRequest(`/api/admin/command-center/approvals/${encodeURIComponent(pending.approvalId)}`, "PATCH", {
          expectedVersion: pending.expectedVersion,
          decision: pending.decision,
          reason: pending.reason,
        }, {
          "Idempotency-Key": pending.idempotencyKey,
          "X-Reauthentication-Token": recentlyAuthenticated.reauthenticationToken,
        });
      }, `${pending.decision === "approved" ? "Approval" : "Rejection"} recorded. Nothing was sent or executed.`);
      if (saved) {
        savePendingApprovalReview(null);
        setPendingApprovalReview(null);
        setReviewReason("");
        setDialog(null);
      }
      approvalResumeStarted.current = false;
    })();
  }, [apiRequest, authLoading, reauthenticate, runMutation, user]);

  const resumeApprovalReview = async () => {
    const pending = pendingApprovalReview ?? parsePendingApprovalReview();
    if (!pending) return;
    const saved = await runMutation(async () => {
      const recentlyAuthenticated = await reauthenticate("/admin/command-center");
      if (!recentlyAuthenticated.reauthenticationToken) {
        throw new Error("Sign-in confirmation did not return a decision proof.");
      }
      await apiRequest(`/api/admin/command-center/approvals/${encodeURIComponent(pending.approvalId)}`, "PATCH", {
        expectedVersion: pending.expectedVersion,
        decision: pending.decision,
        reason: pending.reason,
      }, {
        "Idempotency-Key": pending.idempotencyKey,
        "X-Reauthentication-Token": recentlyAuthenticated.reauthenticationToken,
      });
    }, `${pending.decision === "approved" ? "Approval" : "Rejection"} reconciled. Nothing was sent or executed.`);
    if (saved) {
      savePendingApprovalReview(null);
      setPendingApprovalReview(null);
      setReviewReason("");
      setDialog(null);
    }
  };

  const loadMore = useCallback(async (section: CommandCenterSnapshotCollection) => {
    if (!data?.collections[section].nextCursor) return;
    const parameter = {
      tickets: "ticketsCursor",
      approvals: "approvalsCursor",
      drafts: "draftsCursor",
      auditEvents: "auditEventsCursor",
    }[section];
    setBusy(true);
    setError(null);
    try {
      const next = await fetchSnapshot(`?limit=500&${parameter}=${encodeURIComponent(data.collections[section].nextCursor ?? "")}`);
      setData((current) => {
        if (!current) return next;
        const oldMeta = current.collections[section];
        const nextMeta = next.collections[section];
        const malformed = oldMeta.malformed + nextMeta.malformed;
        const inspected = oldMeta.inspected + nextMeta.inspected;
        const mergedWarnings = [...current.warnings, ...next.warnings.filter((warning) => warning.section === section)]
          .filter((warning, index, all) => all.findIndex((candidate) => candidate.section === warning.section && candidate.recordId === warning.recordId) === index);
        const commonMeta = {
          ...nextMeta,
          inspected,
          malformed,
          cursorApplied: false,
        };
        if (section === "tickets") {
          const tickets = mergeById(current.tickets, next.tickets);
          return withLoadedSummary({ ...current, tickets, retrievedAt: next.retrievedAt, warnings: mergedWarnings, collections: { ...current.collections, tickets: { ...commonMeta, loaded: tickets.length, scanComplete: !nextMeta.nextCursor && inspected === nextMeta.total, complete: !nextMeta.nextCursor && tickets.length === nextMeta.total && malformed === 0 } } });
        }
        if (section === "approvals") {
          const approvals = mergeById(current.approvals, next.approvals);
          return withLoadedSummary({ ...current, approvals, retrievedAt: next.retrievedAt, warnings: mergedWarnings, collections: { ...current.collections, approvals: { ...commonMeta, loaded: approvals.length, scanComplete: !nextMeta.nextCursor && inspected === nextMeta.total, complete: !nextMeta.nextCursor && approvals.length === nextMeta.total && malformed === 0 } } });
        }
        if (section === "drafts") {
          const drafts = mergeById(current.drafts, next.drafts);
          return withLoadedSummary({ ...current, drafts, retrievedAt: next.retrievedAt, warnings: mergedWarnings, collections: { ...current.collections, drafts: { ...commonMeta, loaded: drafts.length, scanComplete: !nextMeta.nextCursor && inspected === nextMeta.total, complete: !nextMeta.nextCursor && drafts.length === nextMeta.total && malformed === 0 } } });
        }
        const auditEvents = mergeById(current.auditEvents, next.auditEvents);
        return withLoadedSummary({ ...current, auditEvents, retrievedAt: next.retrievedAt, warnings: mergedWarnings, collections: { ...current.collections, auditEvents: { ...commonMeta, loaded: auditEvents.length, scanComplete: !nextMeta.nextCursor && inspected === nextMeta.total, complete: !nextMeta.nextCursor && auditEvents.length === nextMeta.total && malformed === 0 } } });
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The next page could not be loaded.");
    } finally {
      setBusy(false);
    }
  }, [data, fetchSnapshot]);

  const tickets = useMemo(() => [...(data?.tickets ?? [])]
    .filter((ticket) => {
      if (riskFilter !== "all" && ticket.riskLevel !== riskFilter) return false;
      if (statusFilter === "open" && ["resolved", "closed"].includes(ticket.status)) return false;
      if (statusFilter !== "all" && statusFilter !== "open" && ticket.status !== statusFilter) return false;
      const haystack = [ticket.ticketNumber, ticket.subject, ticket.normalizedSummary, ticket.category, ...ticket.tags]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query.trim().toLowerCase());
    })
    .sort((a, b) => sortWorkQueue(a, b, now)), [data?.tickets, now, query, riskFilter, statusFilter]);

  const selectedTicket = data?.tickets.find((ticket) => ticket.id === selectedTicketId) ?? null;
  const selectedDraft = reviewSelection?.kind === "draft"
    ? data?.drafts.find((draft) => draft.id === reviewSelection.id) ?? null
    : null;
  const selectedApproval = reviewSelection?.kind === "approval"
    ? data?.approvals.find((approval) => approval.id === reviewSelection.id) ?? null
    : null;

  const chooseTicket = (ticket: CommandCenterTicket) => {
    setNoteText("");
    setSelectedTicketId(ticket.id);
    setMobileDetailOpen(true);
    window.requestAnimationFrame(() => dossierRef.current?.focus());
  };

  const chooseReview = (selection: ReviewSelection) => {
    setReviewSelection(selection);
    setMobileDetailOpen(true);
    window.requestAnimationFrame(() => dossierRef.current?.focus());
  };

  const updateTicket = async (ticket: CommandCenterTicket, body: Record<string, unknown>, success: string) => {
    await runMutation(() => apiRequest(`/api/admin/command-center/tickets/${encodeURIComponent(ticket.id)}`, "PATCH", {
      expectedVersion: ticket.version,
      ...body,
    }), success);
  };

  const submitNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ticket = data?.tickets.find((candidate) => candidate.id === (dialog?.kind === "note" ? dialog.ticketId : ""));
    if (!ticket) return;
    const saved = await runMutation(() => apiRequest(`/api/admin/command-center/tickets/${encodeURIComponent(ticket.id)}`, "PATCH", {
      expectedVersion: ticket.version,
      note: noteText,
    }), "Internal note added. Its contents were not copied into the audit ledger.");
    if (saved) {
      setNoteText("");
      setDialog(null);
    }
  };

  const submitTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let created: CommandCenterTicket | null = null;
    const saved = await runMutation(async () => {
      const result = await apiRequest("/api/admin/command-center/tickets", "POST", {
        category: form.get("category"),
        riskLevel: form.get("riskLevel"),
        subject: form.get("subject"),
        summary: form.get("summary"),
        confirmedFacts: splitLines(form.get("confirmedFacts")),
        unverifiedClaims: splitLines(form.get("unverifiedClaims")),
        tags: String(form.get("tags") ?? "").split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean),
      }, { "Idempotency-Key": `command-center-ticket-${crypto.randomUUID()}` });
      created = result.ticket as CommandCenterTicket;
    }, "Manual case created and recorded in the audit ledger.");
    if (saved) {
      setDialog(null);
      if (created) {
        setNoteText("");
        setSelectedTicketId((created as CommandCenterTicket).id);
      }
    }
  };

  const generateDraft = async (ticket: CommandCenterTicket) => {
    const agentType = agentForTicket(ticket);
    let draftId: string | null = null;
    const generated = await runMutation(async () => {
      const result = await apiRequest("/api/admin/command-center/drafts", "POST", {
        agentType,
        ticketId: ticket.id,
        expectedTicketVersion: ticket.version,
      }, { "Idempotency-Key": `command-center-draft-${crypto.randomUUID()}` });
      draftId = (result.draft as CommandCenterDraft | undefined)?.id ?? null;
    }, `${agentLabels[agentType]} draft generated for review. Nothing was sent or executed.`);
    if (generated) {
      setView("reviews");
      if (draftId) setReviewSelection({ kind: "draft", id: draftId });
    }
  };

  const generateFounderBrief = async () => {
    let draftId: string | null = null;
    const generated = await runMutation(async () => {
      const result = await apiRequest("/api/admin/command-center/drafts", "POST", { agentType: "founderBrief" }, {
        "Idempotency-Key": `command-center-draft-${crypto.randomUUID()}`,
      });
      draftId = (result.draft as CommandCenterDraft | undefined)?.id ?? null;
    }, "Founder brief generated for review from the complete recorded queue. Nothing was sent or executed.");
    if (generated && draftId) setReviewSelection({ kind: "draft", id: draftId });
  };

  const submitApprovalRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ticket = data?.tickets.find((candidate) => candidate.id === (dialog?.kind === "approval_request" ? dialog.ticketId : ""));
    if (!ticket) return;
    const form = new FormData(event.currentTarget);
    const saved = await runMutation(() => apiRequest("/api/admin/command-center/approvals", "POST", {
      ticketId: ticket.id,
      expectedTicketVersion: ticket.version,
      actionType: form.get("actionType"),
      proposedAction: form.get("proposedAction"),
      riskLevel: form.get("riskLevel"),
      sideEffects: splitLines(form.get("sideEffects")),
      affectedRecords: splitLines(form.get("affectedRecords")),
      policyReferences: splitLines(form.get("policyReferences")),
      expiresInHours: Number(form.get("expiresInHours")),
    }), "Decision request created. No external action was executed.");
    if (saved) {
      setDialog(null);
      setView("reviews");
    }
  };

  const submitReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (dialog?.kind !== "review") return;
    const { selection, decision } = dialog;
    const draft = selection.kind === "draft" ? data?.drafts.find((candidate) => candidate.id === selection.id) : null;
    const approval = selection.kind === "approval" ? data?.approvals.find((candidate) => candidate.id === selection.id) : null;
    const saved = await runMutation(async () => {
      if (draft) {
        await apiRequest(`/api/admin/command-center/drafts/${encodeURIComponent(draft.id)}`, "PATCH", {
          expectedVersion: draft.version,
          decision,
          reason: reviewReason,
        });
        return;
      }
      if (approval) {
        const priorPending = parsePendingApprovalReview();
        const pendingDecision = decision === "approved" ? "approved" : "rejected";
        const pending: PendingApprovalReview = {
          version: 1,
          approvalId: approval.id,
          expectedVersion: approval.version,
          decision: pendingDecision,
          reason: reviewReason,
          idempotencyKey: priorPending
            && priorPending.approvalId === approval.id
            && priorPending.expectedVersion === approval.version
            && priorPending.decision === pendingDecision
            && priorPending.reason === reviewReason
            ? priorPending.idempotencyKey
            : `approval-review-${crypto.randomUUID()}`,
          createdAt: new Date().toISOString(),
        };
        savePendingApprovalReview(pending);
        setPendingApprovalReview(pending);
        const recentlyAuthenticated = await reauthenticate("/admin/command-center");
        if (!recentlyAuthenticated.reauthenticationToken) {
          throw new Error("Sign-in confirmation did not return a decision proof.");
        }
        await apiRequest(`/api/admin/command-center/approvals/${encodeURIComponent(approval.id)}`, "PATCH", {
          expectedVersion: approval.version,
          decision: pendingDecision,
          reason: reviewReason,
        }, {
          "Idempotency-Key": pending.idempotencyKey,
          "X-Reauthentication-Token": recentlyAuthenticated.reauthenticationToken,
        });
        savePendingApprovalReview(null);
        setPendingApprovalReview(null);
      }
    }, `${decision === "rejected" ? "Rejection" : decision === "approved" ? "Approval" : "Acceptance"} recorded. Nothing was sent or executed.`);
    if (saved) {
      setReviewReason("");
      setDialog(null);
    }
  };

  const openPublication = (ticket: CommandCenterTicket, suggestedBody: string | null = "") => {
    const pending = parsePendingPublication();
    if (pending?.ticketId === ticket.id) {
      setPublicationText(pending.body);
      setPublicationFailure(pending.failure ?? null);
      setPendingPublication(pending);
    } else {
      setPublicationText(suggestedBody ?? "");
      setPublicationFailure(null);
    }
    setDialog({ kind: "publish", ticketId: ticket.id });
  };

  const publishToLearner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ticket = data?.tickets.find((candidate) => candidate.id === (dialog?.kind === "publish" ? dialog.ticketId : ""));
    if (!ticket) return;
    const body = publicationText.trim();
    const existing = parsePendingPublication();
    const envelope = existing?.ticketId === ticket.id && existing.body === body
      ? existing
      : {
          version: 1 as const,
          ticketId: ticket.id,
          expectedVersion: ticket.version,
          body,
          idempotencyKey: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        };
    savePendingPublication(envelope);
    setPendingPublication(envelope);
    setBusy(true);
    setError(null);
    setMessage(null);
    setPublicationFailure(null);
    try {
      const recentlyAuthenticated = await reauthenticate("/admin/command-center");
      await apiRequest(`/api/admin/command-center/tickets/${encodeURIComponent(envelope.ticketId)}/public-replies`, "POST", {
        expectedVersion: envelope.expectedVersion,
        body: envelope.body,
      }, {
        "Idempotency-Key": envelope.idempotencyKey,
        ...(recentlyAuthenticated.reauthenticationToken
          ? { "X-Reauthentication-Token": recentlyAuthenticated.reauthenticationToken }
          : {}),
      });
      savePendingPublication(null);
      setPendingPublication(null);
      setMessage("Learner-visible reply published to Support Center and recorded in the audit ledger.");
      setPublicationText("");
      setDialog(null);
      await load();
    } catch (publicationError) {
      const failure = publicationError instanceof Error ? publicationError.message : "The learner-visible reply could not be published.";
      const failedEnvelope = { ...envelope, failure };
      savePendingPublication(failedEnvelope);
      setPendingPublication(failedEnvelope);
      setPublicationFailure(failure);
    } finally {
      setBusy(false);
    }
  };

  const resumePublication = () => {
    if (!pendingPublication || !data) return;
    const ticket = data.tickets.find((candidate) => candidate.id === pendingPublication.ticketId);
    if (!ticket) {
      setError("The pending learner publication belongs to a case that is not in the loaded page. Load more cases or refresh before retrying.");
      return;
    }
    setNoteText("");
    setView("work");
    setSelectedTicketId(ticket.id);
    setPublicationText(pendingPublication.body);
    setPublicationFailure(pendingPublication.failure ?? null);
    setDialog({ kind: "publish", ticketId: ticket.id });
  };

  const updateControls = async (patch: Partial<Pick<CommandCenterSnapshotV2["controls"], "systemEnabled" | "killSwitchActive">> & { agentType?: CommandCenterDraftAgentType }) => {
    if (!data) return;
    const agentFlags = { ...data.controls.agentFlags };
    if (patch.agentType) agentFlags[patch.agentType] = !agentFlags[patch.agentType];
    await runMutation(() => apiRequest("/api/admin/command-center/controls", "PATCH", {
      expectedVersion: data.controls.version,
      systemEnabled: patch.systemEnabled ?? data.controls.systemEnabled,
      killSwitchActive: patch.killSwitchActive ?? data.controls.killSwitchActive,
      agentFlags,
    }), "Safety control updated and audited.");
  };

  const changeView = (nextView: View) => {
    setView(nextView);
    setMobileDetailOpen(false);
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = viewItems.findIndex((item) => item.id === view);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? viewItems.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + viewItems.length) % viewItems.length;
    const next = viewItems[nextIndex];
    changeView(next.id);
    window.requestAnimationFrame(() => document.getElementById(`command-center-tab-${next.id}`)?.focus());
  };

  if (authLoading || (loading && !data)) {
    return (
      <AppShell>
        <main className={styles.statePage} aria-busy="true">
          <LoaderCircle className={styles.spin} aria-hidden="true" />
          <h1>Command Center</h1>
          <p>Loading the owner evidence desk…</p>
        </main>
      </AppShell>
    );
  }

  if (!user || !isOwner) {
    return (
      <AppShell>
        <main className={styles.statePage}>
          <LockKeyhole aria-hidden="true" />
          <h1>Owner access required</h1>
          <p>The Command Center is restricted to the verified Filosage owner.</p>
        </main>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <main className={styles.statePage}>
          <ShieldAlert aria-hidden="true" />
          <h1>Command Center unavailable</h1>
          <p>{error ?? "The evidence desk could not be loaded."}</p>
          <button className={styles.primaryButton} onClick={() => void load()}><RefreshCw aria-hidden="true" size={17} />Try again</button>
        </main>
      </AppShell>
    );
  }

  const draftAgent = selectedTicket ? agentForTicket(selectedTicket) : null;
  const draftAvailable = Boolean(
    draftAgent
    && data.capabilities.draftAgentsAvailable
    && data.controls.systemEnabled
    && !data.controls.killSwitchActive
    && data.controls.agentFlags[draftAgent],
  );
  const environmentDraftBlockReason = !data.capabilities.draftAgentsAvailable
    ? "The local draft environment is unavailable. No model call will be attempted."
    : !data.controls.systemEnabled
      ? "Command Center intake is paused."
      : data.controls.killSwitchActive
        ? "The global kill switch is active."
        : null;
  const selectedDraftBlockReason = selectedTicket?.status === "closed"
    ? "Closed cases cannot generate new review material."
    : environmentDraftBlockReason
      ?? (draftAgent && !data.controls.agentFlags[draftAgent]
        ? `${agentLabels[draftAgent]} draft generation is disabled in System.`
        : null);
  const founderBriefBlockReason = environmentDraftBlockReason
    ?? (!data.controls.agentFlags.founderBrief ? "Founder brief generation is disabled in System." : null);
  const openDrafts = [...data.drafts].sort((a, b) => {
    if ((a.status === "pending_review") !== (b.status === "pending_review")) return a.status === "pending_review" ? -1 : 1;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id);
  });
  const decisions = [...data.approvals].sort((a, b) => {
    if ((a.status === "pending") !== (b.status === "pending")) return a.status === "pending" ? -1 : 1;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id);
  });
  const activity = [...data.auditEvents].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
  const ticketActivity = selectedTicket
    ? activity.filter((event) => event.ticketId === selectedTicket.id || (event.targetType === "ticket" && event.targetId === selectedTicket.id))
    : [];

  return (
    <AppShell>
      <main
        className={styles.root}
        data-impeccable-direction-seed={IMPECCABLE_DIRECTION.seed}
        data-impeccable-direction-contract={IMPECCABLE_DIRECTION.contract}
      >
        <header className={styles.titleRow}>
          <div>
            <h1>Command Center</h1>
          </div>
          <button className={styles.quietButton} onClick={() => void load()} disabled={busy || loading}>
            <RefreshCw className={loading ? styles.spin : undefined} aria-hidden="true" size={17} />
            Refresh evidence
          </button>
        </header>

        <section className={styles.safetyBand} aria-label="Command Center safety boundary">
          <p><LockKeyhole aria-hidden="true" size={17} /><strong>Owner only</strong><span>Simulation locked on</span><span>External execution unavailable</span></p>
          <p><span>Intake: <strong>{data.controls.systemEnabled ? "Open" : "Paused"}</strong></span><span>Last refreshed {relativeTime(data.retrievedAt, now)}</span></p>
        </section>

        <div className={styles.liveRegion} aria-live="polite" aria-atomic="true">
          {error && <p className={styles.errorMessage}><AlertTriangle aria-hidden="true" size={17} />{error}</p>}
          {message && <p className={styles.successMessage}><CheckCircle2 aria-hidden="true" size={17} />{message}</p>}
          {pendingPublication && (
            <p className={styles.pendingMessage}>
              <Send aria-hidden="true" size={17} />
              A learner publication is awaiting a confirmed retry. It has not been marked successful.
              <button onClick={resumePublication}>Review exact retry</button>
            </p>
          )}
          {pendingApprovalReview && (
            <p className={styles.pendingMessage}>
              <UserRoundCheck aria-hidden="true" size={17} />
              An owner decision is awaiting confirmed completion. Its reason remains stored in this tab.
              <button onClick={() => void resumeApprovalReview()}>Reconcile exact decision</button>
            </p>
          )}
        </div>

        <div className={styles.tabs} aria-label="Command Center sections" role="tablist" tabIndex={-1} onKeyDown={handleTabKeyDown}>
          {viewItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              id={`command-center-tab-${id}`}
              role="tab"
              aria-selected={view === id}
              aria-controls={`command-center-panel-${id}`}
              tabIndex={view === id ? 0 : -1}
              onClick={() => changeView(id)}
              className={view === id ? styles.activeTab : undefined}
            >
              <Icon aria-hidden="true" size={18} />{label}
            </button>
          ))}
        </div>

        {view === "work" && (
          <section id="command-center-panel-work" role="tabpanel" aria-labelledby="command-center-tab-work" className={`${styles.workspace} ${mobileDetailOpen ? styles.mobileDetail : ""}`}>
            <section className={styles.ledger} aria-label="Work queue">
              <header className={styles.panelHeader}>
                <div><h2>Work</h2><CollectionTruth data={data} section="tickets" label="Tickets" /></div>
                <div>
                  <button className={styles.secondaryButton} aria-describedby={!data.controls.systemEnabled ? "new-case-disabled-reason" : undefined} disabled={busy || !data.controls.systemEnabled} onClick={() => setDialog({ kind: "new_ticket" })}><Plus aria-hidden="true" size={17} />New case</button>
                  {!data.controls.systemEnabled && <small id="new-case-disabled-reason" className={styles.muted}>Intake is paused in System.</small>}
                </div>
              </header>
              <div className={styles.queueTools}>
                <div className={styles.sortStatement}>
                  <span>Sort</span>
                  <strong>Overdue → due time → risk tie</strong>
                </div>
                <label className={styles.searchField}>
                  <span className={styles.srOnly}>Search work</span>
                  <Search aria-hidden="true" size={17} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search subject or ticket #" />
                </label>
                <label className={styles.compactField}><Filter aria-hidden="true" size={16} /><span className={styles.srOnly}>Risk filter</span><select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as CommandCenterRisk | "all")}><option value="all">All risk</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
                <label className={styles.compactField}><span className={styles.srOnly}>Status filter</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CommandCenterTicketStatus | "open" | "all")}><option value="open">Open work</option><option value="all">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              </div>
              <div className={styles.queueHead} aria-hidden="true"><span>Subject</span><span>Source</span><span>Risk</span><span>Status</span><span>Due</span></div>
              <ol className={styles.queueList}>
                {tickets.map((ticket) => (
                  <li key={ticket.id}>
                    <button className={selectedTicketId === ticket.id ? styles.selectedRow : undefined} onClick={() => chooseTicket(ticket)} aria-current={selectedTicketId === ticket.id ? "true" : undefined}>
                      <span className={styles.subjectCell}><FileText aria-hidden="true" size={18} /><span><strong>{ticket.subject}</strong><small>{ticket.ticketNumber}</small></span></span>
                      <span data-label="Source">{sourceLabels[ticket.source]}</span>
                      <span data-label="Risk" className={riskClass(ticket.riskLevel)}><Circle aria-hidden="true" size={11} fill="currentColor" />{ticket.riskLevel}</span>
                      <span data-label="Status">{statusLabels[ticket.status]}</span>
                      <span data-label="Due" className={Date.parse(ticket.dueAt) < now && !["resolved", "closed"].includes(ticket.status) ? styles.overdue : undefined}>{dueLabel(ticket.dueAt, now)}</span>
                      <ChevronRight className={styles.rowChevron} aria-hidden="true" size={18} />
                    </button>
                  </li>
                ))}
              </ol>
              {tickets.length === 0 && <EmptyState icon={Inbox} title="No matching cases" body="Adjust the search or filters. No queue totals are inferred from hidden records." />}
              {data.collections.tickets.nextCursor && <button className={styles.loadMore} disabled={busy} onClick={() => void loadMore("tickets")}>Load the next recorded page</button>}
            </section>

            <article ref={dossierRef} tabIndex={-1} className={styles.dossier} aria-label="Selected case evidence dossier">
              <button className={styles.mobileBack} onClick={() => setMobileDetailOpen(false)}><ArrowLeft aria-hidden="true" size={17} />Back to work</button>
              {!selectedTicket ? <EmptyState icon={FileText} title="Choose a case" body="Select a queue row to inspect its recorded evidence and bounded actions." /> : (
                <>
                  <header className={styles.dossierHeader}>
                    <div><span>{selectedTicket.ticketNumber}</span><h2>{selectedTicket.subject}</h2></div>
                    <label className={styles.statusSelect}><span>Status</span><select aria-label={`Status for ${selectedTicket.ticketNumber}`} value={selectedTicket.status} disabled={busy} onChange={(event) => void updateTicket(selectedTicket, { status: event.target.value }, `${selectedTicket.ticketNumber} status updated.`)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  </header>
                  <div className={styles.dossierScroll}>
                    <section><h3>Situation</h3><p>{selectedTicket.normalizedSummary}</p><dl className={styles.caseMeta}><div><dt>Source</dt><dd>{sourceLabels[selectedTicket.source]}</dd></div><div><dt>Category</dt><dd>{categoryLabels[selectedTicket.category]}</dd></div><div><dt>Risk</dt><dd className={riskClass(selectedTicket.riskLevel)}>{selectedTicket.riskLevel}</dd></div><div><dt>Due</dt><dd>{formatDate(selectedTicket.dueAt)}</dd></div><div><dt>Record version</dt><dd>{selectedTicket.version}</dd></div></dl></section>
                    <div className={styles.evidenceColumns}>
                      <section><h3><CheckCircle2 aria-hidden="true" size={16} />Confirmed facts</h3>{selectedTicket.confirmedFacts.length > 0 ? <ul className={styles.factList}>{selectedTicket.confirmedFacts.map((fact) => <li key={fact}><Check aria-hidden="true" size={14} />{fact}</li>)}</ul> : <p className={styles.muted}>No confirmed facts are recorded.</p>}</section>
                      <section><h3><AlertTriangle aria-hidden="true" size={16} />Unverified claims</h3>{selectedTicket.unverifiedClaims.length > 0 ? <ul className={styles.claimList}>{selectedTicket.unverifiedClaims.map((claim) => <li key={claim}><Circle aria-hidden="true" size={11} />{claim}</li>)}</ul> : <p className={styles.muted}>No unverified claims are recorded.</p>}{selectedTicket.untrustedExcerpt && <blockquote><strong>Untrusted reporter text</strong><p>{selectedTicket.untrustedExcerpt}</p></blockquote>}</section>
                    </div>
                    <div className={styles.evidenceColumns}>
                      <section><h3><FileText aria-hidden="true" size={16} />Evidence references</h3>{selectedTicket.evidenceReferences.length > 0 ? <ul className={styles.referenceList}>{selectedTicket.evidenceReferences.map((reference) => <li key={reference}><code>{reference}</code></li>)}</ul> : <p className={styles.muted}>No evidence reference is attached.</p>}</section>
                      <section><h3><MessageSquareText aria-hidden="true" size={16} />Related internal notes</h3>{selectedTicket.notes.length > 0 ? <ul className={styles.noteList}>{selectedTicket.notes.map((note) => <li key={note.id}><p>{note.body}</p><small>{formatDate(note.createdAt)} · owner-only</small></li>)}</ul> : <p className={styles.muted}>No internal notes are recorded.</p>}</section>
                    </div>
                    <section><h3><Activity aria-hidden="true" size={16} />Case workstream <span>(chronological)</span></h3>{ticketActivity.length > 0 ? <ol className={styles.timeline}>{[...ticketActivity].reverse().map((event) => <li key={event.id}><span aria-hidden="true" /><div><strong>{formatDate(event.createdAt)}</strong><p>{event.summary}</p></div><small>{event.actorRole}</small></li>)}</ol> : <p className={styles.muted}>No audit events for this case are present in the loaded activity page.</p>}</section>
                    {selectedTicket.publicReplies.length > 0 && <section><h3><Send aria-hidden="true" size={16} />Published learner replies</h3><ul className={styles.noteList}>{selectedTicket.publicReplies.map((reply) => <li key={reply.id}><p>{reply.body}</p><small>{formatDate(reply.createdAt)} · visible in Support Center</small></li>)}</ul></section>}
                    {selectedTicket.tags.length > 0 && <section><h3><Tag aria-hidden="true" size={16} />Tags</h3><div className={styles.tags}>{selectedTicket.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></section>}
                  </div>
                  <footer className={styles.actionDock}>
                    <p><ShieldCheck aria-hidden="true" size={20} /><span><strong>Review-only boundary</strong>Drafts and approvals record review only. Nothing is sent or executed automatically.{selectedDraftBlockReason && <small id="case-draft-disabled-reason">{selectedDraftBlockReason}</small>}</span></p>
                    <div>
                      <button className={styles.secondaryButton} aria-describedby={selectedDraftBlockReason ? "case-draft-disabled-reason" : undefined} disabled={busy || !draftAvailable || selectedTicket.status === "closed"} onClick={() => void generateDraft(selectedTicket)}><Sparkles aria-hidden="true" size={17} />Generate draft</button>
                      <button className={styles.secondaryButton} disabled={busy || selectedTicket.status === "closed"} onClick={() => setDialog({ kind: "approval_request", ticketId: selectedTicket.id })}><ClipboardCheck aria-hidden="true" size={17} />Request decision</button>
                      <button className={styles.secondaryButton} disabled={busy} onClick={() => { setNoteText(""); setDialog({ kind: "note", ticketId: selectedTicket.id }); }}><MessageSquareText aria-hidden="true" size={17} />Add internal note</button>
                      {selectedTicket.source === "user_support" && <button className={styles.publishButton} disabled={busy || selectedTicket.status === "closed"} onClick={() => openPublication(selectedTicket)}><Send aria-hidden="true" size={17} />Publish to learner</button>}
                    </div>
                  </footer>
                </>
              )}
            </article>
          </section>
        )}

        {view === "reviews" && (
          <section id="command-center-panel-reviews" role="tabpanel" aria-labelledby="command-center-tab-reviews" className={`${styles.workspace} ${styles.reviewWorkspace} ${mobileDetailOpen ? styles.mobileDetail : ""}`}>
            <section className={styles.reviewLedger} aria-label="Review queues">
              <header className={styles.panelHeader}><div><h2>Reviews</h2><p>Pending work first. Every decision is versioned and non-executing.</p>{founderBriefBlockReason && <small id="founder-brief-disabled-reason" className={styles.muted}>{founderBriefBlockReason}</small>}</div><button className={styles.secondaryButton} aria-describedby={founderBriefBlockReason ? "founder-brief-disabled-reason" : undefined} disabled={busy || Boolean(founderBriefBlockReason)} onClick={() => void generateFounderBrief()}><Sparkles aria-hidden="true" size={17} />Generate founder brief</button></header>
              <CollectionTruth data={data} section="drafts" label="Drafts" />
              <h3 className={styles.groupHeading}>Drafts <span>{openDrafts.filter((draft) => draft.status === "pending_review").length} pending</span></h3>
              <ol className={styles.reviewList}>{openDrafts.map((draft) => <li key={draft.id}><button aria-current={reviewSelection?.kind === "draft" && reviewSelection.id === draft.id ? "true" : undefined} className={reviewSelection?.kind === "draft" && reviewSelection.id === draft.id ? styles.selectedReview : undefined} onClick={() => chooseReview({ kind: "draft", id: draft.id })}><Bot aria-hidden="true" size={18} /><span><strong>{draft.content.headline}</strong><small>{agentLabels[draft.agentType]} · {formatDate(draft.createdAt)}</small></span><em>{draft.status.replaceAll("_", " ")}</em><ChevronRight aria-hidden="true" size={17} /></button></li>)}</ol>
              {data.collections.drafts.nextCursor && <button className={styles.loadMore} disabled={busy} onClick={() => void loadMore("drafts")}>Load more drafts</button>}
              <CollectionTruth data={data} section="approvals" label="Decisions" />
              <h3 className={styles.groupHeading}>Decisions <span>{decisions.filter((approval) => approval.status === "pending").length} pending</span></h3>
              <ol className={styles.reviewList}>{decisions.map((approval) => <li key={approval.id}><button aria-current={reviewSelection?.kind === "approval" && reviewSelection.id === approval.id ? "true" : undefined} className={reviewSelection?.kind === "approval" && reviewSelection.id === approval.id ? styles.selectedReview : undefined} onClick={() => chooseReview({ kind: "approval", id: approval.id })}><ClipboardCheck aria-hidden="true" size={18} /><span><strong>{approval.proposedAction}</strong><small>{approvalActionLabels[approval.actionType]} · {formatDate(approval.createdAt)}</small></span><em>{approval.status}</em><ChevronRight aria-hidden="true" size={17} /></button></li>)}</ol>
              {data.collections.approvals.nextCursor && <button className={styles.loadMore} disabled={busy} onClick={() => void loadMore("approvals")}>Load more decisions</button>}
            </section>
            <article ref={dossierRef} tabIndex={-1} className={styles.dossier} aria-label="Selected review dossier">
              <button className={styles.mobileBack} onClick={() => setMobileDetailOpen(false)}><ArrowLeft aria-hidden="true" size={17} />Back to reviews</button>
              {selectedDraft && <DraftDossier draft={selectedDraft} ticket={data.tickets.find((ticket) => ticket.id === selectedDraft.ticketId) ?? null} busy={busy} onReview={(decision) => { setReviewReason(""); setDialog({ kind: "review", selection: { kind: "draft", id: selectedDraft.id }, decision }); }} onOpenTicket={(ticketId) => { setNoteText(""); setSelectedTicketId(ticketId); setView("work"); setMobileDetailOpen(true); }} onPublish={(ticket, body) => { setNoteText(""); setSelectedTicketId(ticket.id); setView("work"); openPublication(ticket, body); }} />}
              {selectedApproval && <ApprovalDossier now={now} approval={selectedApproval} ticket={data.tickets.find((ticket) => ticket.id === selectedApproval.ticketId) ?? null} busy={busy} onReview={(decision) => { setReviewReason(""); setDialog({ kind: "review", selection: { kind: "approval", id: selectedApproval.id }, decision }); }} onOpenTicket={(ticketId) => { setNoteText(""); setSelectedTicketId(ticketId); setView("work"); setMobileDetailOpen(true); }} />}
              {!selectedDraft && !selectedApproval && <EmptyState icon={ClipboardCheck} title="Choose a review" body="Select a draft or decision request to inspect its evidence and provenance." />}
            </article>
          </section>
        )}

        {view === "activity" && (
          <section id="command-center-panel-activity" role="tabpanel" aria-labelledby="command-center-tab-activity" className={styles.fullPanel}>
            <header className={styles.panelHeader}><div><h2>Activity</h2><CollectionTruth data={data} section="auditEvents" label="Events" /></div></header>
            <p className={styles.panelIntro}>This ledger records bounded operational changes. Event summaries do not contain public-reply or internal-note bodies.</p>
            <ol className={styles.activityList}>{activity.map((event) => <li key={event.id}><span className={styles.activityMark}><History aria-hidden="true" size={17} /></span><div><strong>{event.summary}</strong><p>{event.action} · {event.targetType} {event.targetId}</p></div><dl><div><dt>Actor</dt><dd>{event.actorRole}</dd></div><div><dt>Effect</dt><dd>{event.externalSideEffect ? "External effect recorded" : "No external effect"}</dd></div></dl><time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time></li>)}</ol>
            {activity.length === 0 && <EmptyState icon={History} title="No activity in the loaded page" body="No audit event is available to display." />}
            {data.collections.auditEvents.nextCursor && <button className={styles.loadMore} disabled={busy} onClick={() => void loadMore("auditEvents")}>Load more recorded activity</button>}
          </section>
        )}

        {view === "system" && (
          <section id="command-center-panel-system" role="tabpanel" aria-labelledby="command-center-tab-system" className={styles.fullPanel}>
            <header className={styles.panelHeader}><div><h2>System</h2><p>Fail-closed boundaries on the left; individual review-only draft contracts on the right.</p></div></header>
            <div className={styles.systemLayout}>
              <aside className={styles.systemRail} aria-labelledby="system-boundaries-title">
                <header><h3 id="system-boundaries-title">System boundaries</h3><p>Every change is version-checked and recorded.</p></header>
                <ControlRow icon={Inbox} title="Command Center intake" body="Allows manual and normalized intake while preserving owner review." checked={data.controls.systemEnabled} disabled={busy} label={data.controls.systemEnabled ? "Pause Command Center intake" : "Open Command Center intake"} onChange={() => void updateControls({ systemEnabled: !data.controls.systemEnabled })} />
                <div className={styles.boundaryRow}><FileText aria-hidden="true" size={20} /><span><strong>Draft generation</strong><p>Structured review material only.</p></span><em>{data.capabilities.draftAgentsAvailable ? "Available" : "Unavailable"}</em></div>
                <div className={styles.boundaryRow}><LockKeyhole aria-hidden="true" size={20} /><span><strong>Simulation</strong><p>All drafts and decisions remain non-executing.</p></span><em>Locked on</em></div>
                <ControlRow icon={ShieldAlert} title="Global kill switch" body="Blocks draft generation. Manual review and evidence access remain available." checked={data.controls.killSwitchActive} danger disabled={busy} label={data.controls.killSwitchActive ? "Deactivate global kill switch" : "Activate global kill switch"} onChange={() => { if (!data.controls.killSwitchActive && !window.confirm("Activate the global kill switch and pause all draft generation?")) return; void updateControls({ killSwitchActive: !data.controls.killSwitchActive }); }} />
                <section className={styles.systemImpact}><h4>Impact</h4><p>All draft agents stop at once. Intake and evidence access remain available.</p><dl><div><dt>Access</dt><dd>Verified owner only</dd></div><div><dt>External executor</dt><dd>Unavailable</dd></div><div><dt>Billing actions</dt><dd>Disabled</dd></div><div><dt>Snapshot</dt><dd>Best-effort, non-atomic</dd></div></dl></section>
              </aside>

              <section className={styles.agentMatrix} aria-labelledby="draft-agent-contracts-title">
                <header><h3 id="draft-agent-contracts-title">Draft agents</h3><p>Each contract produces review material only. No bulk enable is available.</p></header>
                <div className={styles.agentTableWrap}>
                  <table className={styles.agentTable}>
                    <thead><tr><th>Agent</th><th>Purpose</th><th>Compatible inputs</th><th>Review-only output</th><th>Explicit prohibition</th><th>State control</th></tr></thead>
                    <tbody>
                      {(["support", "legal", "billing", "productOperations", "founderBrief"] as const).map((agentType) => {
                        const contract = agentContracts[agentType];
                        const disabled = busy || Boolean(environmentDraftBlockReason);
                        const reason = environmentDraftBlockReason ?? (busy ? "Another update is in progress." : null);
                        const descriptionId = `agent-contract-${agentType}-description`;
                        return <tr key={agentType}><th scope="row" data-label="Agent"><span className={styles.agentIdentity}><Bot aria-hidden="true" size={19} /><strong>{agentLabels[agentType]}</strong></span></th><td data-label="Purpose">{contract.purpose}</td><td data-label="Compatible inputs">{contract.inputs}</td><td data-label="Review-only output">{contract.output}</td><td data-label="Explicit prohibition" id={descriptionId}>{contract.prohibition}</td><td data-label="State control" className={styles.agentState}><button type="button" role="switch" aria-checked={data.controls.agentFlags[agentType]} aria-label={`${data.controls.agentFlags[agentType] ? "Disable" : "Enable"} ${agentLabels[agentType]} draft contract`} aria-describedby={descriptionId} aria-disabled={disabled} className={`${styles.switch} ${data.controls.agentFlags[agentType] ? styles.switchOn : ""}`} onClick={() => { if (!disabled) void updateControls({ agentType }); }}><span aria-hidden="true" /><em>{data.controls.agentFlags[agentType] ? "Enabled" : "Disabled"}</em></button>{reason && <small>{reason}</small>}</td></tr>;
                      })}
                    </tbody>
                  </table>
                </div>

                <section className={styles.futureAgents} aria-labelledby="future-agents-title"><header><h3 id="future-agents-title">Future agents</h3><p>Visible for boundary clarity, locked off by schema.</p></header><div className={styles.agentTableWrap}><table className={styles.agentTable}><thead><tr><th>Agent</th><th>Purpose</th><th>Compatible inputs</th><th>Review-only output</th><th>Explicit prohibition</th><th>State</th></tr></thead><tbody>{futureAgentContracts.map((contract) => <tr key={contract.name}><th scope="row" data-label="Agent"><span className={styles.agentIdentity}><ShieldAlert aria-hidden="true" size={19} /><strong>{contract.name}</strong></span></th><td data-label="Purpose">{contract.purpose}</td><td data-label="Compatible inputs">{contract.inputs}</td><td data-label="Review-only output">{contract.output}</td><td data-label="Explicit prohibition">{contract.prohibition}</td><td data-label="State" className={styles.agentState}><em>Locked off</em><small>Not available in this release.</small></td></tr>)}</tbody></table></div></section>
              </section>
            </div>
            <section className={styles.futureSection}><h3>Future boundary</h3><p>Providers, email, external effect execution, and autonomous actions are not configured. Enabling a draft contract does not change that boundary.</p></section>
            {data.warnings.length > 0 && <section className={styles.warningSection}><h3><AlertTriangle aria-hidden="true" size={17} />Snapshot warnings</h3><p>{data.warnings.length} malformed record{data.warnings.length === 1 ? " was" : "s were"} omitted. Warning details expose paths and codes only, never rejected values.</p><ul>{data.warnings.map((warning) => <li key={`${warning.section}-${warning.recordId}`}><code>{warning.section}/{warning.recordId}</code><span>{warning.issues.map((issue) => `${issue.path || "record"}: ${issue.code}`).join(", ")}</span></li>)}</ul></section>}
          </section>
        )}
      </main>

      <dialog ref={dialogRef} aria-labelledby="command-center-dialog-title" className={`${styles.dialog} ${dialog?.kind === "publish" ? styles.publicationDialog : ""}`} onCancel={(event) => { if (busy) event.preventDefault(); else setDialog(null); }} onClose={() => { if (!busy) setDialog(null); }}>
        {dialog?.kind === "new_ticket" && <form onSubmit={submitTicket}><DialogHeader title="Record a manual case" body="Create an owner-only operational record. This does not contact a learner or execute an action." onClose={() => setDialog(null)} /><div className={styles.dialogBody}><div className={styles.formGrid}><label>Category<select name="category" defaultValue="support">{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Risk<select name="riskLevel" defaultValue="low"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label></div><label>Subject<input name="subject" minLength={5} maxLength={160} required /></label><label>Operational summary<textarea name="summary" minLength={10} maxLength={2000} rows={4} required /></label><div className={styles.formGrid}><label>Confirmed facts <small>One per line, up to 10</small><textarea name="confirmedFacts" rows={4} /></label><label>Unverified claims <small>One per line, up to 10</small><textarea name="unverifiedClaims" rows={4} /></label></div><label>Tags <small>Comma-separated lowercase terms</small><input name="tags" pattern="[a-z0-9, -]*" /></label></div><DialogFooter busy={busy} action="Create case" onCancel={() => setDialog(null)} /> </form>}
        {dialog?.kind === "note" && <form onSubmit={submitNote}><DialogHeader title="Add an internal note" body="This note remains owner-only. Its body is not copied into the audit event summary." onClose={() => setDialog(null)} /><div className={styles.dialogBody}><label>Internal note<textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} minLength={2} maxLength={2000} rows={7} required /></label></div><DialogFooter busy={busy} action="Add internal note" onCancel={() => setDialog(null)} /></form>}
        {dialog?.kind === "approval_request" && <form onSubmit={submitApprovalRequest}><DialogHeader title="Request an owner decision" body="This records a proposed action for review. It cannot execute the action." onClose={() => setDialog(null)} /><div className={styles.dialogBody}><div className={styles.formGrid}><label>Action type<select name="actionType" defaultValue="send_response">{Object.entries(approvalActionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Risk<select name="riskLevel" defaultValue="high"><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label></div><label>Proposed action<textarea name="proposedAction" minLength={10} maxLength={500} rows={4} required /></label><label>Expected side effects <small>One per line</small><textarea name="sideEffects" minLength={3} rows={3} required /></label><label>Affected records <small>One stable reference per line</small><textarea name="affectedRecords" minLength={3} rows={3} required /></label><label>Policy references <small>Include an immutable version</small><textarea name="policyReferences" minLength={3} rows={3} required /></label><label>Expires after<select name="expiresInHours" defaultValue="24"><option value="1">1 hour</option><option value="4">4 hours</option><option value="24">24 hours</option><option value="72">72 hours</option></select></label></div><DialogFooter busy={busy} action="Create decision request" onCancel={() => setDialog(null)} /></form>}
        {dialog?.kind === "review" && <form onSubmit={submitReview}><DialogHeader title={dialog.decision === "rejected" ? "Record rejection" : dialog.decision === "approved" ? "Record approval" : "Accept review draft"} body={dialog.selection.kind === "approval" ? "Recent owner confirmation is required. The decision remains non-executing in simulation mode." : "This records review only. The draft will not be sent or executed."} onClose={() => setDialog(null)} /><div className={styles.dialogBody}><label>Review reason<textarea value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} minLength={10} maxLength={500} rows={5} required /></label></div><DialogFooter busy={busy} action={dialog.decision === "rejected" ? "Record rejection" : dialog.decision === "approved" ? "Confirm owner and record approval" : "Record acceptance"} danger={dialog.decision === "rejected"} onCancel={() => setDialog(null)} /></form>}
        {dialog?.kind === "publish" && <form onSubmit={publishToLearner}><DialogHeader title="Publish to learner" body="Preview the exact learner-visible text before confirming your identity." onClose={() => setDialog(null)} /><div className={styles.publicationBoundary}><Send aria-hidden="true" size={21} /><p><strong>This creates an external learner-visible effect.</strong> Publishing immediately makes this reply visible to the requester in Support Center. It does not send email, and no automated executor is connected.</p></div><div className={styles.dialogBody}><label>Learner-visible reply<textarea value={publicationText} onChange={(event) => setPublicationText(event.target.value)} minLength={2} maxLength={2000} rows={8} required /></label><div className={styles.preview}><span>Exact preview</span><p>{publicationText.trim() || "Your reply preview will appear here."}</p></div>{publicationFailure && <p className={styles.dialogError} role="alert"><AlertTriangle aria-hidden="true" size={17} />{publicationFailure} The exact body and idempotency key remain stored in this tab for a safe retry.</p>}</div><DialogFooter busy={busy} action={pendingPublication?.ticketId === dialog.ticketId ? "Confirm identity and retry exact publication" : "Confirm identity and publish"} publish onCancel={() => setDialog(null)} /></form>}
      </dialog>
    </AppShell>
  );
}

function DraftDossier({ draft, ticket, busy, onReview, onOpenTicket, onPublish }: {
  draft: CommandCenterDraft;
  ticket: CommandCenterTicket | null;
  busy: boolean;
  onReview: (decision: "accepted" | "rejected") => void;
  onOpenTicket: (ticketId: string) => void;
  onPublish: (ticket: CommandCenterTicket, body: string | null) => void;
}) {
  const content = draft.content;
  const stale = Boolean(ticket && draft.sourceTicketVersion !== undefined && draft.sourceTicketVersion !== ticket.version);
  return <><header className={styles.dossierHeader}><div><span>{ticket?.ticketNumber ?? "Queue-wide brief"}</span><h2>{content.headline}</h2></div><em className={styles.reviewStatus}>{stale ? "stale" : draft.status.replaceAll("_", " ")}</em></header><div className={styles.dossierScroll}>{stale && <section id="stale-draft-warning" className={styles.warningSection}><h3><AlertTriangle aria-hidden="true" size={17} />Ticket changed after generation</h3><p>Acceptance is blocked until a new draft is generated from ticket version {ticket?.version}. This draft remains available as review history.</p></section>}<section><h3>Draft summary</h3><p>{content.summary}</p></section>{content.responseDraft && <section className={styles.proposedReply}><h3><MessageSquareText aria-hidden="true" size={16} />Proposed response</h3><blockquote><p>{content.responseDraft}</p></blockquote><small>Review copy only. No recipient or send mechanism is connected.</small></section>}{content.priorities.length > 0 && <section><h3>Owner priorities</h3><ul className={styles.factList}>{content.priorities.map((item) => <li key={item}><Check aria-hidden="true" size={14} />{item}</li>)}</ul></section>}{content.groupedSignals.length > 0 && <section><h3>Grouped signals</h3><ul className={styles.factList}>{content.groupedSignals.map((item) => <li key={item}><Tag aria-hidden="true" size={14} />{item}</li>)}</ul></section>}<div className={styles.evidenceColumns}><section><h3>Missing information</h3>{content.missingInformation.length ? <ul className={styles.claimList}>{content.missingInformation.map((item) => <li key={item}><Circle aria-hidden="true" size={11} />{item}</li>)}</ul> : <p className={styles.muted}>None identified.</p>}</section><section><h3>Evidence used</h3>{content.evidenceUsed.length ? <ul className={styles.referenceList}>{content.evidenceUsed.map((item) => <li key={item}><code>{item}</code></li>)}</ul> : <p className={styles.muted}>No approved knowledge reference is cited.</p>}</section></div><section><h3>Confidence and cautions</h3><p><strong>{content.confidence} confidence.</strong> {content.confidenceRationale}</p>{content.cautions.length > 0 && <ul className={styles.claimList}>{content.cautions.map((item) => <li key={item}><AlertTriangle aria-hidden="true" size={14} />{item}</li>)}</ul>}</section><section><h3>Generation provenance</h3><dl className={styles.caseMeta}><div><dt>Agent</dt><dd>{agentLabels[draft.agentType]}</dd></div><div><dt>Model</dt><dd><code>{draft.model}</code></dd></div><div><dt>Prompt</dt><dd><code>{draft.promptVersion}</code></dd></div><div><dt>Source</dt><dd>{draft.sourceTicketVersion ?? "Queue manifest"}</dd></div><div><dt>External action</dt><dd>Disabled</dd></div></dl></section>{draft.reviewerReason && <section><h3>Recorded review</h3><p>{draft.reviewerReason}</p><small>{draft.reviewedAt ? formatDate(draft.reviewedAt) : "Review time unavailable"}</small></section>}</div><footer className={styles.actionDock}><p><ShieldCheck aria-hidden="true" size={20} /><span><strong>Review-only draft</strong>Accepting records judgment only. Nothing is sent or executed.</span></p><div>{ticket && <button className={styles.secondaryButton} onClick={() => onOpenTicket(ticket.id)}>Open case</button>}{draft.status === "accepted" && ticket?.source === "user_support" && content.responseDraft && <button className={styles.publishButton} onClick={() => onPublish(ticket, content.responseDraft ?? "")}><Send aria-hidden="true" size={17} />Open publication preview</button>}{draft.status === "pending_review" && <><button className={styles.dangerButton} disabled={busy} onClick={() => onReview("rejected")}><X aria-hidden="true" size={17} />Reject</button><button className={styles.primaryButton} aria-describedby={stale ? "stale-draft-warning" : undefined} disabled={busy || stale} onClick={() => onReview("accepted")}><Check aria-hidden="true" size={17} />Accept review</button></>}</div></footer></>;
}

function ApprovalDossier({ approval, ticket, busy, now, onReview, onOpenTicket }: {
  approval: CommandCenterApproval;
  ticket: CommandCenterTicket | null;
  busy: boolean;
  now: number;
  onReview: (decision: "approved" | "rejected") => void;
  onOpenTicket: (ticketId: string) => void;
}) {
  const expired = Date.parse(approval.expiresAt) <= now;
  const stale = Boolean(ticket && ticket.version !== approval.expectedTicketVersion);
  const blocked = expired || stale;
  return <><header className={styles.dossierHeader}><div><span>{ticket?.ticketNumber ?? "Decision request"}</span><h2>{approval.proposedAction}</h2></div><em className={styles.reviewStatus}>{expired ? "expired" : stale ? "stale" : approval.status}</em></header><div className={styles.dossierScroll}>{blocked && <section id="blocked-decision-warning" className={styles.warningSection}><h3><AlertTriangle aria-hidden="true" size={17} />Decision review blocked</h3><p>{expired ? "This request has expired and remains available as decision history." : `The case is now version ${ticket?.version}; this request was prepared for version ${approval.expectedTicketVersion}. Create a new decision request after reviewing the changed case.`}</p></section>}<section><h3>Why this needs review</h3><p>Policy requires the verified owner to make this decision. The record captures intent only; no effect executor is connected.</p></section><section><h3>Expected side effects</h3><ul className={styles.claimList}>{approval.sideEffects.map((item) => <li key={item}><AlertTriangle aria-hidden="true" size={14} />{item}</li>)}</ul></section><div className={styles.evidenceColumns}><section><h3>Affected records</h3><ul className={styles.referenceList}>{approval.affectedRecords.map((item) => <li key={item}><code>{item}</code></li>)}</ul></section><section><h3>Policy references</h3><ul className={styles.referenceList}>{approval.policyReferences.map((item) => <li key={item}><code>{item}</code></li>)}</ul></section></div><section><h3>Execution boundary</h3><dl className={styles.caseMeta}><div><dt>Simulation</dt><dd>On</dd></div><div><dt>Execution</dt><dd>{approval.executionState.replaceAll("_", " ")}</dd></div><div><dt>Risk</dt><dd className={riskClass(approval.riskLevel)}>{approval.riskLevel}</dd></div><div><dt>Expires</dt><dd>{formatDate(approval.expiresAt)}</dd></div></dl></section>{approval.reviewerReason && <section><h3>Recorded decision</h3><p>{approval.reviewerReason}</p><small>{approval.reviewedAt ? formatDate(approval.reviewedAt) : "Review time unavailable"}</small></section>}</div><footer className={styles.actionDock}><p><ShieldCheck aria-hidden="true" size={20} /><span><strong>Non-executing decision</strong>Approval records judgment only. No proposed action can run.</span></p><div>{ticket && <button className={styles.secondaryButton} onClick={() => onOpenTicket(ticket.id)}>Open case</button>}{approval.status === "pending" && <><button className={styles.dangerButton} aria-describedby={blocked ? "blocked-decision-warning" : undefined} disabled={busy || blocked} onClick={() => onReview("rejected")}><X aria-hidden="true" size={17} />Reject</button><button className={styles.primaryButton} aria-describedby={blocked ? "blocked-decision-warning" : undefined} disabled={busy || blocked} onClick={() => onReview("approved")}><UserRoundCheck aria-hidden="true" size={17} />Confirm owner and approve</button></>}</div></footer></>;
}

function ControlRow({ icon: Icon, title, body, reason = null, checked, disabled, danger = false, label, onChange }: { icon: LucideIcon; title: string; body: string; reason?: string | null; checked: boolean; disabled: boolean; danger?: boolean; label: string; onChange: () => void }) {
  const descriptionId = useId();
  return <div className={styles.controlRow}><Icon aria-hidden="true" size={19} /><span id={descriptionId}><strong>{title}</strong><p>{body}</p>{reason && <small>{reason}</small>}</span><button type="button" role="switch" aria-checked={checked} aria-label={label} aria-describedby={descriptionId} aria-disabled={disabled} className={`${styles.switch} ${checked ? styles.switchOn : ""} ${danger && checked ? styles.switchDanger : ""}`} onClick={() => { if (!disabled) onChange(); }}><span aria-hidden="true" /><em>{checked ? (danger ? "Active" : "Enabled") : (danger ? "Ready" : "Disabled")}</em></button></div>;
}

function DialogHeader({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
  return <header className={styles.dialogHeader}><div><h2 id="command-center-dialog-title">{title}</h2><p>{body}</p></div><button type="button" aria-label="Close dialog" onClick={onClose}><X aria-hidden="true" size={18} /></button></header>;
}

function DialogFooter({ busy, action, danger = false, publish = false, onCancel }: { busy: boolean; action: string; danger?: boolean; publish?: boolean; onCancel: () => void }) {
  return <footer className={styles.dialogFooter}><button type="button" className={styles.quietButton} disabled={busy} onClick={onCancel}>Cancel</button><button className={publish ? styles.publishButton : danger ? styles.dangerButton : styles.primaryButton} disabled={busy}>{busy ? <LoaderCircle className={styles.spin} aria-hidden="true" size={17} /> : publish ? <Send aria-hidden="true" size={17} /> : <Check aria-hidden="true" size={17} />}{busy ? "Working…" : action}</button></footer>;
}
