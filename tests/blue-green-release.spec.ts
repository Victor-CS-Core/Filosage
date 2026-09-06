import { expect, test } from "@playwright/test";
import { releaseEnvironment, type ReleaseEvidence } from "../src/lib/release-capabilities";
import { readFileSync } from "node:fs";
import { assertBlueGreenState, assertCandidateReadback, authConfigurationHash, candidateTraffic, labelOrigin } from "../scripts/blue-green-contract";

const appId = "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/release/providers/Microsoft.App/containerApps/filosage-app";
const sha = "a".repeat(40);
const digest = `sha256:${"d".repeat(64)}`;
const image = `registry.azurecr.io/filosage@${digest}`;
const manifest = JSON.parse(readFileSync("config/release-capabilities.json", "utf8"));
const auth = { platform: { enabled: true }, httpSettings: { requireHttps: true }, identityProviders: { google: { enabled: true }, customOpenIdConnectProviders: { filosage: { enabled: true } } } };
const state = () => ({ appId, location: "westus", mode: "Multiple", fqdn: "filosage-app.region.azurecontainerapps.io", authConfigSha256: authConfigurationHash(auth, "migration-dual"), traffic: [
  { label: "blue", revisionName: "filosage-app--old", weight: 100 },
  { label: "green", revisionName: "filosage-app--candidate", weight: 0 },
] });

test("inactive color is derived only from exact observed 100/0 revision bindings", () => {
  expect(assertBlueGreenState(state()).candidate.label).toBe("green");
  const swapped = state(); swapped.traffic[0].weight = 0; swapped.traffic[1].weight = 100;
  expect(assertBlueGreenState(swapped).candidate.label).toBe("blue");
  for (const weights of [[50, 50], [99, 1], [0, 0], [100, 100], [100, undefined], [100, "0"], [-1, 101]]) {
    const invalid = state(); invalid.traffic.forEach((entry, index) => { entry.weight = weights[index] as number; });
    expect(() => assertBlueGreenState(invalid)).toThrow();
  }
  for (const mutate of [
    (value: ReturnType<typeof state>) => { value.traffic.pop(); },
    (value: ReturnType<typeof state>) => { value.traffic.push({ label: "extra", revisionName: "filosage-app--extra", weight: 0 }); },
    (value: ReturnType<typeof state>) => { value.traffic[1].label = "blue"; },
    (value: ReturnType<typeof state>) => { value.traffic[1].revisionName = value.traffic[0].revisionName; },
    (value: ReturnType<typeof state>) => { value.mode = "Single"; },
    (value: ReturnType<typeof state>) => { Object.assign(value.traffic[1], { latestRevision: true }); },
    (value: ReturnType<typeof state>) => { value.traffic[1].revisionName = "other-app--candidate"; },
  ]) { const invalid = state(); mutate(invalid); expect(() => assertBlueGreenState(invalid)).toThrow(); }
});

test("auth state hashing is order independent and fails disabled or mismatched shared providers", () => {
  expect(authConfigurationHash({ identityProviders: auth.identityProviders, httpSettings: auth.httpSettings, platform: auth.platform }, "migration-dual")).toBe(authConfigurationHash(auth, "migration-dual"));
  expect(() => authConfigurationHash(auth, "direct-google")).toThrow();
  expect(() => authConfigurationHash({ ...auth, platform: { enabled: false } }, "migration-dual")).toThrow();
  expect(authConfigurationHash({ ...auth, login: { tokenStore: { enabled: false } } }, "migration-dual")).not.toBe(authConfigurationHash(auth, "migration-dual"));
});

test("candidate readback binds exact runtime image, manifest, SHA, canonical origin and unchanged live routing", () => {
  const previous = state();
  const candidate: ReleaseEvidence = { schemaVersion: 2, sha, imageDigest: digest, manifest, productionOrigin: "https://filosage.com", candidateOrigin: "https://filosage-app--candidate.region.azurecontainerapps.io", authenticationMode: "migration-dual", appId, revision: "filosage-app--candidate", label: "green", authConfigSha256: previous.authConfigSha256 };
  const revision = { name: candidate.revision, properties: { active: true, fqdn: candidate.candidateOrigin.slice(8), template: { containers: [{ image, env: [
    ...Object.entries({ ...releaseEnvironment(manifest), AZURE_EASY_AUTH_ENABLED: "true", DIRECT_GOOGLE_AUTH_ENABLED: "true", EXTERNAL_ID_AUTH_ENABLED: "true" }).map(([name, value]) => ({ name, value })),
    { name: "SITE_VERSION", value: sha }, { name: "NEXT_PUBLIC_SITE_URL", value: candidate.productionOrigin }, { name: "RELEASE_IMAGE_DIGEST", value: digest },
    { name: "BILLING_ENABLED", value: "false" }, { name: "BILLING_ROLLOUT_MODE", value: "closed" },
  ] }] } } };
  expect(() => assertCandidateReadback(candidate, state(), revision, previous)).not.toThrow();
  for (const change of [{ imageDigest: `sha256:${"e".repeat(64)}` }, { revision: "filosage-app--other" }, { appId: `${appId}other` }, { authConfigSha256: "f".repeat(64) }, { productionOrigin: "https://other.example" }]) {
    expect(() => assertCandidateReadback({ ...candidate, ...change }, state(), revision, previous)).toThrow();
  }
  const changedLive = state(); changedLive.traffic[0].revisionName = "filosage-app--different";
  expect(() => assertCandidateReadback(candidate, changedLive, revision, previous)).toThrow();
});

