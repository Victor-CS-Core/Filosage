import "server-only";

import { commandCenterDraftsEnvironmentEnabled } from "@/lib/command-center-auth";

import {
  canTransitionCommandCenterTicket,
  commandCenterApprovalIsExpired,
  commandCenterDueAt,
  commandCenterPriority,
  defaultCommandCenterControls,
  sanitizeCommandCenterState,
} from "@/lib/command-center-policy";
import type {
  CommandCenterApproval,
  CommandCenterApprovalActionType,
  CommandCenterAuditEvent,
  CommandCenterControls,
  CommandCenterDraft,
  CommandCenterDraftAgentType,
  CommandCenterDraftContent,
  CommandCenterRisk,
  CommandCenterSnapshot,
  CommandCenterTicket,
  CommandCenterTicketCategory,
  CommandCenterTicketStatus,
} from "@/lib/command-center-types";
import {
  createStoredDocument,
  getStoredDocument,
  listCollectionDocuments,
  runStoredDocumentTransaction,
  type StoredDocument,
} from "@/lib/firebase-server";

const TICKETS = "commandCenterTickets";
const APPROVALS = "commandCenterApprovals";
const DRAFTS = "commandCenterDrafts";
const AUDIT_EVENTS = "commandCenterAuditEvents";
const CONTROLS_PATH = "commandCenterControls/global";

export class CommandCenterConflictError extends Error {
  readonly status = 409;
}

export class CommandCenterNotFoundError extends Error {
  readonly status = 404;
}

export class CommandCenterDisabledError extends Error {
  readonly status = 409;
}

function parseControls(document: StoredDocument | null): CommandCenterControls {
  if (!document) return structuredClone(defaultCommandCenterControls);
  return {
    ...structuredClone(defaultCommandCenterControls),
    ...document,
    version: Number(document.version ?? 1),
    systemEnabled: document.systemEnabled !== false,
    simulationMode: true,
    killSwitchActive: document.killSwitchActive === true,
    agentFlags: commandCenterDraftsEnvironmentEnabled()
      ? { ...structuredClone(defaultCommandCenterControls.agentFlags), ...(document.agentFlags as CommandCenterControls["agentFlags"] | undefined) }
      : structuredClone(defaultCommandCenterControls.agentFlags),
    actionFlags: structuredClone(defaultCommandCenterControls.actionFlags),
  } as CommandCenterControls;
}

function ticketNumber(id: string) {
  return `TKT-${id.replaceAll("-", "").slice(0, 7).toUpperCase()}`;
}

function auditEvent(input: {
  id: string;
  actorUid: string;
  actorRole?: "owner" | "system";
  action: string;
  targetType: CommandCenterAuditEvent["targetType"];
  targetId: string;
  ticketId?: string;
  correlationId: string;
  summary: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: string;
}): CommandCenterAuditEvent {
  return {
    id: input.id,
    actorUid: input.actorUid,
    actorRole: input.actorRole ?? "owner",
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    ticketId: input.ticketId,
    correlationId: input.correlationId,
    summary: input.summary.slice(0, 240),
    beforeState: sanitizeCommandCenterState(input.beforeState),
    afterState: sanitizeCommandCenterState(input.afterState),
    metadata: sanitizeCommandCenterState(input.metadata) ?? {},
    externalSideEffect: false,
    createdAt: input.createdAt,
  };
}

function assertSystemEnabled(controls: CommandCenterControls) {
  if (!controls.systemEnabled) {
    throw new CommandCenterDisabledError("The command center is paused. Re-enable it in Controls before creating new work.");
  }
}

function assertDraftAgentEnabled(controls: CommandCenterControls, agentType: CommandCenterDraftAgentType) {
  assertSystemEnabled(controls);
  if (!commandCenterDraftsEnvironmentEnabled()) {
    throw new CommandCenterDisabledError("Draft agents are not available in this environment.");
  }
  if (controls.killSwitchActive) {
    throw new CommandCenterDisabledError("The kill switch is active. Draft generation is paused.");
  }
  if (!controls.agentFlags[agentType]) {
    throw new CommandCenterDisabledError("Enable this draft agent in Controls before generating a draft.");
  }
}

