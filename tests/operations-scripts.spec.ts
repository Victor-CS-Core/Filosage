import { expect, test } from "@playwright/test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const nodeArguments = ["--experimental-strip-types"];

test("backup fails closed and retains local failure evidence when configuration is missing", () => {
  const evidenceDirectory = mkdtempSync(join(tmpdir(), "filosage-backup-test-"));
  const evidencePath = join(evidenceDirectory, "evidence.json");
  const result = spawnSync(process.execPath, [
    ...nodeArguments,
    resolve(root, "scripts/backup-firestore.ts"),
    `--evidence-file=${evidencePath}`,
  ], {
    cwd: root,
    env: {
      ...process.env,
      FIREBASE_PROJECT_ID: "",
      FIREBASE_CLIENT_EMAIL: "",
      FIREBASE_PRIVATE_KEY: "",
      FIRESTORE_BACKUP_BUCKET: "",
      OPERATIONS_ALERT_WEBHOOK_URL: "",
      OPERATIONS_ALERT_WEBHOOK_SECRET: "",
    },
    encoding: "utf8",
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Missing required environment variables");
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as { status: string; error: string };
  expect(evidence.status).toBe("failed");
  expect(evidence.error).toContain("FIREBASE_PROJECT_ID");
});

test("restore remains a no-network dry run without explicit apply confirmation", () => {
  const result = spawnSync(process.execPath, [
    ...nodeArguments,
    resolve(root, "scripts/restore-firestore.ts"),
    "--input=gs://filosage-test-backups/filosage-backups/2026-08-12",
  ], {
    cwd: root,
    env: {
      ...process.env,
      FIREBASE_PROJECT_ID: "filosage-recovery-test",
      FIREBASE_CLIENT_EMAIL: "recovery@example.invalid",
      FIREBASE_PRIVATE_KEY: "not-used-in-dry-run",
      FIRESTORE_BACKUP_BUCKET: "filosage-test-backups",
    },
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("DRY RUN");
  expect(result.stdout).toContain("--apply --confirm-project=filosage-recovery-test");
});
