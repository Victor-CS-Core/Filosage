/** Reviewed modern capacity: six production processes, each with main + health pools. */
export const modernDatabasePoolMax = 2;
export const databaseHealthPoolMax = 1;
export const productionConnectionLimit = 18;
export const qaConnectionAllowance = 11;
export const operationalConnectionAllowance = 6;
export const requiredUnreservedConnections = productionConnectionLimit + qaConnectionAllowance + operationalConnectionAllowance;

/** Never let Number coercion, pg defaults or an unreviewed override expand the pool. */
export function databasePoolMaximum(value: string | undefined): number {
  if (value === undefined) return modernDatabasePoolMax;
  if (!/^[1-2]$/.test(value)) throw new Error("DATABASE_POOL_MAX must be 1 or 2 within the reviewed connection budget.");
  return Number(value);
}
