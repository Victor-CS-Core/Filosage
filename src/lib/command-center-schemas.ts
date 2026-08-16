import "server-only";

import { Buffer } from "node:buffer";
import { z } from "zod";
import { commandCenterDraftContentSchema } from "@/lib/command-center-draft-schema";
import {
  commandCenterControlsSafetyEnvelopePresent,
  defaultCommandCenterControls,
  failClosedCommandCenterControls,
} from "@/lib/command-center-policy";
import {
  commandCenterApprovalActionTypes,
  commandCenterDraftAgentTypes,
  commandCenterSnapshotCollections,
  commandCenterTicketCategories,
  type CommandCenterApproval,
  type CommandCenterAuditEvent,
  type CommandCenterCollectionSnapshotMeta,
  type CommandCenterControls,
  type CommandCenterDraft,
  type CommandCenterSnapshotCollection,
  type CommandCenterSnapshotV2,
  type CommandCenterSnapshotWarning,
  type CommandCenterTicket,
} from "@/lib/command-center-types";

const recordIdSchema = z.string().min(1).max(1_500);
const isoDateTimeSchema = z.string().datetime();
const scalarStateSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const scalarStateRecordSchema = z.record(z.string(), scalarStateSchema);

const supportRequestContextSchema = z.object({
  pathname: z.string(),
  pageTitle: z.string().optional(),
  feature: z.string().optional(),
}).strict();

const commandCenterNoteSchema = z.object({
  id: recordIdSchema,
  authorUid: z.string().min(1),
  body: z.string(),
  createdAt: isoDateTimeSchema,
}).strict();

const commandCenterPublicReplySchema = z.object({
  id: recordIdSchema,
  authorUid: z.string().min(1),
  body: z.string(),
  createdAt: isoDateTimeSchema,
}).strict();

const commandCenterFounderBriefSourceSchema = z.object({
  ticketId: recordIdSchema,
  ticketVersion: z.number().int().positive(),
}).strict();

const commandCenterFounderBriefManifestSchema = z.object({
  version: z.literal(1),
  generatedAt: isoDateTimeSchema,
  query: z.object({
    statuses: z.array(z.enum(["new", "triaged", "waiting_for_admin", "approved", "in_progress"])),
    order: z.literal("risk_desc_due_asc_id_asc"),
  }).strict(),
  queueRevision: z.number().int().nonnegative(),
  queueCount: z.number().int().nonnegative(),
  queueComplete: z.literal(true),
  queueFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  queueSources: z.array(commandCenterFounderBriefSourceSchema),
  promptSelection: z.object({
    limit: z.literal(50),
    count: z.number().int().nonnegative().max(50),
    truncated: z.boolean(),
    sources: z.array(commandCenterFounderBriefSourceSchema).max(50),
  }).strict(),
}).strict().superRefine((manifest, context) => {
  if (manifest.queueCount !== manifest.queueSources.length) {
    context.addIssue({ code: "custom", path: ["queueCount"], message: "Queue count must match queue sources." });
  }
  const expectedPromptCount = Math.min(50, manifest.queueSources.length);
  if (manifest.promptSelection.count !== expectedPromptCount) {
    context.addIssue({ code: "custom", path: ["promptSelection", "count"], message: "Prompt count must match the bounded selection." });
  }
  if (manifest.promptSelection.sources.length !== manifest.promptSelection.count) {
    context.addIssue({ code: "custom", path: ["promptSelection", "sources"], message: "Prompt sources must match the declared count." });
  }
  if (manifest.promptSelection.truncated !== (manifest.queueSources.length > 50)) {
    context.addIssue({ code: "custom", path: ["promptSelection", "truncated"], message: "Prompt truncation must reflect the complete queue." });
  }
  const expectedSources = JSON.stringify(manifest.queueSources.slice(0, 50));
  if (JSON.stringify(manifest.promptSelection.sources) !== expectedSources) {
    context.addIssue({ code: "custom", path: ["promptSelection", "sources"], message: "Prompt sources must be the canonical queue prefix." });
  }
  if (new Set(manifest.queueSources.map((source) => source.ticketId)).size !== manifest.queueSources.length) {
    context.addIssue({ code: "custom", path: ["queueSources"], message: "Queue source ticket IDs must be unique." });
  }
});

