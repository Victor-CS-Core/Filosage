import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { resolveCoursePipelineFeatureFlags } from "../src/lib/course-pipeline/feature-policy";
import {
  observedReleaseCapabilities,
  releaseCapabilitiesMatch,
  releaseEnvironment,
  releaseEvidenceMatches,
  releaseSelectionMatches,
  validReleaseManifest,
} from "../src/lib/release-capabilities";

const manifest = JSON.parse(readFileSync(resolve("config/release-capabilities.json"), "utf8"));
const sha = "b".repeat(40);
const digest = `sha256:${"d".repeat(64)}`;
const origin = "https://filosage.com";
const evidence = { schemaVersion: 1, sha, imageDigest: digest, manifest, productionOrigin: origin, qaOrigin: "https://qa.example", qaAuthenticationMode: "migration-dual" };
const script = resolve("scripts/release-capabilities.mjs");
const run = (args: string[], env: NodeJS.ProcessEnv = process.env) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env });

for (const [decks, generation] of [[false, false], [true, false], [true, true]]) {
  test(`approved selection ${decks}/${generation} round trips through build and runtime values`, () => {
    const selected = { ...manifest, capabilities: { ...manifest.capabilities, flashcardDecks: decks, flashcardGeneration: generation } };
    expect(releaseCapabilitiesMatch(selected.capabilities, selected.capabilities)).toBe(true);
    expect(releaseSelectionMatches(selected.capabilities, observedReleaseCapabilities(releaseEnvironment(selected)))).toBe(true);
    const result = run(["environment"], { ...process.env, RELEASE_CAPABILITIES_JSON: JSON.stringify(selected) });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`FLASHCARD_DECKS_ENABLED=${decks}\n`);
    expect(result.stdout).toContain(`FLASHCARD_AI_GENERATION_ENABLED=${generation}\n`);
  });
}

test("capabilities reject missing, nonboolean, unexpected, opposite, and invalid dependency states", () => {
  for (const value of [null, [], {}, { flashcardDecks: false }, { flashcardDecks: "false", flashcardGeneration: false }, { flashcardDecks: false, flashcardGeneration: true }]) {
    expect(releaseCapabilitiesMatch(manifest.capabilities, value)).toBe(false);
  }
  for (const change of [{ flashcardDecks: true }, { flashcardGeneration: true }, { pipelineV2: "false" }, { labsV2: true }, { unexpected: false }, { pipelineCohortPercent: "0" }]) {
    expect(releaseSelectionMatches(manifest.capabilities, { ...manifest.capabilities, ...change })).toBe(false);
  }
  for (const value of ["", "TRUE", "0", " false ", undefined]) {
    expect(releaseSelectionMatches(manifest.capabilities, observedReleaseCapabilities({ ...releaseEnvironment(manifest), FLASHCARD_DECKS_ENABLED: value }))).toBe(false);
  }
  expect(validReleaseManifest({ ...manifest, capabilities: { ...manifest.capabilities, flashcardGeneration: true } })).toBe(false);
  const invalid = { flashcardDecks: false, flashcardGeneration: true };
  expect(releaseCapabilitiesMatch(invalid, invalid)).toBe(false);
  expect(releaseCapabilitiesMatch({ flashcardDecks: "false", flashcardGeneration: false } as never, manifest.capabilities)).toBe(false);
});

test("evidence binds the reviewed manifest to the exact SHA, digest, origins, and bounded QA authentication", () => {
  expect(releaseEvidenceMatches(evidence, sha, manifest, origin)).toBe(true);
  for (const changed of [null, {}, { ...evidence, sha: "c".repeat(40) }, { ...evidence, imageDigest: "latest" }, { ...evidence, manifest: { ...manifest, capabilities: { ...manifest.capabilities, flashcardDecks: true } } }, { ...evidence, productionOrigin: "https://other.example" }, { ...evidence, qaOrigin: "https://qa.example/path" }, { ...evidence, qaAuthenticationMode: "unexpected" }]) {
    expect(releaseEvidenceMatches(changed, sha, manifest, origin)).toBe(false);
  }
});

test("candidate CLI creates and checks evidence without permitting a different deployed digest", () => {
  const directory = mkdtempSync(join(tmpdir(), "filosage-release-evidence-"));
  const path = join(directory, "release-candidate.json");
  try {
    const created = run(["create-evidence", sha, digest, origin, evidence.qaOrigin, evidence.qaAuthenticationMode]);
    expect(created.status, created.stderr).toBe(0);
    expect(JSON.parse(created.stdout)).toEqual(evidence);
    writeFileSync(path, created.stdout);
    const verified = run(["verify-evidence", path, sha, origin]);
    expect(verified.status, verified.stderr).toBe(0);
    expect(verified.stdout).toContain(`EXPECTED_IMAGE_DIGEST=${digest}`);
    expect(verified.stdout).toContain("QA_AUTH_MODE=migration-dual");
    expect(run(["verify-evidence", path, "c".repeat(40), origin]).status).toBe(1);
    expect(run(["check-image", "registry.azurecr.io/filosage", digest, `registry.azurecr.io/filosage@${digest}`]).status).toBe(0);
    expect(run(["check-image", "registry.azurecr.io/filosage", digest, `registry.azurecr.io/filosage@sha256:${"e".repeat(64)}`]).status).toBe(1);
    expect(run(["check-image", "registry.azurecr.io/filosage", digest, `registry.azurecr.io/filosage:${sha}`]).status).toBe(1);
    writeFileSync(path, JSON.stringify({ ...evidence, qaAuthenticationMode: "secret-do-not-print" }));
    const rejected = run(["verify-evidence", path, sha, origin]);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).not.toContain("secret-do-not-print");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("build refuses unselected, missing, or invalid runtime switches before Next builds", () => {
  const environment = { ...process.env, ...releaseEnvironment(manifest) };
  expect(run(["check-environment"], environment).status).toBe(0);
  for (const changed of [{ FLASHCARD_AI_GENERATION_ENABLED: "true" }, { COURSE_LABS_V2: "true" }, { COMMAND_CENTER_ENABLED: "true" }, { COURSE_PIPELINE_V2_OWNER_ONLY: "" }, { COURSE_PIPELINE_V2_COHORT_PERCENT: "0.0" }]) {
    expect(run(["check-environment"], { ...environment, ...changed }).status).toBe(1);
  }
});


test("the approved owner canary keeps V2 decisions enabled without enrolling non-owners", () => {
  const environment = releaseEnvironment(manifest);
  expect(resolveCoursePipelineFeatureFlags(environment, { uid: "owner-fixture", isOwner: true })).toEqual({
    pipelineV2: true, validationV2: true, repairV2: true, publicationV2: true,
    labsV2: false, visualsV2: false, shadowMode: false,
  });
  for (const actor of [undefined, { uid: "learner-fixture", isOwner: false }]) {
    expect(Object.values(resolveCoursePipelineFeatureFlags(environment, actor))).toEqual([false, false, false, false, false, false, false]);
  }
  expect(environment.COURSE_PIPELINE_V2_OWNER_ONLY).toBe("true");
  expect(environment.COURSE_PIPELINE_V2_COHORT_PERCENT).toBe("0");
});
