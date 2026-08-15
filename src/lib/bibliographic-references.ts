import { createHash } from "node:crypto";
import { z } from "zod";
import { isSafePublicSourceUrl } from "@/lib/source-safety";
import { canonicalProviderUrl, providerGroundedUrls } from "@/lib/source-research";

export const BIBLIOGRAPHIC_REFERENCE_POLICY_VERSION = "bibliographic-reference-v1.1.0";
export const BIBLIOGRAPHIC_METADATA_RESOLVER_VERSION = "catalog-metadata-resolver-v1.0.0";
export const BIBLIOGRAPHIC_DISCOVERY_ALLOWED_DOMAINS = [
  "openlibrary.org",
  "books.google.com",
] as const;

const currentYear = new Date().getUTCFullYear();
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, "Use a lowercase SHA-256 fingerprint.");
const safeText = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum);

const materialTypeSchema = z.enum([
  "book",
  "book-chapter",
  "article",
  "scripture",
  "commentary",
  "reference-work",
]);

const contributorRoleSchema = z.enum([
  "author",
  "editor",
  "translator",
  "compiler",
  "commentator",
  "corporate-author",
]);

const metadataProviderSchema = z.enum([
  "open-library",
  "google-books",
  "worldcat",
  "library-of-congress",
  "publisher-catalog",
  "other-authoritative-catalog",
]);

const contentProviderSchema = z.enum([
  "publisher-full-text",
  "library-digital-copy",
  "licensed-file",
  "user-provided-file",
]);

const CONTROL_ARTIFACTS = [
  /\bignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?\b/i,
  /\b(?:system|developer)\s+(?:message|prompt|instructions?)\b/i,
  /\byou\s+are\s+now\b/i,
  /\b(?:assistant|tool)\s+to\b/i,
  /\btool\s*(?:call|result|output)\b/i,
  /<\|(?:assistant|tool|system|user)[^|]*\|>/i,
  /\bresponses?\.(?:parse|create)\b/i,
] as const;

