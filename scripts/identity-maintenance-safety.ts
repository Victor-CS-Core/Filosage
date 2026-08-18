export function identityMaintenanceTarget(
  env: Record<string, string | undefined> = process.env,
) {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (databaseUrl) {
    let parsed: URL;
    try {
      parsed = new URL(databaseUrl);
    } catch {
      throw new Error("The PostgreSQL maintenance target is invalid.");
    }
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    const server = env.AZURE_POSTGRES_SERVER_NAME?.trim() || parsed.hostname;
    if (!server || !database) {
      throw new Error("The PostgreSQL maintenance target is incomplete.");
    }
    return `postgres:${server}/${database}`;
  }
  const project = env.FIREBASE_PROJECT_ID?.trim();
  if (project) return `firestore:${project}`;
  throw new Error("No supported identity-maintenance datastore is configured.");
}

export function assertIdentityMaintenanceWriteTarget(
  args: string[],
  actualTarget: string,
  env: Record<string, string | undefined> = process.env,
) {
  const expected = args.find((value) => (
    value.startsWith("--expected-target=")
  ))?.slice(18).trim();
  if (!expected || expected !== actualTarget) {
    throw new Error("Write mode requires the exact target to match the configured datastore.");
  }
  if (!["qa", "production"].includes(env.OPERATIONS_ENVIRONMENT?.trim() ?? "")) {
    throw new Error("Write mode requires OPERATIONS_ENVIRONMENT=qa or production.");
  }
}
