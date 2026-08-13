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
const attempts = 12;
let lastFailure = "unknown error";
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(healthUrl, {
      headers: { "User-Agent": "Filosage-Release-Check/1.0" },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (response.ok && body?.ok === true && body?.checks?.datastore === true && body?.version === expectedVersion) {
      console.log(`Production health is healthy (version ${body.version}).`);
      process.exit(0);
    }
    lastFailure = body?.version && body.version !== expectedVersion
      ? `version mismatch: expected ${expectedVersion}, received ${body.version}`
      : `health endpoint returned ${response.status}`;
  } catch (error) {
    lastFailure = error instanceof Error ? error.message : "unknown error";
  } finally {
    clearTimeout(timeout);
  }
  if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 10_000));
}
console.error(`Production health check failed after ${attempts} attempts: ${lastFailure}`);
process.exit(1);
