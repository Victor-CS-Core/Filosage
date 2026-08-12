import {
  argument,
  firestoreEnvironment,
  firestoreOperation,
  putOperationalEvidence,
  safeError,
  waitForOperation,
} from "./firestore-operations.ts";
import { deliverScriptAlert, writeEvidenceFile } from "./operations-script-support.ts";

const startedAt = new Date();
const evidenceFile = argument("--evidence-file");
let environment: ReturnType<typeof firestoreEnvironment> | null = null;
let inputUriPrefix: string | undefined;
let operationName: string | null = null;

try {
  environment = firestoreEnvironment();
  inputUriPrefix = argument("--input");
  if (!inputUriPrefix) throw new Error("Provide --input=gs://BUCKET/filosage-backups/TIMESTAMP.");
  const allowedPrefix = `gs://${environment.bucket}/filosage-backups/`;
  if (!inputUriPrefix.startsWith(allowedPrefix) || inputUriPrefix.includes("..")) {
    throw new Error(`Restore input must be under ${allowedPrefix}`);
  }
  const confirmedProject = argument("--confirm-project");
  if (!process.argv.includes("--apply")) {
    console.log(`DRY RUN: would import ${inputUriPrefix} into project ${environment.projectId}.`);
    console.log(`To apply: add --apply --confirm-project=${environment.projectId}`);
    process.exit(0);
  }
  if (confirmedProject !== environment.projectId) {
    throw new Error(`Refusing restore. Pass --confirm-project=${environment.projectId} exactly.`);
  }
  const operation = await firestoreOperation(environment, "importDocuments", { inputUriPrefix });
  operationName = operation.name;
  console.log(`Firestore restore started for project ${environment.projectId}.`);
  console.log(`Operation: ${operationName}`);
  const completedOperation = await waitForOperation(environment, operationName, {
    timeoutMinutes: Number(argument("--timeout-minutes") ?? 180),
  });
  const completedAt = new Date().toISOString();
  const evidence = {
    operation: "firestore_restore",
    status: "succeeded",
    projectId: environment.projectId,
    inputUriPrefix,
    operationName,
    startedAt: startedAt.toISOString(),
    completedAt,
    durationSeconds: Math.round((Date.parse(completedAt) - startedAt.getTime()) / 1_000),
    releaseSha: process.env.SITE_VERSION?.trim() || process.env.GITHUB_SHA?.trim() || null,
    operationMetadata: completedOperation.metadata ?? null,
  };
  await putOperationalEvidence(environment, "firestore-restore-latest", evidence);
  await writeEvidenceFile(evidenceFile, evidence);
  const alert = await deliverScriptAlert({
    severity: "recovery",
    code: "backup.restore_drill_succeeded",
    message: "The Firestore restore operation completed successfully.",
    deduplicationKey: operationName,
    context: { projectId: environment.projectId, inputUriPrefix, operationName },
  });
  if (!alert.ok) console.warn(`Restore succeeded, but its notification was not acknowledged: ${alert.error}`);
  console.log("Firestore restore completed.");
} catch (error) {
  const evidence = {
    operation: "firestore_restore",
    status: "failed",
    projectId: environment?.projectId ?? process.env.FIREBASE_PROJECT_ID?.trim() ?? null,
    inputUriPrefix: inputUriPrefix ?? null,
    operationName,
    startedAt: startedAt.toISOString(),
    failedAt: new Date().toISOString(),
    error: safeError(error),
  };
  if (environment) {
    try {
      await putOperationalEvidence(environment, "firestore-restore-latest", evidence);
    } catch (evidenceError) {
      console.error(`Restore evidence could not be saved: ${safeError(evidenceError)}`);
    }
  }
  try {
    await writeEvidenceFile(evidenceFile, evidence);
  } catch (evidenceFileError) {
    console.error(`Restore evidence file could not be saved: ${safeError(evidenceFileError)}`);
  }
  const alert = await deliverScriptAlert({
    severity: "critical",
    code: "backup.restore_failed",
    message: "A Firestore restore operation failed and requires owner attention.",
    deduplicationKey: operationName ?? startedAt.toISOString(),
    context: { projectId: environment?.projectId ?? null, operationName, error: safeError(error) },
  });
  if (!alert.ok) console.error(`Restore failure notification was not acknowledged: ${alert.error}`);
  console.error(safeError(error));
  process.exitCode = 1;
}
