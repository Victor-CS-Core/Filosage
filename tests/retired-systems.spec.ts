import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RETIRED_SYSTEM_NAMES } from "./fixtures/retired-system-names";

function trackedRetiredNames(directory: string): string[] {
  const leftovers: string[] = [];
  for (const name of RETIRED_SYSTEM_NAMES) {
    const result = spawnSync(
      "git",
      ["grep", "-l", "-z", "-I", "-i", "-F", "-e", name, "--", "."],
      { cwd: directory, encoding: "utf8" },
    );
    const diagnostics = [
      `Retired-name scan for ${JSON.stringify(name)}: exit=${result.status}, signal=${result.signal}`,
      result.error?.message,
      result.stderr,
    ].filter(Boolean).join("\n");
    expect(result.error, diagnostics).toBeUndefined();
    expect([0, 1], diagnostics).toContain(result.status);
    if (result.status === 0) {
      const files = result.stdout.split("\0").filter(Boolean);
      expect(files.length, diagnostics).toBeGreaterThan(0);
      leftovers.push(`${name}\n${files.join("\n")}`);
    }
  }
  return leftovers;
}

test("tracked files do not mention retired product or datastore names", () => {
  expect(trackedRetiredNames(process.cwd()).join("\n\n")).toBe("");
});

test("retired-name scanning reports oversized minified files without buffering their contents", () => {
  const directory = mkdtempSync(join(tmpdir(), "filosage-retired-scan-"));
  try {
    const init = spawnSync("git", ["init", "--quiet", directory], { encoding: "utf8" });
    expect(init.status, init.error?.message ?? init.stderr).toBe(0);
    const name = RETIRED_SYSTEM_NAMES[1];
    writeFileSync(join(directory, "large.json"), JSON.stringify({ value: `${"x".repeat(2_000_000)}${name}` }));
    const add = spawnSync("git", ["add", "--", "large.json"], { cwd: directory, encoding: "utf8" });
    expect(add.status, add.error?.message ?? add.stderr).toBe(0);
    expect(trackedRetiredNames(directory)).toEqual([`${name}\nlarge.json`]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("hosted document access never calls a retired datastore HTTP API", async () => {
  const { readFile } = await import("node:fs/promises");
  const store = await readFile("src/lib/document-store.ts", "utf8");
  expect(store).toContain("postgresDocumentStoreJson");
  expect(store).toContain("localDocumentStoreJson");
  expect(store).not.toContain("googleapis.com");
  expect(store).not.toContain("oauth2.googleapis.com/token");
});
