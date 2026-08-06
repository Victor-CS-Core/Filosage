import { z } from "zod";
import {
  commandCenterDraftAgentTypes,
  commandCenterTicketCategories,
} from "@/lib/command-center-types";

export const commandCenterDraftContentSchema = z.object({
  headline: z.string().trim().min(4).max(160),
  summary: z.string().trim().min(20).max(1_500),
  recommendedCategory: z.enum(commandCenterTicketCategories).nullable(),
  recommendedRisk: z.enum(["low", "medium", "high", "critical"]).nullable(),
  recommendedTags: z.array(z.string().trim().min(2).max(40)).max(10),
  responseDraft: z.string().trim().min(20).max(4_000).nullable(),
  missingInformation: z.array(z.string().trim().min(4).max(240)).max(10),
  escalationReasons: z.array(z.string().trim().min(4).max(240)).max(10),
  evidenceUsed: z.array(z.string().trim().min(3).max(240)).max(15),
  groupedSignals: z.array(z.string().trim().min(4).max(300)).max(12),
  priorities: z.array(z.string().trim().min(4).max(300)).max(12),
  confidence: z.enum(["low", "medium", "high"]),
  confidenceRationale: z.string().trim().min(12).max(500),
  cautions: z.array(z.string().trim().min(4).max(240)).max(10),
}).strict();

export const commandCenterDraftRequestSchema = z.object({
  agentType: z.enum(commandCenterDraftAgentTypes),
  ticketId: z.string().regex(/^[A-Za-z0-9_-]{8,200}$/).optional(),
  expectedTicketVersion: z.number().int().positive().optional(),
}).strict().superRefine((value, context) => {
  const founderBrief = value.agentType === "founderBrief";
  if (founderBrief && (value.ticketId || value.expectedTicketVersion)) {
    context.addIssue({ code: "custom", message: "Founder briefs summarize the queue and do not accept a ticket." });
  }
  if (!founderBrief && (!value.ticketId || !value.expectedTicketVersion)) {
    context.addIssue({ code: "custom", message: "Choose a current ticket for this draft agent." });
  }
});

export const commandCenterDraftReviewSchema = z.object({
  expectedVersion: z.number().int().positive(),
  decision: z.enum(["accepted", "rejected"]),
  reason: z.string().trim().min(10).max(500),
}).strict();