function normalizedText(value: string) {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function containsControlArtifact(value: string) {
  return CONTROL_ARTIFACTS.some((pattern) => pattern.test(value));
}

function normalizedIsbn(value: string) {
  return value
    .replace(/^isbn(?:-1[03])?\s*:?\s*/i, "")
    .replace(/[\s-]/g, "")
    .toUpperCase();
}

export function isValidIsbn10(value: string) {
  const normalized = normalizedIsbn(value);
  if (!/^\d{9}[\dX]$/.test(normalized)) return false;
  const sum = [...normalized].reduce((total, character, index) => {
    const digit = character === "X" ? 10 : Number(character);
    return total + digit * (10 - index);
  }, 0);
  return sum % 11 === 0;
}

export function isValidIsbn13(value: string) {
  const normalized = normalizedIsbn(value);
  if (!/^\d{13}$/.test(normalized)) return false;
  const sum = Array.from(normalized.slice(0, 12)).reduce(
    (total, character, index) => total + Number(character) * (index % 2 === 0 ? 1 : 3),
    0,
  );
  return (10 - (sum % 10)) % 10 === Number(normalized[12]);
}

function normalizedOclc(value: string) {
  return value.replace(/^\s*(?:\(OCoLC\)|OCLC|oc[ mn])\s*/i, "").replace(/[\s-]/g, "");
}

function normalizedLccn(value: string) {
  return value.replace(/^\s*LCCN\s*:?\s*/i, "").replace(/[\s-]/g, "").toLowerCase();
}

function normalizedDoi(value: string) {
  return value.replace(/^\s*(?:https?:\/\/(?:dx\.)?doi\.org\/|doi\s*:\s*)/i, "").trim().toLowerCase();
}

function normalizedOlid(value: string) {
  return value.replace(/^\s*OLID\s*:?\s*/i, "").replace(/\s/g, "").toUpperCase();
}

function normalizedUrl(value: string) {
  const parsed = new URL(value);
  parsed.hostname = parsed.hostname.toLowerCase();
  return parsed.toString();
}

const identifiersInputSchema = z.object({
  isbn10: safeText(1, 40).optional(),
  isbn13: safeText(1, 40).optional(),
  oclc: safeText(1, 40).optional(),
  lccn: safeText(1, 40).optional(),
  doi: safeText(1, 240).optional(),
  olid: safeText(1, 40).optional(),
}).strict().optional().default({});

const identifiersSchema = z.object({
  isbn10: z.string().regex(/^\d{9}[\dX]$/).refine(isValidIsbn10, "ISBN-10 checksum is invalid.").optional(),
  isbn13: z.string().regex(/^\d{13}$/).refine(isValidIsbn13, "ISBN-13 checksum is invalid.").optional(),
  oclc: z.string().regex(/^\d{1,15}$/, "OCLC must contain 1 to 15 digits.").optional(),
  lccn: z.string().regex(/^[a-z]{0,3}\d{8,10}$/, "LCCN format is invalid.").optional(),
  doi: z.string().regex(/^10\.\d{4,9}\/\S+$/i, "DOI format is invalid.").max(200).optional(),
  olid: z.string().regex(/^OL\d+[MWA]$/, "Open Library identifier format is invalid.").optional(),
}).strict();

const contributorSchema = z.object({
  name: safeText(2, 160),
  role: contributorRoleSchema,
}).strict();

const metadataVerificationSchema = z.object({
  status: z.literal("verified"),
  provider: metadataProviderSchema,
  recordId: safeText(1, 200),
  recordFingerprint: sha256Schema,
  verifiedAt: z.string().datetime(),
  resolverVersion: safeText(2, 100).optional(),
}).strict();

const contentVerificationSchema = z.object({
  status: z.literal("verified"),
  provider: contentProviderSchema,
  recordId: safeText(1, 200),
  contentFingerprint: sha256Schema,
  verifiedAt: z.string().datetime(),
  rights: z.enum(["public-domain", "licensed", "author-owned"]),
}).strict();

const inputShape = z.object({
  materialType: materialTypeSchema,
  title: safeText(2, 300),
  containerTitle: safeText(2, 300).optional(),
  contributors: z.array(contributorSchema).max(12).optional().default([]),
  edition: safeText(1, 120).optional(),
  publisher: safeText(2, 200).optional(),
  publicationYear: z.number().int().min(1000).max(currentYear).optional(),
  language: safeText(2, 35).regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, "Use a BCP 47 language tag.").optional(),
  identifiers: identifiersInputSchema,
  metadataVerification: metadataVerificationSchema,
  contentVerification: contentVerificationSchema.optional(),
  catalogUrl: safeText(1, 1_000).optional(),
  accessUrl: safeText(1, 1_000).optional(),
  quotation: safeText(2, 280).optional(),
  pageLocator: safeText(1, 80).optional(),
}).strict();

