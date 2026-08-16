"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  FileCheck2,
  FileText,
  Inbox,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  UserRoundCheck,
  X,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import CommandCenterV2 from "./CommandCenterV2";
import type {
  CommandCenterApproval,
  CommandCenterApprovalActionType,
  CommandCenterDraft,
  CommandCenterDraftAgentType,
  CommandCenterRisk,
  CommandCenterSnapshot,
  CommandCenterTicket,
  CommandCenterTicketCategory,
  CommandCenterTicketStatus,
} from "@/lib/command-center-types";
import { matchesSearchQuery } from "@/lib/search";

type CommandCenterView = "inbox" | "drafts" | "approvals" | "audit" | "controls";
type ApprovalDecision = "approved" | "rejected";
type DraftDecision = "accepted" | "rejected";
type TicketField = "category" | "riskLevel" | "subject" | "summary" | "confirmedFacts" | "unverifiedClaims" | "tags";
type TicketFormErrors = Partial<Record<TicketField, string>>;

const PUBLIC_REPLY_PENDING_STORAGE_KEY = "filosage:command-center:public-reply:v1";

interface PendingPublicReply {
  ticketId: string;
  ticketNumber: string;
  expectedVersion: number;
  body: string;
  idempotencyKey: string;
}

function pendingPublicReply(): PendingPublicReply | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PUBLIC_REPLY_PENDING_STORAGE_KEY) ?? "null") as Partial<PendingPublicReply> | null;
    if (
      !parsed
      || typeof parsed.ticketId !== "string"
      || typeof parsed.ticketNumber !== "string"
      || typeof parsed.expectedVersion !== "number"
      || typeof parsed.body !== "string"
      || typeof parsed.idempotencyKey !== "string"
    ) return null;
    return parsed as PendingPublicReply;
  } catch {
    return null;
  }
}

const draftAgentLabels: Record<CommandCenterDraftAgentType, string> = {
  support: "Support",
  legal: "Legal intake",
  billing: "Billing explanation",
  productOperations: "Product operations",
  founderBrief: "Founder brief",
};

const availableDraftAgentTypes = Object.keys(draftAgentLabels) as CommandCenterDraftAgentType[];

function agentForTicket(ticket: CommandCenterTicket): Exclude<CommandCenterDraftAgentType, "founderBrief"> {
  if (["legal", "copyright", "privacy"].includes(ticket.category)) return "legal";
  if (ticket.category === "billing") return "billing";
  if (ticket.category === "product_feedback") return "productOperations";
  return "support";
}

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

