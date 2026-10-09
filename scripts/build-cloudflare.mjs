#!/usr/bin/env node
/**
 * Build for Cloudflare Workers.
 *
 * Two source swaps are needed for the Workers build:
 *
 * 1. Next 16 runs `proxy.ts` on the Node.js runtime unconditionally, which
 *    @opennextjs/cloudflare cannot bundle ("Node.js middleware is not currently
 *    supported"). The deprecated `middleware.ts` convention still defaults to
 *    the Edge runtime, so `src/proxy.ts` is moved aside and
 *    `src/middleware.cloudflare.ts` is installed as `src/middleware.ts`.
 *
 * 2. `postgres-document-store.ts` imports the `pg` driver, which cannot be
 *    bundled for Workers (Node.js TCP sockets). On Cloudflare the D1 backend
 *    is always active, so the pg module is dead code — but the bundler still
 *    follows the dynamic `import()` in `document-store.ts`. Swapping in the
 *    stub keeps `pg` out of the Worker bundle entirely.
 *
 * Both swaps are restored after the build. Set DEPLOYMENT_ENVIRONMENT in the
 * build environment to control the middleware's QA robots tag (inlined at
 * build time).
 */
import { copyFileSync, rmSync, renameSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const swaps = [
  { original: "src/proxy.ts", backup: "src/proxy.ts.cfbuild-bak", replacement: "src/middleware.cloudflare.ts", target: "src/middleware.ts" },
  { original: "src/lib/postgres-document-store.ts", backup: "src/lib/postgres-document-store.ts.cfbuild-bak", replacement: "src/lib/postgres-document-store.cloudflare-stub.ts", target: "src/lib/postgres-document-store.ts" },
];

// next.config.ts sets a CSP header without a nonce via headers(). The edge
// middleware sets the full CSP with a per-request nonce. If both reach the
// response, browsers enforce the stricter (nonce-less) one and block inline
// scripts. Strip the CSP from next.config for the Workers build.
const NEXT_CONFIG = "next.config.ts";
const NEXT_CONFIG_BACKUP = "next.config.ts.cfbuild-bak";
const CSP_HEADERS_CALL = "headers: securityHeaders(process.env.NODE_ENV === \"development\", undefined, false),";
const CSP_HEADERS_REPLACEMENT = "headers: securityHeaders(process.env.NODE_ENV === \"development\", undefined, false).filter((h) => h.key !== \"Content-Security-Policy\"),";

function sh(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

let restored = false;
function restore() {
  if (restored) return;
  restored = true;
  for (const s of swaps) {
    if (existsSync(s.target) && s.target !== s.original) rmSync(s.target);
    if (existsSync(s.backup)) {
      renameSync(s.backup, s.original);
      console.log(`[build:cloudflare] restored ${s.original}`);
    }
  }
  if (existsSync(NEXT_CONFIG_BACKUP)) {
    renameSync(NEXT_CONFIG_BACKUP, NEXT_CONFIG);
    console.log(`[build:cloudflare] restored ${NEXT_CONFIG}`);
  }
}
process.on("exit", restore);
process.on("SIGINT", () => { restore(); process.exit(130); });

try {
  for (const s of swaps) {
    if (!existsSync(s.original)) throw new Error(`${s.original} not found`);
    if (!existsSync(s.replacement)) throw new Error(`${s.replacement} not found`);
    renameSync(s.original, s.backup);
    copyFileSync(s.replacement, s.target);
    console.log(`[build:cloudflare] swapped ${s.original} -> ${s.target}`);
  }
  // Strip the nonce-less CSP from next.config.ts (middleware sets the real one).
  const nextConfig = readFileSync(NEXT_CONFIG, "utf8");
  if (!nextConfig.includes(CSP_HEADERS_CALL)) throw new Error("next.config.ts CSP pattern not found");
  renameSync(NEXT_CONFIG, NEXT_CONFIG_BACKUP);
  writeFileSync(NEXT_CONFIG, nextConfig.replace(CSP_HEADERS_CALL, CSP_HEADERS_REPLACEMENT));
  console.log(`[build:cloudflare] stripped CSP from ${NEXT_CONFIG}`);
  sh("npx opennextjs-cloudflare build");
  console.log("[build:cloudflare] OpenNext build succeeded");
} finally {
  restore();
}