export const bibliographicReferenceInputSchema = inputShape.superRefine((value, context) => {
  if (value.materialType !== "scripture" && value.contributors.length === 0) {
    context.addIssue({ code: "custom", path: ["contributors"], message: "This material type requires at least one named contributor." });
  }
  if ((value.materialType === "book-chapter" || value.materialType === "article") && !value.containerTitle) {
    context.addIssue({ code: "custom", path: ["containerTitle"], message: "A containing work or publication is required." });
  }
  if (value.materialType === "scripture" && !value.edition) {
    context.addIssue({ code: "custom", path: ["edition"], message: "Scripture references must identify a translation or edition." });
  }
  if (Object.keys(value.identifiers).length === 0 && !(value.publisher && value.publicationYear)) {
    context.addIssue({
      code: "custom",
      path: ["identifiers"],
      message: "Provide a stable bibliographic identifier or both publisher and publication year.",
    });
  }
  if (value.identifiers.isbn10 && value.identifiers.isbn13) {
    const isbn10 = normalizedIsbn(value.identifiers.isbn10);
    const isbn13 = normalizedIsbn(value.identifiers.isbn13);
    if (isValidIsbn10(isbn10) && isValidIsbn13(isbn13)
      && (!isbn13.startsWith("978") || isbn13.slice(3, 12) !== isbn10.slice(0, 9))) {
      context.addIssue({
        code: "custom",
        path: ["identifiers", "isbn13"],
        message: "ISBN-10 and ISBN-13 identify different editions.",
      });
    }
  }
  if ((value.quotation || value.pageLocator) && !value.contentVerification) {
    context.addIssue({
      code: "custom",
      path: [value.quotation ? "quotation" : "pageLocator"],
      message: "Quotations and page locators require verified access to the exact content edition.",
    });
  }
  for (const [path, text] of [
    [["title"], value.title],
    [["containerTitle"], value.containerTitle],
    [["edition"], value.edition],
    [["publisher"], value.publisher],
    [["quotation"], value.quotation],
    [["pageLocator"], value.pageLocator],
    [["metadataVerification", "recordId"], value.metadataVerification.recordId],
    [["contentVerification", "recordId"], value.contentVerification?.recordId],
    ...value.contributors.map((contributor, index) => [["contributors", index, "name"], contributor.name] as const),
  ] as Array<readonly [Array<string | number>, string | undefined]>) {
    if (text && containsControlArtifact(text)) {
      context.addIssue({ code: "custom", path: [...path], message: "Bibliographic metadata contains a model-control artifact." });
    }
  }
  for (const key of ["catalogUrl", "accessUrl"] as const) {
    const url = value[key];
    if (url && !isSafePublicSourceUrl(url)) {
      context.addIssue({ code: "custom", path: [key], message: "Use a safe public HTTPS URL without credentials." });
    }
  }
});

export const bibliographicReferenceSchema = z.object({
  id: z.string().regex(/^reference-[a-f0-9]{16}$/),
  policyVersion: z.literal(BIBLIOGRAPHIC_REFERENCE_POLICY_VERSION),
  role: z.literal("further-reading"),
  claimEvidence: z.literal(false),
  contentVerified: z.boolean(),
  materialType: materialTypeSchema,
  title: safeText(2, 300),
  containerTitle: safeText(2, 300).optional(),
  contributors: z.array(contributorSchema).max(12),
  edition: safeText(1, 120).optional(),
  publisher: safeText(2, 200).optional(),
  publicationYear: z.number().int().min(1000).max(currentYear).optional(),
  language: safeText(2, 35),
  identifiers: identifiersSchema,
  metadataVerification: metadataVerificationSchema,
  contentVerification: contentVerificationSchema.optional(),
  catalogUrl: z.string().max(1_000).refine(isSafePublicSourceUrl).optional(),
  accessUrl: z.string().max(1_000).refine(isSafePublicSourceUrl).optional(),
  quotation: safeText(2, 280).optional(),
  pageLocator: safeText(1, 80).optional(),
}).strict();

export type BibliographicReferenceInput = z.input<typeof bibliographicReferenceInputSchema>;
export type BibliographicReference = z.infer<typeof bibliographicReferenceSchema>;

const optionalDiscoveryText = (minimum: number, maximum: number) => safeText(minimum, maximum).nullable();