export async function getCommandCenterSnapshot(): Promise<CommandCenterSnapshot> {
  const [controlsDocument, ticketDocuments, approvalDocuments, draftDocuments, auditDocuments] = await Promise.all([
    getStoredDocument(CONTROLS_PATH),
    listCollectionDocuments(TICKETS, 500),
    listCollectionDocuments(APPROVALS, 500),
    listCollectionDocuments(DRAFTS, 500),
    listCollectionDocuments(AUDIT_EVENTS, 500),
  ]);
  const now = Date.now();
  const tickets = (ticketDocuments as unknown as CommandCenterTicket[])
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const approvals = (approvalDocuments as unknown as CommandCenterApproval[])
    .map((approval) => approval.status === "pending" && commandCenterApprovalIsExpired(approval.expiresAt)
      ? { ...approval, status: "expired" as const }
      : approval)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const auditEvents = (auditDocuments as unknown as CommandCenterAuditEvent[])
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const drafts = (draftDocuments as unknown as CommandCenterDraft[])
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const openTickets = tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status));
  return {
    controls: parseControls(controlsDocument),
    tickets,
    approvals,
    drafts,
    auditEvents,
    capabilities: {
      draftAgentsAvailable: commandCenterDraftsEnvironmentEnabled(),
    },
    summary: {
      openTickets: openTickets.length,
      highRiskTickets: openTickets.filter((ticket) => ticket.riskLevel === "high" || ticket.riskLevel === "critical").length,
      pendingApprovals: approvals.filter((approval) => approval.status === "pending").length,
      overdueTickets: openTickets.filter((ticket) => Date.parse(ticket.dueAt) < now).length,
      pendingDrafts: drafts.filter((draft) => draft.status === "pending_review").length,
    },
  };
}

export async function createManualCommandCenterTicket(input: {
  actorUid: string;
  category: CommandCenterTicketCategory;
  riskLevel: CommandCenterRisk;
  subject: string;
  summary: string;
  confirmedFacts: string[];
  unverifiedClaims: string[];
  tags: string[];
}) {
  const id = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const correlationId = crypto.randomUUID();
  const now = new Date();
  const ticket: CommandCenterTicket = {
    id,
    ticketNumber: ticketNumber(id),
    version: 1,
    source: "manual",
    category: input.category,
    riskLevel: input.riskLevel,
    priority: commandCenterPriority(input.riskLevel),
    status: "new",
    subject: input.subject,
    normalizedSummary: input.summary,
    assignedRole: "owner",
    requiresHumanApproval: false,
    confirmedFacts: input.confirmedFacts,
    unverifiedClaims: input.unverifiedClaims,
    evidenceReferences: [],
    tags: input.tags,
    notes: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    dueAt: commandCenterDueAt(input.riskLevel, now),
  };
  const audit = auditEvent({
    id: auditId,
    actorUid: input.actorUid,
    action: "ticket.created",
    targetType: "ticket",
    targetId: id,
    ticketId: id,
    correlationId,
    summary: `Created ${ticket.ticketNumber}`,
    afterState: { status: ticket.status, riskLevel: ticket.riskLevel, version: ticket.version },
    metadata: { source: ticket.source, category: ticket.category },
    createdAt: ticket.createdAt,
  });
  await runStoredDocumentTransaction([CONTROLS_PATH, `${TICKETS}/${id}`, `${AUDIT_EVENTS}/${auditId}`], (documents) => {
    assertSystemEnabled(parseControls(documents[CONTROLS_PATH]));
    if (documents[`${TICKETS}/${id}`]) throw new CommandCenterConflictError("The ticket already exists.");
    return {
      writes: [
        { path: `${TICKETS}/${id}`, data: ticket },
        { path: `${AUDIT_EVENTS}/${auditId}`, data: audit },
      ],
      result: ticket,
    };
  });
  return ticket;
}