export const commandCenterTicketSchemaV1 = z.object({
  id: recordIdSchema,
  ticketNumber: z.string().regex(/^TKT-[A-Z0-9]{7}$/),
  version: z.number().int().positive(),
  source: z.enum(["manual", "content_report", "user_support"]),
  sourceRecordId: z.string().optional(),
  category: z.enum(commandCenterTicketCategories),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  status: z.enum(["new", "triaged", "waiting_for_admin", "approved", "in_progress", "resolved", "closed"]),
  subject: z.string(),
  normalizedSummary: z.string(),
  untrustedExcerpt: z.string().optional(),
  requestContext: supportRequestContextSchema.optional(),
  relatedUserId: z.string().optional(),
  relatedCourseId: z.string().optional(),
  relatedLessonId: z.string().optional(),
  assignedRole: z.literal("owner").optional(),
  requiresHumanApproval: z.boolean(),
  confirmedFacts: z.array(z.string()),
  unverifiedClaims: z.array(z.string()),
  evidenceReferences: z.array(z.string()),
  tags: z.array(z.string()),
  notes: z.array(commandCenterNoteSchema),
  publicReplies: z.array(commandCenterPublicReplySchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  dueAt: isoDateTimeSchema,
  resolvedAt: isoDateTimeSchema.optional(),
}).strip();

export const commandCenterApprovalSchemaV1 = z.object({
  id: recordIdSchema,
  version: z.number().int().positive(),
  ticketId: recordIdSchema,
  actionType: z.enum(commandCenterApprovalActionTypes),
  proposedAction: z.string(),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  sideEffects: z.array(z.string()),
  affectedRecords: z.array(z.string()),
  policyReferences: z.array(z.string()),
  requiredApproverRole: z.literal("owner"),
  status: z.enum(["pending", "approved", "rejected", "expired"]),
  executionState: z.literal("not_executed"),
  idempotencyKey: z.string().min(1),
  expectedTicketVersion: z.number().int().positive(),
  requestedBy: z.string().min(1),
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  reviewedAt: isoDateTimeSchema.optional(),
  reviewedBy: z.string().min(1).optional(),
  reviewerReason: z.string().optional(),
}).strip();

export const commandCenterDraftSchemaV1 = z.object({
  id: recordIdSchema,
  version: z.number().int().positive(),
  scope: z.enum(["ticket", "founder_brief"]),
  ticketId: recordIdSchema.optional(),
  sourceTicketVersion: z.number().int().positive().optional(),
  sourceManifest: commandCenterFounderBriefManifestSchema.optional(),
  agentType: z.enum(commandCenterDraftAgentTypes),
  status: z.enum(["pending_review", "accepted", "rejected"]),
  content: commandCenterDraftContentSchema,
  model: z.string().min(1),
  generationProfile: z.string().min(1),
  promptVersion: z.string().min(1),
  requestedBy: z.string().min(1),
  createdAt: isoDateTimeSchema,
  reviewedAt: isoDateTimeSchema.optional(),
  reviewedBy: z.string().min(1).optional(),
  reviewerReason: z.string().optional(),
  externalSideEffect: z.literal(false),
}).strip();

export const commandCenterAuditEventSchemaV1 = z.object({
  id: recordIdSchema,
  actorUid: z.string().min(1),
  actorRole: z.enum(["owner", "system"]),
  action: z.string().min(1),
  targetType: z.enum(["ticket", "approval", "draft", "controls"]),
  targetId: recordIdSchema,
  ticketId: recordIdSchema.optional(),
  correlationId: z.string().min(1),
  summary: z.string(),
  beforeState: scalarStateRecordSchema.optional(),
  afterState: scalarStateRecordSchema.optional(),
  metadata: scalarStateRecordSchema,
  externalSideEffect: z.boolean(),
  createdAt: isoDateTimeSchema,
}).strip();

export const commandCenterControlsSchemaV1 = z.object({
  version: z.number().int().positive(),
  systemEnabled: z.boolean(),
  simulationMode: z.literal(true),
  killSwitchActive: z.boolean(),
  agentFlags: z.object({
    support: z.boolean(),
    legal: z.boolean(),
    billing: z.boolean(),
    privacy: z.boolean(),
    content: z.boolean(),
    productOperations: z.boolean(),
    knowledge: z.boolean(),
    founderBrief: z.boolean(),
  }).strict(),
  actionFlags: z.object({
    externalEffects: z.literal(false),
    sendResponse: z.literal(false),
    refund: z.literal(false),
    deleteData: z.literal(false),
    restrictAccount: z.literal(false),
    removeContent: z.literal(false),
    publishStatus: z.literal(false),
  }).strict(),
  updatedAt: isoDateTimeSchema.optional(),
  updatedBy: z.string().min(1).optional(),
}).strip();

const cursorDocumentIdSchema = z.string()
  .regex(/^[A-Za-z0-9_-]{1,1500}$/);

export const commandCenterSnapshotCursorSchemaV1 = z.object({
  v: z.literal(1),
  section: z.enum(commandCenterSnapshotCollections),
  afterId: cursorDocumentIdSchema,
}).strict();

export type CommandCenterSnapshotCursorV1 = z.infer<typeof commandCenterSnapshotCursorSchemaV1>;

export class CommandCenterSnapshotCursorError extends Error {
  constructor(message = "The command-center cursor is invalid.") {
    super(message);
    this.name = "CommandCenterSnapshotCursorError";
  }
}

export function encodeCommandCenterSnapshotCursor(
  section: CommandCenterSnapshotCollection,
  afterId: string,
) {
  const payload = commandCenterSnapshotCursorSchemaV1.parse({ v: 1, section, afterId });
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCommandCenterSnapshotCursor(
  encoded: string,
  expectedSection: CommandCenterSnapshotCollection,
): CommandCenterSnapshotCursorV1 {
  if (!/^[A-Za-z0-9_-]{1,4096}$/.test(encoded)) {
    throw new CommandCenterSnapshotCursorError();
  }
  try {
    const decoded = Buffer.from(encoded, "base64url");
    if (decoded.toString("base64url") !== encoded) {
      throw new CommandCenterSnapshotCursorError();
    }
    const parsed = commandCenterSnapshotCursorSchemaV1.safeParse(JSON.parse(decoded.toString("utf8")));
    if (!parsed.success || parsed.data.section !== expectedSection) {
      throw new CommandCenterSnapshotCursorError();
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof CommandCenterSnapshotCursorError) throw error;
    throw new CommandCenterSnapshotCursorError();
  }
}

export interface CommandCenterRecordNormalization<T> {
  value: T | null;
  warning: CommandCenterSnapshotWarning | null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function warningFor(
  section: CommandCenterSnapshotWarning["section"],
  recordId: string,
  error: z.ZodError,
): CommandCenterSnapshotWarning {
  return {
    code: "malformed_record",
    section,
    recordId,
    issues: error.issues.slice(0, 20).map((issue) => ({
      path: issue.path.length ? issue.path.map(String).join(".") : "$",
      code: issue.code,
    })),
  };
}

function normalizeRecord<T>(
  section: CommandCenterSnapshotWarning["section"],
  value: unknown,
  schema: z.ZodType<T>,
  compatibility?: (candidate: Record<string, unknown>) => Record<string, unknown>,
): CommandCenterRecordNormalization<T> {
  const raw = objectValue(value);
  const recordId = typeof raw?.id === "string" ? raw.id : "unknown";
  const candidate = raw && compatibility ? compatibility(raw) : value;
  const parsed = schema.safeParse(candidate);
  return parsed.success
    ? { value: parsed.data, warning: null }
    : { value: null, warning: warningFor(section, recordId, parsed.error) };
}

export function normalizeCommandCenterTicketV1(value: unknown): CommandCenterRecordNormalization<CommandCenterTicket> {
  return normalizeRecord("tickets", value, commandCenterTicketSchemaV1, (raw) => ({
    ...raw,
    ...(raw.notes === undefined ? { notes: [] } : {}),
    ...(raw.publicReplies === undefined ? { publicReplies: [] } : {}),
  })) as CommandCenterRecordNormalization<CommandCenterTicket>;
}

export function normalizeCommandCenterApprovalV1(value: unknown): CommandCenterRecordNormalization<CommandCenterApproval> {
  return normalizeRecord("approvals", value, commandCenterApprovalSchemaV1) as CommandCenterRecordNormalization<CommandCenterApproval>;
}

export function normalizeCommandCenterDraftV1(value: unknown): CommandCenterRecordNormalization<CommandCenterDraft> {
  return normalizeRecord("drafts", value, commandCenterDraftSchemaV1) as CommandCenterRecordNormalization<CommandCenterDraft>;
}

export function normalizeCommandCenterAuditEventV1(value: unknown): CommandCenterRecordNormalization<CommandCenterAuditEvent> {
  return normalizeRecord("auditEvents", value, commandCenterAuditEventSchemaV1, (raw) => ({
    ...raw,
    ...(raw.metadata === undefined ? { metadata: {} } : {}),
  })) as CommandCenterRecordNormalization<CommandCenterAuditEvent>;
}

function compatibleControls(value: unknown) {
  const raw = objectValue(value);
  if (!raw) return value;
  if (!commandCenterControlsSafetyEnvelopePresent(raw)) {
    // Legacy compatibility may backfill optional capability maps, but an
    // incomplete safety envelope must reach schema validation unchanged and
    // fall back to the explicit fail-closed controls.
    return raw;
  }
  const rawAgentFlags = objectValue(raw.agentFlags);
  const rawActionFlags = objectValue(raw.actionFlags);
  return {
    ...structuredClone(defaultCommandCenterControls),
    ...raw,
    agentFlags: raw.agentFlags === undefined
      ? structuredClone(defaultCommandCenterControls.agentFlags)
      : rawAgentFlags
        ? { ...structuredClone(defaultCommandCenterControls.agentFlags), ...rawAgentFlags }
        : raw.agentFlags,
    actionFlags: raw.actionFlags === undefined
      ? structuredClone(defaultCommandCenterControls.actionFlags)
      : rawActionFlags
        ? { ...structuredClone(defaultCommandCenterControls.actionFlags), ...rawActionFlags }
        : raw.actionFlags,
  };
}

export function normalizeCommandCenterControlsV1(value: unknown): {
  value: CommandCenterControls;
  warning: CommandCenterSnapshotWarning | null;
} {
  if (value === null || value === undefined) {
    return { value: structuredClone(defaultCommandCenterControls), warning: null };
  }
  const parsed = commandCenterControlsSchemaV1.safeParse(compatibleControls(value));
  if (parsed.success) {
    return { value: parsed.data as CommandCenterControls, warning: null };
  }
  return {
    value: failClosedCommandCenterControls(),
    warning: warningFor(
      "controls",
      "global",
      parsed.error,
    ),
  };
}

const commandCenterCollectionMetaSchema = z.object({
  total: z.number().int().nonnegative(),
  inspected: z.number().int().nonnegative(),
  loaded: z.number().int().nonnegative(),
  malformed: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  cursorApplied: z.boolean(),
  nextCursor: z.string().nullable(),
  scanComplete: z.boolean(),
  complete: z.boolean(),
  traversalOrder: z.object({
    field: z.literal("id"),
    direction: z.literal("asc"),
  }).strict(),
  presentationOrder: z.object({
    field: z.enum(["updatedAt", "createdAt"]),
    direction: z.literal("desc"),
    tieBreaker: z.literal("id"),
    tieDirection: z.literal("asc"),
  }).strict(),
}).strict().superRefine((value, context) => {
  if (value.loaded + value.malformed !== value.inspected) {
    context.addIssue({ code: "custom", path: ["inspected"], message: "Inspected must equal loaded plus malformed." });
  }
  const expectedScanComplete = !value.cursorApplied
    && value.nextCursor === null
    && value.inspected === value.total;
  if (value.scanComplete !== expectedScanComplete) {
    context.addIssue({ code: "custom", path: ["scanComplete"], message: "Scan completeness metadata is inconsistent." });
  }
  const expectedComplete = expectedScanComplete
    && value.malformed === 0
    && value.loaded === value.total;
  if (value.complete !== expectedComplete) {
    context.addIssue({ code: "custom", path: ["complete"], message: "Record completeness metadata is inconsistent." });
  }
});

const commandCenterSnapshotWarningSchema = z.object({
  code: z.literal("malformed_record"),
  section: z.enum(["controls", ...commandCenterSnapshotCollections]),
  recordId: z.string(),
  issues: z.array(z.object({
    path: z.string(),
    code: z.string(),
  }).strict()),
}).strict();

export const commandCenterSnapshotV2Schema = z.object({
  controls: commandCenterControlsSchemaV1,
  tickets: z.array(commandCenterTicketSchemaV1),
  approvals: z.array(commandCenterApprovalSchemaV1),
  drafts: z.array(commandCenterDraftSchemaV1),
  auditEvents: z.array(commandCenterAuditEventSchemaV1),
  capabilities: z.object({
    draftAgentsAvailable: z.boolean(),
  }).strict(),
  summary: z.object({
    openTickets: z.number().int().nonnegative(),
    highRiskTickets: z.number().int().nonnegative(),
    pendingApprovals: z.number().int().nonnegative(),
    overdueTickets: z.number().int().nonnegative(),
    pendingDrafts: z.number().int().nonnegative(),
  }).strict(),
  contractVersion: z.literal(2),
  retrievedAt: isoDateTimeSchema,
  consistency: z.literal("best_effort_non_atomic"),
  schemaVersions: z.object({
    controls: z.literal(1),
    tickets: z.literal(1),
    approvals: z.literal(1),
    drafts: z.literal(1),
    auditEvents: z.literal(1),
  }).strict(),
  collections: z.object({
    tickets: commandCenterCollectionMetaSchema,
    approvals: commandCenterCollectionMetaSchema,
    drafts: commandCenterCollectionMetaSchema,
    auditEvents: commandCenterCollectionMetaSchema,
  }).strict(),
  warnings: z.array(commandCenterSnapshotWarningSchema),
  summaryCompleteness: z.object({
    basis: z.literal("loaded_records"),
    complete: z.boolean(),
  }).strict(),
}).strict().superRefine((value, context) => {
  for (const section of commandCenterSnapshotCollections) {
    if (value.collections[section].loaded !== value[section].length) {
      context.addIssue({
        code: "custom",
        path: ["collections", section, "loaded"],
        message: "Loaded metadata must equal the emitted array length.",
      });
    }
    const warningCount = value.warnings.filter((warning) => warning.section === section).length;
    if (value.collections[section].malformed !== warningCount) {
      context.addIssue({
        code: "custom",
        path: ["collections", section, "malformed"],
        message: "Malformed metadata must equal the isolated warning count.",
      });
    }
  }
  const expectedSummaryComplete = value.collections.tickets.complete
    && value.collections.approvals.complete
    && value.collections.drafts.complete;
  if (value.summaryCompleteness.complete !== expectedSummaryComplete) {
    context.addIssue({
      code: "custom",
      path: ["summaryCompleteness", "complete"],
      message: "Summary completeness must follow the contributing collections.",
    });
  }
});

void (commandCenterSnapshotV2Schema satisfies z.ZodType<CommandCenterSnapshotV2>);
void (commandCenterCollectionMetaSchema satisfies z.ZodType<CommandCenterCollectionSnapshotMeta>);
