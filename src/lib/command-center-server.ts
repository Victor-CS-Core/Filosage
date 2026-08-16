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
import {
  CommandCenterSnapshotCursorError,
  decodeCommandCenterSnapshotCursor,
  encodeCommandCenterSnapshotCursor,
  normalizeCommandCenterApprovalV1,
  normalizeCommandCenterAuditEventV1,
  normalizeCommandCenterControlsV1,
  normalizeCommandCenterDraftV1,
  normalizeCommandCenterTicketV1,
  commandCenterSnapshotV2Schema,
  type CommandCenterRecordNormalization,
} from "@/lib/command-center-schemas";
import type {
  CommandCenterApproval,
  CommandCenterApprovalActionType,
  CommandCenterAuditEvent,
  CommandCenterControls,
  CommandCenterDraft,
  CommandCenterDraftAgentType,
  CommandCenterDraftContent,
  CommandCenterFounderBriefManifest,
  CommandCenterRisk,
  CommandCenterSnapshot,
  CommandCenterSnapshotCollection,
  CommandCenterSnapshotV2,
  CommandCenterSnapshotWarning,
  CommandCenterTicket,
  CommandCenterTicketCategory,
  CommandCenterTicketStatus,
} from "@/lib/command-center-types";
import type {
  LearnerSupportTicketDetail,
  LearnerSupportTicketSummary,
  SupportRequestContext,
} from "@/lib/support-center-types";
import {
  createStoredDocument,
  countCollectionDocuments,
  getStoredDocument,
  listCollectionDocuments,
  listCollectionDocumentsPage,
  listStoredDocumentsByField,
  runStoredDocumentTransaction,
  type StoredDocument,
  type StoredDocumentPage,
} from "@/lib/firebase-server";

const TICKETS = "commandCenterTickets";
const APPROVALS = "commandCenterApprovals";
const DRAFTS = "commandCenterDrafts";
const AUDIT_EVENTS = "commandCenterAuditEvents";
const TICKET_REQUESTS = "commandCenterTicketRequests";
const PUBLIC_REPLY_REQUESTS = "commandCenterPublicReplyRequests";
const APPROVAL_REVIEW_REQUESTS = "commandCenterApprovalReviewRequests";
const CONTROLS_PATH = "commandCenterControls/global";
const FOUNDER_QUEUE_STATE_PATH = "commandCenterQueueState/founderBrief";

interface CommandCenterQueueState extends Record<string, unknown> {
  version: 1;
  revision: number;
  updatedAt: string;
  updatedBy: string;
}

function nextFounderQueueState(
  stored: StoredDocument | null,
  actorUid: string,
  updatedAt: string,
): CommandCenterQueueState {
  const revision = typeof stored?.revision === "number"
    && Number.isSafeInteger(stored.revision)
    && stored.revision >= 0
    ? stored.revision
    : 0;
  return { version: 1, revision: revision + 1, updatedAt, updatedBy: actorUid };
}

function founderQueueIncludes(ticket: Pick<CommandCenterTicket, "status">) {
  return ticket.status !== "resolved" && ticket.status !== "closed";
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function manualTicketId(actorUid: string, idempotencyKey?: string | null) {
  return idempotencyKey
    ? sha256Hex(`${actorUid}:command-center-ticket:${idempotencyKey}`)
    : crypto.randomUUID();
}

interface UserTicketInput {
  actorUid: string;
  idempotencyKey?: string | null;
  category: Extract<CommandCenterTicketCategory, "support" | "billing" | "privacy" | "product_feedback" | "other">;
  subject: string;
  message: string;
  requestContext?: SupportRequestContext;
}

async function supportTicketId(actorUid: string, idempotencyKey: string) {
  return sha256Hex(`${actorUid}:support-center-ticket:${idempotencyKey}`);
}

function userTicketFingerprintPayload(input: UserTicketInput) {
  return {
    category: input.category,
    subject: input.subject,
    message: input.message,
    requestContext: input.requestContext ?? null,
  };
}

async function userTicketFingerprint(input: UserTicketInput) {
  return sha256Hex(JSON.stringify(userTicketFingerprintPayload(input)));
}

function normalizedTicket(ticket: CommandCenterTicket): CommandCenterTicket {
  return {
    ...ticket,
    notes: Array.isArray(ticket.notes) ? ticket.notes : [],
    publicReplies: Array.isArray(ticket.publicReplies) ? ticket.publicReplies : [],
  };
}

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
  const normalized = normalizeCommandCenterControlsV1(document).value;
  return {
    ...normalized,
    simulationMode: true,
    agentFlags: commandCenterDraftsEnvironmentEnabled()
      ? normalized.agentFlags
      : structuredClone(defaultCommandCenterControls.agentFlags),
    actionFlags: structuredClone(defaultCommandCenterControls.actionFlags),
  };
}

