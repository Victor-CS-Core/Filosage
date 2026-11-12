import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { resolveCoursePipelineFeatureFlags } from "../src/lib/course-pipeline/feature-policy";
import {
  observedReleaseCapabilities,
  releaseCapabilitiesMatch,
  releaseEnvironment,
  releaseSelectionMatches,
  validReleaseManifest,
} from "../src/lib/release-capabilities";

const manifest = JSON.parse(readFileSync(resolve("config/release-capabilities.json"), "utf8"));
for (const [decks, generation] of [[false, false], [true, false], [true, true]]) {
  test(`approved selection ${decks}/${generation} round trips through build and runtime values`, () => {
    const selected = { ...manifest, capabilities: { ...manifest.capabilities, flashcardDecks: decks, flashcardGeneration: generation } };
    expect(releaseCapabilitiesMatch(selected.capabilities, selected.capabilities)).toBe(true);
    expect(releaseSelectionMatches(selected.capabilities, observedReleaseCapabilities(releaseEnvironment(selected)))).toBe(true);
    expect(releaseEnvironment(selected)).toMatchObject({
      FLASHCARD_DECKS_ENABLED: String(decks),
      FLASHCARD_AI_GENERATION_ENABLED: String(generation),
    });
  });
}

test("capabilities reject missing, nonboolean, unexpected, opposite, and invalid dependency states", () => {
  for (const value of [null, [], {}, { flashcardDecks: false }, { flashcardDecks: "false", flashcardGeneration: false }, { flashcardDecks: false, flashcardGeneration: true }]) {
    expect(releaseCapabilitiesMatch(manifest.capabilities, value)).toBe(false);
  }
  for (const change of [{ flashcardDecks: !manifest.capabilities.flashcardDecks }, { flashcardGeneration: !manifest.capabilities.flashcardGeneration }, { pipelineV2: "false" }, { labsV2: true }, { unexpected: false }, { pipelineCohortPercent: "0" }]) {
    expect(releaseSelectionMatches(manifest.capabilities, { ...manifest.capabilities, ...change })).toBe(false);
  }
  for (const value of ["", "TRUE", "0", " false ", undefined]) {
    expect(releaseSelectionMatches(manifest.capabilities, observedReleaseCapabilities({ ...releaseEnvironment(manifest), FLASHCARD_DECKS_ENABLED: value }))).toBe(false);
  }
  expect(validReleaseManifest({ ...manifest, capabilities: { ...manifest.capabilities, flashcardDecks: false, flashcardGeneration: true } })).toBe(false);
  const invalid = { flashcardDecks: false, flashcardGeneration: true };
  expect(releaseCapabilitiesMatch(invalid, invalid)).toBe(false);
  expect(releaseCapabilitiesMatch({ flashcardDecks: "false", flashcardGeneration: false } as never, manifest.capabilities)).toBe(false);
});

test("build refuses unselected, missing, or invalid runtime switches before Next builds", () => {
  const environment = { ...process.env, ...releaseEnvironment(manifest) };
  expect(releaseSelectionMatches(manifest.capabilities, observedReleaseCapabilities(environment))).toBe(true);
  for (const changed of [{ FLASHCARD_AI_GENERATION_ENABLED: String(!manifest.capabilities.flashcardGeneration) }, { COURSE_LABS_V2: "true" }, { COMMAND_CENTER_ENABLED: "true" }, { COURSE_PIPELINE_V2_OWNER_ONLY: "" }, { COURSE_PIPELINE_V2_COHORT_PERCENT: "0.0" }]) {
    expect(releaseSelectionMatches(manifest.capabilities, observedReleaseCapabilities({ ...environment, ...changed }))).toBe(false);
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


test("approved lesson flashcards release enables both decks and grounded generation", () => {
  expect(manifest.capabilities.flashcardDecks).toBe(true);
  expect(manifest.capabilities.flashcardGeneration).toBe(true);
  expect(releaseEnvironment(manifest)).toMatchObject({
    FLASHCARD_DECKS_ENABLED: "true", FLASHCARD_AI_GENERATION_ENABLED: "true",
  });
});

test("production release flashcards preserve tier, suspension and quota contracts", () => {
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--test", "--test-reporter=tap", "tests/fixtures/flashcard-release-behavior.ts"], {
    encoding: "utf8", timeout: 30_000,
    env: { ...process.env, ...releaseEnvironment(manifest), NODE_ENV: "production" },
  });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  expect(result.stdout).toContain("# pass 2");
  expect(result.stdout).toContain("# fail 0");
});
