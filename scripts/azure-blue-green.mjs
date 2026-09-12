import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { assertBlueGreenState, assertCandidateReadback, authConfigurationHash, fingerprint, canonical, candidateTraffic, labelOrigin, azureLocationName } from "./blue-green-contract.ts";
import { readReleaseManifest } from "./release-manifest.mjs";
import { releaseEnvironment, releaseEvidenceMatches, validReleaseSha, validReleaseDigest, observedReleaseCapabilities, validReleaseManifest } from "../src/lib/release-capabilities.ts";

// All process arguments remain separate. Never print provider bodies, environment
// contents, auth configuration, or CLI error output into logs/artifacts.
const run = (binary, args, extra = {}) => {
  const result = spawnSync(binary, args, { encoding: "utf8", timeout: 180_000, maxBuffer: 4 * 1024 * 1024, ...extra });
  if (result.status !== 0) throw new Error(`Required ${binary} operation failed; review provider state before retrying.`);
  return result.stdout.trim();
};
const json = (path) => {
  const source = readFileSync(path, "utf8");
  if (Buffer.byteLength(source) > 64 * 1024) throw new Error("Evidence exceeds the bounded input limit.");
  return JSON.parse(source);
};
const save = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
const command = process.argv[2];
const directory = process.env.RELEASE_EVIDENCE_DIR || join(process.env.RUNNER_TEMP || "/tmp", "blue-green-evidence");
const env = process.env;
const sha = env.EXPECTED_SHA;
const repository = env.GITHUB_REPOSITORY;
const appArgs = ["--resource-group", env.AZURE_RESOURCE_GROUP || "", "--name", env.AZURE_CONTAINER_APP_NAME || ""];
const az = (args) => JSON.parse(run("az", [...args, "--only-show-errors", "--output", "json"]));
const mutate = (args) => run("az", [...args, "--only-show-errors", "--output", "none"]);
const api = (path) => JSON.parse(run("gh", ["api", `repos/${repository}/${path}`]));
const manifest = readReleaseManifest();
const expectedMode = env.EXPECTED_AUTH_MODE;
const snapshot = () => {
  const app = az(["containerapp", "show", ...appArgs]);
  const auth = az(["containerapp", "auth", "show", ...appArgs]);
  const state = { appId: app.id, location: azureLocationName(app.location), mode: app.properties?.configuration?.activeRevisionsMode, fqdn: app.properties?.configuration?.ingress?.fqdn,
    traffic: app.properties?.configuration?.ingress?.traffic, authConfigSha256: authConfigurationHash(auth.properties || auth, expectedMode) };
  assertBlueGreenState(state);
  state.traffic = state.traffic.map(({ label, revisionName, weight }) => ({ label, revisionName, weight })).sort((a, b) => a.label.localeCompare(b.label));
  return state;
};
const revision = (name) => az(["containerapp", "revision", "show", ...appArgs, "--revision", name]);
const requireRun = (id, path) => {
  if (!/^[1-9][0-9]*$/.test(String(id))) throw new Error("An exact successful workflow run is required.");
  const result = api(`actions/runs/${id}`);
  if (result.head_sha !== sha || result.path !== path || result.status !== "completed" || result.conclusion !== "success" || result.head_repository?.full_name !== repository) throw new Error("Workflow evidence identity or success mismatched.");
  return { id: String(id), path, sha };
};
const download = (runId, artifact, destination) => {
  const listing = api(`actions/runs/${runId}/artifacts?per_page=100`);
  const matches = listing.artifacts?.filter((entry) => entry.name === artifact && entry.expired === false);
  if (matches?.length !== 1 || !validReleaseDigest(matches[0].digest)) throw new Error("A unique immutable artifact with digest is required.");
  run("gh", ["run", "download", String(runId), "--repo", repository, "--name", artifact, "--dir", destination]);
  return { runId: String(runId), artifactId: matches[0].id, artifact, digest: matches[0].digest };
};
const check = (script, args, extra = {}) => run(process.execPath, [`scripts/${script}`, ...args], { env: { ...env, ...extra } });
const smoke = (candidate, origin = candidate.candidateOrigin) => {
  const options = { EXPECTED_AUTH_MODE: candidate.authenticationMode, EXPECTED_IMAGE_DIGEST: candidate.imageDigest, RELEASE_CAPABILITIES_JSON: JSON.stringify(candidate.manifest) };
  check("check-production-health.mjs", [origin, candidate.sha, candidate.productionOrigin], options);
  check("check-release-safety.mjs", [origin], options);
  check("check-bff-boundary.mjs", [origin], options);
  check("check-featured-course.mjs", [origin, candidate.featuredCourseId], options);
};
const loadCandidate = () => {
  requireRun(env.CANDIDATE_RUN_ID, ".github/workflows/azure-staging.yml");
  const destination = join(directory, "stage");
  const artifact = download(env.CANDIDATE_RUN_ID, `release-candidate-${sha}`, destination);
  const candidate = json(join(destination, "release-candidate.json"));
  if (!releaseEvidenceMatches(candidate, sha, manifest, env.PUBLIC_SITE_URL) || candidate.authenticationMode !== expectedMode || candidate.stageRunId !== String(env.CANDIDATE_RUN_ID)) throw new Error("Candidate source, manifest, origin or stage run mismatched.");
  return { candidate, artifact };
};
const verify = (candidate, promoted = false) => {
  const observed = snapshot();
  assertCandidateReadback(candidate, observed, revision(candidate.revision), candidate.before, promoted);
  const previous = revision(candidate.previous.revision);
  const container = previous.properties?.template?.containers?.[0];
  if (previous.properties?.active !== true || previous.properties.template.containers.length !== 1 || container.image !== candidate.previous.image
    || container.env?.find((entry) => entry.name === "SITE_VERSION")?.value !== candidate.previous.sha) throw new Error("Previous immutable revision changed or is unavailable.");
  return observed;
};

