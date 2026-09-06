import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
const directory = await mkdtemp(join(tmpdir(), 'filosage-support-'));
process.env.FILOSAGE_LOCAL_DIR = relative(process.cwd(), directory);
process.env.NODE_ENV = 'test'; process.env.DATABASE_URL = '';
process.env.COMMAND_CENTER_ENABLED = 'true'; process.env.OPENAI_API_KEY = '';
const documents = await import('../../src/lib/document-store.ts');
const lifecycle = await import('../../src/lib/account-lifecycle.ts');
const { PRIVACY_VERSION, TERMS_VERSION } = await import('../../src/lib/legal.ts');
const { defaultCommandCenterControls } = await import('../../src/lib/command-center-policy.ts');
const { parseSupportCapabilities } = await import('../../src/lib/support-capabilities.ts');
const { GET: capabilities } = await import('../../src/app/api/support/capabilities/route.ts');
const { GET: list, POST: submit } = await import('../../src/app/api/support/tickets/route.ts');
const { GET: detail } = await import('../../src/app/api/support/tickets/[ticketId]/route.ts');
const { PATCH: triage } = await import('../../src/app/api/admin/command-center/tickets/[ticketId]/route.ts');
const { POST: reply } = await import('../../src/app/api/admin/command-center/tickets/[ticketId]/public-replies/route.ts');
async function seed(owner = false) {
  const suffix = crypto.randomUUID(); const uid = owner ? 'local-owner' : `local-plus-learner-${suffix}`;
  const token = owner ? 'playwright-local-owner' : `playwright-plus-learner-${suffix}`;
  const generation = await lifecycle.captureAccountGeneration(uid);
  await lifecycle.runWithAccountGeneration(generation, () => documents.putStoredDocument(`users/${uid}`, {
    uid, email: owner ? 'owner@filosage.local' : 'learner@filosage.local', plan: 'free', subscriptionStatus: 'none', acceptedTermsVersion: TERMS_VERSION, acceptedPrivacyVersion: PRIVACY_VERSION,
  }));
  return { uid, token, generation };
}
function request(account, method = 'GET', body, key = crypto.randomUUID()) {
  return new Request('https://filosage.invalid/api/support/tickets', {
    method, headers: { authorization: `Bearer ${account.token}`, 'x-reauthentication-token': account.token, origin: 'https://filosage.invalid', 'content-type': 'application/json', 'idempotency-key': key },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
try {
  const a = await seed(); const b = await seed(); const owner = await seed(true);
  const ready = await capabilities(); assert.equal(ready.headers.get('cache-control'), 'no-store');
  assert.deepEqual(parseSupportCapabilities(await ready.json()), { submissionEnabled: true, historyEnabled: true });
  assert.equal(parseSupportCapabilities({ submissionEnabled: true, historyEnabled: true, ownerControls: {} }), null);
  assert.equal(parseSupportCapabilities({ submissionEnabled: 'true', historyEnabled: true }), null);
  const body = { category: 'support', subject: 'A saved support request', message: 'The lesson action could not be saved and I need help with this account.' };
  const key = crypto.randomUUID();
  const responses = await Promise.all([submit(request(a, 'POST', body, key)), submit(request(a, 'POST', body, key))]);
  assert(responses.every(response => response.status === 201));
  const [created, repeated] = await Promise.all(responses.map(response => response.json()));
  assert.equal(created.ticketId, repeated.ticketId);
  const context = { params: Promise.resolve({ ticketId: created.ticketId }) };
  assert.equal((await detail(request(b), context)).status, 404);
  const triaged = await triage(request(owner, 'PATCH', { expectedVersion: 1, status: 'triaged', note: 'PRIVATE OWNER INVESTIGATION, never expose this' }), context);
  assert.equal(triaged.status, 200, await triaged.clone().text());
  const version = (await triaged.json()).ticket.version;
  const published = await reply(request(owner, 'POST', { expectedVersion: version, body: 'PUBLIC REPLY: Please reopen this lesson and check the saved activity.' }), context);
  assert.equal(published.status, 201, await published.clone().text());
  const readback = await detail(request(a), context); assert.equal(readback.status, 200);
  const privateSafeBody = await readback.text();
  assert(privateSafeBody.includes('PUBLIC REPLY:')); assert(!privateSafeBody.includes('PRIVATE OWNER INVESTIGATION'));
  assert.equal((await (await list(request(a))).json()).tickets.length, 1);
  assert.equal((await (await list(request(b))).json()).tickets.length, 0);
  // Owner intake controls and environment independently disable composition.
  await documents.putStoredDocument('commandCenterControls/global', { ...defaultCommandCenterControls, systemEnabled: false });
  assert.equal((await (await capabilities()).json()).submissionEnabled, false);
  const controlsOff = await submit(request(a, 'POST', body)); assert.equal(controlsOff.status, 503);
  assert.equal((await controlsOff.json()).code, 'SUPPORT_SUBMISSION_UNAVAILABLE');
  await documents.putStoredDocument('commandCenterControls/global', { ...defaultCommandCenterControls });
  process.env.COMMAND_CENTER_ENABLED = 'false';
  assert.equal((await (await capabilities()).json()).submissionEnabled, false);
  assert.equal((await submit(request(a, 'POST', body))).status, 503);
  assert.equal((await (await list(request(a))).json()).tickets.length, 1);
  assert.equal((await detail(request(a), context)).status, 200);
  assert.equal((await detail(request(b), context)).status, 404);
  console.log('SUPPORT_AVAILABILITY_BEHAVIOR_OK env-off=true control-off=true durable-idempotency=one owner-triage-public-reply=private-safe history=available');
} finally { await rm(directory, { recursive: true, force: true }); }
