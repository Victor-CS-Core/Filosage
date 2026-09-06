import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateBillingConfiguration } from '../../src/lib/billing-lock.ts';

test('Portal configuration and acquisition do not gate API or signed webhooks', () => {
  const config = evaluateBillingConfiguration({ BILLING_PROVIDER: 'stripe', BILLING_ENABLED: 'false', STRIPE_SECRET_KEY: 'sk_test_mock', STRIPE_WEBHOOK_SECRET: 'whsec_fixture' });
  assert.equal(config.apiReady, true);
  assert.equal(config.webhookReady, true);
  assert.equal(config.portalReady, false);
  assert.equal(config.managementReady, false);
  assert.equal(config.checkoutReady, false);
  assert.equal(evaluateBillingConfiguration({ BILLING_PROVIDER: 'stripe', STRIPE_WEBHOOK_SECRET: 'whsec_fixture' }).webhookReady, false);
  assert.equal(evaluateBillingConfiguration({ BILLING_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'sk_test_mock' }).webhookReady, false);
});