async function founderBriefFingerprint(
  manifest: Pick<CommandCenterFounderBriefManifest, "version" | "query" | "queueSources">,
) {
  return sha256Hex(JSON.stringify({
    version: manifest.version,
    query: manifest.query,
    queueSources: manifest.queueSources,
  }));
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
  externalSideEffect?: boolean;
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
    externalSideEffect: input.externalSideEffect ?? false,
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
    .map(normalizedTicket)
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
  idempotencyKey?: string | null;
  category: CommandCenterTicketCategory;
  riskLevel: CommandCenterRisk;
  subject: string;
  summary: string;
  confirmedFacts: string[];
  unverifiedClaims: string[];
  tags: string[];
}) {
  const id = await manualTicketId(input.actorUid, input.idempotencyKey);
  const auditId = input.idempotencyKey ? `ticket-create-${id}` : crypto.randomUUID();
  const requestPath = input.idempotencyKey ? `${TICKET_REQUESTS}/${id}` : null;
  const payloadFingerprint = input.idempotencyKey ? await sha256Hex(JSON.stringify({
    category: input.category,
    riskLevel: input.riskLevel,
    subject: input.subject,
    summary: input.summary,
    confirmedFacts: input.confirmedFacts,
    unverifiedClaims: input.unverifiedClaims,
    tags: input.tags,
  })) : null;
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
    publicReplies: [],
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
  return runStoredDocumentTransaction<CommandCenterTicket>([CONTROLS_PATH, FOUNDER_QUEUE_STATE_PATH, `${TICKETS}/${id}`, `${AUDIT_EVENTS}/${auditId}`, ...(requestPath ? [requestPath] : [])], (documents) => {
    const existing = documents[`${TICKETS}/${id}`] as CommandCenterTicket | null;
    const requestRecord = requestPath ? documents[requestPath] : null;
    if (requestRecord) {
      if (requestRecord.payloadFingerprint !== payloadFingerprint) {
        throw new CommandCenterConflictError("This idempotency key is already associated with different ticket details.");
      }
      if (!existing) throw new CommandCenterConflictError("The prior ticket request is incomplete. Use a new idempotency key.");
      return { writes: [], result: existing };
    }
    if (existing) throw new CommandCenterConflictError("The ticket already exists without a matching request record.");
    assertSystemEnabled(parseControls(documents[CONTROLS_PATH]));
    return {
      writes: [
        { path: `${TICKETS}/${id}`, data: ticket },
        { path: `${AUDIT_EVENTS}/${auditId}`, data: audit },
        { path: FOUNDER_QUEUE_STATE_PATH, data: nextFounderQueueState(documents[FOUNDER_QUEUE_STATE_PATH], input.actorUid, ticket.updatedAt) },
        ...(requestPath ? [{ path: requestPath, data: { ticketId: id, payloadFingerprint } }] : []),
      ],
      result: ticket,
    };
  });
}

export async function findUserCommandCenterTicketByRequest(input: UserTicketInput) {
  if (!input.idempotencyKey) return null;
  const id = await supportTicketId(input.actorUid, input.idempotencyKey);
  const requestRecord = await getStoredDocument(`${TICKET_REQUESTS}/${id}`);
  if (!requestRecord) return null;
  const payloadFingerprint = await userTicketFingerprint(input);
  if (requestRecord.payloadFingerprint !== payloadFingerprint) {
    throw new CommandCenterConflictError("This request key is already associated with different support details.");
  }
  const ticket = await getStoredDocument(`${TICKETS}/${id}`) as CommandCenterTicket | null;
  if (!ticket || ticket.relatedUserId !== input.actorUid || ticket.source !== "user_support") {
    throw new CommandCenterConflictError("The prior support request is incomplete. Start a new request.");
  }
  return normalizedTicket(ticket);
}

export async function createUserCommandCenterTicket(input: UserTicketInput) {
  const id = input.idempotencyKey
    ? await supportTicketId(input.actorUid, input.idempotencyKey)
    : crypto.randomUUID();
  const auditId = input.idempotencyKey ? `support-create-${id}` : crypto.randomUUID();
  const requestPath = input.idempotencyKey ? `${TICKET_REQUESTS}/${id}` : null;
  const payloadFingerprint = input.idempotencyKey ? await userTicketFingerprint(input) : null;
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
    requestContext: input.requestContext,
    relatedUserId: input.actorUid,
    assignedRole: "owner",
    requiresHumanApproval: input.category === "billing" || input.category === "privacy",
    confirmedFacts: [
      "The request was submitted from a verified Filosage account.",
      `Request category: ${categoryLabel}`,
    ],
    unverifiedClaims: ["The request description has not yet been verified by the owner."],
    evidenceReferences: [],
    tags: ["user-submitted", input.category.replaceAll("_", "-")],
    notes: [],
    publicReplies: [],
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
  return runStoredDocumentTransaction<CommandCenterTicket>([CONTROLS_PATH, FOUNDER_QUEUE_STATE_PATH, `${TICKETS}/${id}`, `${AUDIT_EVENTS}/${auditId}`, ...(requestPath ? [requestPath] : [])], (documents) => {
    const existing = documents[`${TICKETS}/${id}`] as CommandCenterTicket | null;
    const requestRecord = requestPath ? documents[requestPath] : null;
    if (requestRecord) {
      if (requestRecord.payloadFingerprint !== payloadFingerprint) {
        throw new CommandCenterConflictError("This request key is already associated with different support details.");
      }
      if (!existing || existing.relatedUserId !== input.actorUid || existing.source !== "user_support") {
        throw new CommandCenterConflictError("The prior support request is incomplete. Start a new request.");
      }
      return { writes: [], result: normalizedTicket(existing) };
    }
    if (existing) throw new CommandCenterConflictError("The support request already exists without a matching request record.");
    assertSystemEnabled(parseControls(documents[CONTROLS_PATH]));
    return {
      writes: [
        { path: `${TICKETS}/${id}`, data: ticket },
        { path: `${AUDIT_EVENTS}/${auditId}`, data: audit },
        { path: FOUNDER_QUEUE_STATE_PATH, data: nextFounderQueueState(documents[FOUNDER_QUEUE_STATE_PATH], input.actorUid, ticket.updatedAt) },
        ...(requestPath ? [{ path: requestPath, data: { ticketId: id, payloadFingerprint } }] : []),
      ],
      result: ticket,
    };
  });
}

