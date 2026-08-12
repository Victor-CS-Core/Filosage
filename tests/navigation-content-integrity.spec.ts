import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, test } from "@playwright/test";

const root = process.cwd();
const sourceRoot = resolve(root, "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const copyBans = [
  { pattern: /\b(?:unlock|unlocks|unlocking)\b/gi, reason: "access copy should name what opens or becomes available" },
  { pattern: /\b(?:learning|learner) journey\b/gi, reason: "journey is vague product copy" },
  { pattern: /\bsource-aware\b/gi, reason: "source status should be described concretely" },
  { pattern: /\b(?:seamless|effortless|revolutionary|game-changing|supercharge|cutting-edge|delve|one-stop|all-in-one)\b/gi, reason: "generic promotional language is not product evidence" },
  { pattern: /right before you would forget|what you have stopped being wrong about|stopped being wrong|at least two reasoning steps/gi, reason: "the claim is not supported by the implementation" },
] as const;

test.describe.configure({ mode: "serial" });

test("keeps fixed product copy specific and evidence-bounded", ({ request }, testInfo) => {
  void request;
  test.skip(testInfo.project.name !== "chromium", "One source-level copy contract is sufficient.");

  const findings: string[] = [];
  for (const file of sourceFiles(sourceRoot)) {
    const source = readFileSync(file, "utf8");
    for (const ban of copyBans) {
      ban.pattern.lastIndex = 0;
      for (const match of source.matchAll(ban.pattern)) {
        const line = source.slice(0, match.index).split("\n").length;
        findings.push(`${relative(root, file)}:${line} ${JSON.stringify(match[0])} — ${ban.reason}`);
      }
    }
  }

  expect(findings, findings.join("\n")).toEqual([]);
});

test("resolves every internal destination discoverable from the public application", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The public navigation crawl runs once in desktop Chromium.");

  const pending = ["/"];
  const discovered = new Set(pending);
  const hashesByRoute = new Map<string, Set<string>>();
  let origin = "";

  while (pending.length) {
    const route = pending.shift()!;
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response, `${route} should return a document response`).not.toBeNull();
    expect(response!.status(), `${route} should resolve`).toBeLessThan(400);
    origin ||= new URL(page.url()).origin;

    const hrefs = await page.locator("a[href]").evaluateAll((links) =>
      links.map((link) => (link as HTMLAnchorElement).href),
    );
    for (const href of hrefs) {
      const destination = new URL(href, page.url());
      if (destination.origin !== origin || !["http:", "https:"].includes(destination.protocol)) continue;
      const destinationRoute = `${destination.pathname}${destination.search}` || "/";
      if (destination.hash) {
        const hashes = hashesByRoute.get(destinationRoute) ?? new Set<string>();
        hashes.add(decodeURIComponent(destination.hash.slice(1)));
        hashesByRoute.set(destinationRoute, hashes);
      }
      if (!discovered.has(destinationRoute)) {
        discovered.add(destinationRoute);
        pending.push(destinationRoute);
      }
    }

    expect(discovered.size, "The crawl exceeded its bounded route budget.").toBeLessThanOrEqual(100);
  }

  for (const [route, hashes] of hashesByRoute) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${route} should resolve before checking its section links`).toBeLessThan(400);
    for (const id of hashes) {
      const exists = await page.evaluate((targetId) => Boolean(document.getElementById(targetId)), id);
      expect(exists, `${route}#${id} should identify a section`).toBe(true);
    }
  }
});