export const bibliographicDiscoverySchema = z.object({
  references: z.array(z.object({
    materialType: z.enum(["book", "scripture", "commentary", "reference-work"]),
    title: safeText(2, 300),
    containerTitle: optionalDiscoveryText(2, 300),
    contributors: z.array(contributorSchema).max(12),
    edition: optionalDiscoveryText(1, 120),
    publisher: optionalDiscoveryText(2, 200),
    publicationYear: z.number().int().min(1000).max(currentYear).nullable(),
    language: safeText(2, 35),
    identifiers: z.object({
      isbn10: optionalDiscoveryText(1, 40),
      isbn13: optionalDiscoveryText(1, 40),
      oclc: optionalDiscoveryText(1, 40),
      lccn: optionalDiscoveryText(1, 40),
      doi: optionalDiscoveryText(1, 240),
      olid: optionalDiscoveryText(1, 40),
    }).strict(),
    metadataProvider: z.enum(["open-library", "google-books"]),
    catalogUrl: z.string().url().max(1_000),
  }).strict()).max(5),
}).strict();

export type BibliographicDiscovery = z.infer<typeof bibliographicDiscoverySchema>;

const metadataProviderHosts: Record<BibliographicDiscovery["references"][number]["metadataProvider"], Set<string>> = {
  "open-library": new Set(["openlibrary.org"]),
  "google-books": new Set(["books.google.com"]),
};

type DiscoveryCandidate = BibliographicDiscovery["references"][number];
type ResolvedCatalogRecord = {
  recordId: string;
  title: string;
  contributors: Array<{ name: string; role: "author" }>;
  edition?: string;
  publisher?: string;
  publicationYear?: number;
  language: string;
  identifiers: Record<string, string>;
};

class BibliographicResolverUnavailableError extends Error {}

async function catalogJson(url: string, fetcher: typeof fetch) {
  try {
    const response = await fetcher(url, {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      if (response.status === 408 || response.status === 429 || response.status >= 500) {
        throw new BibliographicResolverUnavailableError(`catalog resolver returned ${response.status}`);
      }
      throw new Error(`catalog resolver returned ${response.status}`);
    }
    const text = await response.text();
    if (text.length > 1_000_000) {
      throw new BibliographicResolverUnavailableError("catalog record exceeded the resolver size limit");
    }
    let value: unknown;
    try {
      value = JSON.parse(text) as unknown;
    } catch {
      throw new BibliographicResolverUnavailableError("catalog resolver returned invalid JSON");
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new BibliographicResolverUnavailableError("catalog resolver returned malformed metadata");
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof BibliographicResolverUnavailableError) throw error;
    if (error instanceof Error && error.message.startsWith("catalog resolver returned 4")) throw error;
    throw new BibliographicResolverUnavailableError("catalog resolver could not be reached");
  }
}

function yearFrom(value: unknown) {
  const match = typeof value === "string" ? value.match(/\b(1\d{3}|20\d{2})\b/) : null;
  return match ? Number(match[1]) : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

const openLibraryLanguage: Record<string, string> = { eng: "en", spa: "es", fre: "fr", fra: "fr", ger: "de", deu: "de", por: "pt", ita: "it" };

async function resolveOpenLibrary(candidate: DiscoveryCandidate, fetcher: typeof fetch): Promise<ResolvedCatalogRecord> {
  const catalogUrl = new URL(candidate.catalogUrl);
  const match = catalogUrl.pathname.replace(/\/+$/, "").match(/^\/(works\/OL\d+W|books\/OL\d+M)$/i);
  if (!match) throw new Error("Open Library URL is not an exact work or edition record");
  const recordKey = `/${match[1]}`;
  const record = await catalogJson(`https://openlibrary.org${recordKey}.json`, fetcher);
  const authorKeys = (Array.isArray(record.authors) ? record.authors : []).flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const author = value as Record<string, unknown>;
    const direct = typeof author.key === "string" ? author.key : undefined;
    const nested = author.author && typeof author.author === "object" && typeof (author.author as Record<string, unknown>).key === "string"
      ? String((author.author as Record<string, unknown>).key)
      : undefined;
    const key = direct ?? nested;
    return key && /^\/authors\/OL\d+A$/i.test(key) ? [key] : [];
  }).slice(0, 12);
  const authorRecords = await Promise.all(authorKeys.map((key) => catalogJson(`https://openlibrary.org${key}.json`, fetcher)));
  const contributors = authorRecords.flatMap((author) => typeof author.name === "string" && author.name.trim()
    ? [{ name: author.name, role: "author" as const }]
    : []);
  const title = typeof record.title === "string" ? record.title.trim() : "";
  if (!title || !contributors.length) throw new Error("Open Library record lacks a title or resolved contributor");
  const languages = (Array.isArray(record.languages) ? record.languages : []).flatMap((value) => {
    if (!value || typeof value !== "object" || typeof (value as Record<string, unknown>).key !== "string") return [];
    return [String((value as Record<string, unknown>).key).split("/").at(-1)?.toLowerCase() ?? ""];
  });
  const olid = recordKey.split("/").at(-1)?.toUpperCase() ?? "";
  return {
    recordId: recordKey,
    title,
    contributors,
    edition: typeof record.edition_name === "string" ? record.edition_name : undefined,
    publisher: stringArray(record.publishers)[0],
    publicationYear: yearFrom(record.publish_date) ?? yearFrom(record.first_publish_date),
    language: openLibraryLanguage[languages[0]] ?? "und",
    identifiers: {
      ...(stringArray(record.isbn_10)[0] ? { isbn10: stringArray(record.isbn_10)[0] } : {}),
      ...(stringArray(record.isbn_13)[0] ? { isbn13: stringArray(record.isbn_13)[0] } : {}),
      ...(stringArray(record.oclc_numbers)[0] ? { oclc: stringArray(record.oclc_numbers)[0] } : {}),
      ...(stringArray(record.lccn)[0] ? { lccn: stringArray(record.lccn)[0] } : {}),
      ...(olid ? { olid } : {}),
    },
  };
}

