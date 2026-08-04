import { readFile, writeFile } from "node:fs/promises";

const wranglerConfigPath = new URL("../dist/server/wrangler.json", import.meta.url);
const wranglerConfig = JSON.parse(await readFile(wranglerConfigPath, "utf8"));
const compatibilityFlags = wranglerConfig.compatibility_flags;
const nodeCompatibilityFlag = ["nodejs", "compat"].join("_");

if (!Array.isArray(compatibilityFlags)) {
  throw new Error("Expected dist/server/wrangler.json to contain compatibility_flags.");
}

const productionCompatibilityFlags = compatibilityFlags.filter(
  (flag) => flag !== nodeCompatibilityFlag,
);

if (productionCompatibilityFlags.length > 0) {
  wranglerConfig.compatibility_flags = productionCompatibilityFlags;
} else {
  delete wranglerConfig.compatibility_flags;
}

await writeFile(wranglerConfigPath, `${JSON.stringify(wranglerConfig)}\n`);
console.log("Prepared Sites package metadata for the production Workers runtime.");
