import { createHash } from "node:crypto";
import { releaseEvidenceMatches, releaseEnvironment, type ReleaseEvidence } from "../src/lib/release-capabilities.ts";

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
export const canonical = (value: unknown): string => JSON.stringify(value, (_, item: unknown) => object(item) ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);
export const fingerprint = (value: unknown): string => createHash("sha256").update(canonical(value)).digest("hex");
/** Azure CLI may return the region display name (for example Central US). */
export function azureLocationName(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9]*(?: [A-Za-z0-9]+)*$/.test(value)) throw new Error("Invalid Azure location metadata.");
  return value.replaceAll(" ", "").toLowerCase();
}
export interface TrafficBinding { label: "blue" | "green"; revisionName: string; weight: number; latestRevision?: boolean }
export interface BlueGreenState { appId: string; location: string; mode: string; fqdn: string; authConfigSha256: string; traffic: TrafficBinding[] }
export function assertBlueGreenState(value: unknown): { state: BlueGreenState; live: TrafficBinding; candidate: TrafficBinding } {
  if (!object(value) || typeof value.appId !== "string" || !/^\/subscriptions\/[a-f0-9-]{36}\/resourceGroups\/[\w.-]+\/providers\/Microsoft.App\/containerApps\/[a-z0-9-]+$/i.test(value.appId)
    || typeof value.location !== "string" || !/^[a-z0-9]+$/.test(value.location) || value.mode !== "Multiple" || typeof value.fqdn !== "string" || !/^[a-z0-9.-]+\.azurecontainerapps\.io$/.test(value.fqdn)
    || typeof value.authConfigSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.authConfigSha256)
    || !Array.isArray(value.traffic) || value.traffic.length !== 2) throw new Error("Ambiguous application or traffic state.");
  const appName = value.appId.split("/").at(-1);
  for (const entry of value.traffic) {
    if (!object(entry) || !["blue", "green"].includes(String(entry.label)) || ![0, 100].includes(entry.weight as number)
      || typeof entry.revisionName !== "string" || !entry.revisionName.startsWith(`${appName}--`) || !/^[a-z0-9-]+$/.test(entry.revisionName)
      || (entry.latestRevision !== undefined && entry.latestRevision !== false)) throw new Error("Ambiguous revision binding.");
  }
  const traffic = value.traffic as TrafficBinding[];
  if (new Set(traffic.map((entry) => entry.label)).size !== 2 || new Set(traffic.map((entry) => entry.revisionName)).size !== 2
    || traffic.filter((entry) => entry.weight === 100).length !== 1) throw new Error("Expected one live and one inactive revision.");
  return { state: value as unknown as BlueGreenState, live: traffic.find((entry) => entry.weight === 100)!, candidate: traffic.find((entry) => entry.weight === 0)! };
}

export function authConfigurationHash(value: unknown, expectedMode: string): string {
  if (!object(value) || !object(value.platform) || value.platform.enabled !== true || !object(value.httpSettings) || value.httpSettings.requireHttps !== true
    || !object(value.identityProviders) || !["direct-google", "migration-dual"].includes(expectedMode)) throw new Error("Shared authentication configuration is invalid.");
  const providers = value.identityProviders;
  const google = object(providers.google) && providers.google.enabled === true;
  const external = object(providers.customOpenIdConnectProviders) && object(providers.customOpenIdConnectProviders.filosage) && providers.customOpenIdConnectProviders.filosage.enabled === true;
  if (!google || external !== (expectedMode === "migration-dual")) throw new Error("Preserve and verify the currently configured authentication mode.");
  return fingerprint(value);
}

export function assertCandidateReadback(evidence: ReleaseEvidence, observed: unknown, revision: unknown, previous: unknown, promoted = false): void {
  if (!releaseEvidenceMatches(evidence, evidence.sha, evidence.manifest, evidence.productionOrigin)) throw new Error("Invalid candidate evidence.");
  const now = assertBlueGreenState(observed);
  const before = assertBlueGreenState(previous);
  const target = promoted ? now.live : now.candidate;
  const prior = promoted ? now.candidate : now.live;
  if (now.state.appId !== evidence.appId || before.state.appId !== evidence.appId || now.state.authConfigSha256 !== evidence.authConfigSha256
    || before.state.authConfigSha256 !== evidence.authConfigSha256 || target.label !== evidence.label || target.revisionName !== evidence.revision
    || prior.revisionName !== before.live.revisionName || prior.label !== before.live.label) throw new Error("Candidate, live revision or shared auth configuration changed.");
  if (!object(revision) || revision.name !== evidence.revision || !object(revision.properties) || revision.properties.active !== true
    || `https://${revision.properties.fqdn}` !== evidence.candidateOrigin || !object(revision.properties.template) || !Array.isArray(revision.properties.template.containers)
    || revision.properties.template.containers.length !== 1) throw new Error("Candidate revision readback is invalid.");
  const container = revision.properties.template.containers[0];
  if (!object(container) || typeof container.image !== "string" || !/^[a-z0-9]+\.azurecr\.io\/filosage@sha256:[a-f0-9]{64}$/.test(container.image)
    || !container.image.endsWith(`@${evidence.imageDigest}`) || !Array.isArray(container.env)) throw new Error("Candidate image is not the approved immutable image.");
  const environment = new Map<string, unknown>();
  for (const entry of container.env) {
    if (!object(entry) || typeof entry.name !== "string" || environment.has(entry.name)) throw new Error("Ambiguous runtime environment.");
    environment.set(entry.name, entry.value);
  }
  for (const [name, value] of Object.entries({ ...releaseEnvironment(evidence.manifest), AZURE_EASY_AUTH_ENABLED: "true", DIRECT_GOOGLE_AUTH_ENABLED: "true", EXTERNAL_ID_AUTH_ENABLED: evidence.authenticationMode === "migration-dual" ? "true" : "false", SITE_VERSION: evidence.sha, NEXT_PUBLIC_SITE_URL: evidence.productionOrigin, RELEASE_IMAGE_DIGEST: evidence.imageDigest, BILLING_ENABLED: "false", BILLING_ROLLOUT_MODE: "closed" })) {
    if (environment.get(name) !== value) throw new Error("Candidate runtime selection changed.");
  }
}

/** Replace the old zero-weight label row atomically; CLI label add retains it. */
export function candidateTraffic(previous: unknown, revision: string): TrafficBinding[] {
  const { state, live, candidate } = assertBlueGreenState(previous);
  const appName = state.appId.split("/").at(-1);
  if (!revision.startsWith(`${appName}--`) || !/^[a-z0-9-]+$/.test(revision) || revision === live.revisionName || revision === candidate.revisionName) throw new Error("A unique new candidate revision is required.");
  return [{ label: live.label, revisionName: live.revisionName, weight: 100 }, { label: candidate.label, revisionName: revision, weight: 0 }].sort((a, b) => a.label.localeCompare(b.label));
}
export function labelOrigin(value: unknown, label: string): string {
  const { state } = assertBlueGreenState(value);
  if (!["blue", "green"].includes(label)) throw new Error("Invalid revision label.");
  const [app, ...domain] = state.fqdn.split(".");
  return `https://${app}---${label}.${domain.join(".")}`;
}
