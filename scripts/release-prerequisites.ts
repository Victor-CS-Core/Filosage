import { observedReleaseCapabilities, releaseCapabilitiesMatch, releaseSelectionMatches, validReleaseDigest, validReleaseManifest, validReleaseSha } from "../src/lib/release-capabilities.ts";
import { assertBlueGreenState, fingerprint, labelOrigin } from "./blue-green-contract.ts";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => Boolean(value) && typeof value === "object" && !Array.isArray(value);
export const deploymentVariables = ["AZURE_RESOURCE_GROUP", "AZURE_CONTAINER_APP_NAME", "AZURE_ACR_NAME"];
export const deploymentSecrets = ["AZURE_CLIENT_ID", "AZURE_TENANT_ID", "AZURE_SUBSCRIPTION_ID"];
// Manual stage, evidence review and promotion share the existing scoped OIDC environment.
export const releaseEnvironments = ["azure-staging"];

/** Read-only maintenance surface inventory; routing never proves write quiescence. */
export function maintenanceIngressInventory(value: unknown, ingress: unknown, revisions: unknown) {
  const { state } = assertBlueGreenState(value);
  if (!record(ingress) || !Array.isArray(revisions)) throw new Error("Missing ingress/writer metadata.");
  const origins = new Set(["https://filosage.com", "https://www.filosage.com", `https://${state.fqdn}`, labelOrigin(state, "blue"), labelOrigin(state, "green")]);
  const names = new Set<string>();
  for (const revision of revisions) {
    if (!record(revision) || !record(revision.properties) || typeof revision.properties.active !== "boolean") throw new Error("Ambiguous revision activity.");
    if (!revision.properties.active) continue;
    const name = revision.name;
    const fqdn = revision.properties.fqdn;
    if (typeof name !== "string" || !name.startsWith(`${state.appId.split("/").at(-1)}--`) || !/^[a-z0-9-]+$/.test(name)
      || names.has(name) || typeof fqdn !== "string" || !fqdn.startsWith(`${name}.`) || !/^[a-z0-9.-]+\.azurecontainerapps\.io$/.test(fqdn)) throw new Error("Ambiguous revision origin.");
    names.add(name);
    origins.add(`https://${fqdn}`);
  }
  if (state.traffic.some((entry) => !names.has(entry.revisionName))) throw new Error("A bound revision is missing from the active inventory.");
  for (const domain of Array.isArray(ingress.customDomains) ? ingress.customDomains : []) {
    if (!record(domain) || typeof domain.name !== "string" || !/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(domain.name)) throw new Error("Ambiguous custom origin.");
    origins.add(`https://${domain.name}`);
  }
  return { ingressFingerprint: fingerprint(ingress), httpOrigins: [...origins].sort(), activeRevisionCount: names.size,
    ipRestrictionsPresent: Array.isArray(ingress.ipSecurityRestrictions) && ingress.ipSecurityRestrictions.length > 0,
    additionalPortMappingsPresent: Array.isArray(ingress.additionalPortMappings) && ingress.additionalPortMappings.length > 0,
    drainVerified: false, maintenanceReady: false,
    pending: ["reviewed enforcement and allowed/disallowed vantage proof for every origin including /.auth", "all external jobs, callbacks, direct database and Blob writers inventoried", "old revision/process/session and in-flight request drain", "Victor's explicit approval of the concrete production operation", "current restore and modern baseline acceptance"] };
}

/** Native review settings are observations only. Victor's explicit approval is procedural,
 * recorded in the task/handoff; metadata never proves that approval was given. */
export function environmentReadiness(value: unknown, branches: unknown, variables: string[], secrets: string[]) {
  const environment = record(value) ? value : {};
  const rules = Array.isArray(environment.protection_rules) ? environment.protection_rules : [];
  const review = rules.filter((rule) => record(rule) && rule.type === "required_reviewers");
  const independentReview = review.length === 1 && review[0].prevent_self_review === true
    && Array.isArray(review[0].reviewers) && review[0].reviewers.length > 0
    && review[0].reviewers.every((entry: unknown) => record(entry) && ["User", "Team"].includes(String(entry.type))
      && record(entry.reviewer) && Number.isSafeInteger(entry.reviewer.id) && Number(entry.reviewer.id) > 0);
  const noAdminBypass = environment.can_admins_bypass === false;
  const policy = environment.deployment_branch_policy;
  const onlyMain = record(policy) && policy.protected_branches === false && policy.custom_branch_policies === true
    && record(branches) && branches.total_count === 1 && Array.isArray(branches.branch_policies)
    && branches.branch_policies.length === 1 && record(branches.branch_policies[0])
    && branches.branch_policies[0].name === "main" && branches.branch_policies[0].type === "branch";
  const missingVariables = deploymentVariables.filter((name) => !variables.includes(name));
  const missingSecrets = deploymentSecrets.filter((name) => !secrets.includes(name));
  return { ready: onlyMain && !missingVariables.length && !missingSecrets.length,
    independentReview, noAdminBypass, onlyMain, missingVariables, missingSecrets };
}

