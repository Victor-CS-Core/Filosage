import { createHash } from "node:crypto";
import { z } from "zod";
import type { CourseSource, SourceAuthorityClass, SourceEvidenceType } from "@/lib/course-types";
import { isSafePublicSourceUrl } from "@/lib/source-safety";
import {
  LESSON_GROUNDING_EVALUATOR_VERSION,
  lessonGroundingFingerprint,
} from "@/lib/source-grounding";

export const SOURCE_RESEARCH_POLICY_VERSION = "source-research-v1.0.0";

type AuthorityRule = {
  domain: string;
  authorityClass: SourceAuthorityClass;
  family: string;
};

const AUTHORITY_RULES: AuthorityRule[] = [
  { domain: "doi.org", authorityClass: "scholarly", family: "doi" },
  { domain: "pubmed.ncbi.nlm.nih.gov", authorityClass: "scholarly", family: "pubmed" },
  { domain: "ncbi.nlm.nih.gov", authorityClass: "government", family: "nih" },
  { domain: "nih.gov", authorityClass: "government", family: "nih" },
  { domain: "cdc.gov", authorityClass: "government", family: "cdc" },
  { domain: "nist.gov", authorityClass: "government", family: "nist" },
  { domain: "nasa.gov", authorityClass: "government", family: "nasa" },
  { domain: "noaa.gov", authorityClass: "government", family: "noaa" },
  { domain: "usgs.gov", authorityClass: "government", family: "usgs" },
  { domain: "who.int", authorityClass: "intergovernmental", family: "who" },
  { domain: "oecd.org", authorityClass: "intergovernmental", family: "oecd" },
  { domain: "worldbank.org", authorityClass: "intergovernmental", family: "world-bank" },
  { domain: "un.org", authorityClass: "intergovernmental", family: "un" },
  { domain: "unesco.org", authorityClass: "intergovernmental", family: "unesco" },
  { domain: "europa.eu", authorityClass: "government", family: "europa" },
  { domain: "gov.uk", authorityClass: "government", family: "uk-government" },
  { domain: "cochranelibrary.com", authorityClass: "scholarly", family: "cochrane" },
  { domain: "cochrane.org", authorityClass: "scholarly", family: "cochrane" },
  { domain: "prismastatement.org", authorityClass: "standards", family: "prisma" },
  { domain: "science.org", authorityClass: "scholarly", family: "science" },
  { domain: "nature.com", authorityClass: "scholarly", family: "nature" },
  { domain: "cell.com", authorityClass: "scholarly", family: "cell" },
  { domain: "thelancet.com", authorityClass: "scholarly", family: "lancet" },
  { domain: "bmj.com", authorityClass: "scholarly", family: "bmj" },
  { domain: "nejm.org", authorityClass: "scholarly", family: "nejm" },
  { domain: "jamanetwork.com", authorityClass: "scholarly", family: "jama" },
  { domain: "springer.com", authorityClass: "scholarly", family: "springer" },
  { domain: "sciencedirect.com", authorityClass: "scholarly", family: "elsevier" },
  { domain: "ieee.org", authorityClass: "scholarly", family: "ieee" },
  { domain: "acm.org", authorityClass: "scholarly", family: "acm" },
  { domain: "w3.org", authorityClass: "standards", family: "w3c" },
  { domain: "rfc-editor.org", authorityClass: "standards", family: "ietf" },
  { domain: "ietf.org", authorityClass: "standards", family: "ietf" },
  { domain: "crossref.org", authorityClass: "scholarly", family: "crossref" },
  { domain: "openalex.org", authorityClass: "scholarly", family: "openalex" },
  { domain: "jstor.org", authorityClass: "scholarly", family: "jstor" },
  { domain: "muse.jhu.edu", authorityClass: "scholarly", family: "project-muse" },
  { domain: "cambridge.org", authorityClass: "scholarly", family: "cambridge" },
  { domain: "oxfordacademic.com", authorityClass: "scholarly", family: "oxford" },
  { domain: "academic.oup.com", authorityClass: "scholarly", family: "oxford" },
  { domain: "loc.gov", authorityClass: "government", family: "library-of-congress" },
  { domain: "archives.gov", authorityClass: "government", family: "us-national-archives" },
  { domain: "si.edu", authorityClass: "government", family: "smithsonian" },
  { domain: "metmuseum.org", authorityClass: "scholarly", family: "metropolitan-museum" },
  { domain: "britishmuseum.org", authorityClass: "scholarly", family: "british-museum" },
  { domain: "europeana.eu", authorityClass: "intergovernmental", family: "europeana" },
  { domain: "sec.gov", authorityClass: "government", family: "sec" },
  { domain: "bls.gov", authorityClass: "government", family: "bls" },
  { domain: "census.gov", authorityClass: "government", family: "census" },
  { domain: "federalreserve.gov", authorityClass: "government", family: "federal-reserve" },
  { domain: "imf.org", authorityClass: "intergovernmental", family: "imf" },
  { domain: "wto.org", authorityClass: "intergovernmental", family: "wto" },
  { domain: "congress.gov", authorityClass: "government", family: "us-congress" },
  { domain: "supremecourt.gov", authorityClass: "government", family: "us-supreme-court" },
  { domain: "law.cornell.edu", authorityClass: "scholarly", family: "cornell-law" },
  { domain: "federalregister.gov", authorityClass: "government", family: "us-federal-register" },
  { domain: "ed.gov", authorityClass: "government", family: "us-education" },
  { domain: "epa.gov", authorityClass: "government", family: "epa" },
  { domain: "fda.gov", authorityClass: "government", family: "fda" },
];

