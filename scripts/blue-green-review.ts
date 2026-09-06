import { fingerprint } from "./blue-green-contract.ts";
import type { ReleaseEvidence } from "../src/lib/release-capabilities.ts";

export const hostedGates = ["bff-auth-privacy", "learner-journey", "publication", "billing-containment", "operations-probes-alerts", "recovery-rollback", "data-write-compatibility"] as const;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && /^[\x20-\x7e]{1,200}$/.test(value);
export function validateHostedReview(value: unknown, candidate: ReleaseEvidence & { previous?: { sha: string; revision: string; image: string } }): void {
  if (!object(value) || value.schemaVersion !== 1 || value.candidateFingerprint !== fingerprint(candidate) || !text(value.operator)
    || !text(value.reviewedBy) || !text(value.rollbackTrigger) || value.testDataPolicy !== "approved-accounts-and-data-only"
    || value.writeCompatibility !== "overlapping-readers-writers-and-inflight-fences-verified"
    || value.minimumSafeRollbackSha !== candidate.previous?.sha || value.rollbackRevision !== candidate.previous?.revision
    || value.rollbackImage !== candidate.previous?.image || value.rollbackAuthorized !== true || !Array.isArray(value.evidence)
    || value.evidence.length !== hostedGates.length) throw new Error("Exact-candidate hosted evidence and compatible rollback review are required.");
  const seen = new Set();
  for (const proof of value.evidence) {
    if (!object(proof) || !hostedGates.includes(proof.gate as typeof hostedGates[number]) || seen.has(proof.gate)
      || !/^[1-9][0-9]*$/.test(String(proof.runId)) || typeof proof.workflow !== "string" || !/^\.github\/workflows\/[a-z0-9-]+\.yml$/.test(proof.workflow)
      || [".github/workflows/azure-staging.yml", ".github/workflows/azure-promote-staging.yml"].includes(proof.workflow)
      || typeof proof.artifact !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(proof.artifact)
      || typeof proof.artifactDigest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(proof.artifactDigest)
      || proof.candidateFingerprint !== fingerprint(candidate) || proof.result !== "passed" || !text(proof.method)
      || !text(proof.reviewedBy) || typeof proof.observedAt !== "string" || !Number.isFinite(Date.parse(proof.observedAt))
      || Date.parse(proof.observedAt) > Date.now() + 60_000) throw new Error("Hosted proof must identify a reviewed result and immutable evidence artifact.");
    seen.add(proof.gate);
  }
}