function learnerSupportStatus(status: CommandCenterTicketStatus): LearnerSupportTicketSummary["status"] {
  if (status === "new") return "submitted";
  if (status === "resolved") return "resolved";
  if (status === "closed") return "closed";
  return "in_review";
}

function learnerTicketSummary(ticket: CommandCenterTicket): LearnerSupportTicketSummary {
  const normalized = normalizedTicket(ticket);
  return {
    id: normalized.id,
    ticketNumber: normalized.ticketNumber,
    subject: normalized.subject,
    category: normalized.category as LearnerSupportTicketSummary["category"],
    status: learnerSupportStatus(normalized.status),
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    replyCount: normalized.publicReplies.length,
  };
}

export function learnerSupportTicketDetail(ticket: CommandCenterTicket): LearnerSupportTicketDetail {
  const normalized = normalizedTicket(ticket);
  return {
    ...learnerTicketSummary(normalized),
    description: normalized.untrustedExcerpt ?? "",
    requestContext: normalized.requestContext,
    publicReplies: normalized.publicReplies.map((reply) => ({
      id: reply.id,
      body: reply.body,
      createdAt: reply.createdAt,
    })),
  };
}

export async function listUserCommandCenterTickets(actorUid: string) {
  const tickets = await listStoredDocumentsByField(TICKETS, "relatedUserId", actorUid, 100) as unknown as CommandCenterTicket[];
  return tickets
    .filter((ticket) => ticket.source === "user_support")
    .map(normalizedTicket)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .map(learnerTicketSummary);
}

export async function getUserCommandCenterTicket(actorUid: string, ticketId: string) {
  const ticket = await getStoredDocument(`${TICKETS}/${ticketId}`) as CommandCenterTicket | null;
  if (!ticket || ticket.source !== "user_support" || ticket.relatedUserId !== actorUid) {
    throw new CommandCenterNotFoundError("Support request not found.");
  }
  return learnerSupportTicketDetail(ticket);
}