export const SOURCE_RESEARCH_ALLOWED_DOMAINS = AUTHORITY_RULES.map((rule) => rule.domain);

export const sourceResearchSchema = z.object({
  sources: z.array(z.object({
    label: z.string().trim().min(2).max(160),
    // OpenAI Structured Outputs does not support JSON Schema's `format: "uri"`.
    // Keep the schema compatible and perform full URL, host, and deep-link
    // validation in the server certification step below.
    url: z.string().startsWith("https://").max(500),
    author: z.string().trim().max(160).nullable(),
    publisher: z.string().trim().min(2).max(160),
    publicationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    publicationStatus: z.literal("released"),
    statusCheck: z.literal("released-no-withdrawal-found"),
    evidenceType: z.enum(["primary-study", "systematic-review", "official-guidance", "standard", "official-dataset"]),
    evidenceClaims: z.array(z.object({
      claim: z.string().trim().min(30).max(320),
      locator: z.string().trim().min(2).max(160).nullable(),
    })).min(2).max(4),
    reputationRationale: z.string().trim().min(20).max(400),
    limitations: z.string().trim().min(10).max(400),
  })).min(2).max(3),
});

export type SourceResearchResult = z.infer<typeof sourceResearchSchema>;

export const sourceEvidenceValidationSchema = z.object({
  sources: z.array(z.object({
    url: z.string().startsWith("https://").max(500),
    statusVerdict: z.enum(["released-no-withdrawal-found", "unverified"]),
    claims: z.array(z.object({
      evidenceClaimId: z.string().trim().regex(/^evidence-[a-z0-9-]{1,80}$/),
      verdict: z.enum(["supported", "partial", "unsupported"]),
      rationale: z.string().trim().min(10).max(400),
    })).min(1).max(4),
  })).min(1).max(3),
});

export type SourceEvidenceValidationResult = z.infer<typeof sourceEvidenceValidationSchema>;

const SOURCE_CONTROL_ARTIFACTS = [
  /\bignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?\b/i,
  /\b(?:system|developer)\s+(?:message|prompt|instructions?)\b/i,
  /\byou\s+are\s+now\b/i,
  /\b(?:assistant|tool)\s+to\b/i,
  /\btool\s*(?:call|result|output)\b/i,
  /<\|(?:assistant|tool|system|user)[^|]*\|>/i,
  /\bresponses?\.(?:parse|create)\b/i,
] as const;

function hasSourceControlArtifact(value: string | undefined) {
  return Boolean(value && SOURCE_CONTROL_ARTIFACTS.some((pattern) => pattern.test(value)));
}

function canonicalUrl(value: string) {
  const parsed = new URL(value);
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/$/, "");
  return parsed.toString();
}

function authorityRuleForUrl(value: string) {
  const hostname = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  return AUTHORITY_RULES.find((rule) => hostname === rule.domain || hostname.endsWith(`.${rule.domain}`));
}

