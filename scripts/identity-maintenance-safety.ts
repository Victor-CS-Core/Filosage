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
    if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
      throw new Error("The PostgreSQL maintenance target uses an unsupported protocol.");
    }
    let database: string;
    try {
      database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    } catch {
      throw new Error("The PostgreSQL maintenance target database is invalid.");
    }
    const server = parsed.hostname;
    if (
      !/^[A-Za-z0-9.-]+$/.test(server)
      || !/^[A-Za-z0-9_.-]{1,128}$/.test(database)
    ) {
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
