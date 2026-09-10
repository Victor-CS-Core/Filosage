import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import type { ServerAccount } from "@/lib/account-server";
import {
  AiQuotaError,
  extractOpenAiUsage,
  finalizeAiUsage,
  openAiSafetyIdentifier,
  reserveAiUsage,
  type AiReservation,
} from "@/lib/ai-usage";
import { aiClient } from "@/lib/local-ai";
import { aiUsageProfileMetadata, openAiExecutionProfile } from "@/lib/openai-generation";
import { billingConfiguration } from "@/lib/runtime-config";
import { supportArticles } from "@/content/support/articles";
import { commandCenterDraftContentSchema } from "@/lib/command-center-draft-schema";
import {
  buildCommandCenterDraftPrompt,
  commandCenterDraftInstructions,
  normalizeCommandCenterEvidenceReferences,
} from "@/lib/command-center-draft-prompt";
import {
  commandCenterDraftEligibility,
  redactCommandCenterDraftInput,
  type CommandCenterDraftOutputMode,
} from "@/lib/command-center-policy";
import {
  getCommandCenterDraft,
  getCommandCenterFounderBriefMaterial,
  getCommandCenterSnapshot,
  getCommandCenterTicket,
  storeGeneratedCommandCenterDraft,
} from "@/lib/command-center-server";
import type {
  CommandCenterDraft,
  CommandCenterDraftAgentType,
  CommandCenterDraftContent,
  CommandCenterTicket,
} from "@/lib/command-center-types";

export class CommandCenterDraftGenerationError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

function tokens(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
}

function approvedSupportKnowledge(ticket: CommandCenterTicket) {
  const terms = tokens([ticket.subject, ticket.normalizedSummary, ...ticket.tags].join(" "));
  return supportArticles
    .map((article) => ({
      article,
      score: [article.title, article.summary, ...article.keywords]
        .flatMap((value) => [...tokens(value)])
        .filter((value) => terms.has(value)).length,
    }))
    .sort((a, b) => b.score - a.score || Number(b.article.featured) - Number(a.article.featured))
    .slice(0, 3)
    .map(({ article }) => ({
      ref: `support:${article.slug}@${article.reviewedOn}`,
      text: `${article.title}\n${article.summary}\n${article.body}`.slice(0, 2_400),
    }));
}

function ticketBlock(ticket: CommandCenterTicket) {
  return [
    `Ticket: ${ticket.ticketNumber}`,
    `Subject: ${redactCommandCenterDraftInput(ticket.subject, 160)}`,
    `Current category: ${ticket.category}`,
    `Current risk: ${ticket.riskLevel}`,
    `Operational summary: ${redactCommandCenterDraftInput(ticket.normalizedSummary)}`,
    `Confirmed facts:\n${ticket.confirmedFacts.map((fact) => `- ${redactCommandCenterDraftInput(fact, 500)}`).join("\n") || "- None recorded"}`,
    `Unverified claims:\n${ticket.unverifiedClaims.map((claim) => `- ${redactCommandCenterDraftInput(claim, 500)}`).join("\n") || "- None recorded"}`,
    `Evidence references:\n${ticket.evidenceReferences.map((ref) => `- ${redactCommandCenterDraftInput(ref, 240)}`).join("\n") || "- None recorded"}`,
  ].filter(Boolean).join("\n");
}