test("hosted review requires every exact-candidate artifact and compatible predecessor", async () => {
  const { validateHostedReview, hostedGates } = await import("../scripts/blue-green-review");
  const { fingerprint } = await import("../scripts/blue-green-contract");
  const candidate = { schemaVersion: 2 as const, sha, imageDigest: digest, manifest, productionOrigin: "https://filosage.com", candidateOrigin: "https://filosage-app--candidate.region.azurecontainerapps.io", authenticationMode: "migration-dual", appId, revision: "filosage-app--candidate", label: "green", authConfigSha256: state().authConfigSha256,
    previous: { sha: "b".repeat(40), revision: "filosage-app--old", image: `registry.azurecr.io/filosage@sha256:${"e".repeat(64)}` } };
  const packet = { schemaVersion: 1, candidateFingerprint: fingerprint(candidate), operator: "Operator fixture", reviewedBy: "Reviewer fixture", rollbackTrigger: "Signed-in smoke or monitored error regression", testDataPolicy: "approved-accounts-and-data-only", writeCompatibility: "overlapping-readers-writers-and-inflight-fences-verified", minimumSafeRollbackSha: candidate.previous.sha, rollbackRevision: candidate.previous.revision, rollbackImage: candidate.previous.image, rollbackAuthorized: true,
    evidence: hostedGates.map((gate) => ({ gate, runId: "123", workflow: ".github/workflows/hosted-fixture.yml", artifact: gate, artifactDigest: digest, candidateFingerprint: fingerprint(candidate), result: "passed", method: "Observed hosted fixture transcript", reviewedBy: "Reviewer fixture", observedAt: "2026-09-01T10:00:00Z" })) };
  expect(() => validateHostedReview(packet, candidate)).not.toThrow();
  for (const invalid of [null, {}, { ...packet, evidence: true }, { ...packet, evidence: packet.evidence.slice(1) }, { ...packet, minimumSafeRollbackSha: sha }, { ...packet, rollbackAuthorized: false }, { ...packet, candidateFingerprint: "0".repeat(64) }, { ...packet, evidence: packet.evidence.map((proof) => ({ ...proof, result: "pending" })) }, { ...packet, evidence: packet.evidence.map((proof) => ({ ...proof, workflow: ".github/workflows/azure-staging.yml" })) }]) {
    expect(() => validateHostedReview(invalid, candidate)).toThrow();
  }
});

test("candidate runtime readback rejects a capability mismatch even when health metadata could agree", () => {
  const candidate: ReleaseEvidence = { schemaVersion: 2, sha, imageDigest: digest, manifest, productionOrigin: "https://filosage.com", candidateOrigin: "https://filosage-app--candidate.region.azurecontainerapps.io", authenticationMode: "migration-dual", appId, revision: "filosage-app--candidate", label: "green", authConfigSha256: state().authConfigSha256 };
  const environment = { ...releaseEnvironment(manifest), AZURE_EASY_AUTH_ENABLED: "true", DIRECT_GOOGLE_AUTH_ENABLED: "true", EXTERNAL_ID_AUTH_ENABLED: "true", SITE_VERSION: sha, NEXT_PUBLIC_SITE_URL: candidate.productionOrigin, RELEASE_IMAGE_DIGEST: digest, BILLING_ENABLED: "false", BILLING_ROLLOUT_MODE: "closed", COURSE_PIPELINE_V2: "false" };
  const revision = { name: candidate.revision, properties: { active: true, fqdn: candidate.candidateOrigin.slice(8), template: { containers: [{ image, env: Object.entries(environment).map(([name, value]) => ({ name, value })) }] } } };
  expect(() => assertCandidateReadback(candidate, state(), revision, state())).toThrow();
});

test("binding replaces the previous inactive row atomically and constructs the Azure label host", () => {
  expect(candidateTraffic(state(), "filosage-app--new")).toEqual([
    { label: "blue", revisionName: "filosage-app--old", weight: 100 },
    { label: "green", revisionName: "filosage-app--new", weight: 0 },
  ]);
  expect(labelOrigin(state(), "green")).toBe("https://filosage-app---green.region.azurecontainerapps.io");
  expect(() => candidateTraffic(state(), "filosage-app--old")).toThrow();
  expect(() => candidateTraffic(state(), "filosage-app--candidate")).toThrow();
});

test("promoted readback accepts only the verified candidate at 100 and its captured predecessor at 0", () => {
  const candidate: ReleaseEvidence = { schemaVersion: 2, sha, imageDigest: digest, manifest, productionOrigin: "https://filosage.com", candidateOrigin: "https://filosage-app--candidate.region.azurecontainerapps.io", authenticationMode: "migration-dual", appId, revision: "filosage-app--candidate", label: "green", authConfigSha256: state().authConfigSha256 };
  const environment = { ...releaseEnvironment(manifest), AZURE_EASY_AUTH_ENABLED: "true", DIRECT_GOOGLE_AUTH_ENABLED: "true", EXTERNAL_ID_AUTH_ENABLED: "true", SITE_VERSION: sha, NEXT_PUBLIC_SITE_URL: candidate.productionOrigin, RELEASE_IMAGE_DIGEST: digest, BILLING_ENABLED: "false", BILLING_ROLLOUT_MODE: "closed" };
  const revision = { name: candidate.revision, properties: { active: true, fqdn: candidate.candidateOrigin.slice(8), template: { containers: [{ image, env: Object.entries(environment).map(([name, value]) => ({ name, value })) }] } } };
  const promoted = state(); promoted.traffic[0].weight = 0; promoted.traffic[1].weight = 100;
  expect(() => assertCandidateReadback(candidate, promoted, revision, state(), true)).not.toThrow();
  expect(() => assertCandidateReadback(candidate, promoted, revision, state())).toThrow();
  promoted.traffic[0].revisionName = "filosage-app--unapproved-rollback";
  expect(() => assertCandidateReadback(candidate, promoted, revision, state(), true)).toThrow();
});
