import { deliverScriptAlert, operationalAlertTransportEvidence, writeEvidenceFile } from "./operations-script-support.ts";

const evidenceFile = process.argv.find((value) => value.startsWith("--evidence-file="))?.slice(16);
const testId = `manual-${new Date().toISOString()}`;
const environment = process.env.OPERATIONS_ENVIRONMENT?.trim() || "production";

try {
  const result = await deliverScriptAlert({
    severity: "info",
    code: "operations.signed_test",
    message: "This is a signed Filosage operational-alert delivery test.",
    deduplicationKey: testId,
    context: { environment, testId },
  });
  if (!result.ok) throw new Error(result.error ?? "Operational alert was not acknowledged.");
  const evidence = operationalAlertTransportEvidence(result, {
    environment,
    releaseSha: process.env.SITE_VERSION?.trim() || process.env.GITHUB_SHA?.trim() || null,
  });
  await writeEvidenceFile(evidenceFile, evidence);
  console.log(`Signed alert HTTP delivery accepted: ${result.alertId}. Receiver durability and independent monitoring remain unverified.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Operational alert test failed.");
  process.exitCode = 1;
}
