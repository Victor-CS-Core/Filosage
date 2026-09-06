import assert from 'node:assert/strict';
import { after, test, mock } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import Stripe from 'stripe';

// The installed SDK serializes every request and verifies every webhook HMAC.
// Only its HTTP transport is replaced; document transactions stay real.
const calls = [];
const provider = new Map();
let beforeRead;
let cancelUnknown = false;
let checkoutCreateUnknown = false;
const transport = {
  getClientName: () => 'billing-fixture',
  async makeRequest(_host, _port, path, method, _headers, body) {
    calls.push({ path, method, body });
    const url = new URL(path, 'https://fixture.invalid');
    if (beforeRead) await beforeRead(url.pathname, method);
    let data;
    if (method === 'GET' && url.pathname === '/v1/subscriptions') {
      data = { object: 'list', has_more: false, data: [...provider.values()].filter(v => v.object === 'subscription' && v.customer === url.searchParams.get('customer')) };
    } else if (method === 'GET' && url.pathname === '/v1/checkout/sessions') {
      data = { object: 'list', has_more: false, data: [] };
    } else if (method === 'POST' && url.pathname.startsWith('/v1/checkout/sessions/') && url.pathname.endsWith('/expire')) {
      data = provider.get(url.pathname.slice(0, -7));
      assert.ok(data, 'Expiration must identify the created fixture session');
      data.status = 'expired';
    } else if (method === 'POST' && url.pathname === '/v1/billing_portal/sessions') {
      data = { id: 'bps_fixture', object: 'billing_portal.session', url: 'https://billing.stripe.com/p/session/fixture' };
    } else if (method === 'POST' && url.pathname === '/v1/checkout/sessions') {
      data = { id: `cs_${new URLSearchParams(body).get('client_reference_id')}`, object: 'checkout.session', status: 'open', url: 'https://checkout.stripe.com/c/pay/fixture', created: Math.floor(Date.now()/1000), expires_at: Math.floor(Date.now()/1000)+1800, mode: 'subscription', customer: new URLSearchParams(body).get('customer'), metadata: { filosage_uid: new URLSearchParams(body).get('client_reference_id') } };
      provider.set(`/v1/checkout/sessions/${data.id}`, data);
      if (checkoutCreateUnknown) { checkoutCreateUnknown = false; throw new Error('Creation response lost after provider commit'); }
    } else if (method === 'DELETE' && url.pathname.startsWith('/v1/subscriptions/')) {
      data = provider.get(url.pathname);
      assert.ok(data, 'Cancellation must own a fixture subscription');
      data.status = 'canceled';
      if (cancelUnknown) { cancelUnknown = false; const error = new Error('Fixture timeout after provider commit'); error.code = 'ECONNRESET'; throw error; }
    } else {
      assert.equal(method, 'GET', `Unexpected provider mutation: ${method} ${path}`);
      data = provider.get(url.pathname);
      assert.ok(data, `Unmocked Stripe request ${path}`);
    }
    const snapshot = structuredClone(data);
    return { getStatusCode: () => 200, getHeaders: () => ({}), getRawResponse: () => snapshot, toJSON: async () => snapshot };
  },
};
class FixtureStripe extends Stripe {
  constructor(key) { super(key, { httpClient: transport, maxNetworkRetries: 0 }); }
}
mock.module('stripe', { defaultExport: FixtureStripe });
const fileDirectory = await mkdtemp(join(process.cwd(), '.billing-fixture-'));
const pgFixture = process.env.FILOSAGE_POSTGRES_TEST_URL
  ? await (await import('../postgres/fixture.ts')).createPostgresFixture() : null;