export function isResearchResourceDeepLink(value: string) {
  try {
    const parsed = new URL(value);
    const path = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    if (!path || path === "/") return false;
    if (["/search", "/research", "/publications", "/topics", "/resources"].includes(path)) return false;
    return path.split("/").filter(Boolean).length >= 1;
  } catch {
    return false;
  }
}

export function isServerClassifiedResearchSource(source: CourseSource) {
  return source.origin === "web-search"
    && source.citationVerified === true
    && source.publicationStatus === "released"
    && source.statusCheck === "released-no-withdrawal-found"
    && source.researchPolicyVersion === SOURCE_RESEARCH_POLICY_VERSION
    && Boolean(source.researchResponseId)
    && Boolean(source.researchCallIds?.length)
    && Boolean(source.evidenceValidationResponseId)
    && Boolean(source.evidenceValidationCallIds?.length)
    && source.qualityTier === "vetted"
    && Boolean(source.authorityClass && source.authorityFamily && source.note?.trim())
    && Boolean(source.url && isSafePublicSourceUrl(source.url) && authorityRuleForUrl(source.url))
    && Boolean(source.url && isResearchResourceDeepLink(source.url));
}

export function groundedSourcePackIssues(sourcePack: CourseSource[] | undefined) {
  const sources = sourcePack ?? [];
  const issues: string[] = [];
  if (sources.length < 2) issues.push("A grounded course requires at least two vetted research sources.");
  for (const source of sources) {
    if (!isServerClassifiedResearchSource(source)) {
      issues.push(`Source ${source.id} lacks API-cited, server-classified research provenance.`);
    }
    if (source.rights !== "link-only") issues.push(`Source ${source.id} must remain link-only.`);
  }
  if (new Set(sources.flatMap((source) => source.authorityFamily ? [source.authorityFamily] : [])).size < 2) {
    issues.push("A grounded course requires at least two independent authority families.");
  }
  return issues;
}

export function automaticCitationGroundingIssues(
  citations: Array<{
    id?: string;
    sourceId?: string;
    evidenceClaimId?: string;
    claim?: string;
    section?: string;
    supportStatus?: string;
    supportEvaluatorVersion?: string;
    supportFingerprint?: string;
  }> | undefined,
  assignedSources: CourseSource[] = [],
  lesson: Record<string, unknown> = {},
) {
  const normalized = (citations ?? []).flatMap((citation) =>
    typeof citation.id === "string"
      && typeof citation.sourceId === "string"
      && typeof citation.claim === "string"
      && typeof citation.section === "string"
      ? [{
          id: citation.id,
          sourceId: citation.sourceId,
          evidenceClaimId: citation.evidenceClaimId,
          claim: citation.claim,
          section: citation.section,
        }]
      : [],
  );
  const expectedFingerprint = lessonGroundingFingerprint(normalized, assignedSources, lesson);
  const issues = (citations ?? []).flatMap((citation, index) =>
    citation.supportStatus === "supported"
      && citation.supportEvaluatorVersion === LESSON_GROUNDING_EVALUATOR_VERSION
      && citation.supportFingerprint === expectedFingerprint
      ? []
      : [`citations[${index}] lacks a current automatic claim-support verdict bound to this lesson and evidence snapshot.`],
  );
  if (lesson.claimSupportEvaluatorStatus !== "executed"
    || lesson.claimSupportEvaluatorVersion !== LESSON_GROUNDING_EVALUATOR_VERSION
    || lesson.claimSupportFingerprint !== expectedFingerprint) {
    issues.push("The lesson lacks a current automatic claim-support result bound to this lesson and evidence snapshot.");
  }
  return issues;
}