function contextForAgent(
  agentType: CommandCenterDraftAgentType,
  ticket: CommandCenterTicket | undefined,
  tickets: CommandCenterTicket[],
  outputMode: Exclude<CommandCenterDraftOutputMode, "ineligible">,
) {
  const refs: string[] = [];
  const knowledge: string[] = [];
  const relatedData: string[] = [];
  if (ticket && outputMode === "response_draft" && (agentType === "support" || agentType === "billing")) {
    for (const source of approvedSupportKnowledge(ticket)) {
      refs.push(source.ref);
      knowledge.push(`[${source.ref}]\n${source.text}`);
    }
  }
  if (agentType === "billing") {
    const billing = billingConfiguration();
    refs.push("runtime:billing-capability");
    knowledge.push(`[runtime:billing-capability]\nPaid checkout enabled: ${billing.checkoutReady}. Billing provider ready: ${billing.providerReady}. Never imply that a charge, refund, cancellation, or subscription change occurred.`);
  }
  if (agentType === "legal") {
    refs.push("policy:legal-intake-v1", "policy:privacy-workflows-v1", "policy:copyright-intake-v1");
    knowledge.push("[policy:legal-intake-v1]\nSummarize intake facts and missing information only. Do not give legal advice, decide legal rights, promise an outcome, or draft a final legal position. Escalate to the owner.");
  }
  if (agentType === "productOperations") {
    refs.push("queue:product-feedback-snapshot");
    const related = tickets.filter((candidate) => candidate.category === "product_feedback" || candidate.category === "content_report").slice(0, 25);
    relatedData.push(`[queue:product-feedback-snapshot]\n${related.map((candidate) => `- ${candidate.ticketNumber}: ${redactCommandCenterDraftInput(candidate.subject, 160)} — ${redactCommandCenterDraftInput(candidate.normalizedSummary, 500)}`).join("\n") || "No related feedback tickets."}`);
  }
  if (agentType === "founderBrief") {
    refs.push("queue:open-work-snapshot");
    relatedData.push(`[queue:open-work-snapshot]\n${tickets.filter((candidate) => !["resolved", "closed"].includes(candidate.status)).slice(0, 50).map((candidate) => `- ${candidate.ticketNumber} | ${candidate.riskLevel} | ${candidate.status} | ${redactCommandCenterDraftInput(candidate.subject, 160)} | due ${candidate.dueAt}`).join("\n") || "No open tickets."}`);
  }
  return { refs, knowledge, relatedData };
}

function assertAgentReady(agentType: CommandCenterDraftAgentType, ticket: CommandCenterTicket | undefined, snapshot: Awaited<ReturnType<typeof getCommandCenterSnapshot>>) {
  if (!snapshot.capabilities.draftAgentsAvailable) throw new CommandCenterDraftGenerationError("Draft agents are not available in this environment.");
  if (!snapshot.controls.systemEnabled) throw new CommandCenterDraftGenerationError("The command center is paused.");
  if (snapshot.controls.killSwitchActive) throw new CommandCenterDraftGenerationError("The kill switch is active. Draft generation is paused.");
  if (!snapshot.controls.agentFlags[agentType]) throw new CommandCenterDraftGenerationError("Enable this draft agent in Controls before generating a draft.");
  if (agentType !== "founderBrief" && !ticket) {
    throw new CommandCenterDraftGenerationError("Ticket not found.", 404);
  }
  const eligibility = commandCenterDraftEligibility({
    agentType,
    category: ticket?.category,
    riskLevel: ticket?.riskLevel,
  });
  if (!eligibility.eligible) {
    throw new CommandCenterDraftGenerationError(eligibility.reason);
  }
  return eligibility;
}