export async function createUserCommandCenterTicket(input: {
  actorUid: string;
  category: Extract<CommandCenterTicketCategory, "support" | "billing" | "privacy" | "product_feedback" | "other">;
  subject: string;
  message: string;
}) {
  const id = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const correlationId = crypto.randomUUID();
  const now = new Date();
  const riskLevel: CommandCenterRisk = input.category === "product_feedback" ? "low" : "medium";
  const categoryLabel = input.category.replaceAll("_", " ");
  const ticket: CommandCenterTicket = {
    id,
    ticketNumber: ticketNumber(id),
    version: 1,
    source: "user_support",
    category: input.category,
    riskLevel,
    priority: commandCenterPriority(riskLevel),
    status: "new",
    subject: input.subject,
    normalizedSummary: `A signed-in learner submitted a ${categoryLabel} request for owner review. The description is unverified user-provided context.`,
    untrustedExcerpt: input.message,
    relatedUserId: input.actorUid,
    assignedRole: "owner",
    requiresHumanApproval: input.category === "billing" || input.category === "privacy",
    confirmedFacts: [
      "The request was submitted from a verified Erudoza account.",
      `Request category: ${categoryLabel}`,
    ],
    unverifiedClaims: ["The request description has not yet been verified by the owner."],
    evidenceReferences: [],
    tags: ["user-submitted", input.category.replaceAll("_", "-")],
    notes: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    dueAt: commandCenterDueAt(riskLevel, now),
  };
  const audit = auditEvent({
    id: auditId,
    actorUid: input.actorUid,
    actorRole: "system",
    action: "ticket.ingested",
    targetType: "ticket",
    targetId: id,
    ticketId: id,
    correlationId,
    summary: `Ingested ${ticket.ticketNumber} from signed-in support`,
    afterState: { status: ticket.status, riskLevel: ticket.riskLevel, version: ticket.version },
    metadata: { source: ticket.source, category: ticket.category },
    createdAt: ticket.createdAt,
  });
  await runStoredDocumentTransaction([CONTROLS_PATH, `${TICKETS}/${id}`, `${AUDIT_EVENTS}/${auditId}`], (documents) => {
    assertSystemEnabled(parseControls(documents[CONTROLS_PATH]));
    if (documents[`${TICKETS}/${id}`]) throw new CommandCenterConflictError("The ticket already exists.");
    return {
      writes: [
        { path: `${TICKETS}/${id}`, data: ticket },
        { path: `${AUDIT_EVENTS}/${auditId}`, data: audit },
      ],
      result: ticket,
    };
  });
  return ticket;
}

export async function updateCommandCenterTicket(input: {
  actorUid: string;
  ticketId: string;
  expectedVersion: number;
  status?: CommandCenterTicketStatus;
  assignedRole?: "owner";
  tags?: string[];
  note?: string;
}) {
  const path = `${TICKETS}/${input.ticketId}`;
  const auditId = crypto.randomUUID();
  const auditPath = `${AUDIT_EVENTS}/${auditId}`;
  const correlationId = crypto.randomUUID();
  const now = new Date().toISOString();
  return runStoredDocumentTransaction<CommandCenterTicket>([path, auditPath], (documents) => {
    const current = documents[path] as CommandCenterTicket | null;
    if (!current) throw new CommandCenterNotFoundError("Ticket not found.");
    if (current.version !== input.expectedVersion) {
      throw new CommandCenterConflictError("This ticket changed after it was opened. Refresh before saving.");
    }
    if (input.status && !canTransitionCommandCenterTicket(current.status, input.status)) {
      throw new CommandCenterConflictError(`A ${current.status.replaceAll("_", " ")} ticket cannot move directly to ${input.status.replaceAll("_", " ")}.`);
    }
    const next: CommandCenterTicket = {
      ...current,
      version: current.version + 1,
      status: input.status ?? current.status,
      assignedRole: input.assignedRole ?? current.assignedRole,
      tags: input.tags ?? current.tags,
      notes: input.note
        ? [...current.notes, { id: crypto.randomUUID(), authorUid: input.actorUid, body: input.note, createdAt: now }]
        : current.notes,
      updatedAt: now,
      resolvedAt: input.status === "resolved" ? now : current.resolvedAt,
    };
    const audit = auditEvent({
      id: auditId,
      actorUid: input.actorUid,
      action: input.note ? "ticket.note_added" : "ticket.updated",
      targetType: "ticket",
      targetId: current.id,
      ticketId: current.id,
      correlationId,
      summary: input.note ? `Added an internal note to ${current.ticketNumber}` : `Updated ${current.ticketNumber}`,
      beforeState: { status: current.status, version: current.version },
      afterState: { status: next.status, version: next.version },
      metadata: { noteAdded: Boolean(input.note) },
      createdAt: now,
    });
    return { writes: [{ path, data: next }, { path: auditPath, data: audit }], result: next };
  });
}