if (!pgFixture) {
  assert.ok(!process.env.DATABASE_URL, 'Refuse arbitrary database fallback');
  Object.assign(process.env, { NODE_ENV: 'development', FILOSAGE_LOCAL_DIR: relative(process.cwd(), fileDirectory) });
}
Object.assign(process.env, {
  BILLING_PROVIDER: 'stripe', BILLING_ENABLED: 'false', BILLING_ROLLOUT_MODE: 'closed',
  STRIPE_SECRET_KEY: 'sk_test_fixture_not_real', STRIPE_WEBHOOK_SECRET: 'whsec_fixture_not_real',
  STRIPE_PLUS_MONTHLY_PRICE_ID: 'price_plus_monthly', STRIPE_PLUS_ANNUAL_PRICE_ID: 'price_plus_annual',
  STRIPE_PRO_MONTHLY_PRICE_ID: 'price_pro_monthly', STRIPE_PRO_ANNUAL_PRICE_ID: 'price_pro_annual',
  NEXT_PUBLIC_SITE_URL: 'https://filosage.test', STRIPE_TAX_READY: 'true',
});
delete process.env.STRIPE_PORTAL_CONFIGURATION_ID;
const rawStore = pgFixture?.store ?? await import('../../src/lib/document-store.ts');
const lifecycleApi = await import('../../src/lib/account-lifecycle.ts');
const store = {
  ...rawStore,
  async putStoredDocument(path, data) {
    const uid = path.startsWith('users/') ? path.split('/')[1] : undefined;
    if (!uid) return rawStore.putStoredDocument(path, data);
    const lifecycle = await lifecycleApi.captureAccountGeneration(uid);
    return lifecycleApi.runWithAccountGeneration(lifecycle, () => rawStore.putStoredDocument(path, data));
  },
};
const billing = await import('../../src/lib/stripe-server.ts');
const { POST } = await import('../../src/app/api/billing/webhook/route.ts');
const { TERMS_VERSION, PRIVACY_VERSION } = await import('../../src/lib/legal.ts');
const { MEMBERSHIP_PLANS } = await import('../../src/lib/membership-plans.ts');
const testPrefix = `billing_${crypto.randomUUID().replaceAll('-', '')}`;
let sequence = 0;
const tracked = new Set();
const paths = uid => ({ account: `users/${uid}`, ledger: `users/${uid}/courseCredits/current` });
const offers = ['plus', 'pro'].flatMap(plan => ['monthly', 'annual'].map(interval => ({ plan, interval, price: `price_${plan}_${interval}` })));
const currentSecond = () => Math.floor(Date.now()/1000);
function fixture(offer = offers[0], uidOverride) {
  const uid = uidOverride ?? `${testPrefix}_${++sequence}`;
  tracked.add(uid);
  const customer = { object: 'customer', id: `cus_${uid}`, metadata: { filosage_uid: uid } };
  const subscription = {
    object: 'subscription', id: `sub_${uid}`, customer: customer.id, metadata: { filosage_uid: uid },
    status: 'active', cancel_at_period_end: false, canceled_at: null, trial_end: null,
    items: { object: 'list', has_more: false, data: [] }, latest_invoice: `in_${uid}_initial`,
  };
  const f = { uid, customer, subscription, offer, original: offer, invoiceSequence: 0 };
  update(f, offer);
  provider.set(`/v1/customers/${customer.id}`, customer);
  provider.set(`/v1/subscriptions/${subscription.id}`, subscription);
  return f;
}
function update(f, offer, state = 'paid', keepInvoice = false) {
  const plan = MEMBERSHIP_PLANS[offer.plan];
  const price = { object: 'price', id: offer.price, active: true, currency: 'usd', unit_amount: plan.prices[offer.interval], type: 'recurring', recurring: { interval: offer.interval === 'annual' ? 'year' : 'month', interval_count: 1 } };
  // Membership plan prices are amount descriptors in the application.
  price.unit_amount = typeof price.unit_amount === 'object' ? price.unit_amount.amountMinor : price.unit_amount;
  const end = currentSecond() + (offer.interval === 'annual' ? 365 : 30)*86400;
  f.subscription.items.data = [{ id: 'si_fixture', quantity: 1, price, current_period_start: currentSecond()-10, current_period_end: end }];
  provider.set(`/v1/prices/${price.id}`, price);
  f.offer = offer;
  if (!keepInvoice) {
    f.subscription.latest_invoice = `in_${f.uid}_${++f.invoiceSequence}`;
    const invoice = { object: 'invoice', id: f.subscription.latest_invoice, customer: f.customer.id,
      status: state, parent: { subscription_details: { subscription: f.subscription.id } },
      attempt_count: state === 'paid' ? 1 : 0, status_transitions: { paid_at: state === 'paid' ? currentSecond() : null },
      currency: 'usd', amount_due: price.unit_amount, amount_paid: state === 'paid' ? price.unit_amount : 0,
      lines: { object: 'list', has_more: false, data: [{ amount: price.unit_amount, pricing: { price_details: { price: price.id } }, period: { start: currentSecond()-10, end }, parent: { subscription_item_details: { subscription: f.subscription.id, subscription_item: 'si_fixture' } } }] } };
    provider.set(`/v1/invoices/${invoice.id}`, invoice);
  }
}
async function seed(f) {
  await store.putStoredDocument(paths(f.uid).account, {
    uid: f.uid, email: `${f.uid}@example.test`, displayName: 'Fixture learner', accountStatus: 'active',
    plan: f.original.plan, billingPlan: f.original.plan, billingPriceId: f.original.price, billingInterval: f.original.interval,
    billingSubscriptionId: f.subscription.id, billingCustomerId: f.customer.id,
    subscriptionStatus: 'active', billingRawStatus: 'active', billingPaymentState: 'paid',
    billingConsentSubscriptionId: f.subscription.id, billingConsentCustomerId: f.customer.id,
    billingConsentCheckoutSessionId: `cs_${f.uid}`, billingConsentRecordedAt: '2026-01-01T00:00:00.000Z',
    billingConsentPriceId: f.original.price, billingConsentPlanId: f.original.plan, billingConsentInterval: f.original.interval,
    acceptedTermsVersion: TERMS_VERSION, acceptedPrivacyVersion: PRIVACY_VERSION,
  });
  await deliver(f, 'customer.subscription.updated');
}
async function deliver(f, type, { id = `evt_${testPrefix}_${++sequence}`, created = currentSecond(), object } = {}) {
  const event = { id, object: 'event', created, type, data: { object: object ?? f.subscription }, livemode: false };
  const payload = JSON.stringify(event);
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
  return POST(new Request('https://filosage.test/api/billing/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': signature } }));
}
async function read(f) { return { account: await store.getStoredDocument(paths(f.uid).account), ledger: await store.getStoredDocument(paths(f.uid).ledger) }; }
after(async () => {
  if (pgFixture) {
    for (const uid of tracked) await pgFixture.monitor.query('DELETE FROM filosage_documents WHERE path = $1 OR left(path, length($2)) = $2 OR path = $3 OR path = $4', [`users/${uid}`, `users/${uid}/`, `accountLifecycles/${uid}`, `accountDeletionJobs/job_${uid}`]);
    await pgFixture.monitor.query('DELETE FROM filosage_documents WHERE left(path, length($1)) = $1', [`stripeEvents/evt_${testPrefix}_`]);
    for (const kind of ['started', 'canceled']) await pgFixture.monitor.query('DELETE FROM filosage_documents WHERE left(path, length($1)) = $1', [`productEvents/stripe-${kind}-evt_${testPrefix}_`]);
    await pgFixture.close();
  }
  await rm(fileDirectory, { recursive: true, force: true });
});