function normalizeContent(
  content: CommandCenterDraftContent,
  outputMode: Exclude<CommandCenterDraftOutputMode, "ineligible">,
  refs: string[],
) {
  return {
    ...content,
    responseDraft: outputMode === "response_draft" ? content.responseDraft : null,
    recommendedTags: Array.from(new Set(content.recommendedTags.map((tag) => tag.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")).filter(Boolean))).slice(0, 10),
    evidenceUsed: normalizeCommandCenterEvidenceReferences(content.evidenceUsed, refs),
    cautions: Array.from(new Set([
      ...content.cautions,
      ...(outputMode === "response_draft" ? [] : ["Internal-summary-only policy. No response copy is authorized."]),
      "Review-only output. No message or external action was executed.",
    ])).slice(0, 10),
  } satisfies CommandCenterDraftContent;
}

export async function generateCommandCenterDraft(input: {
  account: ServerAccount;
  agentType: CommandCenterDraftAgentType;
  ticketId?: string;
  expectedTicketVersion?: number;
  idempotencyKey: string | null;
}): Promise<{ draft: CommandCenterDraft; recovered: boolean }> {
  const [snapshot, ticket] = await Promise.all([
    getCommandCenterSnapshot(),
    input.ticketId ? getCommandCenterTicket(input.ticketId) : Promise.resolve(null),
  ]);
  const eligibility = assertAgentReady(input.agentType, ticket ?? undefined, snapshot);
  if (ticket && ticket.version !== input.expectedTicketVersion) {
    throw new CommandCenterDraftGenerationError("The ticket changed. Refresh before generating a draft.");
  }
  const founderMaterial = input.agentType === "founderBrief"
    ? await getCommandCenterFounderBriefMaterial()
    : null;

  let reservation: AiReservation | null = null;
  let usage = { inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
  const profile = openAiExecutionProfile("command-center.draft");
  let responseId: string | undefined;
  try {
    try {
      reservation = await reserveAiUsage(input.account, "command_center_draft", input.idempotencyKey);
    } catch (error) {
      if (error instanceof AiQuotaError && error.code === "DUPLICATE_REQUEST" && error.details.requestStatus === "completed" && typeof error.details.resultId === "string") {
        const recovered = await getCommandCenterDraft(error.details.resultId);
        if (recovered) return { draft: recovered, recovered: true };
      }
      throw error;
    }
    const context = contextForAgent(
      input.agentType,
      ticket ?? undefined,
      founderMaterial?.promptTickets ?? snapshot.tickets,
      eligibility.mode,
    );
    const client = aiClient();
    const safetyIdentifier = await openAiSafetyIdentifier(input.account.uid);
    const prompt = buildCommandCenterDraftPrompt({
      agentType: input.agentType,
      outputMode: eligibility.mode,
      workItemLabel: ticket ? ticket.ticketNumber : "current owner queue",
      untrustedWork: [ticket ? ticketBlock(ticket) : "", ...context.relatedData].filter(Boolean).join("\n\n"),
      approvedKnowledge: context.knowledge,
      allowedEvidenceReferences: context.refs,
    });
    const generated = await client.responses.parse({
      model: profile.model,
      store: false,
      instructions: commandCenterDraftInstructions,
      input: prompt,
      reasoning: { effort: profile.reasoningEffort },
      text: { format: zodTextFormat(commandCenterDraftContentSchema, "command_center_draft"), verbosity: profile.textVerbosity },
      prompt_cache_key: profile.promptCacheKey,
      max_output_tokens: 2_500,
      safety_identifier: safetyIdentifier,
    });
    const extractedUsage = extractOpenAiUsage(generated);
    responseId = generated.id;
    usage = extractedUsage;
    if (!generated.output_parsed) throw new CommandCenterDraftGenerationError("The model did not return a reviewable draft.", 502);
    const content = normalizeContent(generated.output_parsed, eligibility.mode, context.refs);
    const draft = await storeGeneratedCommandCenterDraft({
      id: reservation.requestId,
      actorUid: input.account.uid,
      agentType: input.agentType,
      ticketId: ticket?.id,
      expectedTicketVersion: ticket?.version,
      sourceManifest: founderMaterial?.manifest,
      content,
      model: profile.model,
      generationProfile: profile.id,
      promptVersion: profile.promptVersion,
    });
    await finalizeAiUsage(reservation, { ...usage, model: profile.model, responseId, resultId: draft.id, ...aiUsageProfileMetadata(profile) });
    reservation = null;
    return { draft, recovered: false };
  } catch (error) {
    if (reservation) {
      await finalizeAiUsage(reservation, { ...usage, model: profile.model, responseId, failed: true, ...aiUsageProfileMetadata(profile) }).catch(() => undefined);
    }
    throw error;
  }
}

export function commandCenterDraftGenerationResponse(error: unknown) {
  if (!(error instanceof CommandCenterDraftGenerationError)) return null;
  return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
}