export async function addCommandCenterPublicReply(input: {
  actorUid: string;
  ticketId: string;
  expectedVersion: number;
  body: string;
  idempotencyKey: string;
}) {
  const operationId = await sha256Hex(`${input.actorUid}:command-center-public-reply:${input.idempotencyKey}`);
  const requestPath = `${PUBLIC_REPLY_REQUESTS}/${operationId}`;
  const path = `${TICKETS}/${input.ticketId}`;
  const auditId = `public-reply-${operationId}`;
  const auditPath = `${AUDIT_EVENTS}/${auditId}`;
  const correlationId = operationId;
  const replyId = `reply-${operationId}`;
  const body = input.body.trim();
  const payloadFingerprint = await sha256Hex(JSON.stringify({
    ticketId: input.ticketId,
    expectedVersion: input.expectedVersion,
    body,
  }));
  const bodySha256 = await sha256Hex(body);
  const now = new Date().toISOString();
  return runStoredDocumentTransaction<{
    ticket: CommandCenterTicket;
    reply: CommandCenterTicket["publicReplies"][number];
    operationId: string;
    recovered: boolean;
  }>([path, auditPath, requestPath, FOUNDER_QUEUE_STATE_PATH], (documents) => {
    const stored = documents[path] as CommandCenterTicket | null;
    if (!stored) throw new CommandCenterNotFoundError("Ticket not found.");
    const current = normalizedTicket(stored);
    const priorRequest = documents[requestPath] as {
      operationId?: string;
      ticketId?: string;
      payloadFingerprint?: string;
      replyId?: string;
      completedAt?: string;
      resultingTicketVersion?: number;
    } | null;
    if (priorRequest) {
      if (
        priorRequest.operationId !== operationId
        || priorRequest.ticketId !== input.ticketId
        || priorRequest.payloadFingerprint !== payloadFingerprint
      ) {
        throw new CommandCenterConflictError("This idempotency key was already used for a different public reply request.");
      }
      const priorReply = current.publicReplies.find((reply) => reply.id === priorRequest.replyId);
      const priorAudit = documents[auditPath] as CommandCenterAuditEvent | null;
      if (
        !priorReply
        || !priorRequest.completedAt
        || typeof priorRequest.resultingTicketVersion !== "number"
        || current.version < priorRequest.resultingTicketVersion
        || priorAudit?.action !== "ticket.public_reply_published"
        || priorAudit.targetId !== current.id
        || priorAudit.metadata.replyId !== priorReply.id
      ) {
        throw new CommandCenterConflictError("The previous public reply request is incomplete. No retry was performed.");
      }
      return {
        writes: [],
        result: { ticket: current, reply: priorReply, operationId, recovered: true },
      };
    }
    if (current.source !== "user_support" || !current.relatedUserId) {
      throw new CommandCenterConflictError("Public replies are available only for learner support requests.");
    }
    if (current.version !== input.expectedVersion) {
      throw new CommandCenterConflictError("This ticket changed after it was opened. Refresh before publishing the reply.");
    }
    const reply = { id: replyId, authorUid: input.actorUid, body, createdAt: now };
    const next: CommandCenterTicket = {
      ...current,
      version: current.version + 1,
      publicReplies: [...current.publicReplies, reply],
      updatedAt: now,
    };
    const audit = auditEvent({
      id: auditId,
      actorUid: input.actorUid,
      action: "ticket.public_reply_published",
      targetType: "ticket",
      targetId: current.id,
      ticketId: current.id,
      correlationId,
      summary: `Published a learner-visible reply on ${current.ticketNumber}`,
      beforeState: { version: current.version, publicReplyCount: current.publicReplies.length },
      afterState: { version: next.version, publicReplyCount: next.publicReplies.length },
      metadata: { visibility: "requester", source: current.source, replyId, bodySha256 },
      externalSideEffect: true,
      createdAt: now,
    });
    const requestRecord = {
      operationId,
      ticketId: current.id,
      payloadFingerprint,
      replyId,
      completedAt: now,
      resultingTicketVersion: next.version,
    };
    return {
      writes: [
        { path, data: next },
        { path: auditPath, data: audit },
        { path: requestPath, data: requestRecord },
        ...(founderQueueIncludes(next)
          ? [{ path: FOUNDER_QUEUE_STATE_PATH, data: nextFounderQueueState(documents[FOUNDER_QUEUE_STATE_PATH], input.actorUid, now) }]
          : []),
      ],
      result: { ticket: next, reply, operationId, recovered: false },
    };
  });
}

export async function getCommandCenterTicket(ticketId: string): Promise<CommandCenterTicket | null> {
  const stored = await getStoredDocument(`${TICKETS}/${ticketId}`);
  if (!stored) return null;
  const normalized = normalizeCommandCenterTicketV1(stored);
  if (!normalized.value) {
    throw new CommandCenterConflictError("The requested ticket is malformed and cannot be used for draft generation.");
  }
  return normalized.value;
}

interface CommandCenterSnapshotV2Options {
  limit?: number;
  cursors?: Partial<Record<CommandCenterSnapshotCollection, string>>;
}

function normalizedSnapshotPage<T extends { id: string; createdAt?: string; updatedAt?: string }>(input: {
  section: CommandCenterSnapshotCollection;
  page: StoredDocumentPage;
  total: number;
  limit: number;
  cursorApplied: boolean;
  presentationField: "updatedAt" | "createdAt";
  normalize: (value: unknown) => CommandCenterRecordNormalization<T>;
}) {
  const records: T[] = [];
  const warnings: CommandCenterSnapshotWarning[] = [];
  for (const document of input.page.documents) {
    const normalized = input.normalize(document);
    if (normalized.value) records.push(normalized.value);
    if (normalized.warning) warnings.push(normalized.warning);
  }
  records.sort((left, right) => {
    const leftTime = Date.parse(String(left[input.presentationField]));
    const rightTime = Date.parse(String(right[input.presentationField]));
    return rightTime - leftTime || left.id.localeCompare(right.id);
  });
  const malformed = input.page.inspected - records.length;
  const scanComplete = !input.cursorApplied
    && !input.page.hasMore
    && input.page.inspected === input.total;
  const complete = scanComplete && malformed === 0 && records.length === input.total;
  return {
    records,
    warnings,
    meta: {
      total: input.total,
      inspected: input.page.inspected,
      loaded: records.length,
      malformed,
      limit: input.limit,
      cursorApplied: input.cursorApplied,
      nextCursor: input.page.hasMore && input.page.nextAfterId
        ? encodeCommandCenterSnapshotCursor(input.section, input.page.nextAfterId)
        : null,
      scanComplete,
      complete,
      traversalOrder: { field: "id" as const, direction: "asc" as const },
      presentationOrder: {
        field: input.presentationField,
        direction: "desc" as const,
        tieBreaker: "id" as const,
        tieDirection: "asc" as const,
      },
    },
  };
}

