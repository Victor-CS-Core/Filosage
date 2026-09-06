import { readFileSync } from "node:fs";
import { validReleaseManifest } from "../src/lib/release-capabilities.ts";

export function readReleaseManifest() {
  // An explicit JSON selection also supports controlled local contract fixtures.
  const manifest = JSON.parse(process.env.RELEASE_CAPABILITIES_JSON || readFileSync(new URL("../config/release-capabilities.json", import.meta.url), "utf8"));
  if (!validReleaseManifest(manifest)) throw new Error("Invalid approved release manifest.");
  return manifest;
}
