/**
 * Sites exposes variables and secrets as Worker bindings. The Cloudflare Vite
 * plugin intentionally compiles `process.env` to an empty object when
 * nodejs_compat is unavailable, so server code must read those bindings through
 * a runtime-owned object instead. The process environment remains the fallback
 * for Next.js, scripts, and tests outside the Sites Worker.
 */
export type RuntimeEnvironmentBindings = Record<string, string | undefined>;

declare global {
  var __ERUDOZA_RUNTIME_ENV__: RuntimeEnvironmentBindings | undefined;
}

export function installRuntimeEnvironment(bindings: Record<string, unknown>) {
  globalThis.__ERUDOZA_RUNTIME_ENV__ = Object.fromEntries(
    Object.entries(bindings).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : []),
  );
}

export const serverEnvironment = new Proxy({} as NodeJS.ProcessEnv, {
  get(_target, property) {
    if (typeof property !== "string") return undefined;
    const runtimeValue = globalThis.__ERUDOZA_RUNTIME_ENV__?.[property];
    return runtimeValue ?? process.env[property];
  },
});
