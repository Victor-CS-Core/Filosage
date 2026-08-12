/**
 * Azure Container Apps and local Node processes expose configuration through
 * `process.env`. The optional runtime-owned object remains for legacy packaged
 * preview tests while the Azure migration branch is being validated.
 */
export type RuntimeEnvironmentBindings = Record<string, string | undefined>;

declare global {
  var __FILOSAGE_RUNTIME_ENV__: RuntimeEnvironmentBindings | undefined;
}

export function installRuntimeEnvironment(bindings: Record<string, unknown>) {
  globalThis.__FILOSAGE_RUNTIME_ENV__ = Object.fromEntries(
    Object.entries(bindings).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : []),
  );
}

export const serverEnvironment = new Proxy({} as NodeJS.ProcessEnv, {
  get(_target, property) {
    if (typeof property !== "string") return undefined;
    const runtimeValue = globalThis.__FILOSAGE_RUNTIME_ENV__?.[property];
    return runtimeValue ?? process.env[property];
  },
});