export async function createCommandCenterApproval(input: {
  actorUid: string;
  ticketId: string;
  expectedTicketVersion: number;
  actionType: CommandCenterApprovalActionType;
  proposedAction: string;
  riskLevel: CommandCenterRisk;
  sideEffects: string[];
  affectedRecords: string[];
  policyReferences: string[];
  expiresInHours: number;
}) {
  const ticketPath = `${TICKETS}/${input.ticketId}`;
  const id = crypto.randomUUID();
  const approvalPath = `${APPROVALS}/${id}`;
  const auditId = crypto.randomUUID();
  const auditPath = `${AUDIT_EVENTS}/${auditId}`;
  const correlationId = crypto.randomUUID();
  const now = new Date();
  return runStoredDocumentTransaction<CommandCenterApproval>([CONTROLS_PATH, ticketPath, approvalPath, auditPath], (documents) => {
    assertSystemEnabled(parseControls(documents[CONTROLS_PATH]));
    const ticket = documents[ticketPath] as CommandCenterTicket | null;
    if (!ticket) throw new CommandCenterNotFoundError("Ticket not found.");
    if (ticket.version !== input.expectedTicketVersion) {
      throw new CommandCenterConflictError("This ticket changed after the approval was prepared. Refresh and review it again.");
    }
    const approval: CommandCenterApproval = {
      id,
      version: 1,
      ticketId: ticket.id,
      actionType: input.actionType,
      proposedAction: input.proposedAction,
      riskLevel: input.riskLevel,
      sideEffects: input.sideEffects,
      affectedRecords: input.affectedRecords,
      policyReferences: input.policyReferences,
      requiredApproverRole: "owner",
      status: "pending",
      executionState: "not_executed",
      idempotencyKey: crypto.randomUUID(),
      expectedTicketVersion: ticket.version + 1,
      requestedBy: input.actorUid,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + input.expiresInHours * 60 * 60 * 1_000).toISOString(),
    };
    const nextTicket: CommandCenterTicket = {
      ...ticket,
      version: ticket.version + 1,
      status: "waiting_for_admin",
      requiresHumanApproval: true,
      updatedAt: now.toISOString(),
    };
    const audit = auditEvent({
      id: auditId,
      actorUid: input.actorUid,
      action: "approval.requested",
      targetType: "approval",
      targetId: id,
      ticketId: ticket.id,
      correlationId,
      summary: `Requested owner approval for ${ticket.ticketNumber}`,
      afterState: { status: approval.status, actionType: approval.actionType, version: approval.version },
      metadata: { simulationMode: true, externalSideEffect: false },
      createdAt: now.toISOString(),
    });
    return {
      writes: [
        { path: ticketPath, data: nextTicket },
        { path: approvalPath, data: approval },
        { path: auditPath, data: audit },
      ],
      result: approval,
    };
  });
}