try {
  if (!validReleaseSha(sha) || sha !== env.GITHUB_SHA || !/^[\w.-]+\/[\w.-]+$/.test(repository || "")
    || !/^[a-z0-9-]+$/.test(env.AZURE_CONTAINER_APP_NAME || "") || !/^[\w.-]+$/.test(env.AZURE_RESOURCE_GROUP || "")
    || !["direct-google", "migration-dual"].includes(expectedMode) || env.PUBLIC_SITE_URL !== "https://filosage.com") throw new Error("Run from the exact full candidate SHA with reviewed application settings.");
  mkdirSync(directory, { recursive: true });
  if (command === "preflight") {
    const engineering = [requireRun(env.QUALITY_RUN_ID, ".github/workflows/quality-gate.yml"), requireRun(env.REGRESSION_RUN_ID, ".github/workflows/full-regression.yml")];
    const before = snapshot();
    const { live } = assertBlueGreenState(before);
    const liveRevision = revision(live.revisionName);
    const container = liveRevision.properties?.template?.containers?.[0];
    const liveSha = container?.env?.find((entry) => entry.name === "SITE_VERSION")?.value;
    if (liveRevision.properties?.active !== true || liveRevision.properties.template.containers.length !== 1 || !validReleaseSha(liveSha)
      || !/^[a-z0-9]+\.azurecr\.io\/filosage@sha256:[a-f0-9]{64}$/.test(container.image)) throw new Error("Inventory and pin the previous compatible revision before staging.");
    if (container.env?.some((entry) => /^(DATABASE_ADMIN_URL|POSTGRES_.*PASSWORD)$/.test(entry.name))) throw new Error("Complete the separately approved bootstrap/runtime privilege cutover before staging.");
    const liveEnvironment = Object.fromEntries(container.env.map((entry) => [entry.name, entry.value]));
    const previousManifest = { schemaVersion: 1, capabilities: observedReleaseCapabilities(liveEnvironment) };
    if (!validReleaseManifest(previousManifest) || liveEnvironment.NEXT_PUBLIC_SITE_URL !== env.PUBLIC_SITE_URL) throw new Error("Previous runtime manifest/origin must be inventoried exactly.");
    const previous = { revision: live.revisionName, label: live.label, sha: liveSha, image: container.image,
      imageDigest: container.image.split("@")[1], manifest: previousManifest, productionOrigin: env.PUBLIC_SITE_URL,
      candidateOrigin: env.PUBLIC_SITE_URL, authenticationMode: expectedMode, featuredCourseId: liveEnvironment.LANDING_FEATURED_COURSE_ID || "none" };
    smoke(previous);
    save(join(directory, "preflight.json"), { before, previous, engineering });
  } else if (command === "stage") {
    const preflight = json(join(directory, "preflight.json"));
    const before = snapshot();
    if (canonical(before) !== canonical(preflight.before)) throw new Error("Traffic or shared auth changed during the build.");
    const { live, candidate: inactive } = assertBlueGreenState(before);
    const digest = env.EXPECTED_IMAGE_DIGEST;
    if (!validReleaseDigest(digest) || !/^[a-z0-9]+$/.test(env.AZURE_ACR_NAME || "") || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID || "") || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT || "")) throw new Error("Invalid immutable build identity.");
    const featured = env.FEATURED_COURSE_ID;
    if (featured !== "none" && !/^[a-f0-9]{64}$/.test(featured || "")) throw new Error("Select one exact featured course or none.");
    const suffix = `${inactive.label}-${sha.slice(0, 12)}-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
    const revisionName = `${env.AZURE_CONTAINER_APP_NAME}--${suffix}`;
    // Copy the observed live template; do not mutate shared auth, secrets, identity,
    // ingress, or revision mode. Existing explicit revision weights stay pinned.
    const settings = { ...releaseEnvironment(manifest), SITE_VERSION: sha, RELEASE_IMAGE_DIGEST: digest,
      NEXT_PUBLIC_SITE_URL: env.PUBLIC_SITE_URL, BILLING_ENABLED: "false", BILLING_ROLLOUT_MODE: "closed", DEPLOYMENT_SLOT: inactive.label };
    if (featured !== "none") settings.LANDING_FEATURED_COURSE_ID = featured;
    mutate(["containerapp", "revision", "copy", ...appArgs, "--from-revision", live.revisionName, "--image", `${env.AZURE_ACR_NAME}.azurecr.io/filosage@${digest}`, "--revision-suffix", suffix,
      ...(featured === "none" ? ["--remove-env-vars", "LANDING_FEATURED_COURSE_ID"] : []), "--set-env-vars", ...Object.entries(settings).map(([key, value]) => `${key}=${value}`)]);
    const afterDeployment = snapshot();
    if (canonical(afterDeployment) !== canonical(before)) throw new Error("Public routing changed during zero-traffic deployment; operator review required.");
    const candidateRevision = revision(revisionName);
    const candidate = { schemaVersion: 2, sha, imageDigest: digest, manifest, productionOrigin: env.PUBLIC_SITE_URL,
      candidateOrigin: `https://${candidateRevision.properties?.fqdn}`, authenticationMode: expectedMode, appId: before.appId,
      revision: revisionName, label: inactive.label, authConfigSha256: before.authConfigSha256, before, afterDeployment,
      previous: preflight.previous, engineering: preflight.engineering, stageRunId: env.GITHUB_RUN_ID, featuredCourseId: featured,
      compatibility: "Pending exact-candidate hosted verification and compatible rollback review" };
    if (!releaseEvidenceMatches(candidate, sha, manifest, env.PUBLIC_SITE_URL)) throw new Error("Candidate revision identity is unavailable.");
    smoke(candidate);
    // The candidate is tested via its revision URL before binding the inactive label.
    const traffic = candidateTraffic(before, revisionName);
    const patchPath = join(directory, "label-binding.json");
    save(patchPath, { location: before.location, properties: { configuration: { ingress: { traffic } } } });
    // JSON Merge Patch replaces only the reviewed traffic array. The CLI label-add
    // command retains an unlabeled old zero-weight row, creating ambiguous state.
    if (canonical(snapshot()) !== canonical(before)) throw new Error("Traffic changed before inactive-label binding.");
    mutate(["rest", "--method", "patch", "--url", `https://management.azure.com${before.appId}?api-version=2025-01-01`, "--body", `@${patchPath}`]);
    let bound = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const observed = snapshot();
      if (canonical(observed.traffic) === canonical(traffic)) { bound = true; break; }
      if (canonical(observed) !== canonical(before)) throw new Error("Unexpected state during candidate label binding.");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    if (!bound) throw new Error("Candidate label binding did not settle within 60 seconds.");
    candidate.after = verify(candidate);
    smoke(candidate, labelOrigin(before, inactive.label));
    save(join(directory, "release-candidate.json"), candidate);
    console.log("Inactive revision verified; public traffic remains on the previous revision. Hosted review gates remain pending.");
  } else if (command === "review" || command === "promote") {
    const { candidate, artifact } = loadCandidate();
    const observed = verify(candidate);
    smoke(candidate);
    if (command === "review") {
      const packetText = env.REVIEW_PACKET || "";
      if (Buffer.byteLength(packetText) > 32 * 1024) throw new Error("Review packet is too large.");
      const packet = JSON.parse(packetText);
      const { validateHostedReview } = await import("./blue-green-review.ts");
      validateHostedReview(packet, candidate);
      // Referenced evidence artifacts must belong to successful exact-SHA runs.
      // Human assertions remain explicitly labelled as review, never automated passes.
      const references = [];
      for (const proof of packet.evidence) {
        requireRun(proof.runId, proof.workflow);
        const proofDirectory = join(directory, `proof-${references.length}`);
        const proofArtifact = download(proof.runId, proof.artifact, proofDirectory);
        if (proofArtifact.digest !== proof.artifactDigest) throw new Error("Reviewed artifact digest changed.");
        const proofBody = json(join(proofDirectory, "candidate-proof.json"));
        if (proofBody.candidateFingerprint !== fingerprint(candidate) || proofBody.gate !== proof.gate || proofBody.result !== "passed"
          || proofBody.sha !== sha || proofBody.imageDigest !== candidate.imageDigest || proofBody.revision !== candidate.revision
          || proofBody.appId !== candidate.appId || proofBody.manifestFingerprint !== fingerprint(manifest)
          || proofBody.authConfigSha256 !== candidate.authConfigSha256 || proofBody.productionOrigin !== candidate.productionOrigin
          || proofBody.observedAt !== proof.observedAt || proofBody.method !== proof.method) throw new Error("Hosted proof content does not identify this exact candidate and review.");
        references.push(proofArtifact);
      }
      save(join(directory, "candidate-verification.json"), { schemaVersion: 1, candidateFingerprint: fingerprint(candidate), candidateArtifact: artifact,
        packet, references, state: observed, verificationRunId: env.GITHUB_RUN_ID, reviewedAt: new Date().toISOString() });
    } else {
      requireRun(env.VERIFICATION_RUN_ID, ".github/workflows/azure-candidate-verification.yml");
      download(env.VERIFICATION_RUN_ID, `candidate-verification-${sha}`, join(directory, "verification"));
      const verified = json(join(directory, "verification", "candidate-verification.json"));
      const { validateHostedReview } = await import("./blue-green-review.ts");
      validateHostedReview(verified.packet, candidate);
      if (verified.verificationRunId !== String(env.VERIFICATION_RUN_ID) || verified.candidateFingerprint !== fingerprint(candidate)
        || canonical(verified.candidateArtifact) !== canonical(artifact) || canonical(verified.state) !== canonical(observed)) throw new Error("Reviewed candidate or current routing changed.");
      // Re-read immediately before the mutation. Out-of-band traffic writers must
      // be excluded by the deployment lease/RBAC operator gate (CLI has no CAS).
      verify(candidate);
      save(join(directory, "swap-intent.json"), { candidate, verified, at: new Date().toISOString() });
      mutate(["containerapp", "ingress", "traffic", "set", ...appArgs, "--revision-weight", `${candidate.revision}=100`, `${candidate.previous.revision}=0`]);
      const after = verify(candidate, true);
      smoke(candidate, candidate.productionOrigin);
      const www = await fetch("https://www.filosage.com/", { redirect: "manual", signal: AbortSignal.timeout(15_000) });
      if (www.status !== 308 || new URL(www.headers.get("location") || "").origin !== candidate.productionOrigin) throw new Error("Canonical www routing failed.");
      save(join(directory, "promotion.json"), { candidateFingerprint: fingerprint(candidate), state: after, publicSmoke: "passed", signedInPostSwap: "pending operator evidence", at: new Date().toISOString() });
      console.log("Traffic readback and public smoke passed. Record fresh signed-in and monitoring evidence before closing Gate A.");
    }
  } else if (command === "rollback") {
    const path = join(directory, "swap-intent.json");
    if (!existsSync(path)) { console.log("No approved swap was attempted."); process.exit(0); }
    const { candidate, verified } = json(path);
    const { validateHostedReview } = await import("./blue-green-review.ts");
    validateHostedReview(verified.packet, candidate);
    // No blind captured-weight restoration: only the reviewed exact compatible
    // predecessor can receive traffic, and only from the known post-swap state.
    verify(candidate, true);
    mutate(["containerapp", "ingress", "traffic", "set", ...appArgs, "--revision-weight", `${candidate.previous.revision}=100`, `${candidate.revision}=0`]);
    const after = verify(candidate);
    smoke(candidate.previous, candidate.productionOrigin);
    save(join(directory, "rollback.json"), { state: after, previous: candidate.previous, publicHealthOriginSha: "passed", signedInVerification: "pending operator; traffic restoration alone is insufficient" });
    console.log("Compatible predecessor routing and public health/origin/SHA verified; record fresh signed-in evidence before closing the incident.");
  } else throw new Error("Unknown release operation.");
} catch { console.error("Blue/green release operation failed closed; inspect the approved non-secret operator evidence."); process.exitCode = 1; }
