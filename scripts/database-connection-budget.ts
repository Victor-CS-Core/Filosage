import { databasePoolMaximum, modernDatabasePoolMax, databaseHealthPoolMax, productionConnectionLimit, qaConnectionAllowance } from "../src/lib/database-connection-budget.ts";
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Zero public traffic does not deactivate a revision or bound its pools. */
export function assertRevisionConnectionBudget(value: unknown, addingCandidate: boolean) {
  if (!Array.isArray(value) || value.some((row) => !object(row) || !object(row.properties) || typeof row.properties.active !== "boolean")) throw new Error("Incomplete active revision inventory.");
  const active = value.filter((row) => row.properties.active);
  if (!active.length || active.length + Number(addingCandidate) > 2) throw new Error("Drain and deactivate the old inactive revision before creating another candidate.");
  const names = new Set();
  let connections = addingCandidate ? 3 * (modernDatabasePoolMax + databaseHealthPoolMax) : 0;
  for (const row of active) {
    if (typeof row.name !== "string" || !/^[a-z0-9-]+--[a-z0-9-]+$/.test(row.name) || names.has(row.name)) throw new Error("Ambiguous revision identity.");
    names.add(row.name);
    const template = row.properties.template;
    if (!object(template) || !object(template.scale) || !Number.isInteger(template.scale.maxReplicas)
      || Number(template.scale.maxReplicas) < 1 || Number(template.scale.maxReplicas) > 3
      || !Array.isArray(template.containers) || template.containers.length !== 1 || !object(template.containers[0])) throw new Error("Unbounded production replica capacity.");
    const entries = template.containers[0].env;
    const pool = Array.isArray(entries) ? entries.filter((entry) => object(entry) && entry.name === "DATABASE_POOL_MAX") : [];
    if (pool.length !== 1 || typeof pool[0].value !== "string" || pool[0].secretRef !== undefined) throw new Error("Every active modern revision must declare its reviewed pool maximum.");
    connections += Number(template.scale.maxReplicas) * (databasePoolMaximum(pool[0].value) + databaseHealthPoolMax);
  }
  if (connections > productionConnectionLimit) throw new Error("Production connection allowance exceeded.");
  return { activeRevisions: active.length, includesFutureCandidate: addingCandidate, maximumConnections: connections };
}

/** Absent QA is allowed only after an authoritative app list proves its absence. */
export function assertQaConnectionBudget(value: unknown) {
  if (!Array.isArray(value)) throw new Error("Incomplete QA revision inventory.");
  let maximumConnections = 0;
  for (const row of value) {
    if (!object(row) || !object(row.properties) || typeof row.properties.active !== "boolean") throw new Error("Incomplete QA revision state.");
    if (!row.properties.active) continue;
    const template = row.properties.template;
    if (!object(template) || !object(template.scale) || !Number.isInteger(template.scale.maxReplicas)
      || Number(template.scale.maxReplicas) < 1 || !Array.isArray(template.containers)
      || template.containers.length !== 1 || !object(template.containers[0]) || !Array.isArray(template.containers[0].env)) throw new Error("Unbounded QA replica capacity.");
    const pool = template.containers[0].env.filter((entry) => object(entry) && entry.name === "DATABASE_POOL_MAX");
    if (pool.length > 1 || (pool.length === 1 && (typeof pool[0].value !== "string" || !/^(?:[1-9]|10)$/.test(pool[0].value) || pool[0].secretRef !== undefined))) throw new Error("Invalid QA pool metadata.");
    // Current QA legacy source defaults to 10; modern explicit values can only reduce this reserve.
    maximumConnections += Number(template.scale.maxReplicas) * (Number(pool[0]?.value ?? 10) + databaseHealthPoolMax);
  }
  if (maximumConnections > qaConnectionAllowance) throw new Error("QA connection allowance exceeded.");
  return { maximumConnections };
}