test('all four source/target offers reconcile through signed webhooks and real transactions', async () => {
  for (const source of offers) for (const target of offers) {
    const f = fixture(source);
    await seed(f);
    const before = await read(f);
    assert.equal(before.ledger.balance, source.plan === 'plus' ? 2 : 5);
    update(f, target);
    const id = `evt_${testPrefix}_${++sequence}`;
    assert.equal((await deliver(f, 'customer.subscription.updated', { id })).status, 200);
    const { account, ledger } = await read(f);
    assert.equal(account.billingPlan, target.plan);
    assert.equal(account.billingInterval, target.interval);
    assert.equal(account.subscriptionStatus, 'active');
    assert.equal(account.billingConsentPriceId, source.price);
    assert.equal(account.billingConsentCheckoutSessionId, `cs_${f.uid}`);
    assert.equal(ledger.balance, source.plan === 'pro' || target.plan === 'pro' ? 5 : 2);
    const transition = await store.getStoredDocument(`users/${f.uid}/billingTransitions/${id}`);
    if (source.price !== target.price) {
      assert.equal(transition?.toPriceId, target.price);
      assert.equal(transition?.authorizationBasis, 'verified_existing_subscription_management');
    }
    assert.equal((await deliver(f, 'customer.subscription.updated', { id })).status, 200);
    assert.equal((await read(f)).ledger.balance, ledger.balance);
    assert.equal((await deliver(f, 'customer.subscription.updated', { created: 1 })).status, 200);
    assert.equal((await read(f)).account.billingPriceId, target.price);
  }
  assert.equal(calls.filter(call => call.method !== 'GET').length, 0, 'Replays and transitions never issue a charge or provider mutation');
});

test('unpaid target cannot reuse paid source invoice; failure/recovery cannot farm grants', async () => {
  const f = fixture(); await seed(f);
  update(f, offers[2], 'paid', true);
  assert.equal((await deliver(f, 'customer.subscription.updated')).status, 200);
  assert.equal((await read(f)).account.subscriptionStatus, 'past_due');
  assert.equal((await read(f)).ledger.balance, 2);
  for (let n = 0; n < 3; n++) {
    update(f, offers[2], 'open');
    assert.equal((await deliver(f, 'customer.subscription.updated')).status, 200);
    assert.equal((await read(f)).account.subscriptionStatus, 'past_due');
    update(f, offers[2]);
    assert.equal((await deliver(f, 'invoice.paid', { object: provider.get(`/v1/invoices/${f.subscription.latest_invoice}`) })).status, 200);
    assert.equal((await read(f)).ledger.balance, 5);
  }
  // Downgrade and upgrade in the same accrual period cannot repeat the top-up.
  update(f, offers[0]); await deliver(f, 'customer.subscription.updated');
  update(f, offers[2]); await deliver(f, 'customer.subscription.updated');
  assert.equal((await read(f)).ledger.balance, 5);
});

