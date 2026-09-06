import pg from "pg";
import { deliverScriptAlert, operationalAlertTransportEvidence, writeEvidenceFile } from "./operations-script-support.ts";

const evidenceFile = process.argv.find((value) => value.startsWith("--evidence-file="))?.slice(16);
const testId = `manual-${new Date().toISOString()}`;

try {
  const result = await deliverScriptAlert({
    severity: "info",
    code: "operations.signed_test",
    message: "This is a signed Filosage operational-alert delivery test.",
    deduplicationKey: testId,
    context: { resourceGroup: process.env.AZURE_RESOURCE_GROUP?.trim() || "unconfigured", testId },
  });
  if (!result.ok) throw new Error(result.error ?? "Operational alert was not acknowledged.");
  const evidence = operationalAlertTransportEvidence(result, {
    resourceGroup: process.env.AZURE_RESOURCE_GROUP?.trim() || null,
    releaseSha: process.env.SITE_VERSION?.trim() || process.env.GITHUB_SHA?.trim() || null,
  });
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: true }, max: 1 });
    try {
      await pool.query(
        `INSERT INTO filosage_documents (path, collection_id, collection_path, document_id, data)
         VALUES ('operationalEvidence/alert-test-latest', 'operationalEvidence', 'operationalEvidence', 'alert-test-latest', $1::jsonb)
         ON CONFLICT (path) DO UPDATE SET data = EXCLUDED.data, version = filosage_documents.version + 1, updated_at = now()`,
        [JSON.stringify(evidence)],
      );
    } finally {
      await pool.end();
    }
  }
  await writeEvidenceFile(evidenceFile, evidence);
  console.log(`Signed alert HTTP delivery accepted: ${result.alertId}. Receiver durability and independent monitoring remain unverified.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Operational alert test failed.");
  process.exitCode = 1;
}
