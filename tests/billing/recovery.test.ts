import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateBillingConfiguration, subscriptionAccessIsCurrent } from '../../src/lib/billing-lock.ts';

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

test('paid access ends exactly at the paid period or earlier trial boundary', () => {
  const now = Date.parse('2026-09-11T12:00:00Z');
  const future = '2026-10-11T12:00:00Z';
  assert.equal(subscriptionAccessIsCurrent({ subscriptionStatus: 'active', currentPeriodEnd: '2026-09-11T12:00:00Z' }, now), false);
  assert.equal(subscriptionAccessIsCurrent({ subscriptionStatus: 'active', currentPeriodEnd: future }, now), true);
  assert.equal(subscriptionAccessIsCurrent({ subscriptionStatus: 'trialing', currentPeriodEnd: future, billingTrialEnd: '2026-09-11T11:59:59Z' }, now), false);
  assert.equal(subscriptionAccessIsCurrent({ subscriptionStatus: 'trialing', currentPeriodEnd: future, billingTrialEnd: '2026-09-12T12:00:00Z' }, now), true);
  for (const subscriptionStatus of ['past_due', 'canceled', 'unpaid', 'paused', 'none']) {
    assert.equal(subscriptionAccessIsCurrent({ subscriptionStatus, currentPeriodEnd: future }, now), false);
  }
});