test('same-second current cancellation survives reverse delivered active event', async () => {
  const f = fixture(); await seed(f);
  const oldSnapshot = structuredClone(f.subscription);
  const created = currentSecond();
  f.subscription.cancel_at_period_end = true;
  assert.equal((await deliver(f, 'customer.subscription.updated', { created })).status, 200);
  assert.equal((await read(f)).account.billingCancelAtPeriodEnd, true);
  assert.equal((await read(f)).account.subscriptionStatus, 'active');
  f.subscription.status = 'canceled';
  assert.equal((await deliver(f, 'customer.subscription.deleted', { created })).status, 200);
  assert.equal((await deliver(f, 'customer.subscription.updated', { created, object: oldSnapshot })).status, 200);
  assert.equal((await read(f)).account.subscriptionStatus, 'canceled');
});

test('unknown Price and customer rebinding fail closed', async () => {
  const f = fixture(); await seed(f);
  f.subscription.items.data[0].price.id = 'price_foreign';
  assert.equal((await deliver(f, 'customer.subscription.updated')).status, 500);
  assert.equal((await read(f)).account.billingPriceId, f.original.price);
  update(f, offers[2]);
  f.customer.metadata.filosage_uid = 'other';
  assert.equal((await deliver(f, 'customer.subscription.updated')).status, 500);
  assert.equal((await read(f)).account.billingCustomerId, f.customer.id);
});

test('signature and missing signing secret fail closed independently of Portal config', async () => {
  const f = fixture(); await seed(f);
  const bad = await POST(new Request('https://filosage.test/api/billing/webhook', { method: 'POST', body: '{}', headers: { 'stripe-signature': 'invalid' } }));
  assert.equal(bad.status, 400);
  const secret = process.env.STRIPE_WEBHOOK_SECRET; delete process.env.STRIPE_WEBHOOK_SECRET;
  assert.equal((await POST(new Request('https://filosage.test/api/billing/webhook', { method: 'POST', body: '{}' }))).status, 503);
  process.env.STRIPE_WEBHOOK_SECRET = secret;
});

test('deletion cancellation confirms an unknown provider outcome without Portal configuration', async () => {
  const f = fixture(); await seed(f); cancelUnknown = true;
  assert.deepEqual(await billing.cancelStripeBillingForAccountDeletion({ uid: f.uid, customerId: f.customer.id, subscriptionId: f.subscription.id, jobId: 'fixture-job' }), { confirmed: true, jobId: 'fixture-job' });
  assert.equal(f.subscription.status, 'canceled');
});

test('refund/dispute holds survive replay, same-second recovery and fresh paid renewal', async () => {
  const f = fixture(); await seed(f);
  const charge = { object: 'charge', id: `ch_${f.uid}`, payment_intent: `pi_${f.uid}`, amount: 1499, amount_refunded: 0, refunded: false, currency: 'usd' };
  const dispute = { object: 'dispute', id: `dp_${f.uid}`, charge: charge.id, status: 'needs_response', amount: 1499, currency: 'usd' };
  provider.set(`/v1/charges/${charge.id}`, charge);
  provider.set(`/v1/disputes/${dispute.id}`, dispute);
  provider.set('/v1/invoice_payments', { object: 'list', data: [{ invoice: f.subscription.latest_invoice }], has_more: false });
  assert.equal((await deliver(f, 'charge.dispute.created', { object: dispute })).status, 200);
  assert.equal((await read(f)).account.billingPaymentState, 'disputed');
  assert.equal((await deliver(f, 'customer.subscription.updated')).status, 200);
  assert.equal((await read(f)).account.subscriptionStatus, 'past_due');
  assert.equal((await deliver(f, 'charge.dispute.closed', { object: { ...dispute, status: 'won' } })).status, 200);
  assert.equal((await read(f)).account.billingPaymentState, 'disputed', 'A closed event cannot release a currently unresolved dispute');
  dispute.status = 'won';
  assert.equal((await deliver(f, 'charge.dispute.closed', { object: dispute })).status, 200);
  assert.equal((await read(f)).account.subscriptionStatus, 'active');
  assert.equal((await read(f)).ledger.balance, 2);
  charge.amount_refunded = charge.amount; charge.refunded = true;
  assert.equal((await deliver(f, 'charge.refunded', { object: charge })).status, 200);
  assert.equal((await read(f)).account.billingPaymentState, 'refunded');
  assert.equal((await deliver(f, 'invoice.paid', { object: provider.get(`/v1/invoices/${f.subscription.latest_invoice}`) })).status, 200);
  assert.equal((await read(f)).account.subscriptionStatus, 'past_due');
  update(f, offers[0]);
  assert.equal((await deliver(f, 'invoice.paid', { object: provider.get(`/v1/invoices/${f.subscription.latest_invoice}`) })).status, 200);
  assert.equal((await read(f)).account.subscriptionStatus, 'active');
  assert.equal((await read(f)).ledger.balance, 2);
});

