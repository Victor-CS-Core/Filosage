import { createRequire } from 'node:module';
import { runtimeDatabaseOptions } from './inspect-runtime-database.mjs';
export const sourceSha = '93f60f24afe59b19b6a592f455a09e8e813f1f84';
const text = v => typeof v === 'string' && v.length > 0;
const money = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Counts only. Missing legacy/retained relationships are observations, never automatic corruption. */
export function summarizeConsistency(rows) {
  if (!Array.isArray(rows) || rows.length > 10000) throw new Error('Document bound exceeded.');
  const docs = new Map(); let bytes = 0;
  for (const row of rows) {
    if (!text(row.path) || !row.data || typeof row.data !== 'object' || Array.isArray(row.data) || docs.has(row.path)) throw new Error('Invalid document shape.');
    bytes += Buffer.byteLength(JSON.stringify(row));
    if (bytes > 64 * 1024 * 1024) throw new Error('Document byte bound exceeded.');
    docs.set(row.path, row.data);
  }
  const c = Object.fromEntries(['documents','users','usersWithoutLifecycle','lifecycles','malformedLifecycles','deletedLifecycles','identityLinks','linksWithoutCanonicalUid','linksWithoutUser','retainedLinksToDeletedLifecycle','deletionJobs','malformedDeletionJobs','deletionJobLifecycleMismatch','courses','coursesWithoutAuthor','coursesWithAuthorWithoutUser','lessonDocuments','lessonDocumentsWithoutCourse','creditLedgers','legacyCreditLedgers','malformedCurrentCreditLedgers','creditClaims','completedCreditClaims','completedCreditClaimsWithoutCourse','generationOperations','inProgressGenerationOperations','legacyGenerationWithoutLifecycleToken','generationLifecycleMismatch','generationMissingReceipt','generationMissingAccountingRequest','usageReceipts','malformedUsageAmounts'].map(k => [k, 0]));
  c.documents = rows.length;
  for (const [path, d] of docs) {
    const p = path.split('/'); const lifecycle = uid => docs.get(`accountLifecycles/${uid}`);
    // account-lifecycle.ts captureAccountGeneration intentionally lazily creates legacy lifecycle rows.
    if (p.length === 2 && p[0] === 'users') { c.users++; if (!lifecycle(p[1])) c.usersWithoutLifecycle++; }
    if (p.length === 2 && p[0] === 'accountLifecycles') {
      c.lifecycles++; if (!text(d.generation) || !['active','deleting','deleted'].includes(d.state)) c.malformedLifecycles++;
      if (d.state === 'deleted') c.deletedLifecycles++;
    }
    // identity-link-policy.ts canonicalUid; account-deletion.ts deliberately retains identity links.
    if (p.length === 2 && p[0] === 'identityLinks') {
      c.identityLinks++; if (!text(d.canonicalUid)) c.linksWithoutCanonicalUid++;
      else { if (!docs.has(`users/${d.canonicalUid}`)) c.linksWithoutUser++; if (lifecycle(d.canonicalUid)?.state === 'deleted') c.retainedLinksToDeletedLifecycle++; }
    }
    if (p.length === 2 && p[0] === 'accountDeletionJobs') {
      c.deletionJobs++;
      if (!text(d.uid) || !text(d.generation) || d.jobId !== p[1] || !['checkout','inventory','billing','documents','assets','verify','retention_review'].includes(d.stage)
        || !['running','pending','manual_review','retention_review'].includes(d.status)) c.malformedDeletionJobs++;
      if (lifecycle(d.uid)?.generation !== d.generation) c.deletionJobLifecycleMismatch++;
    }
    // document-store.ts stores generated lessons lazily: absence of an outline lesson is legitimate.
    if (p.length === 2 && p[0] === 'courses') {
      c.courses++; if (!text(d.authorId)) c.coursesWithoutAuthor++;
      else if (!docs.has(`users/${d.authorId}`)) c.coursesWithAuthorWithoutUser++;
    }
    if (p.length === 4 && p[0] === 'courses' && p[2] === 'lessons') { c.lessonDocuments++; if (!docs.has(`courses/${p[1]}`)) c.lessonDocumentsWithoutCourse++; }
    // course-credit-policy.ts preserves frozen balances above a zero cap; never require balance <= cap.
    if (p.length === 4 && p[0] === 'users' && p[2] === 'courseCredits' && p[3] === 'current') {
      c.creditLedgers++; if (d.schemaVersion !== 'course-credits-v2') c.legacyCreditLedgers++;
      else if (['balance','balanceCap','monthlyAllocation','periodGranted'].some(k => !Number.isSafeInteger(d[k]) || d[k] < 0)) c.malformedCurrentCreditLedgers++;
    }
    if (p.length === 4 && p[0] === 'users' && p[2] === 'courseCreditClaims') {
      c.creditClaims++; if (d.status === 'completed') { c.completedCreditClaims++; if (!text(d.courseId) || !docs.has(`courses/${d.courseId}`)) c.completedCreditClaimsWithoutCourse++; }
    }
    // generation-operations.ts retains original accounting paths and uncertainty; never infer refunds.
    if (p.length === 2 && p[0] === 'generationOperations') {
      c.generationOperations++; if (['running','pending'].includes(d.status)) c.inProgressGenerationOperations++;
      if (!text(d.accountGeneration)) c.legacyGenerationWithoutLifecycleToken++;
      else if (lifecycle(d.uid)?.generation !== d.accountGeneration) c.generationLifecycleMismatch++;
      if (!docs.has(`generationUsageReceipts/${p[1]}`)) c.generationMissingReceipt++;
      if (!text(d.accounting?.requestPath) || !docs.has(d.accounting.requestPath)) c.generationMissingAccountingRequest++;
    }
    if (p.length === 2 && p[0] === 'generationUsageReceipts' && !p[1].endsWith('__evaluation')) {
      c.usageReceipts++; if (['remainingReserveMicros','actualCostMicros','uncertainCostMicros'].some(k => !money(d[k]))) c.malformedUsageAmounts++;
    }
  }
  return { ...c, consistencyVerified: false, missingScenarioCoverageVerified: false };
}