export async function getCommandCenterSnapshotV2(
  options: CommandCenterSnapshotV2Options = {},
): Promise<CommandCenterSnapshotV2> {
  const limit = options.limit ?? 500;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new CommandCenterSnapshotCursorError("Snapshot limits must be integers from 1 to 500.");
  }
  const cursorFor = (section: CommandCenterSnapshotCollection) => {
    const encoded = options.cursors?.[section];
    return encoded ? decodeCommandCenterSnapshotCursor(encoded, section).afterId : undefined;
  };
  const after = {
    tickets: cursorFor("tickets"),
    approvals: cursorFor("approvals"),
    drafts: cursorFor("drafts"),
    auditEvents: cursorFor("auditEvents"),
  };
  const [
    controlsDocument,
    ticketTotal,
    approvalTotal,
    draftTotal,
    auditTotal,
    ticketPage,
    approvalPage,
    draftPage,
    auditPage,
  ] = await Promise.all([
    getStoredDocument(CONTROLS_PATH),
    countCollectionDocuments(TICKETS),
    countCollectionDocuments(APPROVALS),
    countCollectionDocuments(DRAFTS),
    countCollectionDocuments(AUDIT_EVENTS),
    listCollectionDocumentsPage(TICKETS, { limit, afterId: after.tickets }),
    listCollectionDocumentsPage(APPROVALS, { limit, afterId: after.approvals }),
    listCollectionDocumentsPage(DRAFTS, { limit, afterId: after.drafts }),
    listCollectionDocumentsPage(AUDIT_EVENTS, { limit, afterId: after.auditEvents }),
  ]);
  const controls = normalizeCommandCenterControlsV1(controlsDocument);
  const ticketSnapshot = normalizedSnapshotPage({
    section: "tickets",
    page: ticketPage,
    total: ticketTotal,
    limit,
    cursorApplied: Boolean(after.tickets),
    presentationField: "updatedAt",
    normalize: normalizeCommandCenterTicketV1,
  });
  const approvalSnapshot = normalizedSnapshotPage({
    section: "approvals",
    page: approvalPage,
    total: approvalTotal,
    limit,
    cursorApplied: Boolean(after.approvals),
    presentationField: "createdAt",
    normalize: normalizeCommandCenterApprovalV1,
  });
  const draftSnapshot = normalizedSnapshotPage({
    section: "drafts",
    page: draftPage,
    total: draftTotal,
    limit,
    cursorApplied: Boolean(after.drafts),
    presentationField: "createdAt",
    normalize: normalizeCommandCenterDraftV1,
  });
  const auditSnapshot = normalizedSnapshotPage({
    section: "auditEvents",
    page: auditPage,
    total: auditTotal,
    limit,
    cursorApplied: Boolean(after.auditEvents),
    presentationField: "createdAt",
    normalize: normalizeCommandCenterAuditEventV1,
  });
  const now = new Date();
  const approvals = approvalSnapshot.records.map((approval) => (
    approval.status === "pending" && commandCenterApprovalIsExpired(approval.expiresAt, now)
      ? { ...approval, status: "expired" as const }
      : approval
  ));
  const openTickets = ticketSnapshot.records.filter((ticket) => !["resolved", "closed"].includes(ticket.status));
  const summaryComplete = ticketSnapshot.meta.complete
    && approvalSnapshot.meta.complete
    && draftSnapshot.meta.complete;
  const snapshot = {
    controls: controls.value,
    tickets: ticketSnapshot.records,
    approvals,
    drafts: draftSnapshot.records,
    auditEvents: auditSnapshot.records,
    capabilities: { draftAgentsAvailable: commandCenterDraftsEnvironmentEnabled() },
    summary: {
      openTickets: openTickets.length,
      highRiskTickets: openTickets.filter((ticket) => ticket.riskLevel === "high" || ticket.riskLevel === "critical").length,
      pendingApprovals: approvals.filter((approval) => approval.status === "pending").length,
      overdueTickets: openTickets.filter((ticket) => Date.parse(ticket.dueAt) < now.getTime()).length,
      pendingDrafts: draftSnapshot.records.filter((draft) => draft.status === "pending_review").length,
    },
    contractVersion: 2,
    retrievedAt: now.toISOString(),
    consistency: "best_effort_non_atomic",
    schemaVersions: { controls: 1, tickets: 1, approvals: 1, drafts: 1, auditEvents: 1 },
    collections: {
      tickets: ticketSnapshot.meta,
      approvals: approvalSnapshot.meta,
      drafts: draftSnapshot.meta,
      auditEvents: auditSnapshot.meta,
    },
    warnings: [
      ...(controls.warning ? [controls.warning] : []),
      ...ticketSnapshot.warnings,
      ...approvalSnapshot.warnings,
      ...draftSnapshot.warnings,
      ...auditSnapshot.warnings,
    ],
    summaryCompleteness: { basis: "loaded_records", complete: summaryComplete },
  } satisfies CommandCenterSnapshotV2;
  return commandCenterSnapshotV2Schema.parse(snapshot) as CommandCenterSnapshotV2;
}

