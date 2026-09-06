import { expect, test } from "@playwright/test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { RETIRED_SYSTEM_NAMES } from "./fixtures/retired-system-names";

const backupWorkflow = readFileSync(".github/workflows/azure-backup-evidence.yml", "utf8");
const commercialRunbook = readFileSync("docs/COMMERCIAL_LAUNCH_RUNBOOK.md", "utf8");
const productionOperations = readFileSync("docs/PRODUCTION_OPERATIONS.md", "utf8");

test("managed PostgreSQL backup evidence uses short-lived Azure identity", () => {
  expect(backupWorkflow).toContain("id-token: write");
  expect(backupWorkflow).toContain("azure/login@");
  expect(backupWorkflow).toContain("AZURE_CLIENT_ID");
  expect(backupWorkflow).not.toContain(`${RETIRED_SYSTEM_NAMES[2].toUpperCase()}_PRIVATE_KEY`);
});

test("backup-window evidence fails closed and cannot be mistaken for a restore rehearsal", () => {
  expect(backupWorkflow).toContain("az postgres flexible-server show");
  expect(backupWorkflow).toContain('node scripts/validate-backup-observation.mjs observe');
  expect(backupWorkflow).toContain("backup.backupRetentionDays");
  expect(backupWorkflow).toContain('node scripts/validate-backup-observation.mjs check-inputs');
  expect(backupWorkflow).toContain('--ids "$EXPECTED_POSTGRES_RESOURCE_ID"');
  expect(backupWorkflow).not.toContain('flexible-server list');
  expect(backupWorkflow).not.toContain("az postgres flexible-server restore");
  expect(backupWorkflow).toContain("actions/upload-artifact@");
  expect(backupWorkflow).toContain("retention-days: 90");
  expect(commercialRunbook).toContain("does not prove that a restore succeeds");
  expect(commercialRunbook).not.toContain("waits for completed export evidence");
  expect(productionOperations).toContain("recovery-window observation, not a restore rehearsal");
});

const approvedResource = "/subscriptions/11111111-2222-3333-4444-555555555555/resourceGroups/recovery-fixture/providers/Microsoft.DBforPostgreSQL/flexibleServers/fixture-postgres";
const backupEnvironment = {
  EXPECTED_POSTGRES_RESOURCE_ID: approvedResource,
  APPROVED_BACKUP_RETENTION_DAYS: "14",
  GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
  GITHUB_RUN_ID: "12345", GITHUB_RUN_ATTEMPT: "2", GITHUB_REPOSITORY: "fixture/project",
};
const backupResponse = {
  id: approvedResource, state: "Ready", earliestRestoreDate: "2026-01-01T12:34:56.123456Z", retentionDays: 14,
};
function backupCli(command: string, response: unknown = backupResponse, overrides: Record<string, string | undefined> = {}) {
  return spawnSync(process.execPath, ["scripts/validate-backup-observation.mjs", command], {
    encoding: "utf8", input: JSON.stringify(response),
    env: { ...process.env, ...backupEnvironment, ...overrides }, timeout: 10_000,
  });
}

test("backup observation binds exact resource, retention, candidate and run without claiming a restore", () => {
  const started = Date.now();
  const checked = backupCli("check-inputs");
  expect(checked.status, checked.stderr).toBe(0);
  expect(checked.stdout).toBe("");
  const result = backupCli("observe", { ...backupResponse, privatePayload: "PRIVATE_BACKUP_SENTINEL" });
  expect(result.status, result.stderr).toBe(0);
  const evidence = JSON.parse(result.stdout);
  expect(evidence).toMatchObject({
    schemaVersion: 1, evidenceType: "managed_backup_window_observation", restoreRehearsal: false,
    resourceId: approvedResource, state: "Ready", retentionDays: 14, approvedRetentionDays: 14,
    earliestRestoreDate: "2026-01-01T12:34:56.123456Z",
    candidateSha: "0123456789abcdef0123456789abcdef01234567", runId: "12345", runAttempt: "2",
    repository: "fixture/project", runUrl: "https://github.com/fixture/project/actions/runs/12345/attempts/2",
  });
  expect(Date.parse(evidence.observedAt)).toBeGreaterThanOrEqual(started);
  expect(Date.parse(evidence.observedAt)).toBeLessThanOrEqual(Date.now());
  expect(result.stdout + result.stderr).not.toContain("PRIVATE_BACKUP_SENTINEL");
});

