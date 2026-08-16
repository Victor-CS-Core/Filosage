const FIXTURE_NOW = "2026-08-16T12:00:00.000Z";

export const COMMAND_CENTER_V2_VALID_TICKET_COUNT = 501;
export const COMMAND_CENTER_V2_VALID_TICKET_IDS = Array.from(
  { length: COMMAND_CENTER_V2_VALID_TICKET_COUNT },
  (_, index) => `ccv2-ticket-${String(index).padStart(4, "0")}`,
);
export const COMMAND_CENTER_V2_MALFORMED_TICKET_ID = "ccv2-ticket-0250x-malformed";
export const COMMAND_CENTER_V2_LEGACY_TICKET_ID = "ccv2-ticket-0004";
export const COMMAND_CENTER_V2_SUPPORT_TICKET_A_ID = "ccv2-ticket-0000";
export const COMMAND_CENTER_V2_SUPPORT_TICKET_B_ID = "ccv2-ticket-0001";
export const COMMAND_CENTER_V2_PROTECTED_TICKET_ID = "ccv2-ticket-0002";
export const COMMAND_CENTER_V2_LOW_RISK_TICKET_ID = "ccv2-ticket-0003";
export const COMMAND_CENTER_V2_LEGACY_FOUNDER_DRAFT_ID = "ccv2-founder-v1";
export const COMMAND_CENTER_V2_CANARIES = [
  "MALFORMED_TICKET_PRIVATE_CANARY",
  "MALFORMED_APPROVAL_PRIVATE_CANARY",
  "MALFORMED_DRAFT_PRIVATE_CANARY",
  "MALFORMED_AUDIT_PRIVATE_CANARY",
  "MALFORMED_ID_PRIVATE_CANARY",
  "VALID_EXTRA_FIELD_PRIVATE_CANARY",
];

function ticketNumber(index) {
  return `TKT-${index.toString(36).padStart(7, "0").toUpperCase()}`;
}

function validTicket(index) {
  const id = `ccv2-ticket-${String(index).padStart(4, "0")}`;
  const createdAt = new Date(Date.parse(FIXTURE_NOW) - (index + 1) * 60_000).toISOString();
  const sharedTie = index < 2 ? FIXTURE_NOW : createdAt;
  const source = index < 2 ? "user_support" : "manual";
  const category = index === 2 ? "security" : "support";
  const riskLevel = index === 2 ? "critical" : index === 3 ? "low" : "medium";
  const priority = riskLevel === "critical" ? 1 : riskLevel === "low" ? 4 : 3;
  const ticket = {
    id,
    ticketNumber: ticketNumber(index),
    version: 1,
    source,
    category,
    riskLevel,
    priority,
    status: index === COMMAND_CENTER_V2_VALID_TICKET_COUNT - 1 ? "closed" : "new",
    subject: index === 0
      ? "Contract support ticket A"
      : index === 1
        ? "Contract support ticket B"
        : index === 2
          ? "Critical security report for internal summary only"
          : index === 3
            ? "Low-risk support explanation"
            : `Command Center v2 fixture ticket ${index}`,
    normalizedSummary: `Deterministic Command Center v2 fixture record ${index} for local contract validation.`,
    ...(source === "user_support" ? { relatedUserId: "local-free-learner" } : {}),
    requiresHumanApproval: true,
    confirmedFacts: [`Fixture record ${index} exists in the isolated local store.`],
    unverifiedClaims: [],
    evidenceReferences: [],
    tags: ["command-center-v2-contract"],
    notes: [],
    publicReplies: [],
    createdAt,
    updatedAt: sharedTie,
    dueAt: new Date(Date.parse(FIXTURE_NOW) + (index + 1) * 60_000).toISOString(),
  };

  if (id === COMMAND_CENTER_V2_LEGACY_TICKET_ID) {
    delete ticket.notes;
    delete ticket.publicReplies;
  }
  if (index === 10) ticket.privateExtra = COMMAND_CENTER_V2_CANARIES[5];
  return ticket;
}

function draftContent() {
  return {
    headline: "Legacy founder queue brief",
    summary: "A schema-v1 founder brief remains readable but has no source manifest.",
    recommendedCategory: null,
    recommendedRisk: null,
    recommendedTags: ["founder-brief"],
    responseDraft: null,
    missingInformation: [],
    escalationReasons: [],
    evidenceUsed: ["queue:open-work-snapshot"],
    groupedSignals: [],
    priorities: ["Review critical and overdue work first."],
    confidence: "medium",
    confidenceRationale: "This compatibility fixture predates source manifests.",
    cautions: ["Review-only output. No message or external action was executed."],
  };
}

