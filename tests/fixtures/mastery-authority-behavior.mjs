import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

// AI-assessed authority through the real mastery API routes and the
// evidence-report builder, against the real local document store:
// stored ai-assessed records must survive GET, client submissions must be
// downgraded even when they claim a server tier, server-minted records
// must not be client-overwritable, and reports must label the tier as
// ai-assessed (not learner-reported).
const directory = await mkdtemp(join(tmpdir(), 'filosage-mastery-authority-'));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
process.env.NODE_ENV = 'test'; process.env.DATABASE_URL = ''; process.env.OPENAI_API_KEY = ''; process.env.STRIPE_SECRET_KEY = '';
const documents = await import('../../src/lib/document-store.ts');
const lifecycle = await import('../../src/lib/account-lifecycle.ts');
const { GET, POST } = await import('../../src/app/api/mastery/route.ts');
const { buildEvidenceReport, evidenceReportHasMeaningfulEvidence } = await import('../../src/lib/evidence-report.ts');
const { PRIVACY_VERSION, TERMS_VERSION } = await import('../../src/lib/legal.ts');

try {
  const suffix = crypto.randomUUID();
  const uid = `local-plus-learner-${suffix}`;
  const token = `playwright-plus-learner-${suffix}`;
  const courseId = `mastery-course-${suffix}`;
  const generation = await lifecycle.captureAccountGeneration(uid);
  const aiEvidenceId = 'ai-evidence-0001';
  const aiEvidence = {
    id: aiEvidenceId, courseId, objectiveId: 'objective-m0', type: 'transfer', result: 'passed',
    label: 'AI graded transfer task', observedAt: new Date().toISOString(),
    authority: 'ai-assessed', confidence: 'medium', score: 0.8, criterion: 'Applies the technique unaided',
  };
  await lifecycle.runWithAccountGeneration(generation, () => documents.putStoredDocuments([
    { path: `users/${uid}`, data: { uid, plan: 'free', subscriptionStatus: 'none', acceptedTermsVersion: TERMS_VERSION, acceptedPrivacyVersion: PRIVACY_VERSION } },
    { path: `courses/${courseId}`, data: { authorId: uid, topic: 'Authority course', isPublic: false, modules: [{ title: 'Foundations', objective: 'Apply the technique', description: 'Module one', lessons: [] }] } },
    { path: `users/${uid}/masteryEvidence/${aiEvidenceId}`, data: aiEvidence },
  ]));
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin: 'https://filosage.invalid' };
  const getMastery = async () => {
    const response = await GET(new Request(`https://filosage.invalid/api/mastery?courseId=${courseId}`, { headers }));
    return { status: response.status, body: await response.json() };
  };
  const postEvidence = async (evidence) => {
    const response = await POST(new Request('https://filosage.invalid/api/mastery', { method: 'POST', headers, body: JSON.stringify(evidence) }));
    return { status: response.status, body: await response.json() };
  };

  // 1. GET returns the stored ai-assessed record with its tier intact.
  const loaded = await getMastery();
  assert.equal(loaded.status, 200, JSON.stringify(loaded.body));
  const loadedAi = loaded.body.evidence.find((item) => item.id === aiEvidenceId);
  assert(loadedAi, 'stored ai-assessed evidence must not be dropped by GET');
  assert.equal(loadedAi.authority, 'ai-assessed');
  assert.equal(loadedAi.result, 'passed');

  // 2. A client claiming server-verified is stored as learner-reported.
  const forged = await postEvidence({
    id: 'forged-evidence-1', courseId, objectiveId: 'objective-m0', type: 'transfer', result: 'passed',
    label: 'Forged verified record', observedAt: new Date().toISOString(), authority: 'server-verified', score: 1,
  });
  assert.equal(forged.status, 200, JSON.stringify(forged.body));
  assert.equal(forged.body.evidence.authority, 'learner-reported');
  assert.equal(forged.body.evidence.result, 'attempted');
  assert.equal(forged.body.evidence.score, undefined);
  const storedForged = await documents.getStoredDocument(`users/${uid}/masteryEvidence/forged-evidence-1`);
  assert.equal(storedForged.authority, 'learner-reported');

  // 3. A client cannot overwrite or downgrade the ai-assessed record.
  const overwrite = await postEvidence({ ...aiEvidence, label: 'Relabeled by client', authority: 'learner-reported' });
  assert.equal(overwrite.status, 200, JSON.stringify(overwrite.body));
  assert.equal(overwrite.body.evidence.authority, 'ai-assessed');
  assert.equal(overwrite.body.evidence.label, 'AI graded transfer task');
  const storedAi = await documents.getStoredDocument(`users/${uid}/masteryEvidence/${aiEvidenceId}`);
  assert.equal(storedAi.authority, 'ai-assessed');
  assert.equal(storedAi.label, 'AI graded transfer task');

  // 4. The evidence report labels the record ai-assessed and counts it as
  // meaningful evidence.
  const built = await buildEvidenceReport(uid, courseId, { includeAdvancedCapstoneAnalysis: false });
  assert(built, 'report builds');
  const reported = built.report.evidence.find((item) => item.label === 'AI graded transfer task');
  assert(reported, 'ai-assessed record appears in the report ledger');
  assert.equal(reported.authority, 'ai-assessed');
  assert(built.report.methodology.some((line) => line.includes('AI-assessed')), 'methodology explains the AI tier');
  assert.equal(evidenceReportHasMeaningfulEvidence(built.report), true);

  console.log('MASTERY_AUTHORITY_BEHAVIOR_OK');
} finally {
  await rm(directory, { recursive: true, force: true });
}
