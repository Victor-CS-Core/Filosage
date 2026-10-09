import "server-only";

/**
 * Resolves Cloudflare bindings (D1, R2, KV) in a way that works both on
 * Workers (via the OpenNext Cloudflare context) and in tests (via an
 * explicit override).
 *
 * On Workers, the OpenNext adapter exposes `getCloudflareContext()`.
 * In tests, call `setTestBindings()` before exercising D1-backed code.
 */

interface TestBindings {
  d1?: unknown;
  r2?: unknown;
  FILOSAGE_D1?: unknown;
  FILOSAGE_R2?: unknown;
}

let testBindings: TestBindings | null = null;

export function setTestBindings(bindings: TestBindings) {
  testBindings = bindings;
}

export function clearTestBindings() {
  testBindings = null;
}

async function cloudflareEnv(): Promise<Record<string, unknown> | null> {
  if (testBindings) return testBindings as Record<string, unknown>;
  try {
    // @opennextjs/cloudflare is installed as a dev dependency for Workers builds.
    const mod = await import("@opennextjs/cloudflare").catch(() => null) as {
      getCloudflareContext?: (opts?: { async?: boolean }) => Promise<{ env?: Record<string, unknown> } | null>;
    } | null;
    const context = await mod?.getCloudflareContext?.({ async: true });
    return (context?.env ?? null) as Record<string, unknown> | null;
  } catch {
    return null;
  }
}

export async function getD1Database(): Promise<unknown | null> {
  const env = await cloudflareEnv();
  return env?.FILOSAGE_D1 ?? null;
}

export async function getR2Bucket(): Promise<unknown | null> {
  const env = await cloudflareEnv();
  return env?.FILOSAGE_R2 ?? null;
}
