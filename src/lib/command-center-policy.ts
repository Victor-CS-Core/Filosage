import type {
  CommandCenterControls,
  CommandCenterDraftAgentType,
  CommandCenterRisk,
  CommandCenterTicketCategory,
  CommandCenterTicketStatus,
} from "@/lib/command-center-types";

export type CommandCenterDraftOutputMode =
  | "response_draft"
  | "internal_summary"
  | "founder_brief"
  | "ineligible";

export type CommandCenterDraftEligibility =
  | {
    eligible: true;
    mode: Exclude<CommandCenterDraftOutputMode, "ineligible">;
    reason: string;
  }
  | {
    eligible: false;
    mode: "ineligible";
    reason: string;
  };

const ticketAgentCategories: Record<
  Exclude<CommandCenterDraftAgentType, "founderBrief">,
  readonly CommandCenterTicketCategory[]
> = {
  support: ["support", "other", "security", "abuse", "system_alert"],
  legal: ["legal", "copyright", "privacy"],
  billing: ["billing"],
  productOperations: ["product_feedback", "content_report"],
};

const protectedInternalSummaryCategories: ReadonlySet<CommandCenterTicketCategory> = new Set([
  "legal",
  "copyright",
  "privacy",
  "security",
  "abuse",
  "system_alert",
  "content_report",
]);

export function commandCenterDraftEligibility(input: {
  agentType: CommandCenterDraftAgentType;
  category?: CommandCenterTicketCategory;
  riskLevel?: CommandCenterRisk;
}): CommandCenterDraftEligibility {
  if (input.agentType === "founderBrief") {
    return input.category === undefined && input.riskLevel === undefined
      ? { eligible: true, mode: "founder_brief", reason: "Founder briefs summarize the owner queue only." }
      : { eligible: false, mode: "ineligible", reason: "Founder briefs cannot be generated for a ticket." };
  }

  if (!input.category || !input.riskLevel) {
    return { eligible: false, mode: "ineligible", reason: "A current ticket category and risk are required." };
  }
  if (!ticketAgentCategories[input.agentType].includes(input.category)) {
    return {
      eligible: false,
      mode: "ineligible",
      reason: `The ${input.agentType} agent is not approved for ${input.category.replaceAll("_", " ")} tickets.`,
    };
  }

  if (
    input.agentType === "legal"
    || input.agentType === "productOperations"
    || input.riskLevel === "high"
    || input.riskLevel === "critical"
    || protectedInternalSummaryCategories.has(input.category)
  ) {
    return {
      eligible: true,
      mode: "internal_summary",
      reason: "Protected and high-risk work is limited to an internal summary for owner review.",
    };
  }

  return {
    eligible: true,
    mode: "response_draft",
    reason: "Low- or medium-risk support or billing explanation copy is allowed for owner review.",
  };
}

export const defaultCommandCenterControls: CommandCenterControls = {
  version: 1,
  systemEnabled: true,
  simulationMode: true,
  killSwitchActive: false,
  agentFlags: {
    support: false,
    legal: false,
    billing: false,
    privacy: false,
    content: false,
    productOperations: false,
    knowledge: false,
    founderBrief: false,
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
};

/**
 * Malformed persisted controls cannot be coerced into an enabled capability.
 * The kill switch is asserted as an additional draft-generation backstop.
 */
export function failClosedCommandCenterControls(): CommandCenterControls {
  return {
    ...structuredClone(defaultCommandCenterControls),
    systemEnabled: false,
    killSwitchActive: true,
    agentFlags: structuredClone(defaultCommandCenterControls.agentFlags),
    actionFlags: structuredClone(defaultCommandCenterControls.actionFlags),
  };
}

export function commandCenterControlsSafetyEnvelopePresent(
  value: unknown,
): value is Record<"version" | "systemEnabled" | "simulationMode" | "killSwitchActive", unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return ["version", "systemEnabled", "simulationMode", "killSwitchActive"]
    .every((field) => Object.hasOwn(candidate, field));
}

const ticketTransitions: Record<CommandCenterTicketStatus, CommandCenterTicketStatus[]> = {
  new: ["triaged", "in_progress", "closed"],
  triaged: ["waiting_for_admin", "in_progress", "resolved", "closed"],
  waiting_for_admin: ["approved", "triaged", "closed"],
  approved: ["in_progress", "resolved", "closed"],
  in_progress: ["waiting_for_admin", "resolved", "closed"],
  resolved: ["in_progress", "closed"],
  closed: [],
};

export function canTransitionCommandCenterTicket(
  from: CommandCenterTicketStatus,
  to: CommandCenterTicketStatus,
) {
  return from === to || ticketTransitions[from].includes(to);
}

export function commandCenterDueAt(risk: CommandCenterRisk, now = new Date()) {
  const hours: Record<CommandCenterRisk, number> = {
    low: 72,
    medium: 24,
    high: 4,
    critical: 1,
  };
  return new Date(now.getTime() + hours[risk] * 60 * 60 * 1_000).toISOString();
}

export function commandCenterPriority(risk: CommandCenterRisk): 1 | 2 | 3 | 4 {
  return risk === "critical" ? 1 : risk === "high" ? 2 : risk === "medium" ? 3 : 4;
}

export function commandCenterApprovalIsExpired(expiresAt: string, now = new Date()) {
  const timestamp = Date.parse(expiresAt);
  return !Number.isFinite(timestamp) || timestamp <= now.getTime();
}

export function sanitizeCommandCenterState(
  value: Record<string, unknown> | undefined,
): Record<string, string | number | boolean | null> | undefined {
  if (!value) return undefined;
  const sanitized: Record<string, string | number | boolean | null> = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, 20)) {
    const key = rawKey.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 60);
    if (!key) continue;
    if (rawValue === null || typeof rawValue === "boolean" || typeof rawValue === "number") {
      sanitized[key] = rawValue;
    } else if (typeof rawValue === "string") {
      sanitized[key] = rawValue.slice(0, 240);
    }
  }
  return sanitized;
}

export function redactCommandCenterDraftInput(value: string, limit = 1_500) {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email redacted]")
    .replace(/\b(?:Bearer\s+)?[A-Za-z0-9_-]{32,}\b/g, "[credential redacted]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[number redacted]")
    .slice(0, limit);
}
