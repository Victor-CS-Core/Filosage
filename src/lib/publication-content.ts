const OMITTED_ROOT_PUBLICATION_FIELDS = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "isPublic",
  "publishedAt",
  "publicationReview",
  "publicationProof",
  "generationSafetyProof",
  "publicationMutation",
  "manualReviewResolution",
  "lastRepair",
  "moderationStatus",
  "quarantineReason",
  "quarantinedAt",
  "factualReviewStatus",
  "pipelineStage",
  "pipelineStageUpdatedAt",
  "lastValidationDecision",
  "lastValidationSnapshotHash",
  "publishedReleaseId",
]);

function stablePublicationValue(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) return value.map((item) => stablePublicationValue(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      // Stored document metadata is ignored only at the document root.
      // Nested IDs are course content: changing a source, objective, lab, or
      // interaction ID must invalidate the reviewed snapshot.
      .filter(([key]) => depth > 0 || !OMITTED_ROOT_PUBLICATION_FIELDS.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stablePublicationValue(item, depth + 1)]),
  );
}

export function publicationContentFingerprint(value: unknown) {
  return JSON.stringify(stablePublicationValue(value));
}

export function publicationCandidateContentFingerprint(
  course: unknown,
  lessons: unknown[],
) {
  // A candidate contains several stored documents. Canonicalize each
  // document as a root so publication-only metadata never contaminates the
  // immutable content hash, while nested relationship IDs remain content.
  return JSON.stringify({
    course: stablePublicationValue(course),
    lessons: lessons.map((lesson) => stablePublicationValue(lesson)),
  });
}

export async function publicationContentHash(value: unknown) {
  const bytes = new TextEncoder().encode(publicationContentFingerprint(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function publicationCandidateContentHash(course: unknown, lessons: unknown[]) {
  const bytes = new TextEncoder().encode(publicationCandidateContentFingerprint(course, lessons));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
