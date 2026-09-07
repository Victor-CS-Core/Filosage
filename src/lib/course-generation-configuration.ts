import "server-only";
import type { ServerAccount } from "@/lib/account-server";
import { coursePipelineFeatureFlags } from "@/lib/feature-flags";
import { AI_GENERATION_OUTPUT_BUDGETS, openAiExecutionProfile } from "@/lib/openai-generation";
import { isLocalMode } from "@/lib/local-mode";
import { serverEnvironment } from "@/lib/runtime-environment";

/** The generation route and evaluation preflight use one runtime fingerprint. */
export function courseGenerationConfiguration(account: Pick<ServerAccount, "uid" | "isOwner">) {
  const flags = coursePipelineFeatureFlags(account);
  const stub = isLocalMode() && !serverEnvironment.OPENAI_API_KEY;
  const profiles = ["course.standard", "course.research", "course.grounding", "course.repair", "course.recovery"] as const;
  return { writer: "durable-course-v2", provider: stub ? "local-stub" : "openai", stub, pipelineV2: flags.pipelineV2,
    labsV2: flags.pipelineV2 && flags.labsV2, visualsV2: flags.pipelineV2 && flags.visualsV2,
    outputBudgets: AI_GENERATION_OUTPUT_BUDGETS, moderation: "moderation-provider-v1",
    profiles: profiles.map((id) => {
      const profile = openAiExecutionProfile(id, undefined, { coursePipelineV2: flags.pipelineV2 });
      return { id: profile.id, model: profile.model, promptVersion: profile.promptVersion, promptCacheKey: profile.promptCacheKey,
        reasoningEffort: profile.reasoningEffort, textVerbosity: profile.textVerbosity };
    }),
  };
}
