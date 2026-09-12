import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recoveryIngressMatches } from '../../scripts/recovery-app-packet.mjs';

test('ARM key ordering is irrelevant while ingress values and rule count remain exact', () => {
  const requested = [{ name: 'recovery-operator-20260912', action: 'Allow', ipAddressRange: '198.51.100.17/32' }];
  const observed = [{ action: 'Allow', ipAddressRange: '198.51.100.17/32', name: 'recovery-operator-20260912' }];
  assert.equal(recoveryIngressMatches(observed, requested), true);
  for (const changed of [[{ ...observed[0], action: 'Deny' }], [{ ...observed[0], ipAddressRange: '0.0.0.0/0' }],
    [{ ...observed[0], name: 'other' }], [...observed, observed[0]], [], undefined]) {
    assert.equal(recoveryIngressMatches(changed, requested), false);
  }
});