const actionLabels: Record<CommandCenterApprovalActionType, string> = {
  send_response: "Send a response",
  restrict_account: "Restrict an account",
  remove_content: "Remove content",
  export_user_data: "Export user data",
  delete_user_data: "Delete user data",
  billing_adjustment: "Make a billing adjustment",
  policy_change: "Change a policy",
  publish_status: "Publish a status update",
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

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function relativeDue(value: string, now: number) {
  const minutes = Math.round((Date.parse(value) - now) / 60_000);
  const absolute = Math.abs(minutes);
  if (absolute < 60) return minutes < 0 ? `${absolute}m overdue` : `${absolute}m`;
  const hours = Math.round(absolute / 60);
  if (hours < 48) return minutes < 0 ? `${hours}h overdue` : `${hours}h`;
  const days = Math.round(hours / 24);
  return minutes < 0 ? `${days}d overdue` : `${days}d`;
}

function splitLines(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizedTags(value: FormDataEntryValue | null) {
  return [...new Set(String(value ?? "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean))];
}

function focusDesktopControl(element: HTMLElement | null) {
  if (!window.matchMedia("(min-width: 801px) and (pointer: fine)").matches) return;
  window.requestAnimationFrame(() => element?.focus());
}

function validateTicketForm(form: FormData) {
  const errors: TicketFormErrors = {};
  const category = String(form.get("category") ?? "");
  const riskLevel = String(form.get("riskLevel") ?? "");
  const subject = String(form.get("subject") ?? "").trim();
  const summary = String(form.get("summary") ?? "").trim();
  const confirmedFacts = splitLines(form.get("confirmedFacts"));
  const unverifiedClaims = splitLines(form.get("unverifiedClaims"));
  const tags = normalizedTags(form.get("tags"));

  if (!(category in categoryLabels)) errors.category = "Choose a supported ticket category.";
  if (!(["low", "medium", "high", "critical"] as string[]).includes(riskLevel)) errors.riskLevel = "Choose a supported risk level.";
  if (subject.length < 5) errors.subject = "Enter a subject of at least 5 characters.";
  else if (subject.length > 160) errors.subject = "Keep the subject to 160 characters or fewer.";
  if (summary.length < 10) errors.summary = "Enter an operational summary of at least 10 characters.";
  else if (summary.length > 2_000) errors.summary = "Keep the operational summary to 2,000 characters or fewer.";
  if (confirmedFacts.length > 10 || confirmedFacts.some((fact) => fact.length > 240)) errors.confirmedFacts = "Use at most 10 confirmed facts, with 240 characters or fewer per line.";
  if (unverifiedClaims.length > 10 || unverifiedClaims.some((claim) => claim.length > 240)) errors.unverifiedClaims = "Use at most 10 unverified claims, with 240 characters or fewer per line.";
  if (tags.length > 10) errors.tags = "Use at most 10 tags.";
  else if (tags.some((tag) => !/^[a-z0-9-]{1,32}$/.test(tag))) errors.tags = "Tags may contain lowercase letters, numbers, and hyphens only, up to 32 characters each.";

  return { errors, values: { category, riskLevel, subject, summary, confirmedFacts, unverifiedClaims, tags } };
}

function RiskBadge({ risk }: { risk: CommandCenterRisk }) {
  return <span className={`cc-badge cc-risk-${risk}`}><CircleAlert size={13} />{risk}</span>;
}

function StatusBadge({ status }: { status: CommandCenterTicketStatus }) {
  return <span className={`cc-badge cc-status-${status}`}>{statusLabels[status]}</span>;
}

function LegacyCommandCenterPage() {
  const { user, isOwner, loading: authLoading, reauthenticate } = useAuth();
  const [data, setData] = useState<CommandCenterSnapshot | null>(null);
  const [view, setView] = useState<CommandCenterView>("inbox");
  const [loading, setLoading] = useState(true);
  const [snapshotAt, setSnapshotAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<CommandCenterRisk | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<CommandCenterTicketCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<CommandCenterTicketStatus | "all">("all");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [approvalDecision, setApprovalDecision] = useState<ApprovalDecision | null>(null);
  const [draftDecision, setDraftDecision] = useState<DraftDecision | null>(null);
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [ticketFormDirty, setTicketFormDirty] = useState(false);
  const [ticketFormErrors, setTicketFormErrors] = useState<TicketFormErrors>({});
  const [ticketSubmitError, setTicketSubmitError] = useState<string | null>(null);
  const [ticketTags, setTicketTags] = useState<string[]>([]);
  const ticketSubmitting = useRef(false);
  const ticketIdempotencyKey = useRef<string | null>(null);
  const publicReplyOperation = useRef<{ fingerprint: string; key: string } | null>(null);
  const approvalReviewOperation = useRef<{ fingerprint: string; key: string } | null>(null);
  const publicReplyResumeStarted = useRef(false);
  const newTicketButton = useRef<HTMLButtonElement>(null);
  const ticketSubjectInput = useRef<HTMLInputElement>(null);
  const createTicketDialog = useRef<HTMLDialogElement>(null);
  const createTicketForm = useRef<HTMLFormElement>(null);
  const createApprovalDialog = useRef<HTMLDialogElement>(null);
  const decisionDialog = useRef<HTMLDialogElement>(null);
  const draftDecisionDialog = useRef<HTMLDialogElement>(null);
  const approvalReasonInput = useRef<HTMLTextAreaElement>(null);
  const draftReasonInput = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    if (!user || !isOwner) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/admin/command-center", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({})) as CommandCenterSnapshot & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The command center could not be loaded.");
      setData(body);
      setSnapshotAt(Date.now());
      setSelectedTicketId((current) => current && body.tickets.some((ticket) => ticket.id === current)
        ? current
        : body.tickets[0]?.id ?? null);
      setSelectedApprovalId((current) => current && body.approvals.some((approval) => approval.id === current)
        ? current
        : body.approvals.find((approval) => approval.status === "pending")?.id ?? body.approvals[0]?.id ?? null);
      setSelectedDraftId((current) => current && body.drafts.some((draft) => draft.id === current)
        ? current
        : body.drafts.find((draft) => draft.status === "pending_review")?.id ?? body.drafts[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The command center could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [isOwner, user]);

  useEffect(() => {
    if (authLoading) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [authLoading, load]);

  useEffect(() => {
    if (!ticketDialogOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [ticketDialogOpen]);

  useEffect(() => {
    if (!ticketDialogOpen || !ticketFormDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [ticketDialogOpen, ticketFormDirty]);

  const request = useCallback(async (path: string, method: "POST" | "PATCH", body: Record<string, unknown>, extraHeaders?: Record<string, string>) => {
    if (!user) throw new Error("Owner access is required.");
    const token = await user.getIdToken();
    const response = await fetch(path, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(result.error ?? "The command-center update failed.");
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

  const publishPublicReply = useCallback(async (
    pending: PendingPublicReply,
    reauthenticationToken: string,
  ) => {
    const saved = await runMutation(() => request(
      `/api/admin/command-center/tickets/${encodeURIComponent(pending.ticketId)}/public-replies`,
      "POST",
      { expectedVersion: pending.expectedVersion, body: pending.body },
      {
        "Idempotency-Key": pending.idempotencyKey,
        "X-Reauthentication-Token": reauthenticationToken,
      },
    ), "Learner-visible reply published once and recorded in the application audit log.");
    if (saved) {
      sessionStorage.removeItem(PUBLIC_REPLY_PENDING_STORAGE_KEY);
      publicReplyOperation.current = null;
      setSelectedTicketId(pending.ticketId);
    }
    return saved;
  }, [request, runMutation]);

  useEffect(() => {
    if (authLoading || !user || publicReplyResumeStarted.current) return;
    if (new URL(window.location.href).searchParams.get("filosage_reauthenticated") !== "1") return;
    const pending = pendingPublicReply();
    if (!pending) return;
    publicReplyResumeStarted.current = true;
    void (async () => {
      try {
        const refreshedUser = await reauthenticate("/admin/command-center");
        if (!refreshedUser.reauthenticationToken) {
          throw new Error("Sign-in confirmation did not return a publication proof.");
        }
        await publishPublicReply(pending, refreshedUser.reauthenticationToken);
      } catch (resumeError) {
        setError(resumeError instanceof Error ? resumeError.message : "The learner reply was not published.");
      } finally {
        publicReplyResumeStarted.current = false;
      }
    })();
  }, [authLoading, publishPublicReply, reauthenticate, user]);

  const filteredTickets = useMemo(() => (data?.tickets ?? []).filter((ticket) => {
    if (riskFilter !== "all" && ticket.riskLevel !== riskFilter) return false;
    if (categoryFilter !== "all" && ticket.category !== categoryFilter) return false;
    if (statusFilter !== "all" && ticket.status !== statusFilter) return false;
    return matchesSearchQuery(query, [
      ticket.ticketNumber,
      ticket.subject,
      ticket.normalizedSummary,
      ticket.category,
      ticket.status,
      ...ticket.tags,
    ]);
  }), [categoryFilter, data?.tickets, query, riskFilter, statusFilter]);

  const selectedTicket = data?.tickets.find((ticket) => ticket.id === selectedTicketId) ?? null;
  const selectedApproval = data?.approvals.find((approval) => approval.id === selectedApprovalId) ?? null;
  const selectedDraft = data?.drafts.find((draft) => draft.id === selectedDraftId) ?? null;
  const selectedApprovalTicket = data?.tickets.find((ticket) => ticket.id === selectedApproval?.ticketId) ?? null;
  const selectedDraftTicket = data?.tickets.find((ticket) => ticket.id === selectedDraft?.ticketId) ?? null;

  const chooseTicket = (ticket: CommandCenterTicket) => {
    setSelectedTicketId(ticket.id);
    setMobileDetailOpen(true);
  };

  const chooseApproval = (approval: CommandCenterApproval) => {
    setSelectedApprovalId(approval.id);
    setMobileDetailOpen(true);
  };

  const chooseDraft = (draft: CommandCenterDraft) => {
    setSelectedDraftId(draft.id);
    setMobileDetailOpen(true);
  };

  const openTicketDialog = () => {
    ticketIdempotencyKey.current = crypto.randomUUID();
    setTicketFormErrors({});
    setTicketSubmitError(null);
    setTicketDialogOpen(true);
    createTicketDialog.current?.showModal();
    focusDesktopControl(ticketSubjectInput.current);
  };

  const closeTicketDialog = (force = false) => {
    if (busy || ticketSubmitting.current) return;
    if (!force && ticketFormDirty && !window.confirm("Discard this unfinished ticket? Your entered information will be lost.")) return;
    createTicketDialog.current?.close();
  };

  const handleTicketDialogClose = () => {
    createTicketForm.current?.reset();
    setTicketDialogOpen(false);
    setTicketFormDirty(false);
    setTicketFormErrors({});
    setTicketSubmitError(null);
    setTicketTags([]);
    ticketIdempotencyKey.current = null;
    newTicketButton.current?.focus();
  };

  const createTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (ticketSubmitting.current) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const validation = validateTicketForm(form);
    setTicketFormErrors(validation.errors);
    setTicketSubmitError(null);
    const firstInvalid = Object.keys(validation.errors)[0] as TicketField | undefined;
    if (firstInvalid) {
      const invalidControl = formElement.elements.namedItem(firstInvalid);
      if (invalidControl instanceof HTMLElement) invalidControl.focus();
      return;
    }

    ticketSubmitting.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      ticketIdempotencyKey.current ??= crypto.randomUUID();
      const result = await request("/api/admin/command-center/tickets", "POST", validation.values, {
        "Idempotency-Key": ticketIdempotencyKey.current,
      }) as { ticket?: CommandCenterTicket };
      if (!result.ticket) throw new Error("The server did not return the created ticket.");
      await load();
      setSelectedTicketId(result.ticket.id);
      setView("inbox");
      setMobileDetailOpen(true);
      setQuery("");
      setRiskFilter("all");
      setCategoryFilter("all");
      setStatusFilter("all");
      setMessage(`${result.ticket.ticketNumber} created and recorded in the audit ledger.`);
      formElement.reset();
      setTicketFormDirty(false);
      createTicketDialog.current?.close();
    } catch (submissionError) {
      setTicketSubmitError(submissionError instanceof Error ? submissionError.message : "The ticket could not be created. Review the details and try again.");
    } finally {
      ticketSubmitting.current = false;
      setBusy(false);
    }
  };

  const updateTicket = async (ticket: CommandCenterTicket, body: Record<string, unknown>, success: string) => {
    await runMutation(() => request(`/api/admin/command-center/tickets/${encodeURIComponent(ticket.id)}`, "PATCH", {
      expectedVersion: ticket.version,
      ...body,
    }), success);
  };

  const addNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTicket) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const saved = await runMutation(() => request(`/api/admin/command-center/tickets/${encodeURIComponent(selectedTicket.id)}`, "PATCH", {
      expectedVersion: selectedTicket.version,
      note: form.get("note"),
    }), "Internal note added. Its contents were not copied into the audit ledger.");
    if (saved) formElement.reset();
  };

  const addPublicReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTicket) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = String(form.get("publicReply") ?? "").trim();
    if (!window.confirm(
      `Publish this reply to the requester for ${selectedTicket.ticketNumber}?\n\n${body}\n\nIt will be visible immediately and recorded as an external effect.`,
    )) return;
    const fingerprint = JSON.stringify({
      ticketId: selectedTicket.id,
      expectedVersion: selectedTicket.version,
      body,
    });
    if (publicReplyOperation.current?.fingerprint !== fingerprint) {
      publicReplyOperation.current = { fingerprint, key: crypto.randomUUID() };
    }
    const pending: PendingPublicReply = {
      ticketId: selectedTicket.id,
      ticketNumber: selectedTicket.ticketNumber,
      expectedVersion: selectedTicket.version,
      body,
      idempotencyKey: publicReplyOperation.current.key,
    };
    sessionStorage.setItem(PUBLIC_REPLY_PENDING_STORAGE_KEY, JSON.stringify(pending));
    let refreshedUser;
    try {
      refreshedUser = await reauthenticate("/admin/command-center");
      if (!refreshedUser.reauthenticationToken) {
        throw new Error("Sign-in confirmation did not return a publication proof.");
      }
    } catch (reauthenticationError) {
      setError(reauthenticationError instanceof Error ? reauthenticationError.message : "The learner reply was not published.");
      return;
    }
    const saved = await publishPublicReply(pending, refreshedUser.reauthenticationToken);
    if (saved) formElement.reset();
  };

  const createApproval = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTicket) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const created = await runMutation(() => request("/api/admin/command-center/approvals", "POST", {
      ticketId: selectedTicket.id,
      expectedTicketVersion: selectedTicket.version,
      actionType: form.get("actionType"),
      proposedAction: form.get("proposedAction"),
      riskLevel: form.get("riskLevel"),
      sideEffects: splitLines(form.get("sideEffects")),
      affectedRecords: splitLines(form.get("affectedRecords")),
      policyReferences: splitLines(form.get("policyReferences")),
      expiresInHours: Number(form.get("expiresInHours")),
    }), "Approval request created. No external action was executed.");
    if (created) {
      formElement.reset();
      createApprovalDialog.current?.close();
      setView("approvals");
    }
  };

  const openDecision = (decision: ApprovalDecision) => {
    setApprovalDecision(decision);
    decisionDialog.current?.showModal();
    focusDesktopControl(approvalReasonInput.current);
  };

  const reviewApproval = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedApproval || !approvalDecision) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const reason = String(form.get("reason") ?? "").trim();
    const fingerprint = JSON.stringify({
      approvalId: selectedApproval.id,
      expectedVersion: selectedApproval.version,
      decision: approvalDecision,
      reason,
    });
    if (approvalReviewOperation.current?.fingerprint !== fingerprint) {
      approvalReviewOperation.current = { fingerprint, key: `approval-review-${crypto.randomUUID()}` };
    }
    const saved = await runMutation(async () => {
      const recentlyAuthenticated = await reauthenticate("/admin/command-center");
      if (!recentlyAuthenticated.reauthenticationToken) {
        throw new Error("Sign-in confirmation did not return a decision proof.");
      }
      await request(`/api/admin/command-center/approvals/${encodeURIComponent(selectedApproval.id)}`, "PATCH", {
        expectedVersion: selectedApproval.version,
        decision: approvalDecision,
        reason,
      }, {
        "Idempotency-Key": approvalReviewOperation.current!.key,
        "X-Reauthentication-Token": recentlyAuthenticated.reauthenticationToken,
      });
    }, `${approvalDecision === "approved" ? "Approval" : "Rejection"} recorded in simulation mode. No external action was executed.`);
    if (saved) {
      approvalReviewOperation.current = null;
      formElement.reset();
      decisionDialog.current?.close();
      setApprovalDecision(null);
    }
  };

  const generateDraft = async (agentType: CommandCenterDraftAgentType, ticket?: CommandCenterTicket) => {
    let createdId: string | null = null;
    const generated = await runMutation(async () => {
      const result = await request("/api/admin/command-center/drafts", "POST", {
        agentType,
        ...(ticket ? { ticketId: ticket.id, expectedTicketVersion: ticket.version } : {}),
      }, { "Idempotency-Key": crypto.randomUUID() }) as { draft?: CommandCenterDraft };
      createdId = result.draft?.id ?? null;
    }, `${draftAgentLabels[agentType]} draft generated for review. Nothing was sent or executed.`);
    if (generated) {
      setView("drafts");
      if (createdId) setSelectedDraftId(createdId);
      setMobileDetailOpen(Boolean(createdId));
    }
  };

  const openDraftDecision = (decision: DraftDecision) => {
    setDraftDecision(decision);
    draftDecisionDialog.current?.showModal();
    focusDesktopControl(draftReasonInput.current);
  };

  const reviewDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedDraft || !draftDecision) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const saved = await runMutation(() => request(`/api/admin/command-center/drafts/${encodeURIComponent(selectedDraft.id)}`, "PATCH", {
      expectedVersion: selectedDraft.version,
      decision: draftDecision,
      reason: form.get("reason"),
    }), `${draftDecision === "accepted" ? "Acceptance" : "Rejection"} recorded. Nothing was sent or executed.`);
    if (saved) {
      formElement.reset();
      draftDecisionDialog.current?.close();
      setDraftDecision(null);
    }
  };

  const updateControls = async (next: { systemEnabled: boolean; killSwitchActive: boolean; agentFlags?: CommandCenterSnapshot["controls"]["agentFlags"] }) => {
    if (!data) return;
    await runMutation(() => request("/api/admin/command-center/controls", "PATCH", {
      expectedVersion: data.controls.version,
      systemEnabled: next.systemEnabled,
      killSwitchActive: next.killSwitchActive,
      agentFlags: next.agentFlags ?? data.controls.agentFlags,
    }), "Safety controls updated and audited.");
  };

  const toggleAgent = async (agentType: CommandCenterDraftAgentType) => {
    if (!data) return;
    await updateControls({
      systemEnabled: data.controls.systemEnabled,
      killSwitchActive: data.controls.killSwitchActive,
      agentFlags: { ...data.controls.agentFlags, [agentType]: !data.controls.agentFlags[agentType] },
    });
  };

  const setAvailableAgents = async (enabled: boolean) => {
    if (!data) return;
    await updateControls({
      systemEnabled: data.controls.systemEnabled,
      killSwitchActive: data.controls.killSwitchActive,
      agentFlags: availableDraftAgentTypes.reduce(
        (flags, agentType) => ({ ...flags, [agentType]: enabled }),
        { ...data.controls.agentFlags },
      ),
    });
  };

  const toggleCommandCenterIntake = () => {
    if (!data) return;
    const nextEnabled = !data.controls.systemEnabled;
    if (!window.confirm(`${nextEnabled ? "Enable" : "Pause"} command-center intake? This change is recorded in the audit ledger.`)) return;
    void updateControls({ systemEnabled: nextEnabled, killSwitchActive: data.controls.killSwitchActive });
  };

  const toggleKillSwitch = () => {
    if (!data) return;
    if (data.controls.killSwitchActive && !window.confirm("Deactivate the global kill switch? Draft generation will be available again under the current agent controls.")) return;
    void updateControls({ systemEnabled: data.controls.systemEnabled, killSwitchActive: !data.controls.killSwitchActive });
  };

  if (authLoading) {
    return <AppShell><div className="center-state"><LoaderCircle className="spin" /><h1>Verifying owner access</h1></div></AppShell>;
  }
  if (!user || !isOwner) {
    return <AppShell><div className="center-state"><ShieldCheck /><h1>This page is not available.</h1><p>The command center is restricted to the verified Filosage owner.</p><Link className="button button-primary" href="/">Return home</Link></div></AppShell>;
  }

  const controls = data?.controls;
  const pendingApprovals = data?.approvals.filter((approval) => approval.status === "pending").length ?? 0;
  const enabledDraftAgents = controls ? availableDraftAgentTypes.filter((agentType) => controls.agentFlags[agentType]).length : 0;
  const allAvailableDraftAgentsEnabled = enabledDraftAgents === availableDraftAgentTypes.length;
  const ticketFiltersActive = Boolean(query || riskFilter !== "all" || categoryFilter !== "all" || statusFilter !== "all");

  return (
    <AppShell>
      <div className="command-center-page">
        <header className="cc-page-header">
          <div>
            <Link href="/admin"><ArrowLeft size={16} /> Control room</Link>
            <h1>Agent command center</h1>
            <p>Review operational work, draft evidence-grounded responses and summaries, and record consequential decisions. Draft agents never send or execute actions automatically; owner-published support replies are visible to requesters immediately.</p>
          </div>
          <div className="cc-header-actions">
            <button className="button button-secondary" onClick={() => void load()} disabled={loading || busy}><RefreshCw className={loading ? "spin" : ""} size={16} />Refresh</button>
            <button ref={newTicketButton} className="button button-primary" onClick={openTicketDialog} disabled={!controls?.systemEnabled || busy}><Plus size={16} />New ticket</button>
          </div>
        </header>

        {data && (
          <section className="cc-status-strip" aria-label="Command-center safety status">
            <div className={!controls?.systemEnabled ? "is-warning" : ""}><ShieldCheck size={18} /><span><strong>Command center</strong><small>{controls?.systemEnabled ? "Enabled" : "Paused"}</small></span></div>
            <div><LockKeyhole size={18} /><span><strong>Agent simulation</strong><small>Drafts only</small></span></div>
            <div><UserRoundCheck size={18} /><span><strong>Draft agents</strong><small>{enabledDraftAgents} of {availableDraftAgentTypes.length} enabled</small></span></div>
            <div className={data.summary.overdueTickets ? "is-warning" : ""}><Clock3 size={18} /><span><strong>Overdue work</strong><small>{data.summary.overdueTickets} ticket{data.summary.overdueTickets === 1 ? "" : "s"}</small></span></div>
            <div className={controls?.killSwitchActive ? "is-danger" : ""}><ShieldAlert size={18} /><span><strong>Kill switch</strong><small>{controls?.killSwitchActive ? "Active" : "Ready"}</small></span></div>
          </section>
        )}

        {error && <div className="cc-feedback is-error" role="alert"><CircleAlert size={17} /><span>{error}</span><button onClick={() => setError(null)} aria-label="Dismiss error"><X size={15} /></button></div>}
        {message && <div className="cc-feedback is-success" role="status"><Check size={17} /><span>{message}</span><button onClick={() => setMessage(null)} aria-label="Dismiss message"><X size={15} /></button></div>}

        {loading && !data ? (
          <div className="cc-loading" aria-label="Loading command center"><span /><span /><span /></div>
        ) : data ? (
          <div className={`cc-shell ${mobileDetailOpen ? "is-mobile-detail" : ""}`}>
            <nav className="cc-section-nav" aria-label="Command center sections">
              <button aria-label={`Inbox, ${data.summary.openTickets} open`} aria-pressed={view === "inbox"} className={view === "inbox" ? "is-active" : ""} onClick={() => { setView("inbox"); setMobileDetailOpen(false); }}><Inbox size={17} /><span>Inbox</span><b>{data.summary.openTickets}</b></button>
              <button aria-label={`Drafts, ${data.summary.pendingDrafts} pending review`} aria-pressed={view === "drafts"} className={view === "drafts" ? "is-active" : ""} onClick={() => { setView("drafts"); setMobileDetailOpen(false); }}><Bot size={17} /><span>Drafts</span><b>{data.summary.pendingDrafts}</b></button>
              <button aria-label={`Approvals, ${pendingApprovals} pending`} aria-pressed={view === "approvals"} className={view === "approvals" ? "is-active" : ""} onClick={() => { setView("approvals"); setMobileDetailOpen(false); }}><FileCheck2 size={17} /><span>Approvals</span><b>{pendingApprovals}</b></button>
              <button aria-label="Audit log" aria-pressed={view === "audit"} className={view === "audit" ? "is-active" : ""} onClick={() => { setView("audit"); setMobileDetailOpen(false); }}><FileText size={17} /><span>Audit log</span></button>
              <button aria-label="Controls" aria-pressed={view === "controls"} className={view === "controls" ? "is-active" : ""} onClick={() => { setView("controls"); setMobileDetailOpen(false); }}><SlidersHorizontal size={17} /><span>Controls</span></button>
              <div><strong>Draft-agent boundary</strong><p>Agent outputs require owner review and cannot execute actions. An owner can separately publish a support reply.</p></div>
            </nav>

            <section className="cc-work-list" aria-label={view === "inbox" ? "Unified inbox" : view === "drafts" ? "Draft review queue" : view === "approvals" ? "Approval queue" : view === "audit" ? "Audit log" : "Safety controls"}>
              {view === "inbox" && (
                <>
                  <header className="cc-list-toolbar">
                    <div><h2>Unified inbox</h2><p>{filteredTickets.length} of {data.tickets.length} tickets</p></div>
                    <div className="cc-filter-controls">
                      <label><Search size={15} /><span className="sr-only">Search tickets</span><input type="search" name="ticketSearch" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tickets…" /></label>
                      <select aria-label="Filter by risk" value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as CommandCenterRisk | "all")}>
                        <option value="all">All risk</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                      </select>
                      <select aria-label="Filter by category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as CommandCenterTicketCategory | "all")}>
                        <option value="all">All categories</option>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CommandCenterTicketStatus | "all")}>
                        <option value="all">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <button type="button" className="button button-quiet cc-filter-reset" disabled={!ticketFiltersActive} onClick={() => { setQuery(""); setRiskFilter("all"); setCategoryFilter("all"); setStatusFilter("all"); }}>Reset</button>
                    </div>
                  </header>
                  <div className="cc-ticket-table">
                    <div className="cc-ticket-columns" aria-hidden="true"><span>Ticket</span><span>Category</span><span>Risk</span><span>Status</span><span>Due</span></div>
                    {filteredTickets.map((ticket) => (
                      <button key={ticket.id} className={selectedTicketId === ticket.id ? "is-selected" : ""} onClick={() => chooseTicket(ticket)}>
                        <span className="cc-ticket-title"><strong>{ticket.subject}</strong><small>{ticket.ticketNumber} · {ticket.source.replaceAll("_", " ")}</small></span>
                        <span>{categoryLabels[ticket.category]}</span>
                        <RiskBadge risk={ticket.riskLevel} />
                        <StatusBadge status={ticket.status} />
                        <span className={Date.parse(ticket.dueAt) < snapshotAt && !["resolved", "closed"].includes(ticket.status) ? "cc-due is-overdue" : "cc-due"}>{relativeDue(ticket.dueAt, snapshotAt)}</span>
                        <ChevronRight className="cc-row-chevron" size={16} />
                      </button>
                    ))}
                    {!filteredTickets.length && <div className="cc-empty"><Inbox size={22} /><h3>{data.tickets.length ? "No tickets match this view" : "No operational work yet"}</h3><p>{data.tickets.length ? "Clear a filter or search for another term." : "New content reports and manually created tickets will appear here."}</p></div>}
                  </div>
                </>
              )}

              {view === "drafts" && (
                <>
                  <header className="cc-list-toolbar"><div><h2>Draft review</h2><p>{data.summary.pendingDrafts} awaiting owner review</p></div><button className="button button-secondary" disabled={busy || !data.capabilities.draftAgentsAvailable || !controls?.agentFlags.founderBrief || controls.killSwitchActive} onClick={() => void generateDraft("founderBrief")}><Sparkles size={16} />Generate brief</button></header>
                  <div className="cc-draft-list">
                    {data.drafts.map((draft) => {
                      const ticket = data.tickets.find((candidate) => candidate.id === draft.ticketId);
                      return <button key={draft.id} className={selectedDraftId === draft.id ? "is-selected" : ""} onClick={() => chooseDraft(draft)}><span className="cc-draft-agent"><Bot size={16} /><em>{draftAgentLabels[draft.agentType]}</em></span><span><strong>{draft.content.headline}</strong><small>{ticket?.ticketNumber ?? "Queue-wide brief"} · {shortDate(draft.createdAt)}</small></span><em className={`cc-approval-status is-${draft.status}`}>{draft.status.replaceAll("_", " ")}</em><ChevronRight size={16} /></button>;
                    })}
                    {!data.drafts.length && <div className="cc-empty"><Bot size={22} /><h3>No review drafts yet</h3><p>Enable a bounded agent in Controls, then generate from a compatible ticket or create a queue-wide founder brief.</p></div>}
                  </div>
                </>
              )}

              {view === "approvals" && (
                <>
                  <header className="cc-list-toolbar"><div><h2>Approval queue</h2><p>Human decisions with no automatic execution</p></div></header>
                  <div className="cc-approval-list">
                    {data.approvals.map((approval) => {
                      const ticket = data.tickets.find((candidate) => candidate.id === approval.ticketId);
                      return <button key={approval.id} className={selectedApprovalId === approval.id ? "is-selected" : ""} onClick={() => chooseApproval(approval)}><span><strong>{approval.proposedAction}</strong><small>{ticket?.ticketNumber ?? "Unknown ticket"} · {actionLabels[approval.actionType]}</small></span><RiskBadge risk={approval.riskLevel} /><em className={`cc-approval-status is-${approval.status}`}>{approval.status}</em><ChevronRight size={16} /></button>;
                    })}
                    {!data.approvals.length && <div className="cc-empty"><FileCheck2 size={22} /><h3>No approval requests</h3><p>Create one from a ticket when a proposed action could affect a person, record, policy, or external system.</p></div>}
                  </div>
                </>
              )}

              {view === "audit" && (
                <>
                  <header className="cc-list-toolbar"><div><h2>Audit ledger</h2><p>Append-only application events · newest first</p></div></header>
                  <div className="cc-audit-list">
                    {data.auditEvents.map((event) => <article key={event.id}><span><FileText size={16} /></span><div><strong>{event.summary}</strong><p>{event.action} · {event.actorRole} · {event.externalSideEffect ? "external effect" : "no external effect"}</p><small>Correlation {event.correlationId}</small></div><time dateTime={event.createdAt}>{shortDate(event.createdAt)}</time></article>)}
                    {!data.auditEvents.length && <div className="cc-empty"><FileText size={22} /><h3>No command-center events yet</h3><p>Ticket, approval, and safety-control changes will create bounded audit records.</p></div>}
                  </div>
                </>
              )}

              {view === "controls" && controls && (
                <>
                  <header className="cc-list-toolbar"><div><h2>Safety controls</h2><p>Fail-closed controls for the entire command center</p></div><button className="button button-secondary" disabled={busy || !data.capabilities.draftAgentsAvailable || controls.killSwitchActive} onClick={() => void setAvailableAgents(!allAvailableDraftAgentsEnabled)}><Bot size={16} />{allAvailableDraftAgentsEnabled ? "Disable available agents" : "Enable available agents"}</button></header>
                  <div className="cc-controls-list">
                    <section><div><ShieldCheck size={19} /><span><strong>Command-center intake</strong><p>Allows manual tickets and normalized intake while preserving owner review.</p></span></div><button className={controls.systemEnabled ? "cc-switch is-on" : "cc-switch"} role="switch" aria-label={controls.systemEnabled ? "Pause command-center intake" : "Enable command-center intake"} aria-checked={controls.systemEnabled} disabled={busy} onClick={toggleCommandCenterIntake}><span />{controls.systemEnabled ? "Enabled" : "Paused"}</button></section>
                    <section><div><ShieldAlert size={19} /><span><strong>Global kill switch</strong><p>Blocks future agent and effect execution. Manual review and evidence access remain available.</p></span></div><button className={controls.killSwitchActive ? "cc-switch is-danger" : "cc-switch"} role="switch" aria-label={controls.killSwitchActive ? "Deactivate global kill switch" : "Activate global kill switch"} aria-checked={controls.killSwitchActive} disabled={busy} onClick={toggleKillSwitch}><span />{controls.killSwitchActive ? "Active" : "Ready"}</button></section>
                    <section><div><LockKeyhole size={19} /><span><strong>Simulation mode</strong><p>Draft and approval decisions are recorded, but no external action executor exists.</p></span></div><strong className="cc-locked-control">Locked on</strong></section>
                    {(["support", "legal", "billing", "productOperations", "founderBrief"] as const).map((agentType) => <section key={agentType}><div><Bot size={19} /><span><strong>{draftAgentLabels[agentType]} agent</strong><p>{agentType === "founderBrief" ? "Summarizes the current owner queue into review priorities." : "Produces structured review-only output from compatible tickets and approved knowledge."}</p></span></div><button className={controls.agentFlags[agentType] ? "cc-switch is-on" : "cc-switch"} role="switch" aria-label={`${controls.agentFlags[agentType] ? "Disable" : "Enable"} ${draftAgentLabels[agentType]} draft agent`} aria-checked={controls.agentFlags[agentType]} disabled={busy || !data.capabilities.draftAgentsAvailable || controls.killSwitchActive} onClick={() => void toggleAgent(agentType)}><span />{controls.agentFlags[agentType] ? "Enabled" : "Disabled"}</button></section>)}
                    <section><div><UserRoundCheck size={19} /><span><strong>Deferred agents</strong><p>Privacy, content-action, and knowledge-maintenance agents remain unavailable in this phase.</p></span></div><strong className="cc-locked-control">Locked off</strong></section>
                  </div>
                </>
              )}
            </section>

            <aside className="cc-inspector" aria-label="Selected work details">
              <button className="cc-mobile-back" onClick={() => setMobileDetailOpen(false)}><ArrowLeft size={16} />Back to {view === "approvals" ? "approvals" : view === "drafts" ? "drafts" : "inbox"}</button>
              {view === "inbox" ? selectedTicket ? (
                <TicketInspector key={selectedTicket.id} ticket={selectedTicket} busy={busy} draftAvailable={data.capabilities.draftAgentsAvailable && data.controls.agentFlags[agentForTicket(selectedTicket)] && !data.controls.killSwitchActive} onGenerateDraft={() => void generateDraft(agentForTicket(selectedTicket), selectedTicket)} onUpdate={updateTicket} onAddNote={addNote} onAddPublicReply={addPublicReply} onRequestApproval={() => createApprovalDialog.current?.showModal()} />
              ) : <InspectorEmpty icon={Inbox} title="Select a ticket" body="Choose an item from the queue to inspect evidence, history, and available next steps." />
                : view === "drafts" ? selectedDraft ? (
                  <DraftInspector draft={selectedDraft} ticket={selectedDraftTicket} busy={busy} onDecision={openDraftDecision} />
                ) : <InspectorEmpty icon={Bot} title="Select a draft" body="Choose an agent output to inspect its evidence, uncertainty, provenance, and review state." />
                : view === "approvals" ? selectedApproval ? (
                  <ApprovalInspector approval={selectedApproval} ticket={selectedApprovalTicket} busy={busy} onDecision={openDecision} />
                ) : <InspectorEmpty icon={FileCheck2} title="Select an approval" body="Choose a request to review its policy basis, affected records, and proposed side effects." />
                  : view === "audit" ? <InspectorEmpty icon={FileText} title="Bounded audit records" body="Audit metadata excludes unrestricted message bodies, private prompts, secrets, and full user-submitted content." />
                    : <InspectorEmpty icon={LockKeyhole} title="Draft-only safety boundary" body="Only explicitly enabled draft agents can run. All external action flags remain disabled, and billing is controlled separately." />}
            </aside>
          </div>
        ) : null}
      </div>

      <dialog
        ref={createTicketDialog}
        className="cc-dialog cc-ticket-dialog"
        aria-labelledby="cc-ticket-form-title"
        aria-describedby="cc-ticket-form-description"
        aria-modal="true"
        onClose={handleTicketDialogClose}
        onCancel={(event) => {
          event.preventDefault();
          closeTicketDialog();
        }}
      >
        <form ref={createTicketForm} onSubmit={createTicket} onInput={() => setTicketFormDirty(true)} autoComplete="off" noValidate>
          <header><div><span className="cc-dialog-icon"><Plus size={18} /></span><div><h2 id="cc-ticket-form-title">Create a manual ticket</h2><p id="cc-ticket-form-description">Capture the work, separate evidence from claims, and set the owner review priority.</p></div></div><button type="button" onClick={() => closeTicketDialog()} aria-label="Close ticket dialog"><X size={18} /></button></header>
          <div className="cc-ticket-form-body">
            <div className="cc-ticket-form-column">
              <fieldset className="cc-ticket-details">
              <legend><FileText size={17} /><span><strong>Ticket details</strong><small>Required information for the owner queue</small></span></legend>
              <div className="cc-form-grid"><label htmlFor="cc-ticket-category"><span className="cc-label-row"><span>Category</span><span className="cc-required">Required</span></span><select id="cc-ticket-category" name="category" defaultValue="support" aria-invalid={Boolean(ticketFormErrors.category)} aria-describedby={ticketFormErrors.category ? "cc-ticket-category-error" : undefined}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{ticketFormErrors.category && <small id="cc-ticket-category-error" className="cc-field-error">{ticketFormErrors.category}</small>}</label><label htmlFor="cc-ticket-risk"><span className="cc-label-row"><span>Risk level</span><span className="cc-required">Required</span></span><select id="cc-ticket-risk" name="riskLevel" defaultValue="medium" aria-invalid={Boolean(ticketFormErrors.riskLevel)} aria-describedby={ticketFormErrors.riskLevel ? "cc-ticket-risk-error" : undefined}><option value="low">Low · routine</option><option value="medium">Medium · review within 24 hours</option><option value="high">High · review within 4 hours</option><option value="critical">Critical · review within 1 hour</option></select>{ticketFormErrors.riskLevel && <small id="cc-ticket-risk-error" className="cc-field-error">{ticketFormErrors.riskLevel}</small>}</label></div>
              <label htmlFor="cc-ticket-subject"><span className="cc-label-row"><span>Subject</span><span className="cc-required">Required</span></span><input ref={ticketSubjectInput} id="cc-ticket-subject" name="subject" minLength={5} maxLength={160} placeholder="A concise description of the work…" required aria-invalid={Boolean(ticketFormErrors.subject)} aria-describedby={ticketFormErrors.subject ? "cc-ticket-subject-error" : undefined} />{ticketFormErrors.subject && <small id="cc-ticket-subject-error" className="cc-field-error">{ticketFormErrors.subject}</small>}</label>
              <label htmlFor="cc-ticket-summary"><span className="cc-label-row"><span>Operational summary</span><span className="cc-required">Required</span></span><small id="cc-ticket-summary-help">Write a neutral summary that another reviewer can understand without opening the source.</small><textarea id="cc-ticket-summary" name="summary" minLength={10} maxLength={2000} rows={5} placeholder="What needs attention, who or what is affected, and what is known right now?" required aria-invalid={Boolean(ticketFormErrors.summary)} aria-describedby={ticketFormErrors.summary ? "cc-ticket-summary-help cc-ticket-summary-error" : "cc-ticket-summary-help"} />{ticketFormErrors.summary && <small id="cc-ticket-summary-error" className="cc-field-error">{ticketFormErrors.summary}</small>}</label>
              </fieldset>
            </div>

            <div className="cc-ticket-form-column">
              <fieldset className="cc-ticket-evidence">
              <legend><ShieldCheck size={17} /><span><strong>Evidence quality</strong><small>Keep verified information separate from reported claims</small></span></legend>
              <div className="cc-evidence-grid">
                <label htmlFor="cc-ticket-facts"><span><Check size={15} />Confirmed facts</span><small id="cc-ticket-facts-help">Verified information only · one fact per line · up to 10</small><textarea id="cc-ticket-facts" name="confirmedFacts" rows={5} placeholder={"Account is verified\nIssue reproduced on the lesson page"} aria-invalid={Boolean(ticketFormErrors.confirmedFacts)} aria-describedby={ticketFormErrors.confirmedFacts ? "cc-ticket-facts-help cc-ticket-facts-error" : "cc-ticket-facts-help"} />{ticketFormErrors.confirmedFacts && <small id="cc-ticket-facts-error" className="cc-field-error">{ticketFormErrors.confirmedFacts}</small>}</label>
                <label htmlFor="cc-ticket-claims"><span><CircleAlert size={15} />Unverified claims</span><small id="cc-ticket-claims-help">Reported but unconfirmed · one claim per line · up to 10</small><textarea id="cc-ticket-claims" name="unverifiedClaims" rows={5} placeholder={"Learner reports the issue started today\nA browser extension may be involved"} aria-invalid={Boolean(ticketFormErrors.unverifiedClaims)} aria-describedby={ticketFormErrors.unverifiedClaims ? "cc-ticket-claims-help cc-ticket-claims-error" : "cc-ticket-claims-help"} />{ticketFormErrors.unverifiedClaims && <small id="cc-ticket-claims-error" className="cc-field-error">{ticketFormErrors.unverifiedClaims}</small>}</label>
              </div>
              </fieldset>

              <fieldset className="cc-ticket-organization">
              <legend><Tags size={17} /><span><strong>Organization</strong><small>Optional terms for search and recurring-issue analysis</small></span></legend>
              <label htmlFor="cc-ticket-tags">Tags <small id="cc-ticket-tags-help">Comma-separated. Spaces and duplicates are removed; tags are saved in lowercase.</small><input id="cc-ticket-tags" name="tags" placeholder="login, lesson-access, known-issue" aria-invalid={Boolean(ticketFormErrors.tags)} aria-describedby={ticketFormErrors.tags ? "cc-ticket-tags-help cc-ticket-tags-error" : "cc-ticket-tags-help"} onChange={(event) => setTicketTags(normalizedTags(event.currentTarget.value))} />{ticketFormErrors.tags && <small id="cc-ticket-tags-error" className="cc-field-error">{ticketFormErrors.tags}</small>}</label>
              {ticketTags.length > 0 && <div className="cc-tag-preview" aria-label="Tags to be saved">{ticketTags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
              </fieldset>
            </div>
          </div>
          <footer><div className="cc-ticket-footer-copy"><span><LockKeyhole size={14} /> Owner-only · recorded in the audit ledger</span>{ticketSubmitError && <span className="cc-ticket-submit-error" role="alert"><CircleAlert size={14} />{ticketSubmitError}</span>}</div><div><button type="button" className="button button-quiet" onClick={() => closeTicketDialog()}>Cancel</button><button className="button button-primary" disabled={busy} aria-describedby="cc-ticket-submit-status">{busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}{busy ? "Creating ticket…" : "Create ticket"}</button><span id="cc-ticket-submit-status" className="sr-only" aria-live="polite">{busy ? "Creating the ticket" : ticketSubmitError ?? ""}</span></div></footer>
        </form>
      </dialog>

      <dialog ref={createApprovalDialog} className="cc-dialog" aria-labelledby="cc-approval-form-title" aria-modal="true">
        <form key={selectedTicket?.id ?? "no-ticket"} onSubmit={createApproval} autoComplete="off">
          <header><div><h2 id="cc-approval-form-title">Request owner approval</h2><p>This records a proposed action for review. It cannot execute the action.</p></div><button type="button" onClick={() => createApprovalDialog.current?.close()} aria-label="Close"><X size={18} /></button></header>
          <div className="cc-form-grid"><label>Action type<select name="actionType" defaultValue="send_response">{Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Risk level<select name="riskLevel" defaultValue={selectedTicket?.riskLevel === "critical" ? "critical" : "high"}><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label></div>
          <label>Proposed action<textarea name="proposedAction" minLength={10} maxLength={500} rows={3} required /></label>
          <label>Expected side effects <small>One per line</small><textarea name="sideEffects" minLength={3} rows={3} required /></label>
          <label>Affected records <small>One stable reference per line</small><textarea name="affectedRecords" minLength={3} rows={3} defaultValue={selectedTicket?.evidenceReferences.join("\n")} required /></label>
          <label>Policy references <small>Include an immutable version</small><textarea name="policyReferences" minLength={3} rows={2} placeholder="Support response policy v1" required /></label>
          <label>Expires after<select name="expiresInHours" defaultValue="24"><option value="1">1 hour</option><option value="4">4 hours</option><option value="24">24 hours</option><option value="72">72 hours</option></select></label>
          <footer><button type="button" className="button button-quiet" onClick={() => createApprovalDialog.current?.close()}>Cancel</button><button className="button button-primary" disabled={busy}><FileCheck2 size={16} />Create request</button></footer>
        </form>
      </dialog>

      <dialog ref={decisionDialog} className="cc-dialog cc-decision-dialog" aria-labelledby="cc-approval-decision-title" aria-modal="true">
        <form onSubmit={reviewApproval} autoComplete="off">
          <header><div><h2 id="cc-approval-decision-title">{approvalDecision === "approved" ? "Approve the proposal" : "Reject the proposal"}</h2><p>Your decision is audited. Phase 1 will not execute the proposed action.</p></div><button type="button" onClick={() => decisionDialog.current?.close()} aria-label="Close"><X size={18} /></button></header>
          <label>Decision reason<textarea ref={approvalReasonInput} name="reason" minLength={10} maxLength={500} rows={4} required /></label>
          <footer><button type="button" className="button button-quiet" onClick={() => decisionDialog.current?.close()}>Cancel</button><button className={approvalDecision === "approved" ? "button button-primary" : "button button-danger"} disabled={busy}>{approvalDecision === "approved" ? <Check size={16} /> : <X size={16} />}Record {approvalDecision === "approved" ? "approval" : "rejection"}</button></footer>
        </form>
      </dialog>

      <dialog ref={draftDecisionDialog} className="cc-dialog cc-decision-dialog" aria-labelledby="cc-draft-decision-title" aria-modal="true">
        <form onSubmit={reviewDraft} autoComplete="off">
          <header><div><h2 id="cc-draft-decision-title">{draftDecision === "accepted" ? "Accept this draft" : "Reject this draft"}</h2><p>This records the owner review only. It will not send the draft or execute an action.</p></div><button type="button" onClick={() => draftDecisionDialog.current?.close()} aria-label="Close"><X size={18} /></button></header>
          <label>Review reason<textarea ref={draftReasonInput} name="reason" minLength={10} maxLength={500} rows={4} required /></label>
          <footer><button type="button" className="button button-quiet" onClick={() => draftDecisionDialog.current?.close()}>Cancel</button><button className={draftDecision === "accepted" ? "button button-primary" : "button button-danger"} disabled={busy}>{draftDecision === "accepted" ? <Check size={16} /> : <X size={16} />}Record {draftDecision === "accepted" ? "acceptance" : "rejection"}</button></footer>
        </form>
      </dialog>
    </AppShell>
  );
}

function nextTicketAction(ticket: CommandCenterTicket): { label: string; status: CommandCenterTicketStatus } | null {
  if (["new", "triaged", "approved"].includes(ticket.status)) return { label: "Start work", status: "in_progress" };
  if (ticket.status === "in_progress") return { label: "Resolve ticket", status: "resolved" };
  if (ticket.status === "resolved") return { label: "Reopen ticket", status: "in_progress" };
  if (ticket.status === "waiting_for_admin") return { label: "Return to triage", status: "triaged" };
  return null;
}

function TicketInspector({ ticket, busy, draftAvailable, onGenerateDraft, onUpdate, onAddNote, onAddPublicReply, onRequestApproval }: {
  ticket: CommandCenterTicket;
  busy: boolean;
  draftAvailable: boolean;
  onGenerateDraft: () => void;
  onUpdate: (ticket: CommandCenterTicket, body: Record<string, unknown>, success: string) => Promise<void>;
  onAddNote: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onAddPublicReply: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onRequestApproval: () => void;
}) {
  const nextAction = nextTicketAction(ticket);
  return <>
    <header className="cc-inspector-header"><div><span>{ticket.ticketNumber}</span><h2>{ticket.subject}</h2></div><RiskBadge risk={ticket.riskLevel} /><div className="cc-inspector-meta"><span><strong>Category</strong>{categoryLabels[ticket.category]}</span><span><strong>Status</strong>{statusLabels[ticket.status]}</span><span><strong>Due</strong>{shortDate(ticket.dueAt)}</span><span><strong>Version</strong>{ticket.version}</span></div></header>
    <div className="cc-inspector-scroll">
      <section><h3>Operational summary</h3><p>{ticket.normalizedSummary}</p></section>
      <section><h3><ShieldCheck size={16} />Confirmed facts</h3>{ticket.confirmedFacts.length ? <ul className="cc-fact-list">{ticket.confirmedFacts.map((fact) => <li key={fact}><Check size={14} />{fact}</li>)}</ul> : <p className="cc-muted-copy">No confirmed facts have been recorded.</p>}</section>
      <section><h3><CircleAlert size={16} />Unverified claims</h3>{ticket.unverifiedClaims.length ? <ul className="cc-claim-list">{ticket.unverifiedClaims.map((claim) => <li key={claim}><CircleAlert size={14} />{claim}</li>)}</ul> : <p className="cc-muted-copy">No unverified claims are summarized.</p>}{ticket.untrustedExcerpt && <blockquote><strong>Untrusted reporter text</strong><p>{ticket.untrustedExcerpt}</p></blockquote>}</section>
      <section><h3><FileText size={16} />Evidence references</h3>{ticket.evidenceReferences.length ? <ul className="cc-reference-list">{ticket.evidenceReferences.map((reference) => <li key={reference}><code>{reference}</code></li>)}</ul> : <p className="cc-muted-copy">No evidence reference is attached yet.</p>}</section>
      {ticket.requestContext && <section><h3><ExternalLink size={16} />Submitted page context</h3><dl className="cc-boundary-list"><div><dt>Path</dt><dd><code>{ticket.requestContext.pathname}</code></dd></div>{ticket.requestContext.pageTitle && <div><dt>Page title</dt><dd>{ticket.requestContext.pageTitle}</dd></div>}</dl></section>}
      <section><h3><Tags size={16} />Tags</h3><div className="cc-tags">{ticket.tags.length ? ticket.tags.map((tag) => <span key={tag}>{tag}</span>) : <span>untagged</span>}</div></section>
      <section><h3><MessageSquareText size={16} />Internal notes</h3>{ticket.notes.length ? <div className="cc-note-list">{ticket.notes.map((note) => <article key={note.id}><p>{note.body}</p><small>{shortDate(note.createdAt)} · owner</small></article>)}</div> : <p className="cc-muted-copy">No internal notes yet.</p>}<form className="cc-note-form" onSubmit={onAddNote}><label htmlFor="cc-internal-note">Add an internal note</label><textarea id="cc-internal-note" name="note" minLength={2} maxLength={2000} rows={3} required /><button className="button button-secondary" disabled={busy}>Add note</button></form></section>
      {ticket.source === "user_support" && <section><h3><MessageSquareText size={16} />Learner-visible replies</h3><p className="cc-muted-copy">Published replies are shown to the requester. Internal notes above remain owner-only.</p>{ticket.publicReplies.length ? <div className="cc-note-list">{ticket.publicReplies.map((reply) => <article key={reply.id}><p>{reply.body}</p><small>{shortDate(reply.createdAt)} · published to requester</small></article>)}</div> : <p className="cc-muted-copy">No public replies have been published.</p>}<form className="cc-note-form" onSubmit={onAddPublicReply}><label htmlFor="cc-public-reply">Publish a reply to the learner</label><small>Publishing immediately makes this text visible in the requester’s Support Center.</small><textarea id="cc-public-reply" name="publicReply" minLength={2} maxLength={2000} rows={4} disabled={busy} required /><button className="button button-secondary" disabled={busy}>Publish reply</button></form></section>}
    </div>
    <footer className="cc-inspector-actions"><button className="button button-secondary" onClick={onGenerateDraft} disabled={busy || !draftAvailable || ticket.status === "closed"}><Sparkles size={16} />Generate draft</button><button className="button button-secondary" onClick={onRequestApproval} disabled={busy || ticket.status === "closed"}><FileCheck2 size={16} />Request approval</button>{nextAction && <button className="button button-primary" disabled={busy} onClick={() => void onUpdate(ticket, { status: nextAction.status }, `${ticket.ticketNumber} moved to ${statusLabels[nextAction.status].toLowerCase()}.`)}>{nextAction.label}</button>}</footer>
  </>;
}

function DraftInspector({ draft, ticket, busy, onDecision }: {
  draft: CommandCenterDraft;
  ticket: CommandCenterTicket | null;
  busy: boolean;
  onDecision: (decision: DraftDecision) => void;
}) {
  const content = draft.content;
  return <>
    <header className="cc-inspector-header"><div><span>{ticket?.ticketNumber ?? "Queue-wide brief"}</span><h2>{content.headline}</h2></div><span className={`cc-confidence is-${content.confidence}`}><Bot size={14} />{content.confidence} confidence</span><div className="cc-inspector-meta"><span><strong>Agent</strong>{draftAgentLabels[draft.agentType]}</span><span><strong>Status</strong>{draft.status.replaceAll("_", " ")}</span><span><strong>Generated</strong>{shortDate(draft.createdAt)}</span><span><strong>Execution</strong>Not executed</span></div></header>
    <div className="cc-inspector-scroll">
      <section><h3>Draft summary</h3><p>{content.summary}</p></section>
      {content.responseDraft && <section className="cc-draft-copy"><h3><MessageSquareText size={16} />Proposed response</h3><blockquote><p>{content.responseDraft}</p></blockquote><small>Review copy only. No recipient or send mechanism is connected.</small></section>}
      {content.priorities.length > 0 && <section><h3>Owner priorities</h3><ul className="cc-fact-list">{content.priorities.map((priority) => <li key={priority}><Check size={14} />{priority}</li>)}</ul></section>}
      {content.groupedSignals.length > 0 && <section><h3>Grouped signals</h3><ul className="cc-fact-list">{content.groupedSignals.map((signal) => <li key={signal}><Tags size={14} />{signal}</li>)}</ul></section>}
      {(content.recommendedCategory || content.recommendedRisk || content.recommendedTags.length > 0) && <section><h3>Classification recommendation</h3><dl className="cc-boundary-list"><div><dt>Category</dt><dd>{content.recommendedCategory ? categoryLabels[content.recommendedCategory] : "No change proposed"}</dd></div><div><dt>Risk</dt><dd>{content.recommendedRisk ?? "No change proposed"}</dd></div><div><dt>Tags</dt><dd>{content.recommendedTags.join(", ") || "None"}</dd></div></dl><small>Recommendations do not modify the ticket automatically.</small></section>}
      <section><h3><CircleAlert size={16} />Missing information</h3>{content.missingInformation.length ? <ul className="cc-claim-list">{content.missingInformation.map((item) => <li key={item}><CircleAlert size={14} />{item}</li>)}</ul> : <p className="cc-muted-copy">No missing information was identified.</p>}</section>
      {content.escalationReasons.length > 0 && <section><h3><ShieldAlert size={16} />Escalation reasons</h3><ul className="cc-claim-list">{content.escalationReasons.map((reason) => <li key={reason}><ShieldAlert size={14} />{reason}</li>)}</ul></section>}
      <section><h3><FileText size={16} />Evidence used</h3>{content.evidenceUsed.length ? <ul className="cc-reference-list">{content.evidenceUsed.map((reference) => <li key={reference}><code>{reference}</code></li>)}</ul> : <p className="cc-muted-copy">The draft cites no approved knowledge reference.</p>}</section>
      <section><h3>Confidence and cautions</h3><p>{content.confidenceRationale}</p><ul className="cc-claim-list">{content.cautions.map((caution) => <li key={caution}><CircleAlert size={14} />{caution}</li>)}</ul></section>
      <section><h3>Generation provenance</h3><dl className="cc-boundary-list"><div><dt>Model</dt><dd><code>{draft.model}</code></dd></div><div><dt>Prompt</dt><dd><code>{draft.promptVersion}</code></dd></div><div><dt>Source version</dt><dd>{draft.sourceTicketVersion ?? "Queue snapshot"}</dd></div><div><dt>External action</dt><dd>Disabled</dd></div></dl></section>
      {draft.reviewerReason && <section><h3>Recorded review</h3><p>{draft.reviewerReason}</p><small>{draft.reviewedAt ? shortDate(draft.reviewedAt) : "Review time unavailable"}</small></section>}
    </div>
    {draft.status === "pending_review" && <footer className="cc-inspector-actions"><button className="button button-danger" disabled={busy} onClick={() => onDecision("rejected")}><X size={16} />Reject draft</button><button className="button button-primary" disabled={busy} onClick={() => onDecision("accepted")}><Check size={16} />Accept draft</button></footer>}
  </>;
}

function ApprovalInspector({ approval, ticket, busy, onDecision }: {
  approval: CommandCenterApproval;
  ticket: CommandCenterTicket | null;
  busy: boolean;
  onDecision: (decision: ApprovalDecision) => void;
}) {
  return <>
    <header className="cc-inspector-header"><div><span>{ticket?.ticketNumber ?? "Approval request"}</span><h2>{approval.proposedAction}</h2></div><RiskBadge risk={approval.riskLevel} /><div className="cc-inspector-meta"><span><strong>Action</strong>{actionLabels[approval.actionType]}</span><span><strong>Status</strong>{approval.status}</span><span><strong>Expires</strong>{shortDate(approval.expiresAt)}</span><span><strong>Execution</strong>Not executed</span></div></header>
    <div className="cc-inspector-scroll">
      <section><h3>Why this needs review</h3><p>Policy requires the verified owner to make this decision. Approval records intent only; Phase 1 has no effect executor.</p></section>
      <section><h3>Expected side effects</h3><ul className="cc-claim-list">{approval.sideEffects.map((effect) => <li key={effect}><CircleAlert size={14} />{effect}</li>)}</ul></section>
      <section><h3>Affected records</h3><ul className="cc-reference-list">{approval.affectedRecords.map((record) => <li key={record}><code>{record}</code></li>)}</ul></section>
      <section><h3>Policy references</h3><ul className="cc-reference-list">{approval.policyReferences.map((policy) => <li key={policy}><code>{policy}</code></li>)}</ul></section>
      <section><h3>Execution boundary</h3><dl className="cc-boundary-list"><div><dt>Simulation mode</dt><dd>On</dd></div><div><dt>External action</dt><dd>Disabled</dd></div><div><dt>Idempotency key</dt><dd><code>{approval.idempotencyKey}</code></dd></div></dl></section>
      {approval.reviewerReason && <section><h3>Recorded decision</h3><p>{approval.reviewerReason}</p><small>{approval.reviewedAt ? shortDate(approval.reviewedAt) : "Review time unavailable"}</small></section>}
    </div>
    {approval.status === "pending" && <footer className="cc-inspector-actions"><button className="button button-danger" disabled={busy} onClick={() => onDecision("rejected")}><X size={16} />Reject</button><button className="button button-primary" disabled={busy} onClick={() => onDecision("approved")}><Check size={16} />Approve proposal</button></footer>}
  </>;
}

function InspectorEmpty({ icon: Icon, title, body }: { icon: typeof Inbox; title: string; body: string }) {
  return <div className="cc-inspector-empty"><Icon size={24} /><h2>{title}</h2><p>{body}</p></div>;
}

export default function CommandCenterPage() {
  return process.env.NEXT_PUBLIC_COMMAND_CENTER_V2 === "true"
    ? <CommandCenterV2 />
    : <LegacyCommandCenterPage />;
}
