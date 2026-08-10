import {
  argument,
  firestoreEnvironment,
  firestoreOperation,
  hasFlag,
  waitForOperation,
} from "./firestore-operations.mjs";

try {
  const environment = firestoreEnvironment();
  const inputUriPrefix = argument("--input");
  if (!inputUriPrefix) throw new Error("Provide --input=gs://BUCKET/filosage-backups/TIMESTAMP.");
  const allowedPrefix = `gs://${environment.bucket}/filosage-backups/`;
  if (!inputUriPrefix.startsWith(allowedPrefix) || inputUriPrefix.includes("..")) {
    throw new Error(`Restore input must be under ${allowedPrefix}`);
  }
  const confirmedProject = argument("--confirm-project");
  if (!hasFlag("--apply")) {
    console.log(`DRY RUN: would import ${inputUriPrefix} into project ${environment.projectId}.`);
    console.log(`To apply: add --apply --confirm-project=${environment.projectId}`);
    process.exit(0);
  }
  if (confirmedProject !== environment.projectId) {
    throw new Error(`Refusing restore. Pass --confirm-project=${environment.projectId} exactly.`);
  }
  const { operation, token } = await firestoreOperation(environment, "importDocuments", { inputUriPrefix });
  console.log(`Firestore restore started for project ${environment.projectId}.`);
  console.log(`Operation: ${operation.name}`);
  if (hasFlag("--wait")) {
    await waitForOperation(operation.name, token);
    console.log("Firestore restore completed.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Firestore restore failed.");
  process.exitCode = 1;
}
