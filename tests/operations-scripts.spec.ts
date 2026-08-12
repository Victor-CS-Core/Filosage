import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const backupWorkflow = readFileSync(".github/workflows/azure-backup-evidence.yml", "utf8");

test("managed PostgreSQL backup evidence uses short-lived Azure identity", () => {
  expect(backupWorkflow).toContain("id-token: write");
  expect(backupWorkflow).toContain("azure/login@v2");
  expect(backupWorkflow).toContain("AZURE_CLIENT_ID");
  expect(backupWorkflow).not.toContain("FIREBASE_PRIVATE_KEY");
});

test("backup evidence fails closed unless Azure reports a recoverable ready server", () => {
  expect(backupWorkflow).toContain("az postgres flexible-server show");
  expect(backupWorkflow).toContain('v.state!=="Ready"||!v.earliestRestoreDate');
  expect(backupWorkflow).toContain("backup.backupRetentionDays");
  expect(backupWorkflow).toContain("actions/upload-artifact@v4");
  expect(backupWorkflow).toContain("retention-days: 90");
});
