import {
  firestoreEnvironment,
  firestoreOperation,
  hasFlag,
  waitForOperation,
} from "./firestore-operations.mjs";

try {
  const environment = firestoreEnvironment();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputUriPrefix = `gs://${environment.bucket}/erudoza-backups/${timestamp}`;
  const { operation, token } = await firestoreOperation(environment, "exportDocuments", { outputUriPrefix });
  console.log(`Firestore backup started: ${outputUriPrefix}`);
  console.log(`Operation: ${operation.name}`);
  if (hasFlag("--wait")) {
    await waitForOperation(operation.name, token);
    console.log("Firestore backup completed.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Firestore backup failed.");
  process.exitCode = 1;
}