export function buildCommandCenterV2ContractStore({ includeMalformedTicket = true } = {}) {
  const store = {};
  for (let index = 0; index < COMMAND_CENTER_V2_VALID_TICKET_COUNT; index += 1) {
    const ticket = validTicket(index);
    store[`commandCenterTickets/${ticket.id}`] = ticket;
  }

  if (includeMalformedTicket) {
    store[`commandCenterTickets/${COMMAND_CENTER_V2_MALFORMED_TICKET_ID}`] = {
      id: COMMAND_CENTER_V2_CANARIES[4],
      version: "not-a-version",
      source: "manual",
      category: "support",
      riskLevel: "medium",
      priority: 3,
      status: "teleported",
      subject: COMMAND_CENTER_V2_CANARIES[0],
      normalizedSummary: "This malformed record must be quarantined.",
      updatedAt: "not-a-date",
    };
  }

  store["commandCenterControls/global"] = {
    version: 1,
    systemEnabled: true,
    simulationMode: true,
    killSwitchActive: false,
    agentFlags: {
      support: true,
      legal: true,
      billing: true,
      privacy: false,
      content: false,
      productOperations: true,
      knowledge: false,
      founderBrief: true,
    },
    actionFlags: {
      externalEffects: false,
      sendResponse: false,
      refund: false,
      deleteData: false,
      restrictAccount: false,
      removeContent: false,
      publishStatus: false,
    },
    updatedAt: FIXTURE_NOW,
    updatedBy: "local-owner",
  };

  store["commandCenterApprovals/ccv2-approval-valid"] = {
    id: "ccv2-approval-valid",
    version: 1,
    ticketId: COMMAND_CENTER_V2_SUPPORT_TICKET_A_ID,
    actionType: "send_response",
    proposedAction: "Send a reviewed response after a separate publication decision.",
    riskLevel: "medium",
    sideEffects: ["A learner-visible message would be published."],
    affectedRecords: [`commandCenterTickets/${COMMAND_CENTER_V2_SUPPORT_TICKET_A_ID}`],
    policyReferences: ["Support response policy v1"],
    requiredApproverRole: "owner",
    status: "pending",
    executionState: "not_executed",
    idempotencyKey: "ccv2-approval-idempotency",
    expectedTicketVersion: 1,
    requestedBy: "local-owner",
    createdAt: FIXTURE_NOW,
    expiresAt: "2030-08-16T12:00:00.000Z",
  };
  store["commandCenterApprovals/ccv2-approval-malformed"] = {
    id: "ccv2-approval-malformed",
    version: 1,
    proposedAction: COMMAND_CENTER_V2_CANARIES[1],
    status: "maybe",
  };

  store[`commandCenterDrafts/${COMMAND_CENTER_V2_LEGACY_FOUNDER_DRAFT_ID}`] = {
    id: COMMAND_CENTER_V2_LEGACY_FOUNDER_DRAFT_ID,
    version: 1,
    scope: "founder_brief",
    agentType: "founderBrief",
    status: "pending_review",
    content: draftContent(),
    model: "local-compatibility-fixture",
    generationProfile: "command-center-v1",
    promptVersion: "2026-08-06-draft-only-v5",
    requestedBy: "local-owner",
    createdAt: FIXTURE_NOW,
    externalSideEffect: false,
  };
  store["commandCenterDrafts/ccv2-draft-malformed"] = {
    id: "ccv2-draft-malformed",
    version: 1,
    scope: "founder_brief",
    agentType: "founderBrief",
    status: "pending_review",
    content: COMMAND_CENTER_V2_CANARIES[2],
  };

  store["commandCenterAuditEvents/ccv2-audit-valid"] = {
    id: "ccv2-audit-valid",
    actorUid: "local-owner",
    actorRole: "owner",
    action: "fixture.seeded",
    targetType: "controls",
    targetId: "global",
    correlationId: "ccv2-fixture-correlation",
    summary: "Seeded the deterministic local Command Center v2 contract fixture.",
    metadata: {},
    externalSideEffect: false,
    createdAt: FIXTURE_NOW,
  };
  store["commandCenterAuditEvents/ccv2-audit-malformed"] = {
    id: "ccv2-audit-malformed",
    action: COMMAND_CENTER_V2_CANARIES[3],
    externalSideEffect: "yes",
    createdAt: "not-a-date",
  };

  return store;
}
