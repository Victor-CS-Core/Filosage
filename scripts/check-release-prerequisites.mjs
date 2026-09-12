import { spawnSync } from "node:child_process";
import { environmentReadiness, predecessorReadiness, runtimeSecretReadiness, releaseEnvironments, maintenanceIngressInventory } from "./release-prerequisites.ts";
import { assertBlueGreenState, authConfigurationHash, azureLocationName } from "./blue-green-contract.ts";

// Read-only, repeatable metadata inventory. Do not add provider mutation or secret
// retrieval here. Neither stdout nor stderr ever contains provider bodies.
const run = (binary, args, allowMissing = false) => {
  const result = spawnSync(binary, args, { encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  if (allowMissing && result.status !== 0 && /HTTP 404/.test(result.stderr)) return null;
  if (result.status !== 0) throw new Error("A required metadata read failed.");
  return JSON.parse(result.stdout);
};
let stage = "input-validation";
try {
  const [repository, group, appName, mode, ...extra] = process.argv.slice(2);
  if (extra.length || !/^[\w.-]+\/[\w.-]+$/.test(repository || "") || !/^[\w.-]+$/.test(group || "")
    || !/^[a-z0-9-]+$/.test(appName || "") || !["direct-google", "migration-dual"].includes(mode)) throw new Error("Invalid inventory context.");
  const gh = (path, projection, allowMissing = false) => run("gh", ["api", `repos/${repository}/${path}`, ...(projection ? ["--jq", projection] : [])], allowMissing);
  const az = (args) => run("az", [...args, "--only-show-errors", "--output", "json"]);
  const appArgs = ["--resource-group", group, "--name", appName];
  stage = "application-and-auth-metadata";
  const app = az(["containerapp", "show", ...appArgs]);
  const auth = az(["containerapp", "auth", "show", ...appArgs]);
  const state = { appId: app.id, location: azureLocationName(app.location), mode: app.properties?.configuration?.activeRevisionsMode,
    fqdn: app.properties?.configuration?.ingress?.fqdn, traffic: app.properties?.configuration?.ingress?.traffic,
    authConfigSha256: authConfigurationHash(auth.properties || auth, mode) };
  const { live } = assertBlueGreenState(state);
  const revision = az(["containerapp", "revision", "show", ...appArgs, "--revision", live.revisionName]);
  const allRevisions = az(["containerapp", "revision", "list", ...appArgs]);
  const maintenance = maintenanceIngressInventory(state, app.properties.configuration.ingress, allRevisions);
  stage = "public-health";
  const response = await fetch("https://filosage.com/api/health", { redirect: "error", signal: AbortSignal.timeout(20_000) });
  const healthText = await response.text();
  if (Buffer.byteLength(healthText) > 64 * 1024) throw new Error("Health metadata exceeds the bound.");
  const predecessor = predecessorReadiness(revision, response.status, JSON.parse(healthText), mode);
  stage = "repository-configuration-metadata";
  const repoVariables = gh("actions/variables?per_page=100", "[.variables[].name]");
  const repoSecrets = gh("actions/secrets?per_page=100", "[.secrets[].name]");
  const environments = [];
  let backupInputsPresent = false;
  for (const name of releaseEnvironments) {
    stage = `${name}-metadata`;
    const environment = gh(`environments/${name}`, undefined, true);
    const branches = environment?.deployment_branch_policy?.custom_branch_policies === true ? gh(`environments/${name}/deployment-branch-policies?per_page=100`) : null;
    const variables = environment ? gh(`environments/${name}/variables?per_page=100`, "[.variables[].name]") : [];
    const secrets = environment ? gh(`environments/${name}/secrets?per_page=100`, "[.secrets[].name]") : [];
    const variableNames = [...repoVariables, ...variables];
    environments.push({ name, exists: Boolean(environment), ...environmentReadiness(environment, branches, variableNames, [...repoSecrets, ...secrets]) });
    if (name === "azure-staging") backupInputsPresent = ["AZURE_POSTGRES_RESOURCE_ID", "AZURE_POSTGRES_APPROVED_RETENTION_DAYS"].every((key) => variableNames.includes(key));
  }
  const identities = Object.entries(app.identity?.userAssignedIdentities || {});
  stage = "runtime-secret-reference-metadata";
  if (identities.length !== 1) throw new Error("Runtime identity requires separate inventory.");
  const [identityId, identity] = identities[0];
  const refs = app.properties?.configuration?.secrets;
  if (!Array.isArray(refs) || !refs.length || refs.some((entry) => entry.identity?.toLowerCase() !== identityId.toLowerCase())) throw new Error("Secret identity inventory is ambiguous.");
  const scopes = refs.map((entry) => {
    const url = new URL(entry.keyVaultUrl);
    if (url.protocol !== "https:" || !/^[a-z0-9-]+\.vault\.azure\.net$/.test(url.hostname) || !/^\/secrets\/[a-z0-9-]+(?:\/[a-f0-9]+)?$/.test(url.pathname)) throw new Error("Unexpected runtime secret reference.");
    // Resolve metadata by vault name rather than guessing the vault resource group.
    const vault = az(["keyvault", "show", "--name", url.hostname.split(".")[0], "--query", "{id:id}"]);
    return `${vault.id}${url.pathname.split("/").slice(0, 3).join("/")}`;
  });
  const assignments = az(["role", "assignment", "list", "--assignee-object-id", identity.principalId, "--all", "--include-inherited", "--query", "[].{scope:scope,roleDefinitionId:roleDefinitionId,condition:condition}"]);
  const runtimeSecrets = runtimeSecretReadiness(assignments, [...new Set(scopes)]);
  const result = { schemaVersion: 1, observedAt: new Date().toISOString(), operation: "read-only-release-prerequisite-inventory",
    appId: state.appId, traffic: state.traffic, authConfigSha256: state.authConfigSha256, authenticationMode: mode,
    environments, backupInputsPresent, predecessor, runtimeSecrets, maintenance,
    metadataReady: environments.every((entry) => entry.ready) && backupInputsPresent && predecessor.contractReady && runtimeSecrets.metadataReady,
    releaseReady: false,
    pendingEvidence: ["actual independent human review and deployment identity restrictions", "approved backup input values and successful recovery-window observation", "current restore rehearsal", "runtime database allow/deny and read-only startup", "actual managed-identity secret allow/deny", "overlapping account/publication/accounting and in-flight writer compatibility", "all seven exact-candidate hosted gates"] };
  console.log(JSON.stringify(result, null, 2));
  if (!result.metadataReady) process.exitCode = 1;
} catch {
  console.error(`Release prerequisite inventory failed closed at ${stage}; inspect access and approved target metadata. No provider output was retained.`);
  process.exitCode = 1;
}