export async function reviewCommandCenterApproval(input: {
  actorUid: string;
  approvalId: string;
  expectedVersion: number;
  decision: "approved" | "rejected";
  reason: string;
}) {
  const approvalPath = `${APPROVALS}/${input.approvalId}`;
  const initial = await getStoredDocument(approvalPath) as CommandCenterApproval | null;
  if (!initial) throw new CommandCenterNotFoundError("Approval request not found.");
  const ticketPath = `${TICKETS}/${initial.ticketId}`;
  const auditId = crypto.randomUUID();
  const auditPath = `${AUDIT_EVENTS}/${auditId}`;
  const correlationId = crypto.randomUUID();
  const now = new Date();
  return runStoredDocumentTransaction<CommandCenterApproval>([approvalPath, ticketPath, auditPath], (documents) => {
    const approval = documents[approvalPath] as CommandCenterApproval | null;
    const ticket = documents[ticketPath] as CommandCenterTicket | null;
    if (!approval || !ticket) throw new CommandCenterNotFoundError("The approval request is incomplete.");
    if (approval.version !== input.expectedVersion || approval.status !== "pending") {
      throw new CommandCenterConflictError("This approval has already changed. Refresh before deciding.");
    }
    if (commandCenterApprovalIsExpired(approval.expiresAt, now)) {
      throw new CommandCenterConflictError("This approval expired. Create a new request after reviewing the current ticket.");
    }
    if (ticket.version !== approval.expectedTicketVersion) {
      throw new CommandCenterConflictError("The ticket changed after this approval was requested. Create a fresh request.");
    }
    const reviewed: CommandCenterApproval = {
      ...approval,
      version: approval.version + 1,
      status: input.decision,
      reviewedAt: now.toISOString(),
      reviewedBy: input.actorUid,
      reviewerReason: input.reason,
      executionState: "not_executed",
    };
    const nextTicket: CommandCenterTicket = {
      ...ticket,
      version: ticket.version + 1,
      status: input.decision === "approved" ? "approved" : "triaged",
      requiresHumanApproval: false,
      updatedAt: now.toISOString(),
    };
    const audit = auditEvent({
      id: auditId,
      actorUid: input.actorUid,
      action: `approval.${input.decision}`,
      targetType: "approval",
      targetId: approval.id,
      ticketId: ticket.id,
      correlationId,
      summary: `${input.decision === "approved" ? "Approved" : "Rejected"} a simulated action for ${ticket.ticketNumber}`,
      beforeState: { status: approval.status, version: approval.version },
      afterState: { status: reviewed.status, version: reviewed.version },
      metadata: { executionState: reviewed.executionState, reasonRecorded: true },
      createdAt: now.toISOString(),
    });
    return {
      writes: [
        { path: approvalPath, data: reviewed },
        { path: ticketPath, data: nextTicket },
        { path: auditPath, data: audit },
      ],
      result: reviewed,
    };
  });
}

export async function getCommandCenterDraft(draftId: string) {
  return getStoredDocument(`${DRAFTS}/${draftId}`) as Promise<CommandCenterDraft | null>;
}

export async function storeGeneratedCommandCenterDraft(input: {
  id: string;
  actorUid: string;
  agentType: CommandCenterDraftAgentType;
  ticketId?: string;
  expectedTicketVersion?: number;
  content: CommandCenterDraftContent;
  model: string;
  generationProfile: string;
  promptVersion: string;
}) {
  const draftPath = `${DRAFTS}/${input.id}`;
  const auditId = crypto.randomUUID();
  const auditPath = `${AUDIT_EVENTS}/${auditId}`;
  const ticketPath = input.ticketId ? `${TICKETS}/${input.ticketId}` : undefined;
  const paths = [CONTROLS_PATH, draftPath, auditPath, ...(ticketPath ? [ticketPath] : [])];
  const now = new Date().toISOString();
  return runStoredDocumentTransaction<CommandCenterDraft>(paths, (documents) => {
    const controls = parseControls(documents[CONTROLS_PATH]);
    assertDraftAgentEnabled(controls, input.agentType);
    if (documents[draftPath]) throw new CommandCenterConflictError("This draft already exists.");
    const ticket = ticketPath ? documents[ticketPath] as CommandCenterTicket | null : null;
    if (ticketPath && !ticket) throw new CommandCenterNotFoundError("Ticket not found.");
    if (ticket && ticket.version !== input.expectedTicketVersion) {
      throw new CommandCenterConflictError("The ticket changed while the draft was generated. Review the current ticket and generate a fresh draft.");
    }
    const draft: CommandCenterDraft = {
      id: input.id,
      version: 1,
      scope: input.agentType === "founderBrief" ? "founder_brief" : "ticket",
      ticketId: ticket?.id,
      sourceTicketVersion: ticket?.version,
      agentType: input.agentType,
      status: "pending_review",
      content: input.content,
      model: input.model,
      generationProfile: input.generationProfile,
      promptVersion: input.promptVersion,
      requestedBy: input.actorUid,
      createdAt: now,
      externalSideEffect: false,
    };
    const audit = auditEvent({
      id: auditId,
      actorUid: input.actorUid,
      action: "draft.generated",
      targetType: "draft",
      targetId: draft.id,
      ticketId: ticket?.id,
      correlationId: crypto.randomUUID(),
      summary: `Generated a review-only ${input.agentType} draft`,
      afterState: { status: draft.status, version: draft.version, agentType: draft.agentType },
      metadata: { model: draft.model, promptVersion: draft.promptVersion, externalSideEffect: false },
      createdAt: now,
    });
    return {
      writes: [{ path: draftPath, data: draft }, { path: auditPath, data: audit }],
      result: draft,
    };
  });
}