function founderQueueRevision(stored: StoredDocument | null) {
  if (!stored) return 0;
  if (
    stored.version !== 1
    || typeof stored.revision !== "number"
    || !Number.isSafeInteger(stored.revision)
    || stored.revision < 0
  ) {
    throw new CommandCenterConflictError("The founder queue state is invalid. Repair it before generating or accepting a brief.");
  }
  return stored.revision;
}

const founderQueueStatuses: CommandCenterFounderBriefManifest["query"]["statuses"] = [
  "new",
  "triaged",
  "waiting_for_admin",
  "approved",
  "in_progress",
];

const founderRiskOrder: Record<CommandCenterRisk, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export async function getCommandCenterFounderBriefMaterial(): Promise<{
  manifest: CommandCenterFounderBriefManifest;
  promptTickets: CommandCenterTicket[];
}> {
  const maximumQueueDocuments = 2_000;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const [stateBefore, totalBefore] = await Promise.all([
      getStoredDocument(FOUNDER_QUEUE_STATE_PATH),
      countCollectionDocuments(TICKETS),
    ]);
    const revision = founderQueueRevision(stateBefore);
    if (totalBefore > maximumQueueDocuments) {
      throw new CommandCenterConflictError(
        `The founder queue has more than ${maximumQueueDocuments.toLocaleString("en-US")} records. Narrowing the source queue requires owner policy approval.`,
      );
    }
    const rawTickets: StoredDocument[] = [];
    let afterId: string | undefined;
    let hasMore = true;
    while (hasMore) {
      const page = await listCollectionDocumentsPage(TICKETS, {
        limit: Math.min(500, Math.max(totalBefore - rawTickets.length, 1)),
        afterId,
      });
      rawTickets.push(...page.documents);
      hasMore = page.hasMore;
      afterId = page.nextAfterId ?? undefined;
      if (hasMore && !afterId) {
        throw new CommandCenterConflictError("The founder queue cursor was incomplete. No brief was generated.");
      }
      if (rawTickets.length > maximumQueueDocuments) {
        throw new CommandCenterConflictError("The founder queue exceeded its bounded read limit. No brief was generated.");
      }
    }
    const [stateAfter, totalAfter] = await Promise.all([
      getStoredDocument(FOUNDER_QUEUE_STATE_PATH),
      countCollectionDocuments(TICKETS),
    ]);
    if (
      revision !== founderQueueRevision(stateAfter)
      || totalBefore !== totalAfter
      || rawTickets.length !== totalAfter
    ) {
      if (attempt === 0) continue;
      throw new CommandCenterConflictError("The founder queue changed while it was read. Try generating the brief again.");
    }
    const tickets: CommandCenterTicket[] = [];
    for (const rawTicket of rawTickets) {
      const normalized = normalizeCommandCenterTicketV1(rawTicket);
      if (!normalized.value) {
        throw new CommandCenterConflictError("The founder queue contains a malformed ticket. No queue-wide brief was generated.");
      }
      tickets.push(normalized.value);
    }
    const openTickets = tickets
      .filter(founderQueueIncludes)
      .sort((left, right) => (
        founderRiskOrder[left.riskLevel] - founderRiskOrder[right.riskLevel]
        || Date.parse(left.dueAt) - Date.parse(right.dueAt)
        || left.id.localeCompare(right.id)
      ));
    const queueSources = openTickets.map((ticket) => ({
      ticketId: ticket.id,
      ticketVersion: ticket.version,
    }));
    const query: CommandCenterFounderBriefManifest["query"] = {
      statuses: [...founderQueueStatuses],
      order: "risk_desc_due_asc_id_asc",
    };
    const queueFingerprint = await founderBriefFingerprint({ version: 1, query, queueSources });
    const promptTickets = openTickets.slice(0, 50);
    return {
      manifest: {
        version: 1,
        generatedAt: new Date().toISOString(),
        query,
        queueRevision: revision,
        queueCount: queueSources.length,
        queueComplete: true,
        queueFingerprint,
        queueSources,
        promptSelection: {
          limit: 50,
          count: promptTickets.length,
          truncated: promptTickets.length < openTickets.length,
          sources: queueSources.slice(0, 50),
        },
      },
      promptTickets,
    };
  }
  throw new CommandCenterConflictError("The founder queue could not be read consistently.");
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
  return runStoredDocumentTransaction<CommandCenterTicket>([path, auditPath, FOUNDER_QUEUE_STATE_PATH], (documents) => {
    const stored = documents[path] as CommandCenterTicket | null;
    if (!stored) throw new CommandCenterNotFoundError("Ticket not found.");
    const current = normalizedTicket(stored);
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
    return {
      writes: [
        { path, data: next },
        { path: auditPath, data: audit },
        ...(founderQueueIncludes(current) || founderQueueIncludes(next)
          ? [{ path: FOUNDER_QUEUE_STATE_PATH, data: nextFounderQueueState(documents[FOUNDER_QUEUE_STATE_PATH], input.actorUid, now) }]
          : []),
      ],
      result: next,
    };
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
  return runStoredDocumentTransaction<CommandCenterApproval>([CONTROLS_PATH, ticketPath, approvalPath, auditPath, FOUNDER_QUEUE_STATE_PATH], (documents) => {
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
        { path: FOUNDER_QUEUE_STATE_PATH, data: nextFounderQueueState(documents[FOUNDER_QUEUE_STATE_PATH], input.actorUid, now.toISOString()) },
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
  idempotencyKey: string;
}) {
  const approvalPath = `${APPROVALS}/${input.approvalId}`;
  const initial = await getStoredDocument(approvalPath) as CommandCenterApproval | null;
  if (!initial) throw new CommandCenterNotFoundError("Approval request not found.");
  const ticketPath = `${TICKETS}/${initial.ticketId}`;
  const operationId = await sha256Hex(`${input.actorUid}:command-center-approval-review:${input.idempotencyKey}`);
  const requestPath = `${APPROVAL_REVIEW_REQUESTS}/${operationId}`;
  const auditId = `approval-review-${operationId}`;
  const auditPath = `${AUDIT_EVENTS}/${auditId}`;
  const correlationId = operationId;
  const reason = input.reason.trim();
  const payloadFingerprint = await sha256Hex(JSON.stringify({
    approvalId: input.approvalId,
    expectedVersion: input.expectedVersion,
    decision: input.decision,
    reason,
  }));
  const now = new Date();
  return runStoredDocumentTransaction<{ approval: CommandCenterApproval; operationId: string; recovered: boolean }>([
    approvalPath,
    ticketPath,
    auditPath,
    requestPath,
    FOUNDER_QUEUE_STATE_PATH,
  ], (documents) => {
    const approval = documents[approvalPath] as CommandCenterApproval | null;
    const ticket = documents[ticketPath] as CommandCenterTicket | null;
    if (!approval || !ticket) throw new CommandCenterNotFoundError("The approval request is incomplete.");
    const priorRequest = documents[requestPath] as {
      operationId?: string;
      approvalId?: string;
      payloadFingerprint?: string;
      decision?: string;
      completedAt?: string;
      resultingApprovalVersion?: number;
    } | null;
    if (priorRequest) {
      if (
        priorRequest.operationId !== operationId
        || priorRequest.approvalId !== input.approvalId
        || priorRequest.payloadFingerprint !== payloadFingerprint
        || priorRequest.decision !== input.decision
      ) {
        throw new CommandCenterConflictError("This idempotency key was already used for a different approval decision.");
      }
      const priorAudit = documents[auditPath] as CommandCenterAuditEvent | null;
      if (
        !priorRequest.completedAt
        || typeof priorRequest.resultingApprovalVersion !== "number"
        || approval.version < priorRequest.resultingApprovalVersion
        || approval.status !== input.decision
        || priorAudit?.action !== `approval.${input.decision}`
        || priorAudit.targetId !== approval.id
      ) {
        throw new CommandCenterConflictError("The previous approval decision request is incomplete. No retry was performed.");
      }
      return {
        writes: [],
        result: { approval, operationId, recovered: true },
      };
    }
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
      reviewerReason: reason,
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
    const requestRecord = {
      operationId,
      approvalId: approval.id,
      payloadFingerprint,
      decision: input.decision,
      completedAt: now.toISOString(),
      resultingApprovalVersion: reviewed.version,
    };
    return {
      writes: [
        { path: approvalPath, data: reviewed },
        { path: ticketPath, data: nextTicket },
        { path: auditPath, data: audit },
        { path: requestPath, data: requestRecord },
        { path: FOUNDER_QUEUE_STATE_PATH, data: nextFounderQueueState(documents[FOUNDER_QUEUE_STATE_PATH], input.actorUid, now.toISOString()) },
      ],
      result: { approval: reviewed, operationId, recovered: false },
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
  sourceManifest?: CommandCenterFounderBriefManifest;
  content: CommandCenterDraftContent;
  model: string;
  generationProfile: string;
  promptVersion: string;
}) {
  const draftPath = `${DRAFTS}/${input.id}`;
  const auditId = crypto.randomUUID();
  const auditPath = `${AUDIT_EVENTS}/${auditId}`;
  const ticketPath = input.ticketId ? `${TICKETS}/${input.ticketId}` : undefined;
  const founderQueuePath = input.agentType === "founderBrief" ? FOUNDER_QUEUE_STATE_PATH : undefined;
  const paths = [
    CONTROLS_PATH,
    draftPath,
    auditPath,
    ...(ticketPath ? [ticketPath] : []),
    ...(founderQueuePath ? [founderQueuePath] : []),
  ];
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
    if (input.agentType === "founderBrief") {
      if (!input.sourceManifest || input.sourceManifest.version !== 1) {
        throw new CommandCenterConflictError("A complete founder queue manifest is required before storing a brief.");
      }
      if (founderQueueRevision(documents[FOUNDER_QUEUE_STATE_PATH]) !== input.sourceManifest.queueRevision) {
        throw new CommandCenterConflictError("The owner queue changed while the brief was generated. Generate it again.");
      }
    }
    const draft: CommandCenterDraft = {
      id: input.id,
      version: 1,
      scope: input.agentType === "founderBrief" ? "founder_brief" : "ticket",
      ticketId: ticket?.id,
      sourceTicketVersion: ticket?.version,
      sourceManifest: input.agentType === "founderBrief" ? input.sourceManifest : undefined,
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
      metadata: {
        model: draft.model,
        promptVersion: draft.promptVersion,
        externalSideEffect: false,
        ...(draft.sourceManifest
          ? {
              queueFingerprint: draft.sourceManifest.queueFingerprint,
              queueRevision: draft.sourceManifest.queueRevision,
              queueCount: draft.sourceManifest.queueCount,
            }
          : {}),
      },
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
  let expectedFounderFingerprint: string | null = null;
  if (input.decision === "accepted" && initial.scope === "founder_brief") {
    if (!initial.sourceManifest || initial.sourceManifest.version !== 1) {
      throw new CommandCenterConflictError("Regenerate this founder brief to establish source freshness before accepting it.");
    }
    expectedFounderFingerprint = await founderBriefFingerprint(initial.sourceManifest);
    if (expectedFounderFingerprint !== initial.sourceManifest.queueFingerprint) {
      throw new CommandCenterConflictError("The founder brief source fingerprint is invalid. Regenerate it before accepting it.");
    }
  }
  const ticketPath = initial.ticketId ? `${TICKETS}/${initial.ticketId}` : undefined;
  const founderQueuePath = initial.scope === "founder_brief" ? FOUNDER_QUEUE_STATE_PATH : undefined;
  const auditId = crypto.randomUUID();
  const auditPath = `${AUDIT_EVENTS}/${auditId}`;
  const now = new Date().toISOString();
  return runStoredDocumentTransaction<CommandCenterDraft>([
    draftPath,
    auditPath,
    ...(ticketPath ? [ticketPath] : []),
    ...(founderQueuePath ? [founderQueuePath] : []),
  ], (documents) => {
    const draft = documents[draftPath] as CommandCenterDraft | null;
    if (!draft) throw new CommandCenterNotFoundError("Draft not found.");
    if (draft.version !== input.expectedVersion || draft.status !== "pending_review") {
      throw new CommandCenterConflictError("This draft has already changed. Refresh before recording a decision.");
    }
    const ticket = ticketPath ? documents[ticketPath] as CommandCenterTicket | null : null;
    if (ticketPath && (!ticket || ticket.version !== draft.sourceTicketVersion)) {
      throw new CommandCenterConflictError("The source ticket changed after this draft was generated. Generate a fresh draft before accepting it.");
    }
    if (input.decision === "accepted" && draft.scope === "founder_brief") {
      if (!draft.sourceManifest || draft.sourceManifest.version !== 1) {
        throw new CommandCenterConflictError("Regenerate this founder brief to establish source freshness before accepting it.");
      }
      if (draft.sourceManifest.queueFingerprint !== expectedFounderFingerprint) {
        throw new CommandCenterConflictError("The founder brief source manifest changed during review. Refresh before accepting it.");
      }
      const currentRevision = founderQueueRevision(documents[FOUNDER_QUEUE_STATE_PATH]);
      if (currentRevision !== draft.sourceManifest.queueRevision) {
        throw new CommandCenterConflictError("The owner queue changed after this brief was generated. Generate a fresh brief before accepting it.");
      }
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
    publicReplies: [],
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
  await runStoredDocumentTransaction([CONTROLS_PATH, reportPath, ticketPath, auditPath, FOUNDER_QUEUE_STATE_PATH], (documents) => {
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
        { path: FOUNDER_QUEUE_STATE_PATH, data: nextFounderQueueState(documents[FOUNDER_QUEUE_STATE_PATH], "system", now) },
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
  return runStoredDocumentTransaction([reportPath, ticketPath, auditPath, FOUNDER_QUEUE_STATE_PATH], (documents) => {
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
      writes.push(
        { path: ticketPath, data: nextTicket },
        { path: auditPath, data: audit },
        ...(founderQueueIncludes(ticket) || founderQueueIncludes(nextTicket)
          ? [{ path: FOUNDER_QUEUE_STATE_PATH, data: nextFounderQueueState(documents[FOUNDER_QUEUE_STATE_PATH], input.actorUid, now) }]
          : []),
      );
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
