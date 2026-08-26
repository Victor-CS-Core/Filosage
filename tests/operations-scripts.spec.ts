import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
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
  expect(backupWorkflow).toContain('v.state!=="Ready"||!v.earliestRestoreDate');
  expect(backupWorkflow).toContain("backup.backupRetentionDays");
  expect(backupWorkflow).toContain('v.evidenceType="managed_backup_window_observation"');
  expect(backupWorkflow).toContain("v.restoreRehearsal=false");
  expect(backupWorkflow).not.toContain("az postgres flexible-server restore");
  expect(backupWorkflow).toContain("actions/upload-artifact@");
  expect(backupWorkflow).toContain("retention-days: 90");
  expect(commercialRunbook).toContain("does not prove that a restore succeeds");
  expect(commercialRunbook).not.toContain("waits for completed export evidence");
  expect(productionOperations).toContain("recovery-window observation, not a restore rehearsal");
});