export async function reviewCommandCenterDraft(input: {
  actorUid: string;
  draftId: string;
  expectedVersion: number;
  decision: "accepted" | "rejected";
  reason: string;
}) {
  const draftPath = `${DRAFTS}/${input.draftId}`;
  const initial = await getStoredDocument(draftPath) as CommandCenterDraft | null;
  if (!initial) throw new CommandCenterNotFoundError("Draft not found.");
  const ticketPath = initial.ticketId ? `${TICKETS}/${initial.ticketId}` : undefined;
  const auditId = crypto.randomUUID();
  const auditPath = `${AUDIT_EVENTS}/${auditId}`;
  const now = new Date().toISOString();
  return runStoredDocumentTransaction<CommandCenterDraft>([draftPath, auditPath, ...(ticketPath ? [ticketPath] : [])], (documents) => {
    const draft = documents[draftPath] as CommandCenterDraft | null;
    if (!draft) throw new CommandCenterNotFoundError("Draft not found.");
    if (draft.version !== input.expectedVersion || draft.status !== "pending_review") {
      throw new CommandCenterConflictError("This draft has already changed. Refresh before recording a decision.");
    }
    const ticket = ticketPath ? documents[ticketPath] as CommandCenterTicket | null : null;
    if (ticketPath && (!ticket || ticket.version !== draft.sourceTicketVersion)) {
      throw new CommandCenterConflictError("The source ticket changed after this draft was generated. Generate a fresh draft before accepting it.");
    }
    const reviewed: CommandCenterDraft = {
      ...draft,
      version: draft.version + 1,
      status: input.decision,
      reviewedAt: now,
      reviewedBy: input.actorUid,
      reviewerReason: input.reason,
      externalSideEffect: false,
    };
    const audit = auditEvent({
      id: auditId,
      actorUid: input.actorUid,
      action: `draft.${input.decision}`,
      targetType: "draft",
      targetId: draft.id,
      ticketId: draft.ticketId,
      correlationId: crypto.randomUUID(),
      summary: `${input.decision === "accepted" ? "Accepted" : "Rejected"} a review-only ${draft.agentType} draft`,
      beforeState: { status: draft.status, version: draft.version },
      afterState: { status: reviewed.status, version: reviewed.version },
      metadata: { reasonRecorded: true, externalSideEffect: false },
      createdAt: now,
    });
    return { writes: [{ path: draftPath, data: reviewed }, { path: auditPath, data: audit }], result: reviewed };
  });
}