/** Reuses current release identity/manifest rules; a legacy HTTP 200 is insufficient. */
export function predecessorReadiness(value: unknown, status: number, body: unknown, mode: string) {
  const properties = record(value) && record(value.properties) ? value.properties : {};
  const template = record(properties.template) ? properties.template : {};
  const containers = Array.isArray(template.containers) ? template.containers : [];
  const container = containers.length === 1 && record(containers[0]) ? containers[0] : {};
  const entries = Array.isArray(container.env) ? container.env : [];
  const environment: Record<string, string | undefined> = {};
  let unambiguous = entries.length > 0;
  for (const entry of entries) {
    if (!record(entry) || typeof entry.name !== "string" || Object.hasOwn(environment, entry.name)) { unambiguous = false; continue; }
    environment[entry.name] = typeof entry.value === "string" ? entry.value : undefined;
  }
  const image = typeof container.image === "string" ? container.image : "";
  const immutableImage = /^[a-z0-9]+\.azurecr\.io\/filosage@sha256:[a-f0-9]{64}$/.test(image);
  const sha = environment.SITE_VERSION;
  const digest = image.split("@")[1];
  const manifest = { schemaVersion: 1, capabilities: observedReleaseCapabilities(environment) };
  const manifestPresent = validReleaseManifest(manifest);
  const noBootstrapEnvironment = !Object.keys(environment).some((name) => /^(DATABASE_ADMIN_URL|POSTGRES_.*PASSWORD)$/.test(name));
  const health = record(body) ? body : {};
  const checks = record(health.checks) ? health.checks : {};
  const healthMatches = status === 200 && health.ok === true && checks.configuration === true && checks.datastore === true
    && validReleaseSha(sha) && health.version === sha && immutableImage && validReleaseDigest(digest)
    && environment.RELEASE_IMAGE_DIGEST === digest && health.imageDigest === digest
    && environment.NEXT_PUBLIC_SITE_URL === "https://filosage.com" && health.origin === "https://filosage.com"
    && ["direct-google", "migration-dual"].includes(mode) && health.authenticationMode === mode && manifestPresent
    && releaseSelectionMatches(manifest.capabilities, health.capabilities)
    && releaseCapabilitiesMatch(manifest.capabilities as { flashcardDecks: boolean; flashcardGeneration: boolean }, checks);
  return { contractReady: properties.active === true && containers.length === 1 && unambiguous && noBootstrapEnvironment && healthMatches,
    immutableImage, manifestPresent, noBootstrapEnvironment, healthMatches,
    sourceSha: validReleaseSha(sha) ? sha : null, imageDigest: validReleaseDigest(digest) ? digest : null,
    writeCompatibility: "pending", startupAndDatabaseProbe: "pending" };
}

const secretsUser = "4633458b-17de-408a-b874-0445c86b69e6";
/** Flags any additional role at a required vault or ancestor, including custom roles. */
export function runtimeSecretReadiness(value: unknown, required: string[]) {
  const assignments = Array.isArray(value) ? value : [];
  const scopes = required.map((scope) => scope.toLowerCase());
  const validScopes = scopes.length > 0 && new Set(scopes).size === scopes.length
    && scopes.every((scope) => /^\/subscriptions\/[a-f0-9-]{36}\/resourcegroups\/[\w.-]+\/providers\/microsoft\.keyvault\/vaults\/[a-z0-9-]+\/secrets\/[a-z0-9-]+$/.test(scope));
  const granted = new Set<string>();
  let unexpectedGrant = false;
  for (const value of assignments) {
    if (!record(value) || typeof value.scope !== "string" || typeof value.roleDefinitionId !== "string") { unexpectedGrant = true; continue; }
    const scope = value.scope.toLowerCase();
    const vaults = scopes.map((entry) => entry.split("/secrets/")[0]);
    const relevant = vaults.some((vault) => scope === vault || vault.startsWith(`${scope}/`) || scope.startsWith(`${vault}/`));
    if (!relevant) continue;
    if (scopes.includes(scope) && value.roleDefinitionId.toLowerCase().endsWith(`/${secretsUser}`) && !value.condition) granted.add(scope);
    else unexpectedGrant = true;
  }
  const missingGrantCount = scopes.filter((scope) => !granted.has(scope)).length;
  return { metadataReady: validScopes && !unexpectedGrant && missingGrantCount === 0, unexpectedGrant, missingGrantCount, effectiveProbe: "pending" };
}
