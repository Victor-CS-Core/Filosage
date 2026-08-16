import "server-only";

import type { ServerAccount } from "@/lib/account-server";
import { flashcardFeatureConfiguration } from "@/lib/flashcard-feature";
import { planAllows, type PlanCapability } from "@/lib/membership-plans";

export function capabilitiesForAccount(account: Pick<ServerAccount, "plan" | "isOwner" | "accountStatus">) {
  const active = account.accountStatus !== "suspended";
  const allowed = (capability: PlanCapability) => active && (account.isOwner || planAllows(account.plan, capability));
  const flashcardDecksEnabled = active && flashcardFeatureConfiguration().decksEnabled;
  return {
    createCourse: allowed("create_course"),
    generateLesson: allowed("generate_lesson"),
    flashcardDecksEnabled,
    createCustomFlashcardDeck: allowed("create_custom_flashcard_deck"),
    publishCourse: allowed("publish_course"),
    advancedCapstoneAnalysis: allowed("advanced_capstone_analysis"),
    exportEvidenceReport: allowed("export_evidence_report"),
    shareEvidenceReport: allowed("share_evidence_report"),
  };
}
