/**
 * Cloudflare Workers stub for the PostgreSQL document store.
 *
 * The real `postgres-document-store.ts` imports the `pg` driver, which cannot
 * be bundled for Workers (it requires Node.js TCP sockets). On Cloudflare the
 * D1 backend is always active (`CLOUDFLARE_D1_ENABLED=true`), so this module
 * is dead code — but the bundler still follows the dynamic `import()` in
 * `document-store.ts`. Swapping in this stub keeps `pg` out of the Worker
 * bundle entirely. If the D1 flag were ever off on a Worker, this throws a
 * clear error instead of crashing inside the pg driver.
 *
 * Signatures mirror the real module so type checking passes during the
 * Cloudflare build.
 */

import type pg from "pg";

interface ActiveTransaction {
  client: pg.PoolClient;
  timeout: ReturnType<typeof setTimeout>;
}

declare global {
  var __FILOSAGE_POSTGRES_POOL__: pg.Pool | undefined;
  var __FILOSAGE_POSTGRES_HEALTH_POOL__: pg.Pool | undefined;
  var __FILOSAGE_POSTGRES_TRANSACTIONS__: Map<string, ActiveTransaction> | undefined;
}

function unavailable(): never {
  throw new Error(
    "PostgreSQL document store is unavailable on Cloudflare Workers; " +
      "the D1 backend must be enabled (CLOUDFLARE_D1_ENABLED=true)."
  );
}

export async function checkPostgresDocumentStoreReadiness(): Promise<never> {
  return unavailable();
}

export async function postgresDocumentStoreJson<T>(
  _requestPath: string,
  _init: RequestInit = {},
  _allowNotFound = false,
): Promise<T | null> {
  void _requestPath;
  void _init;
  void _allowNotFound;
  return unavailable();
}