export async function updateCommandCenterControls(input: {
  actorUid: string;
  expectedVersion: number;
  systemEnabled: boolean;
  killSwitchActive: boolean;
  agentFlags: CommandCenterControls["agentFlags"];
}) {
  const auditId = crypto.randomUUID();
  const auditPath = `${AUDIT_EVENTS}/${auditId}`;
  const correlationId = crypto.randomUUID();
  const now = new Date().toISOString();
  return runStoredDocumentTransaction<CommandCenterControls>([CONTROLS_PATH, auditPath], (documents) => {
    const current = parseControls(documents[CONTROLS_PATH]);
    if (current.version !== input.expectedVersion) {
      throw new CommandCenterConflictError("The command-center controls changed. Refresh before saving.");
    }
    const next: CommandCenterControls = {
      ...structuredClone(defaultCommandCenterControls),
      version: current.version + 1,
      systemEnabled: input.systemEnabled,
      simulationMode: true,
      killSwitchActive: input.killSwitchActive,
      agentFlags: commandCenterDraftsEnvironmentEnabled()
        ? { ...structuredClone(defaultCommandCenterControls.agentFlags), ...input.agentFlags }
        : structuredClone(defaultCommandCenterControls.agentFlags),
      updatedAt: now,
      updatedBy: input.actorUid,
    };
    const audit = auditEvent({
      id: auditId,
      actorUid: input.actorUid,
      action: "controls.updated",
      targetType: "controls",
      targetId: "global",
      correlationId,
      summary: "Updated command-center safety controls",
      beforeState: {
        systemEnabled: current.systemEnabled,
        killSwitchActive: current.killSwitchActive,
        supportAgent: current.agentFlags.support,
        legalAgent: current.agentFlags.legal,
        billingAgent: current.agentFlags.billing,
        productOperationsAgent: current.agentFlags.productOperations,
        founderBriefAgent: current.agentFlags.founderBrief,
        version: current.version,
      },
      afterState: {
        systemEnabled: next.systemEnabled,
        killSwitchActive: next.killSwitchActive,
        supportAgent: next.agentFlags.support,
        legalAgent: next.agentFlags.legal,
        billingAgent: next.agentFlags.billing,
        productOperationsAgent: next.agentFlags.productOperations,
        founderBriefAgent: next.agentFlags.founderBrief,
        version: next.version,
      },
      metadata: { simulationMode: true, externalEffectsEnabled: false },
      createdAt: now,
    });
    return { writes: [{ path: CONTROLS_PATH, data: next }, { path: auditPath, data: audit }], result: next };
  });
}

export async function createContentReportAndCommandCenterTicket(input: {
  reportId: string;
  report: Record<string, unknown>;
  commandCenterEnabled: boolean;
}) {
  if (!input.commandCenterEnabled) {
    return createStoredDocument("contentReports", input.report, input.reportId);
  }
  const reportPath = `contentReports/${input.reportId}`;
  const ticketId = `ccr-${input.reportId}`;
  const ticketPath = `${TICKETS}/${ticketId}`;
  const auditId = crypto.randomUUID();
  const auditPath = `${AUDIT_EVENTS}/${auditId}`;
  const now = String(input.report.createdAt);
  const category = String(input.report.category ?? "other");
  const serious = category === "safety" || category === "copyright";
  const target = typeof input.report.lessonId === "string"
    ? `lesson ${input.report.lessonId}`
    : typeof input.report.sourceId === "string"
      ? `source ${input.report.sourceId}`
      : "course content";
  const ticket: CommandCenterTicket = {
    id: ticketId,
    ticketNumber: ticketNumber(ticketId),
    version: 1,
    source: "content_report",
    sourceRecordId: input.reportId,
    category: "content_report",
    riskLevel: serious ? "high" : "medium",
    priority: serious ? 2 : 3,
    status: "new",
    subject: `${category === "copyright" ? "Copyright" : category === "safety" ? "Safety" : "Content"} report: ${String(input.report.topic ?? "course")}`.slice(0, 160),
    normalizedSummary: `A learner requested owner review of ${target}. The report is an unverified claim, not a finding.`,
    untrustedExcerpt: typeof input.report.note === "string" ? input.report.note.slice(0, 500) : undefined,
    relatedUserId: typeof input.report.reporterUid === "string" ? input.report.reporterUid : undefined,
    relatedCourseId: typeof input.report.courseId === "string" ? input.report.courseId : undefined,
    relatedLessonId: typeof input.report.lessonId === "string" ? input.report.lessonId : undefined,
    assignedRole: "owner",
    requiresHumanApproval: serious,
    confirmedFacts: [
      `Report category: ${category}`,
      `Target: ${target}`,
      `Source record: contentReports/${input.reportId}`,
    ],
    unverifiedClaims: typeof input.report.note === "string" && input.report.note.trim()
      ? ["The reporter supplied additional unverified context."]
      : [],
    evidenceReferences: [`contentReports/${input.reportId}`],
    tags: ["content-report", category],
    notes: [],
    createdAt: now,
    updatedAt: now,
    dueAt: commandCenterDueAt(serious ? "high" : "medium", new Date(now)),
  };
  const audit = auditEvent({
    id: auditId,
    actorUid: "system",
    actorRole: "system",
    action: "ticket.ingested",
    targetType: "ticket",
    targetId: ticketId,
    ticketId,
    correlationId: crypto.randomUUID(),
    summary: `Ingested ${ticket.ticketNumber} from a content report`,
    afterState: { status: ticket.status, riskLevel: ticket.riskLevel, version: ticket.version },
    metadata: { source: ticket.source, sourceRecordId: input.reportId },
    createdAt: now,
  });
  await runStoredDocumentTransaction([CONTROLS_PATH, reportPath, ticketPath, auditPath], (documents) => {
    if (documents[reportPath]) {
      throw new CommandCenterConflictError("The report already exists.");
    }
    if (!parseControls(documents[CONTROLS_PATH]).systemEnabled) {
      return {
        writes: [{ path: reportPath, data: input.report }],
        result: true,
      };
    }
    if (documents[ticketPath]) throw new CommandCenterConflictError("The report ticket already exists.");
    return {
      writes: [
        { path: reportPath, data: input.report },
        { path: ticketPath, data: ticket },
        { path: auditPath, data: audit },
      ],
      result: true,
    };
  });
  return { id: input.reportId, ...input.report };
}

