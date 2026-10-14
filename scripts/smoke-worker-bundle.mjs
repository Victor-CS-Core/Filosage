#!/usr/bin/env node
/**
 * Workers bundle smoke test — the deployability gate CI cannot get from
 * `next dev` suites.
 *
 * Builds the exact artifact the deploy script uploads (the OpenNext build
 * via scripts/build-cloudflare.mjs, bundled by the same
 * `wrangler deploy --dry-run` the deployer uses), runs it in a local
 * Workers runtime, and exercises:
 *   - GET /                  (SSR page)
 *   - GET /api/health        (dynamic API route)
 *   - GET /api/health/ready  (readiness against local D1 bindings with the
 *                             production schema applied)
 *   - GET /<unknown route>   (404)
 *
 * Any worker initialization exception (e.g. the loadManifest
 * preview-props failure, opennextjs/opennextjs-cloudflare#1355), any 5xx
 * on those routes, or a not-ready readiness payload fails the smoke.
 *
 * Harness notes: the bundle bytes under test are exactly what the deploy
 * script uploads; the harness config mirrors the staging bindings and the
 * repo's own compatibility date/flags. Secret bindings are replaced with
 * dummy plain values — readiness checks presence and shape, never the
 * values.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO = process.cwd();
const WORK = join(REPO, ".worker-smoke");
const PORT = 8891;
const BASE = `http://127.0.0.1:${PORT}`;

function run(command, args, options = {}) {
  console.log(`[smoke] $ ${command} ${args.join(" ")}`);
  execFileSync(command, args, { stdio: "inherit", ...options });
}

function wranglerConfig() {
  const root = JSON.parse(readFileSync(join(REPO, "wrangler.jsonc"), "utf8"));
  const staging = root.env.staging;
  const vars = { ...staging.vars };
  // Secret NAMES the worker configuration requires in production shape;
  // dummy values only — nothing here is a credential. Padded past the
  // app's minimum secret length (32) so readiness shape checks pass.
  for (const name of ["ACTIVITY_RECEIPT_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "IDENTITY_LINK_HMAC_SECRET", "OPENAI_API_KEY", "OWNER_EMAIL"]) {
    vars[name] = `smoke-${name.toLowerCase()}-0123456789abcdef0123456789abcdef`;
  }
  return {
    name: "filosage-smoke",
    main: join(WORK, "bundle", "worker.js"),
    compatibility_date: root.compatibility_date,
    compatibility_flags: root.compatibility_flags,
    assets: { directory: join(REPO, ".open-next", "assets"), binding: "ASSETS" },
    d1_databases: [{ binding: "FILOSAGE_D1", database_name: "filosage-db-staging", database_id: "6805f7f9-610a-4699-9253-65bdfc88de40" }],
    r2_buckets: [{ binding: "FILOSAGE_R2", bucket_name: "filosage-assets-staging" }],
    vars,
  };
}

async function waitForServer(deadlineMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    try {
      const response = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(10_000) });
      if (response.status > 0) return true;
    } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  return false;
}

const failures = [];
async function check(name, fn) {
  try {
    await fn();
    console.log(`[smoke] PASS ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(`[smoke] FAIL ${name}: ${error.message}`);
  }
}
function expect(condition, message) {
  if (!condition) throw new Error(message);
}

let server;
try {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });

  if (!process.argv.includes("--skip-build")) {
    run("npm", ["run", "build:cloudflare"], { env: { ...process.env, DEPLOYMENT_ENVIRONMENT: "qa" } });
  }
  if (!existsSync(join(REPO, ".open-next", "worker.js"))) throw new Error(".open-next build output missing");
  run("npx", ["wrangler", "deploy", "--dry-run", "--outdir", join(WORK, "bundle"), "--env", "staging", "--config", "wrangler.jsonc"]);

  const configPath = join(WORK, "wrangler-smoke.json");
  writeFileSync(configPath, JSON.stringify(wranglerConfig(), null, 2));

  run("npx", ["wrangler", "d1", "execute", "filosage-db-staging", "--local", "--config", configPath, "--file", join(REPO, "infra", "cloudflare", "d1", "001_document_store.sql"), "--yes"]);

  console.log("[smoke] starting local Workers runtime…");
  server = spawn("npx", ["wrangler", "dev", "--config", configPath, "--port", String(PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  server.stdout.on("data", (chunk) => process.stdout.write(`[wrangler] ${chunk}`));
  server.stderr.on("data", (chunk) => process.stderr.write(`[wrangler] ${chunk}`));
  expect(await waitForServer(), "worker did not respond within 180s (initialization failure?)");

  await check("SSR page GET / returns 200 HTML", async () => {
    const response = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(30_000) });
    expect(response.status === 200, `status ${response.status}`);
    const body = await response.text();
    expect(body.includes("<html"), "response is not an HTML page");
  });
  await check("dynamic API GET /api/health returns ok", async () => {
    const response = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(30_000) });
    expect(response.status === 200, `status ${response.status}`);
    const body = await response.json();
    expect(body.ok === true, `payload ${JSON.stringify(body).slice(0, 160)}`);
  });
  await check("readiness GET /api/health/ready is healthy against local D1", async () => {
    const response = await fetch(`${BASE}/api/health/ready`, { signal: AbortSignal.timeout(30_000) });
    const body = await response.json();
    expect(response.status === 200, `status ${response.status} payload ${JSON.stringify(body).slice(0, 160)}`);
    expect(body.checks?.configuration === true, "configuration check not healthy");
    expect(body.checks?.datastore === true, "datastore check not healthy");
  });
  await check("unknown route returns 404", async () => {
    const response = await fetch(`${BASE}/worker-smoke-no-such-route`, { signal: AbortSignal.timeout(30_000) });
    expect(response.status === 404, `status ${response.status}`);
  });
} finally {
  if (server) {
    try { process.kill(-server.pid, "SIGTERM"); } catch { /* already gone */ }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* already gone */ }
  }
}

if (failures.length > 0) {
  console.error(`[smoke] BUNDLE SMOKE FAILED: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("[smoke] BUNDLE SMOKE PASSED");