test('concurrent same-second refreshes use a durable lease and retry current provider truth', async () => {
  const f = fixture(); await seed(f);
  let reads = 0, release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const reached = new Promise(resolve => { entered = resolve; });
  beforeRead = async path => {
    if (path === `/v1/subscriptions/${f.subscription.id}` && ++reads === 2) {
      entered(); await gate;
    }
  };
  const first = deliver(f, 'customer.subscription.updated');
  await reached;
  const secondId = `evt_${testPrefix}_${++sequence}`;
  try {
    const second = await deliver(f, 'customer.subscription.updated', { id: secondId });
    assert.equal(second.status, 500, 'Contending handler must ask Stripe to retry, not overwrite a leased snapshot');
    update(f, offers[2]);
  } finally { release(); beforeRead = undefined; }
  assert.equal((await first).status, 200);
  assert.equal((await deliver(f, 'customer.subscription.updated', { id: secondId })).status, 200);
  assert.equal((await read(f)).account.billingPriceId, offers[2].price);
  assert.equal((await read(f)).ledger.balance, 5);
});

test('restricted recovery preserves cancellation and cannot open plan changes', async () => {
  process.env.STRIPE_PORTAL_CONFIGURATION_ID = 'bpc_fixture12345';
  try {
    const f = fixture(); await seed(f);
    const account = { ...(await read(f)).account, acceptedTermsVersion: 'stale', accountStatus: 'suspended' };
    await billing.createBillingPortalSession(account, 'manage');
    let params = new URLSearchParams(calls.at(-1).body);
    assert.equal(params.get('flow_data[type]'), 'payment_method_update');
    assert.equal(params.get('flow_data[after_completion][type]'), 'redirect');
    assert.equal(params.get('configuration'), 'bpc_fixture12345');
    await billing.createBillingPortalSession(account, 'cancel');
    params = new URLSearchParams(calls.at(-1).body);
    assert.equal(params.get('flow_data[type]'), 'subscription_cancel');
    await assert.rejects(billing.createBillingPortalSession(account, 'change_plan'), /Plan changes require/);
    const active = { ...account, accountStatus: 'active', acceptedTermsVersion: TERMS_VERSION };
    f.subscription.status = 'past_due';
    await assert.rejects(billing.createBillingPortalSession(active, 'change_plan'), /Recover your payment/);
  } finally { delete process.env.STRIPE_PORTAL_CONFIGURATION_ID; }
});

test('four Checkout offers restrict methods to card and signed completion records original consent', async () => {
  for (const offer of offers) {
    const f = fixture(offer);
    const account = { uid: f.uid, email: `${f.uid}@example.test`, displayName: 'Fixture learner', accountStatus: 'active', plan: 'free', billingCustomerId: f.customer.id, subscriptionStatus: 'none' };
    await store.putStoredDocument(paths(f.uid).account, account);
    f.subscription.status = 'canceled';
    const url = await billing.createCheckoutSession(account, offer.plan, offer.interval, { version: 'paid-checkout-eligibility-v1', age18OrOlder: true, usResident: true, automaticRenewalAccepted: true });
    assert.equal(url, 'https://checkout.stripe.com/c/pay/fixture');
    const params = new URLSearchParams(calls.findLast(call => call.method === 'POST' && call.path === '/v1/checkout/sessions').body);
    assert.equal(params.get('payment_method_types[0]'), 'card');
    assert.equal(params.get('payment_method_types[1]'), null);
    assert.equal(params.get('line_items[0][price]'), offer.price);
    const metadata = Object.fromEntries([...params].filter(([key]) => key.startsWith('metadata[')).map(([key, value]) => [key.slice(9, -1), value]));
    assert.ok(metadata.filosage_account_generation);
    assert.equal(params.get('subscription_data[metadata][filosage_account_generation]'), metadata.filosage_account_generation);
    f.subscription.metadata.filosage_account_generation = metadata.filosage_account_generation;
    const invoice = provider.get(`/v1/invoices/${f.subscription.latest_invoice}`);
    const session = { object: 'checkout.session', id: `cs_${f.uid}`, mode: 'subscription', status: 'complete', payment_status: 'paid', customer: f.customer.id, subscription: f.subscription.id, client_reference_id: f.uid, consent: { terms_of_service: 'accepted' }, currency: 'usd', amount_subtotal: invoice.amount_paid, amount_total: invoice.amount_paid, metadata };
    f.subscription.status = 'active';
    assert.equal((await deliver(f, 'checkout.session.completed', { object: session })).status, 200);
    const consent = await store.getStoredDocument(`users/${f.uid}/billingConsents/${session.id}`);
    assert.equal(consent.planId, offer.plan);
    assert.equal(consent.interval, offer.interval);
    assert.equal((await read(f)).account.billingConsentPriceId, offer.price);
    assert.equal((await store.getStoredDocument(`users/${f.uid}/billingCheckout/current`)).status, 'completed');
    const balance = (await read(f)).ledger.balance;
    assert.equal((await deliver(f, 'checkout.session.completed', { object: session, created: 1 })).status, 200);
    assert.equal((await read(f)).ledger.balance, balance);
  }
});

