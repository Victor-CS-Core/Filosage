import "server-only";
import type { ServerAccount } from "@/lib/account-server";
import { coursePipelineFeatureFlags, lessonVisualsEnabled } from "@/lib/feature-flags";
import { openAiExecutionProfile } from "@/lib/openai-generation";
import { isLocalMode } from "@/lib/local-mode";
import { serverEnvironment } from "@/lib/runtime-environment";

/** The route and capability response must fingerprint the same runtime contract. */
export function lessonGenerationConfiguration(account: Pick<ServerAccount, "uid" | "isOwner">, pipelineV2 = coursePipelineFeatureFlags(account).pipelineV2) {
  const flags = coursePipelineFeatureFlags(account);
  const stub = isLocalMode() && !serverEnvironment.OPENAI_API_KEY;
  const profiles = ["lesson.standard", "lesson.fallback", "lesson.grounding"] as const;
  return { writer: "durable-lesson-v1", provider: stub ? "local-stub" : "openai", stub, pipelineV2,
    labsV2: pipelineV2 && flags.labsV2, visualsV2: pipelineV2 && flags.visualsV2, legacyVisuals: lessonVisualsEnabled(account),
    maxOutputTokens: 5_000, groundingMaxOutputTokens: 2_000, moderation: "moderation-provider-v1",
    profiles: profiles.map((id) => {
      const p = openAiExecutionProfile(id, undefined, { coursePipelineV2: pipelineV2 });
      return { id: p.id, model: p.model, promptVersion: p.promptVersion, promptCacheKey: p.promptCacheKey, reasoningEffort: p.reasoningEffort, textVerbosity: p.textVerbosity };
    }),
  };
}