async function resolveGoogleBooks(candidate: DiscoveryCandidate, fetcher: typeof fetch): Promise<ResolvedCatalogRecord> {
  const catalogUrl = new URL(candidate.catalogUrl);
  const volumeId = catalogUrl.pathname === "/books" ? catalogUrl.searchParams.get("id") : null;
  if (!volumeId || !/^[A-Za-z0-9_-]{1,120}$/.test(volumeId)) throw new Error("Google Books URL lacks an exact volume ID");
  const record = await catalogJson(`https://www.googleapis.com/books/v1/volumes/${encodeURIComponent(volumeId)}`, fetcher);
  const volumeInfo = record.volumeInfo && typeof record.volumeInfo === "object" && !Array.isArray(record.volumeInfo)
    ? record.volumeInfo as Record<string, unknown>
    : {};
  const title = typeof volumeInfo.title === "string" ? volumeInfo.title.trim() : "";
  const contributors = stringArray(volumeInfo.authors).map((name) => ({ name, role: "author" as const }));
  if (!title || !contributors.length) throw new Error("Google Books record lacks a title or contributor");
  const identifiers = (Array.isArray(volumeInfo.industryIdentifiers) ? volumeInfo.industryIdentifiers : []).reduce<Record<string, string>>((result, value) => {
    if (!value || typeof value !== "object") return result;
    const identifier = value as Record<string, unknown>;
    if (identifier.type === "ISBN_10" && typeof identifier.identifier === "string") result.isbn10 = identifier.identifier;
    if (identifier.type === "ISBN_13" && typeof identifier.identifier === "string") result.isbn13 = identifier.identifier;
    return result;
  }, {});
  return {
    recordId: `google-books:${volumeId}`,
    title,
    contributors,
    publisher: typeof volumeInfo.publisher === "string" ? volumeInfo.publisher : undefined,
    publicationYear: yearFrom(volumeInfo.publishedDate),
    language: typeof volumeInfo.language === "string" ? volumeInfo.language : "und",
    identifiers,
  };
}

