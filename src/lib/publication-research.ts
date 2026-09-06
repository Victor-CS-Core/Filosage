import { effectiveCourseReviewPolicy } from "@/lib/course-pipeline/review-policy";
import { publicationContentFingerprint } from "@/lib/publication-content";
import { restoreEvidenceResearchStage, SOURCE_RESEARCH_POLICY_VERSION } from "@/lib/source-research";

export interface PublicationResearchProof {
  status: "verified" | "blocked";
  artifactPath: string | null;
  fingerprint: string | null;
  expiresAt: string | null;
}

export class PublicationResearchChangedError extends Error {
  constructor() {
    super("STALE_VALIDATION_SNAPSHOT: source evidence changed or expired. Refresh the research and validate this draft again.");
    this.name = "PublicationResearchChangedError";
  }
}

export function publicationResearchArtifactPath(course: Record<string, unknown>) {
  const id = course.sourceResearchArtifactId;
  return typeof id === "string" && /^[a-zA-Z0-9_-]{1,180}$/.test(id)
    ? `courseResearchArtifacts/${id}` : null;
}

/** Further reading is deliberately excluded: a bibliography is not claim evidence. */
export function publicationResearchProof(
  course: Record<string, unknown>, artifact: Record<string, unknown> | null | undefined, now = Date.now(),
): PublicationResearchProof | null {
  const freshnessRequired = effectiveCourseReviewPolicy(course).reasonCodes.includes("freshness");
  const sources = Array.isArray(course.sourcePack) ? course.sourcePack : [];
  const hasBinding = [course.sourceResearchArtifactId, course.sourceResearchRequestFingerprint,
    course.sourceResearchResponseId, course.sourceResearchPolicyVersion].some((value) => value !== undefined);
  // Legacy manually supplied sources still use the explicit review contract.
  // Current-claims courses must have fresh traceable research, including legacy drafts.
  if (!freshnessRequired && (!hasBinding || sources.length === 0)) return null;
  const artifactPath = publicationResearchArtifactPath(course);
  const blocked = (): PublicationResearchProof => ({ status: "blocked", artifactPath, fingerprint: null, expiresAt: null });
  const requestFingerprint = course.sourceResearchRequestFingerprint;
  if (!artifactPath || !sources.length || !artifact || typeof requestFingerprint !== "string"
    || !/^[a-f0-9]{64}$/.test(requestFingerprint)
    || course.sourceResearchPolicyVersion !== SOURCE_RESEARCH_POLICY_VERSION
    || artifact.ownerUid !== course.authorId) return blocked();
  const restored = restoreEvidenceResearchStage(artifact, { requestFingerprint, freshnessRequired, now });
  if (!restored?.responseId || restored.responseId !== course.sourceResearchResponseId
    || publicationContentFingerprint(restored.sourcePack) !== publicationContentFingerprint(sources)) return blocked();
  return {
    status: "verified", artifactPath, expiresAt: restored.expiresAt,
    fingerprint: publicationContentFingerprint({ requestFingerprint, ownerUid: artifact.ownerUid,
      policyVersion: artifact.policyVersion, responseId: restored.responseId,
      sourcePack: restored.sourcePack, evidenceCreatedAt: restored.createdAt, expiresAt: restored.expiresAt }),
  };
}

export function assertPublicationResearchUnchanged(
  course: Record<string, unknown>, artifact: Record<string, unknown> | null | undefined,
  expected: PublicationResearchProof | null | undefined, now = Date.now(),
) {
  const current = publicationResearchProof(course, artifact, now);
  if (JSON.stringify(current) !== JSON.stringify(expected ?? null)) {
    throw new PublicationResearchChangedError();
  }
}
