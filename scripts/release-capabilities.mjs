import { readFileSync } from "node:fs";
import {
  observedReleaseCapabilities, releaseEnvironment, releaseEvidenceMatches,
  releaseSelectionMatches, validReleaseDigest,
} from "../src/lib/release-capabilities.ts";
import { readReleaseManifest } from "./release-manifest.mjs";

try {
  const [command, ...args] = process.argv.slice(2);
  const manifest = readReleaseManifest();
  if (command === "environment") {
    for (const [key, value] of Object.entries(releaseEnvironment(manifest))) console.log(`${key}=${value}`);
  } else if (command === "check-environment") {
    if (!releaseSelectionMatches(manifest.capabilities, observedReleaseCapabilities(process.env))) throw new Error();
    console.log("Build/runtime capabilities match the approved manifest.");
  } else if (command === "create-evidence") {
    const [sha, imageDigest, productionOrigin, qaOrigin, qaAuthenticationMode] = args;
    const evidence = { schemaVersion: 1, sha, imageDigest, manifest, productionOrigin, qaOrigin, qaAuthenticationMode };
    if (!releaseEvidenceMatches(evidence, sha, manifest, productionOrigin)) throw new Error();
    console.log(JSON.stringify(evidence, null, 2));
  } else if (command === "verify-evidence") {
    const [file, sha, productionOrigin] = args;
    const source = readFileSync(file, "utf8");
    if (source.length > 16_384) throw new Error();
    const evidence = JSON.parse(source);
    if (!releaseEvidenceMatches(evidence, sha, manifest, productionOrigin)) throw new Error();
    console.log(`EXPECTED_IMAGE_DIGEST=${evidence.imageDigest}`);
    console.log(`QA_AUTH_MODE=${evidence.qaAuthenticationMode}`);
    console.log(`QA_EVIDENCE_ORIGIN=${evidence.qaOrigin}`);
  } else if (command === "check-image") {
    const [repository, digest, observed] = args;
    if (!/^[a-z0-9]+\.azurecr\.io\/filosage$/.test(repository ?? "") || !validReleaseDigest(digest) || observed !== `${repository}@${digest}`) throw new Error();
    console.log("Deployed image matches the QA-approved digest.");
  } else {
    throw new Error();
  }
} catch {
  console.error("Release capability selection or candidate evidence is invalid or mismatched.");
  process.exitCode = 1;
}
