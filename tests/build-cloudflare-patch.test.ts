import assert from "node:assert/strict";
import { test } from "node:test";

// Fail-closed contract for scripts/preview-props-patch.mjs: the workaround
// for opennextjs/opennextjs-cloudflare#1355 must inject the build-generated
// preview-props.json into exactly one generated loadManifest registry, and
// must refuse (failing the build) on any deviation instead of shipping a
// silently unpatched or double-patched bundle.
const { patchHandlerSource } = await import("../scripts/preview-props-patch.mjs");

const HANDLER = [
  "function loadManifest(path2, shouldCache) {",
  '  if (path2.endsWith("/server/app-paths-manifest.json")) return {"pages":{}};',
  '  { let p = path2.replace(/\\.json$/, ""); if (p.endsWith("prefetch-hints")) return {}; }',
  "  throw new Error(`Unexpected loadManifest(${path2}) call!`);",
  "}",
].join("\n");

const PROPS = JSON.stringify({ previewModeId: "id-1", previewModeSigningKey: "sign", previewModeEncryptionKey: "enc" });

test("injects the build-generated preview-props before the registry throw", () => {
  const patched = patchHandlerSource(HANDLER, PROPS);
  const clause = 'if(path2.endsWith("/server/preview-props.json"))return {"previewModeId":"id-1","previewModeSigningKey":"sign","previewModeEncryptionKey":"enc"};';
  assert.ok(patched.includes(clause), "clause with the exact build-generated content is inserted");
  assert.ok(patched.indexOf(clause) < patched.indexOf("Unexpected loadManifest"), "clause precedes the throw");
  assert.ok(patched.includes('path2.endsWith("/server/app-paths-manifest.json")'), "existing registry clauses are preserved");
  // The patched loader resolves preview-props instead of throwing.
  const loadManifest = new Function(`${patched}; return loadManifest;`)() as (path: string) => unknown;
  assert.deepEqual(loadManifest("/.next/server/preview-props.json"), JSON.parse(PROPS));
  assert.throws(() => loadManifest("/.next/server/unknown.json"), /Unexpected loadManifest/);
});

test("fails when the registry anchor is missing", () => {
  const noAnchor = HANDLER.replace("  throw new Error(`Unexpected loadManifest(${path2}) call!`);\n", "");
  assert.throws(() => patchHandlerSource(noAnchor, PROPS), /expected exactly one loadManifest registry anchor, found 0/);
});

test("fails when the registry anchor is duplicated", () => {
  const duplicated = `${HANDLER}\n${HANDLER}`;
  assert.throws(() => patchHandlerSource(duplicated, PROPS), /expected exactly one loadManifest registry anchor, found 2/);
});

test("fails when preview-props is already served (upstream fixed or double patch)", () => {
  const already = patchHandlerSource(HANDLER, PROPS);
  assert.throws(() => patchHandlerSource(already, PROPS), /already serves preview-props\.json/);
});

test("fails on invalid preview-props JSON", () => {
  assert.throws(() => patchHandlerSource(HANDLER, "{ not json"), /not valid JSON/);
  assert.throws(() => patchHandlerSource(HANDLER, "[1,2]"), /must contain a JSON object/);
});

test("captures the minified parameter name instead of assuming it", () => {
  const renamed = HANDLER.replaceAll("path2", "p9");
  const patched = patchHandlerSource(renamed, PROPS);
  assert.ok(patched.includes('if(p9.endsWith("/server/preview-props.json"))'), "clause uses the handler's own parameter name");
});
