import { readFile, writeFile } from "node:fs/promises";

const wranglerConfigPath = new URL("../dist/server/wrangler.json", import.meta.url);
const wranglerConfig = JSON.parse(await readFile(wranglerConfigPath, "utf8"));
const compatibilityFlags = wranglerConfig.compatibility_flags;

if (!Array.isArray(compatibilityFlags)) {
  throw new Error("Expected dist/server/wrangler.json to contain compatibility_flags.");
}

wranglerConfig.compatibility_flags = compatibilityFlags.filter(
  (flag) => flag !== "nodejs_compat",
);

await writeFile(wranglerConfigPath, `${JSON.stringify(wranglerConfig)}\n`);
console.log("Prepared Sites package metadata for the production Workers runtime.");