test('authenticated Portal route permits suspended/stale-Terms cancellation without accepting Terms', { skip: Boolean(pgFixture) }, async () => {
  const f = fixture(offers[0], 'local-free-learner'); await seed(f);
  const original = (await read(f)).account;
  await store.putStoredDocument(paths(f.uid).account, { ...original, accountStatus: 'suspended', acceptedTermsVersion: 'historical-terms' });
  process.env.STRIPE_PORTAL_CONFIGURATION_ID = 'bpc_fixture12345';
  try {
    const { POST: portalPost } = await import('../../src/app/api/billing/portal/route.ts');
    const generation = await lifecycleApi.captureAccountGeneration(f.uid);
    const invoke = action => lifecycleApi.runWithAccountGeneration(generation, () => portalPost(new Request('https://filosage.test/api/billing/portal', { method: 'POST', body: JSON.stringify({ action }), headers: { authorization: 'Bearer playwright-free-learner', origin: 'https://filosage.test', 'content-type': 'application/json' } })));
    assert.equal((await invoke('manage')).status, 200);
    assert.equal((await invoke('cancel')).status, 200);
    assert.equal((await invoke('change_plan')).status, 403);
    assert.equal((await read(f)).account.acceptedTermsVersion, 'historical-terms');
  } finally { delete process.env.STRIPE_PORTAL_CONFIGURATION_ID; }
});

test('downgrade enforces Plus rollover cap and returning to original offer is audited', async () => {
  const f = fixture(offers[2]); await seed(f);
  const { ledger } = await read(f);
  await store.putStoredDocument(paths(f.uid).ledger, { ...ledger, balance: 60 });
  update(f, offers[0]); await deliver(f, 'customer.subscription.updated');
  assert.equal((await read(f)).ledger.balance, 24);
  update(f, offers[2]);
  const id = `evt_${testPrefix}_${++sequence}`;
  await deliver(f, 'customer.subscription.updated', { id });
  const audit = await store.getStoredDocument(`users/${f.uid}/billingTransitions/${id}`);
  assert.equal(audit.fromPriceId, offers[0].price);
  assert.equal(audit.toPriceId, offers[2].price);
  assert.equal((await read(f)).ledger.balance, 24, 'A return upgrade cannot farm a second top-up');
});

test('late signed Checkout after deletion contains owned billing without restoring account or credits', async () => {
  const f = fixture();
  const jobId = `job_${f.uid}`;
  const lifecycle = await lifecycleApi.captureAccountGeneration(f.uid);
  const job = { ...lifecycle, jobId, billingCustomerId: f.customer.id, billingSubscriptionId: f.subscription.id, stage: 'completed', cancellationConfirmed: true };
  await lifecycleApi.runWithAccountGeneration(lifecycle, () => rawStore.runStoredDocumentTransaction([`accountLifecycles/${f.uid}`, `accountDeletionJobs/${jobId}`], () => ({ writes: [
    { path: `accountLifecycles/${f.uid}`, data: { ...lifecycle, state: 'deleting', jobId } },
    { path: `accountDeletionJobs/${jobId}`, data: job },
  ], result: undefined })));
  await lifecycleApi.runWithAccountDeletion(job, () => rawStore.putStoredDocument(`accountLifecycles/${f.uid}`, { ...lifecycle, state: 'deleted', jobId }));
  const session = { object: 'checkout.session', id: `cs_${f.uid}`, subscription: f.subscription.id, customer: f.customer.id, mode: 'subscription' };
  assert.equal((await deliver(f, 'checkout.session.completed', { object: session })).status, 200);
  assert.equal(f.subscription.status, 'canceled');
  assert.equal((await read(f)).account, null);
  assert.equal((await read(f)).ledger, null);
  assert.equal(await store.getStoredDocument(`users/${f.uid}/billingReconciliation/current`), null);
  if (pgFixture) {
    await pgFixture.monitor.query('DELETE FROM filosage_documents WHERE path = ANY($1::text[])', [[`accountLifecycles/${f.uid}`, `accountDeletionJobs/${jobId}`]]);
  }
});

