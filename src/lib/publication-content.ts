const OMITTED_PUBLICATION_FIELDS = new Set(["id", "createdAt", "updatedAt", "publicationReview"]);

function stablePublicationValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stablePublicationValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !OMITTED_PUBLICATION_FIELDS.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stablePublicationValue(item)]),
  );
}

export function publicationContentFingerprint(value: unknown) {
  return JSON.stringify(stablePublicationValue(value));
}

export async function publicationContentHash(value: unknown) {
  const bytes = new TextEncoder().encode(publicationContentFingerprint(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
