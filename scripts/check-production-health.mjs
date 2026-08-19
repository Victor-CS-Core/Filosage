const target = process.argv[2] || process.env.PRODUCTION_HEALTH_URL || process.env.NEXT_PUBLIC_SITE_URL;
const expectedVersion = (process.argv[3] || process.env.EXPECTED_SITE_VERSION || "").trim();
const expectedOriginInput = (process.argv[4] || process.env.EXPECTED_SITE_ORIGIN || "").trim();
const expectedAuthenticationMode = (process.env.EXPECTED_AUTH_MODE || "").trim();
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
const allowedAuthenticationModes = new Set(["direct-google", "external-id", "migration-dual"]);
if (expectedAuthenticationMode && !allowedAuthenticationModes.has(expectedAuthenticationMode)) {
  console.error("EXPECTED_AUTH_MODE must be direct-google, external-id, or migration-dual.");
  process.exit(1);
}
let expectedOrigin = "";
if (expectedOriginInput) {
  try {
    const parsed = new URL(expectedOriginInput);
    if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error();
    expectedOrigin = parsed.origin;
  } catch {
    console.error("Expected site origin must be an HTTPS origin without a path, query, or fragment.");
    process.exit(1);
  }
}

const healthUrl = new URL("/api/health", target).toString();
function boundedInteger(value, fallback, minimum, maximum) {
  const normalized = (value || "").trim();
  if (!/^\d+$/.test(normalized)) return fallback;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

const attempts = boundedInteger(process.env.FILOSAGE_HEALTH_CHECK_ATTEMPTS, 12, 1, 60);
const retryDelayMs = boundedInteger(process.env.FILOSAGE_HEALTH_CHECK_DELAY_MS, 10_000, 0, 60_000);
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
    const originMatches = !expectedOrigin || body?.origin === expectedOrigin;
    const authenticationModeValid = allowedAuthenticationModes.has(body?.authenticationMode);
    const authenticationModeMatches = !expectedAuthenticationMode || body?.authenticationMode === expectedAuthenticationMode;
    if (expectedAuthenticationMode && authenticationModeValid && !authenticationModeMatches) {
      console.error("Production health check failed: authentication mode mismatch.");
      process.exit(1);
    }
    if (
      response.ok
      && body?.ok === true
      && body?.checks?.datastore === true
      && body?.checks?.flashcardDecks === true
      && body?.checks?.flashcardGeneration === true
      && body?.version === expectedVersion
      && originMatches
      && authenticationModeValid
      && authenticationModeMatches
    ) {
      console.log(`Production health is healthy (version ${body.version}, authentication ${body.authenticationMode}).`);
      process.exit(0);
    }
    lastFailure = body?.version && body.version !== expectedVersion
      ? `version mismatch: expected ${expectedVersion}, received ${body.version}`
      : expectedOrigin && body?.origin !== expectedOrigin
        ? `origin mismatch: expected ${expectedOrigin}, received ${body?.origin ?? "none"}`
        : body?.checks?.flashcardDecks === false
          ? "flashcard decks are disabled at runtime"
          : body?.checks?.flashcardDecks !== true
            ? "flashcard deck runtime status is missing"
            : body?.checks?.flashcardGeneration === false
              ? "flashcard AI generation is disabled at runtime"
              : body?.checks?.flashcardGeneration !== true
                ? "flashcard AI generation runtime status is missing"
                : !authenticationModeValid
                  ? "health endpoint returned an invalid authentication mode"
                  : `health endpoint returned ${response.status}`;
  } catch (error) {
    lastFailure = error instanceof Error ? error.message : "unknown error";
  } finally {
    clearTimeout(timeout);
  }
  if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
}
console.error(`Production health check failed after ${attempts} attempts: ${lastFailure}`);
process.exit(1);