export function validateSourceEvidence(
  validation: SourceEvidenceValidationResult,
  response: unknown,
  sourcePack: CourseSource[],
) {
  const groundedUrls = providerGroundedUrls(response);
  const callIds = completedWebSearchCallIds(response);
  const responseId = typeof (response as { id?: unknown })?.id === "string" ? String((response as { id: string }).id) : undefined;
  const issues: string[] = [];
  const rejections: string[] = [];
  const validationByUrl = new Map<string, SourceEvidenceValidationResult["sources"][number]>();
  for (const result of validation.sources) {
    if (!isSafePublicSourceUrl(result.url)) {
      issues.push("The independent evidence validator returned an unsafe or malformed source URL.");
      continue;
    }
    const url = canonicalUrl(result.url);
    if (validationByUrl.has(url)) {
      issues.push("The independent evidence validator returned a duplicate source URL.");
      continue;
    }
    validationByUrl.set(url, result);
  }
  const sources = sourcePack.flatMap((source) => {
    const url = source.url && isSafePublicSourceUrl(source.url) ? canonicalUrl(source.url) : "";
    const result = validationByUrl.get(url);
    if (!url || !groundedUrls.has(url)) {
      rejections.push(`Source ${source.id} was not cited by the independent evidence-validation response.`);
      return [];
    }
    if (!result) {
      rejections.push(`Source ${source.id} was not assessed by the independent evidence validator.`);
      return [];
    }
    if (result.statusVerdict !== "released-no-withdrawal-found") {
      rejections.push(`Source ${source.id} release or withdrawal status could not be verified.`);
      return [];
    }
    const claimById = new Map(result.claims.map((claim) => [claim.evidenceClaimId, claim]));
    if (claimById.size !== result.claims.length) {
      issues.push(`Source ${source.id} validation contains a duplicate evidence claim assessment.`);
    }
    for (const assessed of result.claims) {
      if (!source.evidenceClaims?.some((evidence) => evidence.id === assessed.evidenceClaimId)) {
        issues.push(`Source ${source.id} validation contains an unknown evidence claim ID.`);
      }
    }
    const supportedEvidenceClaims = (source.evidenceClaims ?? []).filter((evidence) => {
      const verdict = claimById.get(evidence.id)?.verdict;
      if (verdict !== "supported") {
        rejections.push(`Evidence claim ${evidence.id} was discarded because independent validation returned ${verdict ?? "no verdict"}.`);
        return false;
      }
      return true;
    });
    if (!supportedEvidenceClaims.length) {
      rejections.push(`Source ${source.id} was discarded because none of its atomic claims were independently supported.`);
      return [];
    }
    return [{
      ...source,
      note: supportedEvidenceClaims.map((evidence) => evidence.claim).join("\n"),
      evidenceClaims: supportedEvidenceClaims,
      qualityTier: "vetted" as const,
      evidenceValidationResponseId: responseId,
      evidenceValidationCallIds: callIds,
    }];
  });
  if (!callIds.length) issues.push("The independent evidence-validation response did not contain a completed web_search_call.");
  if (!responseId) issues.push("The independent evidence-validation response has no response ID.");
  return { sources, issues, rejections };
}

export function annotatedCitationUrls(response: unknown) {
  const urls = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (record.type === "url_citation" && typeof record.url === "string" && isSafePublicSourceUrl(record.url)) {
      urls.add(canonicalUrl(record.url));
    }
    for (const nested of Object.values(record)) {
      if (Array.isArray(nested)) nested.forEach(visit);
      else if (nested && typeof nested === "object") visit(nested);
    }
  };
  visit(response);
  return urls;
}

export function webSearchSourceUrls(response: unknown) {
  const urls = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (record.type === "web_search_call" && record.status === "completed") {
      const action = record.action && typeof record.action === "object"
        ? record.action as Record<string, unknown>
        : undefined;
      if (action && typeof action.url === "string" && isSafePublicSourceUrl(action.url)) {
        urls.add(canonicalUrl(action.url));
      }
      if (action && Array.isArray(action.sources)) {
        for (const source of action.sources) {
          if (source && typeof source === "object") {
            const url = (source as Record<string, unknown>).url;
            if (typeof url === "string" && isSafePublicSourceUrl(url)) urls.add(canonicalUrl(url));
          }
        }
      }
    }
    for (const nested of Object.values(record)) {
      if (Array.isArray(nested)) nested.forEach(visit);
      else if (nested && typeof nested === "object") visit(nested);
    }
  };
  visit(response);
  return urls;
}

export function providerGroundedUrls(response: unknown) {
  return new Set([...annotatedCitationUrls(response), ...webSearchSourceUrls(response)]);
}

export function webSearchCallCount(response: unknown) {
  return completedWebSearchCallIds(response).length;
}