export async function reviewContentReportWithCommandCenterSync(input: {
  actorUid: string;
  reportId: string;
  status: "resolved" | "dismissed";
}) {
  const reportPath = `contentReports/${input.reportId}`;
  const ticketId = `ccr-${input.reportId}`;
  const ticketPath = `${TICKETS}/${ticketId}`;
  const auditId = crypto.randomUUID();
  const auditPath = `${AUDIT_EVENTS}/${auditId}`;
  const now = new Date().toISOString();
  return runStoredDocumentTransaction([reportPath, ticketPath, auditPath], (documents) => {
    const report = documents[reportPath];
    if (!report) throw new CommandCenterNotFoundError("Report not found.");
    const ticket = documents[ticketPath] as CommandCenterTicket | null;
    const writes: Array<{ path: string; data: Record<string, unknown> }> = [{
      path: reportPath,
      data: { ...report, status: input.status, reviewedAt: now, reviewedBy: input.actorUid },
    }];
    if (ticket) {
      const nextTicket: CommandCenterTicket = {
        ...ticket,
        version: ticket.version + 1,
        status: "closed",
        requiresHumanApproval: false,
        resolvedAt: input.status === "resolved" ? now : ticket.resolvedAt,
        updatedAt: now,
      };
      const audit = auditEvent({
        id: auditId,
        actorUid: input.actorUid,
        action: `content_report.${input.status}`,
        targetType: "ticket",
        targetId: ticket.id,
        ticketId: ticket.id,
        correlationId: crypto.randomUUID(),
        summary: `${input.status === "resolved" ? "Resolved" : "Dismissed"} the source report for ${ticket.ticketNumber}`,
        beforeState: { status: ticket.status, version: ticket.version },
        afterState: { status: nextTicket.status, version: nextTicket.version },
        metadata: { sourceRecordId: input.reportId, reportStatus: input.status },
        createdAt: now,
      });
      writes.push({ path: ticketPath, data: nextTicket }, { path: auditPath, data: audit });
    }
    return { writes, result: { updated: true, ticketSynchronized: Boolean(ticket) } };
  });
}

export function commandCenterErrorResponse(error: unknown) {
  if (error instanceof CommandCenterConflictError
    || error instanceof CommandCenterNotFoundError
    || error instanceof CommandCenterDisabledError) {
    return Response.json(
      { error: error.message },
      { status: error.status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return null;
}
