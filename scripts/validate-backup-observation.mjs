import { readFileSync } from "node:fs";

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function approvedContext(environment) {
  const resourceId = environment.EXPECTED_POSTGRES_RESOURCE_ID;
  requireCondition(typeof resourceId === "string" && /^\/subscriptions\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/resourceGroups\/[a-z0-9_.()-]{1,90}\/providers\/Microsoft\.DBforPostgreSQL\/flexibleServers\/[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/i.test(resourceId), "an exact PostgreSQL Flexible Server resource ID is required.");
  const retention = environment.APPROVED_BACKUP_RETENTION_DAYS;
  requireCondition(typeof retention === "string" && /^(?:[7-9]|[12][0-9]|3[0-5])$/.test(retention), "approved retention must be an integer from 7 to 35 days.");
  requireCondition(/^[0-9a-f]{40}$/.test(environment.GITHUB_SHA ?? ""), "a full candidate SHA is required.");
  requireCondition(/^[1-9][0-9]*$/.test(environment.GITHUB_RUN_ID ?? "") && /^[1-9][0-9]*$/.test(environment.GITHUB_RUN_ATTEMPT ?? ""), "a run ID and attempt are required.");
  requireCondition(/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(environment.GITHUB_REPOSITORY ?? ""), "an owner/repository identity is required.");
  return {
    resourceId, approvedRetentionDays: Number(retention), candidateSha: environment.GITHUB_SHA,
    repository: environment.GITHUB_REPOSITORY, runId: environment.GITHUB_RUN_ID, runAttempt: environment.GITHUB_RUN_ATTEMPT,
    runUrl: `https://github.com/${environment.GITHUB_REPOSITORY}/actions/runs/${environment.GITHUB_RUN_ID}/attempts/${environment.GITHUB_RUN_ATTEMPT}`,
  };
}

function restoreTimestamp(value) {
  // Azure can return fractional seconds beyond JavaScript's millisecond precision.
  const parts = typeof value === "string" && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$/);
  requireCondition(parts, "the earliest restore point must be a valid timestamp with a timezone.");
  const [year, month, day, hour, minute, second] = parts.slice(1).map(Number);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(hour, minute, second, 0);
  requireCondition(calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1
    && calendar.getUTCDate() === day && calendar.getUTCHours() === hour
    && calendar.getUTCMinutes() === minute && calendar.getUTCSeconds() === second
    && Number.isFinite(Date.parse(value)), "the earliest restore point is not a valid calendar timestamp.");
  return Date.parse(value);
}

try {
  const [command, ...extra] = process.argv.slice(2);
  requireCondition(extra.length === 0 && ["check-inputs", "observe"].includes(command), "use check-inputs or observe.");
  const context = approvedContext(process.env);
  if (command === "observe") {
    let response;
    try { response = JSON.parse(readFileSync(0, "utf8")); }
    catch { throw new Error("the Azure observation is not valid JSON."); }
    requireCondition(response && typeof response === "object" && !Array.isArray(response), "the Azure observation must be an object.");
    requireCondition(response.id === context.resourceId, "the observed server differs from the approved resource ID.");
    requireCondition(response.state === "Ready", "the observed server is not Ready.");
    requireCondition(Number.isInteger(response.retentionDays) && response.retentionDays === context.approvedRetentionDays, "the observed retention differs from the approved retention.");
    const now = Date.now();
    requireCondition(restoreTimestamp(response.earliestRestoreDate) <= now, "the earliest restore point is in the future.");
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1, evidenceType: "managed_backup_window_observation", restoreRehearsal: false,
      ...context, observedAt: new Date(now).toISOString(), state: response.state,
      earliestRestoreDate: response.earliestRestoreDate, retentionDays: response.retentionDays,
    }, null, 2)}\n`);
  }
} catch (error) {
  // Messages are fixed validation text; never echo Azure payloads or environment values.
  process.stderr.write(`Backup observation rejected: ${error instanceof Error ? error.message : "validation failed."}\n`);
  process.exitCode = 1;
}