function ensureCandidateMatchesRecord(candidate: DiscoveryCandidate, record: ResolvedCatalogRecord) {
  if (normalizedText(candidate.title).toLocaleLowerCase() !== normalizedText(record.title).toLocaleLowerCase()) {
    throw new Error("model title does not match the resolved catalog record");
  }
  const resolvedContributors = new Set(record.contributors.map((contributor) => normalizedText(contributor.name).toLocaleLowerCase()));
  if (candidate.contributors.some((contributor) => !resolvedContributors.has(normalizedText(contributor.name).toLocaleLowerCase()))) {
    throw new Error("model contributor does not match the resolved catalog record");
  }
  if (candidate.publisher && (!record.publisher || normalizedText(candidate.publisher).toLocaleLowerCase() !== normalizedText(record.publisher).toLocaleLowerCase())) {
    throw new Error("model publisher does not match the resolved catalog record");
  }
  if (candidate.edition && (!record.edition || normalizedText(candidate.edition).toLocaleLowerCase() !== normalizedText(record.edition).toLocaleLowerCase())) {
    throw new Error("model edition does not match the resolved catalog record");
  }
  if (candidate.publicationYear && candidate.publicationYear !== record.publicationYear) {
    throw new Error("model publication year does not match the resolved catalog record");
  }
  const resolvedIdentifiers = normalizeIdentifiers(record.identifiers);
  for (const [key, value] of Object.entries(candidate.identifiers)) {
    if (typeof value !== "string") continue;
    const candidateIdentifier = normalizeIdentifiers({ [key]: value });
    if ((candidateIdentifier as Record<string, string>)[key] !== (resolvedIdentifiers as Record<string, string>)[key]) {
      throw new Error(`model ${key} does not match the resolved catalog record`);
    }
  }
  return resolvedIdentifiers;
}

export async function certifyDiscoveredBibliographicReferences(
  value: unknown,
  response: unknown,
  verifiedAt = new Date().toISOString(),
  fetcher: typeof fetch = fetch,
): Promise<{ references: BibliographicReference[]; rejections: string[]; incomplete: boolean }> {
  const parsed = bibliographicDiscoverySchema.safeParse(value);
  if (!parsed.success) {
    return { references: [], rejections: ["The further-reading response did not match the bibliographic schema."], incomplete: true };
  }
  const groundedUrls = providerGroundedUrls(response);
  const attempts = await Promise.allSettled(parsed.data.references.map(async (candidate) => {
    const url = new URL(candidate.catalogUrl);
    const hostname = url.hostname.toLowerCase();
    if (!isSafePublicSourceUrl(candidate.catalogUrl)
      || !metadataProviderHosts[candidate.metadataProvider].has(hostname)) {
      throw new Error("catalog destination is not a resource-level record from the declared provider");
    }
    if (!groundedUrls.has(canonicalProviderUrl(candidate.catalogUrl))) {
      throw new Error("catalog record was not cited by the provider web-search response");
    }
    const record = candidate.metadataProvider === "open-library"
      ? await resolveOpenLibrary(candidate, fetcher)
      : await resolveGoogleBooks(candidate, fetcher);
    const identifiers = ensureCandidateMatchesRecord(candidate, record);
    const recordFingerprint = createHash("sha256").update(JSON.stringify(record)).digest("hex");
    return normalizeBibliographicReference({
      materialType: candidate.materialType,
      title: record.title,
      contributors: record.contributors,
      edition: record.edition,
      publisher: record.publisher,
      publicationYear: record.publicationYear,
      language: record.language,
      identifiers,
      catalogUrl: canonicalProviderUrl(candidate.catalogUrl),
      metadataVerification: {
        status: "verified",
        provider: candidate.metadataProvider,
        recordId: record.recordId,
        recordFingerprint,
        verifiedAt,
        resolverVersion: BIBLIOGRAPHIC_METADATA_RESOLVER_VERSION,
      },
    });
  }));
  const references: BibliographicReference[] = [];
  const rejections: string[] = [];
  let incomplete = false;
  for (const [index, attempt] of attempts.entries()) {
    if (attempt.status === "fulfilled") {
      references.push(attempt.value);
    } else {
      const error = attempt.reason;
      if (error instanceof BibliographicResolverUnavailableError) incomplete = true;
      rejections.push(`references[${index}] ${error instanceof Error ? error.message : "could not be certified"}.`);
    }
  }
  const uniqueReferences = [...new Map(references.map((reference) => [reference.id, reference])).values()]
    .sort((left, right) => left.id.localeCompare(right.id));
  return { references: uniqueReferences, rejections, incomplete };
}

