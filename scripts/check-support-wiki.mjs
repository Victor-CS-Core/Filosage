import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const manifestPath = resolve(root, "docs/support/wiki-feature-map.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const articleDirectory = resolve(root, manifest.articleDirectory);
const validCategories = new Set(["start", "courses", "practice", "progress", "account", "trust", "plans"]);

function fail(messages) {
  for (const message of messages) process.stderr.write(`Support wiki: ${message}\n`);
  process.exit(1);
}

function extractArray(source, property) {
  const propertyIndex = source.search(new RegExp(`${property}:\\s*\\[`));
  if (propertyIndex < 0) return [];
  const openIndex = source.indexOf("[", propertyIndex);
  let inString = false;
  let escaped = false;
  for (let index = openIndex + 1; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      continue;
    }
    if (character === "]" && !inString) {
      return [...source.slice(openIndex + 1, index).matchAll(/"([^"]+)"/g)].map((item) => item[1]);
    }
  }
  return [];
}

const articleFiles = readdirSync(articleDirectory)
  .filter((name) => name.endsWith(".ts") && name !== "index.ts")
  .sort();
const articles = articleFiles.map((file) => {
  const source = readFileSync(resolve(articleDirectory, file), "utf8");
  const slug = source.match(/slug:\s*"([^"]+)"/)?.[1];
  const category = source.match(/category:\s*"([^"]+)"/)?.[1];
  const reviewedOn = source.match(/reviewedOn:\s*"([^"]+)"/)?.[1];
  return {
    file,
    source,
    slug,
    category,
    reviewedOn,
    related: extractArray(source, "related"),
    sources: extractArray(source, "sources"),
  };
});

const errors = [];
const slugs = new Set();
for (const article of articles) {
  if (!article.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug)) errors.push(`${article.file} has an invalid or missing slug.`);
  if (article.slug && slugs.has(article.slug)) errors.push(`Duplicate article slug: ${article.slug}.`);
  if (article.slug) slugs.add(article.slug);
  if (!validCategories.has(article.category)) errors.push(`${article.file} has an invalid support category.`);
  if (!article.reviewedOn || Number.isNaN(Date.parse(`${article.reviewedOn}T00:00:00Z`))) errors.push(`${article.file} has an invalid reviewedOn date.`);
  if (!article.sources.length) errors.push(`${article.file} does not identify any evidence source.`);
  for (const source of article.sources) {
    if (!existsSync(resolve(root, source))) errors.push(`${article.file} references missing evidence source ${source}.`);
  }
}

for (const article of articles) {
  for (const related of article.related) {
    if (!slugs.has(related)) errors.push(`${article.file} references missing related article ${related}.`);
  }
  for (const match of article.source.matchAll(/\/support\/articles\/([a-z0-9-]+)/g)) {
    if (!slugs.has(match[1])) errors.push(`${article.file} links to missing article ${match[1]}.`);
  }
}

for (const entry of manifest.features) {
  if (!entry.feature || !Array.isArray(entry.sources) || !entry.sources.length) errors.push("Every feature-map entry needs a name and at least one source.");
  for (const slug of entry.articles ?? []) {
    if (!slugs.has(slug)) errors.push(`Feature map references missing article ${slug}.`);
  }
}

const args = process.argv.slice(2);
const changedFiles = [];
let base = null;
let staleAfter = null;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--base") base = args[index + 1] ?? null;
  if (args[index] === "--changed") changedFiles.push((args[index + 1] ?? "").replaceAll("\\", "/"));
  if (args[index] === "--stale-after") staleAfter = Number(args[index + 1]);
}

if (base) {
  const diff = spawnSync("git", ["diff", "--name-only", `${base}...HEAD`], { cwd: root, encoding: "utf8" });
  if (diff.status !== 0) errors.push(`could not compare changes with ${base}: ${diff.stderr.trim()}`);
  else changedFiles.push(...diff.stdout.split(/\r?\n/).filter(Boolean).map((file) => file.replaceAll("\\", "/")));
}

if (Number.isFinite(staleAfter)) {
  const now = Date.now();
  for (const article of articles) {
    if (!article.reviewedOn) continue;
    const ageDays = Math.floor((now - Date.parse(`${article.reviewedOn}T00:00:00Z`)) / 86_400_000);
    if (ageDays > staleAfter) errors.push(`${article.slug} was last reviewed ${ageDays} days ago; the limit is ${staleAfter}.`);
  }
}

function sourceMatches(file, source) {
  return source.endsWith("/") ? file.startsWith(source) : file === source;
}

if (changedFiles.length) {
  const changed = [...new Set(changedFiles.filter(Boolean))];
  const changedArticleSlugs = new Set(changed
    .filter((file) => file.startsWith(`${manifest.articleDirectory}/`) && file.endsWith(".ts"))
    .map((file) => file.slice(`${manifest.articleDirectory}/`.length, -3)));
  const affected = manifest.features.filter((entry) => changed.some((file) => entry.sources.some((source) => sourceMatches(file, source))));
  const missing = affected.filter((entry) => !entry.articles.some((slug) => changedArticleSlugs.has(slug)));
  const prBody = process.env.SUPPORT_WIKI_PR_BODY ?? "";
  const noImpact = /Wiki impact:\s*none/i.test(prBody);
  const rationale = prBody.match(/Wiki rationale:\s*(.+)/i)?.[1]?.trim() ?? "";
  const validRationale = noImpact && rationale.length >= 20 && !/explain why|n\/a|none|todo/i.test(rationale);
  const excludedPagePrefixes = manifest.excludedPagePrefixes ?? [];
  const changedPages = changed.filter((file) => file === "src/app/page.tsx" || (file.startsWith("src/app/") && file.endsWith("/page.tsx")));
  const unmappedPages = changedPages.filter((file) => (
    !excludedPagePrefixes.some((prefix) => file.startsWith(prefix))
    && !manifest.features.some((entry) => entry.sources.some((source) => sourceMatches(file, source)))
  ));
  if (unmappedPages.length && !validRationale) {
    errors.push(`learner-facing page changes are missing from the feature map: ${unmappedPages.join(", ")}.`);
  }
  if (missing.length && !validRationale) {
    errors.push(`mapped feature changes need a corresponding article update: ${missing.map((entry) => `${entry.feature} -> ${entry.articles.join(", ")}`).join("; ")}.`);
    errors.push("If public guidance truly did not change, use 'Wiki impact: none' and a concrete 'Wiki rationale:' of at least 20 characters in the pull request.");
  }
}

if (errors.length) fail(errors);
process.stdout.write(`Support wiki validation passed for ${articles.length} articles.\n`);
