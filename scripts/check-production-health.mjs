const target = process.argv[2] || process.env.PRODUCTION_HEALTH_URL || process.env.NEXT_PUBLIC_SITE_URL;
const expectedVersion = (process.argv[3] || process.env.EXPECTED_SITE_VERSION || "").trim();
if (!target) {
  console.error("Provide a site URL or set PRODUCTION_HEALTH_URL.");
  process.exit(1);
}
if (!expectedVersion) {
  console.error("Provide the exact deployed Git commit SHA or set EXPECTED_SITE_VERSION.");
  process.exit(1);
}
if (!/^[a-f0-9]{40}$/i.test(expectedVersion)) {
  console.error("Expected production version must be the full 40-character Git commit SHA.");
  process.exit(1);
}

const healthUrl = new URL("/api/health", target).toString();
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10_000);
try {
  const response = await fetch(healthUrl, {
    headers: { "User-Agent": "Erudoza-Release-Check/1.0" },
    signal: controller.signal,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok !== true || body?.checks?.datastore !== true) {
    console.error(`Production health check failed (${response.status}).`);
    process.exitCode = 1;
  } else if (body?.version !== expectedVersion) {
    console.error(`Production version mismatch: expected ${expectedVersion}, received ${body?.version ?? "no version"}.`);
    process.exitCode = 1;
  } else {
    console.log(`Production health is healthy${body.version ? ` (version ${body.version})` : ""}.`);
  }
} catch (error) {
  console.error(`Production health check failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}
