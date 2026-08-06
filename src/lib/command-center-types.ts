export const commandCenterTicketCategories = [
  "support",
  "legal",
  "copyright",
  "privacy",
  "billing",
  "content_report",
  "product_feedback",
  "security",
  "abuse",
  "system_alert",
  "other",
] as const;

export type CommandCenterTicketCategory = typeof commandCenterTicketCategories[number];
export type CommandCenterTicketSource = "manual" | "content_report";
export type CommandCenterRisk = "low" | "medium" | "high" | "critical";
export type CommandCenterTicketStatus =
  | "new"
  | "triaged"
  | "waiting_for_admin"
  | "approved"
  | "in_progress"
  | "resolved"
  | "closed";

export interface CommandCenterNote {
  id: string;
  authorUid: string;
  body: string;
  createdAt: string;
}

export interface CommandCenterTicket extends Record<string, unknown> {
  id: string;
  ticketNumber: string;
  version: number;
  source: CommandCenterTicketSource;
  sourceRecordId?: string;
  category: CommandCenterTicketCategory;
  riskLevel: CommandCenterRisk;
  priority: 1 | 2 | 3 | 4;
  status: CommandCenterTicketStatus;
  subject: string;
  normalizedSummary: string;
  untrustedExcerpt?: string;
  relatedUserId?: string;
  relatedCourseId?: string;
  relatedLessonId?: string;
  assignedRole?: "owner";
  requiresHumanApproval: boolean;
  confirmedFacts: string[];
  unverifiedClaims: string[];
  evidenceReferences: string[];
  tags: string[];
  notes: CommandCenterNote[];
  createdAt: string;
  updatedAt: string;
  dueAt: string;
  resolvedAt?: string;
}

export const commandCenterApprovalActionTypes = [
  "send_response",
  "restrict_account",
  "remove_content",
  "export_user_data",
  "delete_user_data",
  "billing_adjustment",
  "policy_change",
  "publish_status",
] as const;

export type CommandCenterApprovalActionType = typeof commandCenterApprovalActionTypes[number];
export type CommandCenterApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export const commandCenterDraftAgentTypes = [
  "support",
  "legal",
  "billing",
  "productOperations",
  "founderBrief",
] as const;

export type CommandCenterDraftAgentType = typeof commandCenterDraftAgentTypes[number];
export type CommandCenterDraftStatus = "pending_review" | "accepted" | "rejected";
export type CommandCenterDraftConfidence = "low" | "medium" | "high";

export interface CommandCenterDraftContent extends Record<string, unknown> {
  headline: string;
  summary: string;
  recommendedCategory: CommandCenterTicketCategory | null;
  recommendedRisk: CommandCenterRisk | null;
  recommendedTags: string[];
  responseDraft: string | null;
  missingInformation: string[];
  escalationReasons: string[];
  evidenceUsed: string[];
  groupedSignals: string[];
  priorities: string[];
  confidence: CommandCenterDraftConfidence;
  confidenceRationale: string;
  cautions: string[];
}

export interface CommandCenterDraft extends Record<string, unknown> {
  id: string;
  version: number;
  scope: "ticket" | "founder_brief";
  ticketId?: string;
  sourceTicketVersion?: number;
  agentType: CommandCenterDraftAgentType;
  status: CommandCenterDraftStatus;
  content: CommandCenterDraftContent;
  model: string;
  generationProfile: string;
  promptVersion: string;
  requestedBy: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewerReason?: string;
  externalSideEffect: false;
}

export interface CommandCenterApproval extends Record<string, unknown> {
  id: string;
  version: number;
  ticketId: string;
  actionType: CommandCenterApprovalActionType;
  proposedAction: string;
  riskLevel: CommandCenterRisk;
  sideEffects: string[];
  affectedRecords: string[];
  policyReferences: string[];
  requiredApproverRole: "owner";
  status: CommandCenterApprovalStatus;
  executionState: "not_executed";
  idempotencyKey: string;
  expectedTicketVersion: number;
  requestedBy: string;
  createdAt: string;
  expiresAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewerReason?: string;
}

export interface CommandCenterAuditEvent extends Record<string, unknown> {
  id: string;
  actorUid: string;
  actorRole: "owner" | "system";
  action: string;
  targetType: "ticket" | "approval" | "draft" | "controls";
  targetId: string;
  ticketId?: string;
  correlationId: string;
  summary: string;
  beforeState?: Record<string, string | number | boolean | null>;
  afterState?: Record<string, string | number | boolean | null>;
  metadata: Record<string, string | number | boolean | null>;
  externalSideEffect: false;
  createdAt: string;
}

export interface CommandCenterControls extends Record<string, unknown> {
  version: number;
  systemEnabled: boolean;
  simulationMode: true;
  killSwitchActive: boolean;
  agentFlags: {
    support: boolean;
    legal: boolean;
    billing: boolean;
    privacy: boolean;
    content: boolean;
    productOperations: boolean;
    knowledge: boolean;
    founderBrief: boolean;
  };
  actionFlags: {
    externalEffects: false;
    sendResponse: false;
    refund: false;
    deleteData: false;
    restrictAccount: false;
    removeContent: false;
    publishStatus: false;
  };
  updatedAt?: string;
  updatedBy?: string;
}

export interface CommandCenterSnapshot {
  controls: CommandCenterControls;
  tickets: CommandCenterTicket[];
  approvals: CommandCenterApproval[];
  drafts: CommandCenterDraft[];
  auditEvents: CommandCenterAuditEvent[];
  capabilities: {
    draftAgentsAvailable: boolean;
  };
  summary: {
    openTickets: number;
    highRiskTickets: number;
    pendingApprovals: number;
    overdueTickets: number;
    pendingDrafts: number;
  };
}