function normalizeIdentifiers(identifiers: z.infer<typeof identifiersInputSchema>) {
  return identifiersSchema.parse({
    ...(identifiers.isbn10 ? { isbn10: normalizedIsbn(identifiers.isbn10) } : {}),
    ...(identifiers.isbn13 ? { isbn13: normalizedIsbn(identifiers.isbn13) } : {}),
    ...(identifiers.oclc ? { oclc: normalizedOclc(identifiers.oclc) } : {}),
    ...(identifiers.lccn ? { lccn: normalizedLccn(identifiers.lccn) } : {}),
    ...(identifiers.doi ? { doi: normalizedDoi(identifiers.doi) } : {}),
    ...(identifiers.olid ? { olid: normalizedOlid(identifiers.olid) } : {}),
  });
}

export function normalizeBibliographicReference(value: unknown): BibliographicReference {
  const parsed = bibliographicReferenceInputSchema.parse(value);
  const identifiers = normalizeIdentifiers(parsed.identifiers);
  const canonicalBibliography = {
    materialType: parsed.materialType,
    title: normalizedText(parsed.title),
    containerTitle: parsed.containerTitle ? normalizedText(parsed.containerTitle) : undefined,
    contributors: parsed.contributors.map((contributor) => ({
      name: normalizedText(contributor.name),
      role: contributor.role,
    })),
    edition: parsed.edition ? normalizedText(parsed.edition) : undefined,
    publisher: parsed.publisher ? normalizedText(parsed.publisher) : undefined,
    publicationYear: parsed.publicationYear,
    language: parsed.language ? Intl.getCanonicalLocales(parsed.language)[0] : "und",
    identifiers,
  };
  const canonicalIdentity = {
    ...canonicalBibliography,
    metadataProvider: parsed.metadataVerification.provider,
    metadataRecordId: normalizedText(parsed.metadataVerification.recordId),
  };
  const id = `reference-${createHash("sha256").update(JSON.stringify(canonicalIdentity)).digest("hex").slice(0, 16)}`;
  return bibliographicReferenceSchema.parse({
    id,
    policyVersion: BIBLIOGRAPHIC_REFERENCE_POLICY_VERSION,
    role: "further-reading",
    claimEvidence: false,
    contentVerified: Boolean(parsed.contentVerification),
    ...canonicalBibliography,
    metadataVerification: {
      ...parsed.metadataVerification,
      recordId: normalizedText(parsed.metadataVerification.recordId),
    },
    contentVerification: parsed.contentVerification
      ? { ...parsed.contentVerification, recordId: normalizedText(parsed.contentVerification.recordId) }
      : undefined,
    catalogUrl: parsed.catalogUrl ? normalizedUrl(parsed.catalogUrl) : undefined,
    accessUrl: parsed.accessUrl ? normalizedUrl(parsed.accessUrl) : undefined,
    quotation: parsed.quotation ? normalizedText(parsed.quotation) : undefined,
    pageLocator: parsed.pageLocator ? normalizedText(parsed.pageLocator) : undefined,
  });
}

export function normalizeBibliographicReferences(values: unknown[]) {
  const normalized = values.map(normalizeBibliographicReference);
  const byId = new Map(normalized.map((reference) => [reference.id, reference]));
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}
