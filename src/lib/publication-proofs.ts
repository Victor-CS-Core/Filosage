import { createHash } from "node:crypto";
import { COURSE_QUALITY_GATE_VERSION } from "@/lib/course-quality";
import { LESSON_QUALITY_GATE_VERSION } from "@/lib/lesson-quality";
import { COURSE_PIPELINE_VERSIONS, type ValidationReport } from "@/lib/course-pipeline/contract";
import { COURSE_REVIEW_POLICY_VERSION } from "@/lib/course-pipeline/review-policy";
import { publicationContentFingerprint, publicationContentHash } from "@/lib/publication-content";

// Bump the safety version when output moderation or local safety policy changes.
export const PUBLICATION_SAFETY_POLICY_VERSION = "publication-safety-v1";
export const PUBLICATION_PROOF_POLICY_VERSION = [
  "publication-proof-v1", PUBLICATION_SAFETY_POLICY_VERSION,
  COURSE_PIPELINE_VERSIONS.qualityContract, COURSE_QUALITY_GATE_VERSION,
  LESSON_QUALITY_GATE_VERSION, COURSE_PIPELINE_VERSIONS.sourcePolicy,
  COURSE_REVIEW_POLICY_VERSION,
].join(":");

export interface GenerationSafetyProof {
  version: 1;
  scope: string;
  contentHash: string;
  policyVersion: string;
  status: "passed";
  basis: "generation-output-moderation";
  moderationModel: "omni-moderation-latest";
}

/** Call only after successful output moderation, on the FINAL stored payload. */
export async function createGenerationSafetyProof(document: unknown, scope: "course" | `lesson:${string}`): Promise<GenerationSafetyProof> {
  return {
    version: 1, scope, contentHash: await publicationContentHash(document),
    policyVersion: PUBLICATION_SAFETY_POLICY_VERSION, status: "passed",
    basis: "generation-output-moderation", moderationModel: "omni-moderation-latest",
  };
}

export async function generationSafetyProofStatus(document: Record<string, unknown>, scope: string) {
  const proof = document.generationSafetyProof as GenerationSafetyProof | undefined;
  if (proof === undefined || proof === null) return "missing" as const;
  return proof.version === 1 && proof.scope === scope
    && proof.contentHash === await publicationContentHash(document)
    && proof.policyVersion === PUBLICATION_SAFETY_POLICY_VERSION
    && proof.status === "passed" && proof.basis === "generation-output-moderation"
    && proof.moderationModel === "omni-moderation-latest"
    ? "passed" as const : "invalid" as const;
}

export interface PublicationProof {
  version: 1;
  policyVersion: string;
  snapshotHash: string;
  courseId: string;
  lessonIds: string[];
  evidenceFingerprint: string;
  safety: { status: "passed"; basis: "publication-local-scan"; reviewedAt: string };
  validationReport: ValidationReport;
}

export function publicationEvidenceFingerprint(course: Record<string, unknown>, lessons: Record<string, unknown>[]) {
  return publicationContentFingerprint({
    generationEvidence: [course, ...lessons].map((document) => document.generationSafetyProof ?? null),
  });
}

export function validationEvidenceFingerprint(report: ValidationReport) {
  return publicationContentFingerprint({
    validationEvidence: Object.fromEntries(Object.entries(report).filter(([key]) => key !== "validatedAt")),
  });
}

export function publicationProofIsCurrent(
  course: Record<string, unknown>, lessons: Record<string, unknown>[], lessonIds: string[],
  snapshotHash: string, proof: PublicationProof | undefined,
): proof is PublicationProof {
  return Boolean(proof && proof.version === 1
    && proof.policyVersion === PUBLICATION_PROOF_POLICY_VERSION
    && proof.courseId === String(course.id ?? course.courseId ?? "unpersisted-course")
    && JSON.stringify(proof.lessonIds) === JSON.stringify(lessonIds)
    && new Set(lessonIds).size === lessonIds.length && lessonIds.length > 0
    && proof.snapshotHash === snapshotHash
    && proof.evidenceFingerprint === publicationEvidenceFingerprint(course, lessons)
    && proof.safety?.status === "passed" && proof.safety.basis === "publication-local-scan"
    && Number.isFinite(Date.parse(proof.safety.reviewedAt))
    && proof.validationReport?.snapshotHash === snapshotHash
    && proof.validationReport.contractVersion === COURSE_PIPELINE_VERSIONS.qualityContract);
}

export function publicationProofApprovalFingerprint(proof: PublicationProof) {
  return JSON.stringify({ policyVersion: proof.policyVersion, snapshotHash: proof.snapshotHash,
    courseId: proof.courseId, lessonIds: proof.lessonIds, evidenceFingerprint: proof.evidenceFingerprint,
    safetyBasis: proof.safety.basis, report: validationEvidenceFingerprint(proof.validationReport) });
}

export function publicationProofToken(proof: PublicationProof) {
  return createHash("sha256").update(publicationProofApprovalFingerprint(proof)).digest("hex");
}

export class StalePublicationProofError extends Error {
  constructor() {
    super("The publication proof changed after this review began. Validate and review the current evidence again.");
    this.name = "StalePublicationProofError";
  }
}

export function assertPublicationProofToken(proof: PublicationProof, expectedToken: string) {
  if (!/^[a-f0-9]{64}$/.test(expectedToken) || publicationProofToken(proof) !== expectedToken) {
    throw new StalePublicationProofError();
  }
}

export function currentManualReviewResolution(course: Record<string, unknown>, snapshotHash: string) {
  const resolution = course.manualReviewResolution as {
    status?: string; snapshotHash?: string; contractVersion?: string; proofPolicyVersion?: string; proofFingerprint?: string; proofToken?: string; reviewId?: string;
  } | undefined;
  return resolution?.status === "approved" && resolution.snapshotHash === snapshotHash
    && resolution.contractVersion === COURSE_PIPELINE_VERSIONS.qualityContract
    && resolution.proofPolicyVersion === PUBLICATION_PROOF_POLICY_VERSION
    && Boolean(course.publicationProof)
    && resolution.proofFingerprint === publicationProofApprovalFingerprint(course.publicationProof as PublicationProof)
    && resolution.proofToken === publicationProofToken(course.publicationProof as PublicationProof)
    && typeof resolution.reviewId === "string" && resolution.reviewId.length > 0 ? resolution : undefined;
}