test('an in-flight signed subscription update cannot cross the account deletion generation fence', async () => {
  const f = fixture(); await seed(f);
  const lifecycle = await lifecycleApi.captureAccountGeneration(f.uid);
  let reads = 0, release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const reached = new Promise(resolve => { entered = resolve; });
  beforeRead = async path => {
    if (path === `/v1/subscriptions/${f.subscription.id}` && ++reads === 2) { entered(); await gate; }
  };
  update(f, offers[2]);
  const pending = deliver(f, 'customer.subscription.updated');
  await reached;
  const jobId = `job_${f.uid}`;
  try {
    await lifecycleApi.runWithAccountGeneration(lifecycle, () => rawStore.runStoredDocumentTransaction([`accountLifecycles/${f.uid}`, `accountDeletionJobs/${jobId}`], () => ({ writes: [
      { path: `accountLifecycles/${f.uid}`, data: { ...lifecycle, state: 'deleting', jobId } },
      { path: `accountDeletionJobs/${jobId}`, data: { ...lifecycle, jobId, billingCustomerId: f.customer.id, billingSubscriptionId: f.subscription.id, stage: 'checkout' } },
    ], result: undefined })));
  } finally { beforeRead = undefined; release(); }
  assert.equal((await pending).status, 500);
  assert.equal((await read(f)).account.billingPlan, 'plus');
  assert.equal((await read(f)).ledger.balance, 2);
  assert.equal((await deliver(f, 'customer.subscription.updated')).status, 200);
  assert.equal(f.subscription.status, 'canceled');
  if (pgFixture) await pgFixture.monitor.query('DELETE FROM filosage_documents WHERE path = $1', [`accountDeletionJobs/${jobId}`]);
});

test('a payment completed between the event read and leased invoice refresh grants paid access', async () => {
  const f = fixture(); await seed(f);
  update(f, offers[2], 'open');
  let invoiceReads = 0;
  beforeRead = async path => {
    if (path === `/v1/invoices/${f.subscription.latest_invoice}` && ++invoiceReads === 2) {
      const invoice = provider.get(path);
      invoice.status = 'paid'; invoice.status_transitions.paid_at = currentSecond(); invoice.amount_paid = invoice.amount_due;
    }
  };
  try {
    assert.equal((await deliver(f, 'customer.subscription.updated')).status, 200);
    assert.equal((await read(f)).account.billingPaymentState, 'paid');
    assert.equal((await read(f)).account.subscriptionStatus, 'active');
    assert.equal((await read(f)).ledger.balance, 5);
  } finally { beforeRead = undefined; }
});


test('closing an old invoice dispute must not clear the latest invoice hold', async () => {
  const f = fixture(); await seed(f);
  const oldInvoiceId = f.subscription.latest_invoice;
  update(f, offers[0]);
  await deliver(f, 'invoice.paid', { object: provider.get(`/v1/invoices/${f.subscription.latest_invoice}`) });
  const latestInvoiceId = f.subscription.latest_invoice;
  const currentCharge = { object: 'charge', id: `ch_current_${f.uid}`, payment_intent: `pi_current_${f.uid}`, amount: 1499, amount_refunded: 0, refunded: false, currency: 'usd' };
  const currentDispute = { object: 'dispute', id: `dp_current_${f.uid}`, charge: currentCharge.id, status: 'needs_response', amount: 1499, currency: 'usd' };
  provider.set(`/v1/charges/${currentCharge.id}`, currentCharge);
  provider.set(`/v1/disputes/${currentDispute.id}`, currentDispute);
  provider.set('/v1/invoice_payments', { object: 'list', data: [{ invoice: latestInvoiceId }], has_more: false });
  assert.equal((await deliver(f, 'charge.dispute.created', { object: currentDispute })).status, 200);
  assert.equal((await read(f)).account.billingPaymentState, 'disputed');
  const oldCharge = { object: 'charge', id: `ch_old_${f.uid}`, payment_intent: `pi_old_${f.uid}`, amount: 1499, amount_refunded: 0, refunded: false, currency: 'usd' };
  const oldDispute = { object: 'dispute', id: `dp_old_${f.uid}`, charge: oldCharge.id, status: 'won', amount: 1499, currency: 'usd' };
  provider.set(`/v1/charges/${oldCharge.id}`, oldCharge);
  provider.set(`/v1/disputes/${oldDispute.id}`, oldDispute);
  provider.set('/v1/invoice_payments', { object: 'list', data: [{ invoice: oldInvoiceId }], has_more: false });
  assert.equal((await deliver(f, 'charge.dispute.closed', { object: oldDispute })).status, 200);
  const observed = await read(f);
  assert.equal(observed.account.billingInvoiceId, latestInvoiceId);
  assert.equal(observed.account.billingPaymentState, 'disputed', 'Closing a different invoice dispute must preserve current unresolved dispute');
  assert.equal(observed.account.subscriptionStatus, 'past_due');
  assert.equal(currentDispute.status, 'needs_response');
  assert.equal(observed.ledger.balance, 2);
  assert.ok(observed.ledger.frozenAt);
});