test("backup workflow queries only the approved resource and never emits successful evidence for another server", () => {
  const directory = mkdtempSync(join(tmpdir(), "r18-workflow-"));
  try {
    const blocks = [...backupWorkflow.matchAll(/^ {8}run: \|\n((?: {10}.*\n|\n)+)/gm)]
      .map((match) => match[1].replace(/^ {10}/gm, "").replace(/\$\{\{ vars\.AZURE_RESOURCE_GROUP \}\}/g, "recovery-fixture")
        .replace(/\$\{\{ vars\.AZURE_POSTGRES_SERVER_NAME \}\}/g, "fixture-postgres"));
    expect(blocks.length).toBeGreaterThan(0);
    writeFileSync(join(directory, "az"), `#!${process.execPath}\nimport fs from 'node:fs';
      fs.writeFileSync(process.env.RUNNER_TEMP + '/query.json', JSON.stringify(process.argv.slice(2)));
      process.stdout.write(fs.readFileSync(process.env.RUNNER_TEMP + '/response.json'));
    `, { mode: 0o700 });
    const evidencePath = join(directory, "azure-postgres-backup-evidence.json");
    for (const valid of [true, false]) {
      rmSync(evidencePath, { force: true });
      writeFileSync(join(directory, "response.json"), JSON.stringify({ ...backupResponse, id: valid ? approvedResource : `${approvedResource}-other` }));
      const result = spawnSync("bash", ["-euo", "pipefail", "-c", blocks.join("\n")], {
        encoding: "utf8", timeout: 15_000,
        env: { ...process.env, ...backupEnvironment, RUNNER_TEMP: directory,
          PATH: `${directory}:${dirname(process.execPath)}:${process.env.PATH}` },
      });
      expect(result.status, result.stderr).toBe(valid ? 0 : 1);
      const args = JSON.parse(readFileSync(join(directory, "query.json"), "utf8"));
      expect(args.slice(0, 3)).toEqual(["postgres", "flexible-server", "show"]);
      expect(args[args.indexOf("--ids") + 1]).toBe(approvedResource);
      if (valid) expect(JSON.parse(readFileSync(evidencePath, "utf8")).resourceId).toBe(approvedResource);
      else expect(existsSync(evidencePath) ? readFileSync(evidencePath, "utf8") : "").toBe("");
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("backup observation rejects absent or ambiguous approval and malformed execution identity", () => {
  for (const overrides of [
    { EXPECTED_POSTGRES_RESOURCE_ID: "" }, { EXPECTED_POSTGRES_RESOURCE_ID: "fixture-postgres" },
    { EXPECTED_POSTGRES_RESOURCE_ID: `${approvedResource}/databases/other` },
    { APPROVED_BACKUP_RETENTION_DAYS: "" }, { APPROVED_BACKUP_RETENTION_DAYS: "6" },
    { APPROVED_BACKUP_RETENTION_DAYS: "36" }, { APPROVED_BACKUP_RETENTION_DAYS: "14days" },
    { GITHUB_SHA: "0123456" }, { GITHUB_RUN_ID: "0" }, { GITHUB_RUN_ATTEMPT: "1.5" },
    { GITHUB_REPOSITORY: "fixture/project/other" },
  ]) {
    const result = backupCli("check-inputs", backupResponse, overrides);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Backup observation rejected:");
  }
});

test("backup observation rejects wrong server, unavailable window and retention drift", () => {
  for (const response of [
    null, [], {}, { ...backupResponse, id: `${approvedResource}-other` },
    { ...backupResponse, state: "Updating" }, { ...backupResponse, retentionDays: 7 },
    { ...backupResponse, retentionDays: "14" }, { ...backupResponse, earliestRestoreDate: "not-a-date" },
    { ...backupResponse, earliestRestoreDate: "2026-02-30T00:00:00Z" },
    { ...backupResponse, earliestRestoreDate: "2026-01-01" },
    { ...backupResponse, earliestRestoreDate: "2999-01-01T00:00:00Z" },
    { ...backupResponse, earliestRestoreDate: null },
  ]) {
    const result = backupCli("observe", response);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Backup observation rejected:");
  }
});

test("backup observation fails closed on malformed JSON and unknown CLI commands without echoing input", () => {
  const malformed = spawnSync(process.execPath, ["scripts/validate-backup-observation.mjs", "observe"], {
    encoding: "utf8", input: "PRIVATE_BACKUP_SENTINEL", env: { ...process.env, ...backupEnvironment }, timeout: 10_000,
  });
  for (const result of [malformed, backupCli("restore")]) {
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Backup observation rejected:");
    expect(result.stderr).not.toContain("PRIVATE_BACKUP_SENTINEL");
  }
});