export function completedWebSearchCallIds(response: unknown) {
  const ids: string[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (record.type === "web_search_call" && record.status === "completed" && typeof record.id === "string") ids.push(record.id);
    for (const nested of Object.values(record)) {
      if (Array.isArray(nested)) nested.forEach(visit);
      else if (nested && typeof nested === "object") visit(nested);
    }
  };
  visit(response);
  return [...new Set(ids)];
}

export function certifyResearchSources(
  research: SourceResearchResult,
  response: unknown,
  retrievedAt = new Date().toISOString(),
) {
  const groundedUrls = providerGroundedUrls(response);
  const researchCallIds = completedWebSearchCallIds(response);
  const seenUrls = new Set<string>();
  const sources: CourseSource[] = [];
  const issues: string[] = [];

  for (const [index, candidate] of research.sources.entries()) {
    const candidateText = [
      candidate.label,
      candidate.author ?? undefined,
      candidate.publisher,
      candidate.reputationRationale,
      candidate.limitations,
      ...candidate.evidenceClaims.flatMap((evidence) => [evidence.claim, evidence.locator ?? undefined]),
    ];
    if (candidateText.some(hasSourceControlArtifact)) {
      issues.push(`sources[${index}] contains an instruction or model-control artifact.`);
      continue;
    }
    if (!isSafePublicSourceUrl(candidate.url)) {
      issues.push(`sources[${index}].url is not a safe public HTTPS address.`);
      continue;
    }
    if (!isResearchResourceDeepLink(candidate.url)) {
      issues.push(`sources[${index}].url must deep-link to a specific research document or resource, not a homepage or listing.`);
      continue;
    }
    const url = canonicalUrl(candidate.url);
    if (!groundedUrls.has(url)) {
      issues.push(`sources[${index}].url was not present in API web-search source provenance.`);
      continue;
    }
    const authority = authorityRuleForUrl(url);
    if (!authority) {
      issues.push(`sources[${index}].url is not covered by the server authority registry.`);
      continue;
    }
    if (seenUrls.has(url)) {
      issues.push(`sources[${index}].url duplicates an earlier research source.`);
      continue;
    }
    seenUrls.add(url);
    if (candidate.publicationDate && candidate.publicationDate > retrievedAt.slice(0, 10)) {
      issues.push(`sources[${index}].publicationDate is in the future.`);
      continue;
    }
    const sourceHash = createHash("sha256").update(url).digest("hex").slice(0, 16);
    const sourceId = `source-${sourceHash}`;
    const evidenceType = candidate.evidenceType as SourceEvidenceType;
    sources.push({
      id: sourceId,
      label: candidate.label,
      url,
      kind: authority.authorityClass === "scholarly"
        ? (evidenceType === "primary-study" || evidenceType === "official-dataset" ? "primary" : "licensed")
        : "official",
      rights: "link-only",
      author: candidate.author ?? undefined,
      publisher: candidate.publisher,
      publicationDate: candidate.publicationDate ?? undefined,
      publicationStatus: "released",
      statusCheck: candidate.statusCheck,
      accessedAt: retrievedAt.slice(0, 10),
      note: candidate.evidenceClaims.map((evidence) => evidence.claim).join("\n"),
      evidenceClaims: candidate.evidenceClaims.map((evidence, evidenceIndex) => ({
        id: `evidence-${sourceHash}-${evidenceIndex + 1}`,
        claim: evidence.claim,
        locator: evidence.locator ?? undefined,
      })),
      origin: "web-search",
      authorityClass: authority.authorityClass,
      authorityFamily: authority.family,
      evidenceType,
      citationVerified: true,
      researchPolicyVersion: SOURCE_RESEARCH_POLICY_VERSION,
      retrievedAt,
      reputationRationale: candidate.reputationRationale,
      limitations: candidate.limitations,
      researchResponseId: typeof (response as { id?: unknown })?.id === "string"
        ? String((response as { id: string }).id)
        : undefined,
      researchCallIds,
    });
  }

  if (webSearchCallCount(response) < 1) issues.push("The research response did not contain a completed web_search_call.");
  if (sources.length < 2) issues.push("At least two API-cited, server-vetted sources are required.");
  if (new Set(sources.map((source) => source.authorityFamily)).size < 2) {
    issues.push("Research must include at least two independent authority families.");
  }
  return { sources, issues };
}
