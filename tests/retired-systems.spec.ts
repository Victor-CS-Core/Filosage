import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { RETIRED_SYSTEM_NAMES } from "./fixtures/retired-system-names";

test("tracked files do not mention retired product or datastore names", () => {
  const leftovers: string[] = [];
  for (const name of RETIRED_SYSTEM_NAMES) {
    const result = spawnSync(
      "git",
      ["grep", "-n", "-I", "-i", "-F", name, "--", "."],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    if (result.status === 0 && result.stdout.trim()) {
      leftovers.push(`${name}\n${result.stdout.trim()}`);
    } else {
      expect(result.status, result.stderr).toBe(1);
    }
  }
  expect(leftovers.join("\n\n")).toBe("");
});

test("hosted document access never calls a retired datastore HTTP API", async () => {
  const { readFile } = await import("node:fs/promises");
  const store = await readFile("src/lib/document-store.ts", "utf8");
  expect(store).toContain("postgresDocumentStoreJson");
  expect(store).toContain("localDocumentStoreJson");
  expect(store).not.toContain("googleapis.com");
  expect(store).not.toContain("oauth2.googleapis.com/token");
});
