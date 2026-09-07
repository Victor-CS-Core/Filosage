import assert from "node:assert/strict";
import { test } from "node:test";
import { courseGenerationConfiguration } from "../../src/lib/course-generation-configuration.ts";
import { generationFingerprint } from "../../src/lib/generation-operations.ts";

test("course configuration changes when resolved lab or visual policy changes", () => {
  const saved = { pipeline: process.env.COURSE_PIPELINE_V2, labs: process.env.COURSE_LABS_V2, visuals: process.env.COURSE_VISUALS_V2 };
  const account = { uid: "local-owner", isOwner: true };
  try {
    process.env.COURSE_PIPELINE_V2 = "true";
    process.env.COURSE_LABS_V2 = "false";
    process.env.COURSE_VISUALS_V2 = "false";
    const before = generationFingerprint(courseGenerationConfiguration(account));
    process.env.COURSE_LABS_V2 = "true";
    assert.notEqual(generationFingerprint(courseGenerationConfiguration(account)), before);
    process.env.COURSE_LABS_V2 = "false";
    process.env.COURSE_VISUALS_V2 = "true";
    assert.notEqual(generationFingerprint(courseGenerationConfiguration(account)), before);
    process.env.COURSE_PIPELINE_V2 = "false";
    const disabled = generationFingerprint(courseGenerationConfiguration(account));
    process.env.COURSE_LABS_V2 = "true";
    process.env.COURSE_VISUALS_V2 = "false";
    assert.equal(generationFingerprint(courseGenerationConfiguration(account)), disabled);
  } finally {
    for (const [key, value] of [["COURSE_PIPELINE_V2", saved.pipeline], ["COURSE_LABS_V2", saved.labs], ["COURSE_VISUALS_V2", saved.visuals]]) {
      if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    }
  }
});