export async function inspectConsistency(client) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await client.query("SET LOCAL statement_timeout = '15s'"); await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query('SET LOCAL row_security = off');
    const meta = (await client.query("SELECT current_database()='filosage' AS correct_database, current_setting('transaction_read_only')='on' AS read_only, transaction_timestamp() AS snapshot_at")).rows[0];
    if (meta?.correct_database !== true || meta?.read_only !== true) throw new Error('Read-only context mismatch.');
    const total = Number((await client.query('SELECT count(*) AS total FROM public.filosage_documents')).rows[0]?.total);
    if (!Number.isSafeInteger(total) || total < 0 || total > 10000) throw new Error('Document bound exceeded.');
    await client.query('DECLARE consistency_rows NO SCROLL CURSOR FOR SELECT path,data FROM public.filosage_documents ORDER BY path COLLATE "C"');
    const rows = []; let bytes = 0;
    while (true) {
      const batch = (await client.query('FETCH FORWARD 100 FROM consistency_rows')).rows;
      if (!batch.length) break;
      bytes += Buffer.byteLength(JSON.stringify(batch)); rows.push(...batch);
      if (rows.length > total || bytes > 64 * 1024 * 1024) throw new Error('Snapshot bound exceeded.');
    }
    if (rows.length !== total) throw new Error('Incomplete snapshot.');
    return { snapshotAt: new Date(meta.snapshot_at).toISOString(), readOnly: true, counts: summarizeConsistency(rows) };
  } finally { await client.query('ROLLBACK'); }
}
export async function runRecoveryConsistency(expectedSha) {
  if (expectedSha !== sourceSha || process.env.SITE_VERSION !== sourceSha) throw new Error('Source mismatch.');
  const require = createRequire(`${process.cwd()}/package.json`); const pg = require('pg');
  const options = runtimeDatabaseOptions(process.env.DATABASE_URL, process.env.DATABASE_SSL);
  const client = new pg.Client({ ...options, application_name: 'filosage-readonly-consistency',
    options: '-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=15000' });
  try { await client.connect(); return { schemaVersion: 1, operation: 'recovery-consistency-observation', sourceSha,
    ...(await inspectConsistency(client)), retrospectiveCloneConsistencyVerified: false }; }
  finally { await client.end().catch(() => undefined); }
}
