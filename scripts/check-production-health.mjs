const target = process.argv[2] || process.env.PRODUCTION_HEALTH_URL || process.env.NEXT_PUBLIC_SITE_URL;
if (!target) {
  console.error("Provide a site URL or set PRODUCTION_HEALTH_URL.");
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
  } else {
    console.log(`Production health is healthy${body.version ? ` (version ${body.version})` : ""}.`);
  }
} catch (error) {
  console.error(`Production health check failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}
