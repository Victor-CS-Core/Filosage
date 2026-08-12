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
const timestamp = startedAt.toISOString().replace(/[:.]/g, "-");
const evidenceFile = argument("--evidence-file");
let environment: ReturnType<typeof firestoreEnvironment> | null = null;
let outputUriPrefix: string | null = null;
let operationName: string | null = null;

try {
  environment = firestoreEnvironment();
  outputUriPrefix = `gs://${environment.bucket}/filosage-backups/${timestamp}`;
  const runningEvidence = {
    operation: "firestore_backup",
    status: "running",
    projectId: environment.projectId,
    outputUriPrefix,
    startedAt: startedAt.toISOString(),
    releaseSha: process.env.SITE_VERSION?.trim() || process.env.GITHUB_SHA?.trim() || null,
    actor: process.env.GITHUB_ACTOR?.trim() || process.env.USERNAME?.trim() || "automation",
  };
  await putOperationalEvidence(environment, "firestore-backup-latest", runningEvidence);
  const operation = await firestoreOperation(environment, "exportDocuments", { outputUriPrefix });
  operationName = operation.name;
  console.log(`Firestore backup started: ${outputUriPrefix}`);
  console.log(`Operation: ${operationName}`);
  const completedOperation = await waitForOperation(environment, operationName, {
    timeoutMinutes: Number(argument("--timeout-minutes") ?? 180),
  });
  const completedAt = new Date().toISOString();
  const completedOutput = typeof completedOperation.response?.outputUriPrefix === "string"
    ? completedOperation.response.outputUriPrefix
    : outputUriPrefix;
  const finalEvidence = {
    ...runningEvidence,
    status: "succeeded",
    outputUriPrefix: completedOutput,
    operationName,
    completedAt,
    durationSeconds: Math.round((Date.parse(completedAt) - startedAt.getTime()) / 1_000),
    operationMetadata: completedOperation.metadata ?? null,
  };
  await putOperationalEvidence(environment, "firestore-backup-latest", finalEvidence);
  await writeEvidenceFile(evidenceFile, finalEvidence);
  const alert = await deliverScriptAlert({
    severity: "info",
    code: "backup.firestore_succeeded",
    message: "The scheduled Firestore managed export completed successfully.",
    deduplicationKey: operationName,
    context: { projectId: environment.projectId, outputUriPrefix: completedOutput, operationName },
  });
  if (!alert.ok) console.warn(`Backup succeeded, but its notification was not acknowledged: ${alert.error}`);
  console.log(`Firestore backup completed: ${completedOutput}`);
} catch (error) {
  const failedAt = new Date().toISOString();
  const finalEvidence = {
    operation: "firestore_backup",
    status: "failed",
    projectId: environment?.projectId ?? process.env.FIREBASE_PROJECT_ID?.trim() ?? null,
    outputUriPrefix,
    operationName,
    startedAt: startedAt.toISOString(),
    failedAt,
    releaseSha: process.env.SITE_VERSION?.trim() || process.env.GITHUB_SHA?.trim() || null,
    error: safeError(error),
  };
  if (environment) {
    try {
      await putOperationalEvidence(environment, "firestore-backup-latest", finalEvidence);
    } catch (evidenceError) {
      console.error(`Backup evidence could not be saved: ${safeError(evidenceError)}`);
    }
  }
  try {
    await writeEvidenceFile(evidenceFile, finalEvidence);
  } catch (evidenceFileError) {
    console.error(`Backup evidence file could not be saved: ${safeError(evidenceFileError)}`);
  }
  const alert = await deliverScriptAlert({
    severity: "critical",
    code: "backup.firestore_failed",
    message: "The scheduled Firestore managed export failed and requires owner attention.",
    deduplicationKey: operationName ?? startedAt.toISOString(),
    context: { projectId: environment?.projectId ?? null, operationName, error: safeError(error) },
  });
  if (!alert.ok) console.error(`Backup failure notification was not acknowledged: ${alert.error}`);
  console.error(safeError(error));
  process.exitCode = 1;
}
