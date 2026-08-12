import {
  argument,
  firestoreEnvironment,
  putOperationalEvidence,
  safeError,
} from "./firestore-operations.ts";
import { deliverScriptAlert, writeEvidenceFile } from "./operations-script-support.ts";

const evidenceFile = argument("--evidence-file");
const testId = `manual-${new Date().toISOString()}`;

try {
  const environment = firestoreEnvironment({ requireBucket: false });
  const result = await deliverScriptAlert({
    severity: "info",
    code: "operations.signed_test",
    message: "This is a signed Filosage operational-alert delivery test.",
    deduplicationKey: testId,
    context: { projectId: environment.projectId, testId },
  });
  if (!result.ok) throw new Error(result.error ?? "Operational alert was not acknowledged.");
  const evidence = {
    operation: "operational_alert_test",
    status: "succeeded",
    projectId: environment.projectId,
    completedAt: new Date().toISOString(),
    alertId: result.alertId,
    attempts: result.attempts,
    receiverStatus: result.status,
    releaseSha: process.env.SITE_VERSION?.trim() || process.env.GITHUB_SHA?.trim() || null,
  };
  await putOperationalEvidence(environment, "alert-test-latest", evidence);
  await writeEvidenceFile(evidenceFile, evidence);
  console.log(`Signed operational alert acknowledged: ${result.alertId}`);
} catch (error) {
  console.error(safeError(error));
  process.exitCode = 1;
}