for (const outcome of ['expired', 'unknown', 'completed', 'replaced', 'missing', 'not_created', 'creation_unknown', 'expiration_unknown_confirmed', 'resumed_unknown']) {
  test(`Checkout deletion race retains a claim-bound ${outcome} outcome`, async () => {
    // This test deliberately uses R04's real lifecycle/store/deletion worker.
    const deletion = await import('../../src/lib/account-deletion.ts');
    const f = fixture(); f.subscription.status = 'canceled';
    const account = { uid: f.uid, email: `${f.uid}@example.test`, displayName: 'Fixture learner', accountStatus: 'active', plan: 'free', billingCustomerId: f.customer.id, subscriptionStatus: 'none' };
    await store.putStoredDocument(paths(f.uid).account, account);
    const generation = await lifecycleApi.captureAccountGeneration(f.uid);
    const checkoutPath = `users/${f.uid}/billingCheckout/current`;
    if (outcome === 'resumed_unknown') {
      checkoutCreateUnknown = true;
      await assert.rejects(lifecycleApi.runWithAccountGeneration(generation, () => billing.createCheckoutSession(account, 'plus', 'monthly', { version: 'paid-checkout-eligibility-v1', age18OrOlder: true, usResident: true, automaticRenewalAccepted: true })));
      const uncertain = await store.getStoredDocument(checkoutPath);
      assert.equal(uncertain.status, 'creating');
      await store.putStoredDocument(checkoutPath, { ...uncertain, claimedAt: new Date(Date.now() - 180000).toISOString() });
    }
    let entered, release;
    const reached = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    beforeRead = async (path, method) => {
      if ((['not_created', 'resumed_unknown'].includes(outcome) && path === '/v1/prices/price_plus_monthly')
        || (!['not_created', 'resumed_unknown'].includes(outcome) && path === '/v1/checkout/sessions' && method === 'POST')) { entered(); await gate; }
      if (path.endsWith('/expire')) {
        if (outcome === 'unknown') throw new Error('Expiration outcome unknown');
        if (outcome === 'expiration_unknown_confirmed') { provider.get(path.slice(0, -7)).status = 'expired'; throw new Error('Expiration response lost after provider commit'); }
        if (outcome === 'completed') {
          const session = provider.get(path.slice(0, -7));
          session.status = 'complete'; session.subscription = f.subscription.id;
          f.subscription.status = 'active';
          throw new Error('Checkout completed before expiration');
        }
      }
    };
    checkoutCreateUnknown = outcome === 'creation_unknown';
    const creating = lifecycleApi.runWithAccountGeneration(generation, () => billing.createCheckoutSession(account, 'plus', 'monthly', { version: 'paid-checkout-eligibility-v1', age18OrOlder: true, usResident: true, automaticRenewalAccepted: true }));
    const rejected = assert.rejects(creating);
    await reached;
    const originalClaim = await store.getStoredDocument(checkoutPath);
    if (outcome === 'replaced') await store.putStoredDocument(checkoutPath, { ...originalClaim, claimId: 'another-claim' });
    if (outcome === 'missing') await lifecycleApi.runWithAccountGeneration(generation, () => rawStore.deleteStoredDocuments([checkoutPath]));
    const job = await lifecycleApi.runWithAccountGeneration(generation, () => deletion.beginAccountDeletion(f.uid));
    try {
      if (outcome !== 'missing') assert.equal((await deletion.resumeAccountDeletion(job)).body.code, 'ACCOUNT_DELETION_WAITING_FOR_CHECKOUT');
      release(); await rejected;
      const checkout = await store.getStoredDocument(checkoutPath);
      if (outcome === 'expired' || outcome === 'completed' || outcome === 'not_created' || outcome === 'expiration_unknown_confirmed') {
        assert.equal(checkout.status, 'canceled');
        assert.equal(checkout.claimId, originalClaim.claimId);
        assert.equal(checkout.accountGeneration, generation.generation);
        assert.equal(checkout.containmentJobId, job.jobId);
        assert.ok(checkout.containmentConfirmedAt);
        assert.equal(checkout.sessionId, outcome === 'not_created' ? null : `cs_${f.uid}`);
        assert.equal(checkout.containmentOutcome, outcome === 'not_created' ? 'not_created' : 'contained');
        if (outcome === 'not_created') assert.equal(provider.has(`/v1/checkout/sessions/cs_${f.uid}`), false);
        if (outcome === 'completed') assert.equal(f.subscription.status, 'canceled');
        assert.notEqual((await deletion.resumeAccountDeletion(job)).body.code, 'ACCOUNT_DELETION_WAITING_FOR_CHECKOUT');
      } else if (outcome === 'missing') assert.equal(checkout, null, 'Containment cannot recreate an erased claim');
      else {
        assert.equal(checkout.status, 'creating');
        assert.equal(checkout.containmentConfirmedAt, undefined);
        if (outcome === 'replaced') assert.equal(checkout.claimId, 'another-claim');
        assert.equal((await deletion.resumeAccountDeletion(job)).body.code, 'ACCOUNT_DELETION_WAITING_FOR_CHECKOUT');
      }
    } finally {
      beforeRead = undefined; checkoutCreateUnknown = false; release();
      if (pgFixture) await pgFixture.monitor.query('DELETE FROM filosage_documents WHERE path = $1', [`accountDeletionJobs/${job.jobId}`]);
    }
  });
}
