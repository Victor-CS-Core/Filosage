export function identityMaintenanceTarget(
  env: Record<string, string | undefined> = process.env,
) {
  const databaseId = env.CLOUDFLARE_D1_DATABASE_ID?.trim().toLowerCase();
  if (!databaseId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(databaseId)) {
    throw new Error("A valid Cloudflare D1 maintenance target is required.");
  }
  return `d1:${databaseId}`;
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
