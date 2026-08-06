import type {
  CommandCenterControls,
  CommandCenterRisk,
  CommandCenterTicketStatus,
} from "@/lib/command-center-types";

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
