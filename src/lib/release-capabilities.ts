/** Pure release contract shared by Node release scripts and the health endpoint. */
export interface ReleaseCapabilities {
  flashcardDecks: boolean;
  flashcardGeneration: boolean;
}

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function releaseCapabilitiesMatch(expected: ReleaseCapabilities, observed: unknown): boolean {
  return record(expected) && record(observed)
    && typeof expected.flashcardDecks === "boolean"
    && typeof expected.flashcardGeneration === "boolean"
    && !(expected.flashcardGeneration && !expected.flashcardDecks)
    && typeof observed.flashcardDecks === "boolean"
    && typeof observed.flashcardGeneration === "boolean"
    && !(observed.flashcardGeneration && !observed.flashcardDecks)
    && observed.flashcardDecks === expected.flashcardDecks
    && observed.flashcardGeneration === expected.flashcardGeneration;
}

export const releaseCapabilityEnvironment = {
  flashcardDecks: "FLASHCARD_DECKS_ENABLED",
  flashcardGeneration: "FLASHCARD_AI_GENERATION_ENABLED",
  lessonVisuals: "LESSON_VISUALS_ENABLED",
  commandCenter: "COMMAND_CENTER_ENABLED",
  commandCenterDrafts: "COMMAND_CENTER_DRAFTS_ENABLED",
  commandCenterV2: "NEXT_PUBLIC_COMMAND_CENTER_V2",
  pipelineV2: "COURSE_PIPELINE_V2",
  validationV2: "COURSE_VALIDATION_V2",
  repairV2: "COURSE_REPAIR_V2",
  labsV2: "COURSE_LABS_V2",
  visualsV2: "COURSE_VISUALS_V2",
  publicationV2: "COURSE_PUBLICATION_V2",
  pipelineShadowMode: "COURSE_PIPELINE_SHADOW_MODE",
  pipelineOwnerOnly: "COURSE_PIPELINE_V2_OWNER_ONLY",
} as const;

type CapabilityName = keyof typeof releaseCapabilityEnvironment;
export type ReleaseSelection = Record<CapabilityName, boolean> & { pipelineCohortPercent: number };
export interface ReleaseManifest { schemaVersion: 1; capabilities: ReleaseSelection }

export function validReleaseSelection(value: unknown): value is ReleaseSelection {
  if (!record(value) || Object.keys(value).length !== Object.keys(releaseCapabilityEnvironment).length + 1) return false;
  if (!Object.keys(releaseCapabilityEnvironment).every((key) => typeof value[key] === "boolean")) return false;
  if (!Number.isInteger(value.pipelineCohortPercent) || Number(value.pipelineCohortPercent) < 0 || Number(value.pipelineCohortPercent) > 100) return false;
  if (value.flashcardGeneration && !value.flashcardDecks) return false;
  if ((value.validationV2 || value.labsV2 || value.visualsV2) && !value.pipelineV2) return false;
  if ((value.repairV2 || value.publicationV2) && !value.validationV2) return false;
  return true;
}

export function validReleaseManifest(value: unknown): value is ReleaseManifest {
  return record(value) && Object.keys(value).length === 2 && value.schemaVersion === 1 && validReleaseSelection(value.capabilities);
}

export function releaseSelectionMatches(expected: unknown, observed: unknown): boolean {
  return validReleaseSelection(expected) && validReleaseSelection(observed)
    && Object.keys(expected).every((key) => observed[key as keyof ReleaseSelection] === expected[key as keyof ReleaseSelection]);
}

/** Do not coerce absent or malformed production flags into a healthy false. */
export function observedReleaseCapabilities(environment: Record<string, string | undefined>): Record<string, unknown> {
  const capabilities: Record<string, unknown> = {};
  for (const [name, variable] of Object.entries(releaseCapabilityEnvironment)) {
    const value = environment[variable];
    capabilities[name] = value === "true" ? true : value === "false" ? false : null;
  }
  const percent = environment.COURSE_PIPELINE_V2_COHORT_PERCENT;
  capabilities.pipelineCohortPercent = /^(?:0|[1-9]\d?|100)$/.test(percent ?? "") ? Number(percent) : null;
  return capabilities;
}

export function releaseEnvironment(manifest: ReleaseManifest): Record<string, string> {
  if (!validReleaseManifest(manifest)) throw new Error("Invalid approved release manifest.");
  return {
    ...Object.fromEntries(Object.entries(releaseCapabilityEnvironment).map(([name, variable]) => [variable, String(manifest.capabilities[name as CapabilityName])])),
    COURSE_PIPELINE_V2_COHORT_PERCENT: String(manifest.capabilities.pipelineCohortPercent),
  };
}

export function validReleaseOrigin(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && value === url.origin && !url.username && !url.password;
  } catch { return false; }
}
export const releaseAuthenticationModes = ["direct-google", "external-id", "migration-dual"] as const;
export const validReleaseSha = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
export const validReleaseDigest = (value: unknown): value is string => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);

export interface ReleaseEvidence {
  schemaVersion: 2;
  sha: string;
  imageDigest: string;
  manifest: ReleaseManifest;
  productionOrigin: string;
  candidateOrigin: string;
  authenticationMode: string;
  appId: string;
  revision: string;
  label: string;
  authConfigSha256: string;
}
export function releaseEvidenceMatches(value: unknown, sha: string, manifest: ReleaseManifest, productionOrigin: string): value is ReleaseEvidence {
  return record(value) && value.schemaVersion === 2 && validReleaseSha(sha) && value.sha === sha
    && validReleaseDigest(value.imageDigest) && validReleaseManifest(value.manifest)
    && releaseSelectionMatches(manifest.capabilities, value.manifest.capabilities)
    && validReleaseOrigin(productionOrigin) && value.productionOrigin === productionOrigin
    && validReleaseOrigin(value.candidateOrigin)
    && typeof value.appId === "string" && /^\/subscriptions\/[a-f0-9-]{36}\/resourceGroups\/[\w.-]+\/providers\/Microsoft.App\/containerApps\/[a-z0-9-]+$/i.test(value.appId)
    && typeof value.revision === "string" && value.revision.startsWith(`${value.appId.split("/").at(-1)}--`) && /^[a-z0-9-]+$/.test(value.revision)
    && ["blue", "green"].includes(String(value.label))
    && typeof value.authConfigSha256 === "string" && /^[a-f0-9]{64}$/.test(value.authConfigSha256)
    && releaseAuthenticationModes.some((mode) => mode === value.authenticationMode);
}
