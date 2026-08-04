/**
 * Sites supplies runtime variables and secrets as Worker bindings. Normally
 * nodejs_compat mirrors those bindings into process.env, but the current Sites
 * publish bridge rejects that flag for newer compatibility dates. Keep the
 * Next.js server runtime working by performing the narrow string-binding copy
 * at the Worker boundary instead.
 */
export function populateProcessEnvFromBindings(bindings: Record<string, unknown>) {
  for (const [key, value] of Object.entries(bindings)) {
    if (typeof value === "string") process.env[key] = value;
  }
}
