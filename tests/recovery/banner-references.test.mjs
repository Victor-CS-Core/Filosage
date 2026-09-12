import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectBannerReferences, bannerTupleFingerprint, compareBannerInventory } from '../../scripts/recovery-banner-references.mjs';
const key = 'a'.repeat(64);
const objectKey = `course-banners/${'b'.repeat(32)}.webp`;
const fixture = rows => ({ query: async sql => { assert.match(sql, /LIMIT 1001/); return { rows }; } });
test('valid references expose only keyed tuples and aggregate counts', async () => {
  const result = await inspectBannerReferences(fixture([{ reference_valid: true, asset_valid: true, storage: 'azure-blob', object_key: objectKey, bytes: 42 }, { reference_valid: true, asset_valid: true, storage: 'inline', object_key: null, bytes: 4 }]), key);
  assert.equal(result.blobReferences, 1); assert.equal(result.inlineReferences, 1);
  assert.equal(result.invalidReferences, 0);
  assert.deepEqual(result.blobTupleHmacs, [bannerTupleFingerprint(key, objectKey, 42)]);
  assert.ok(!JSON.stringify(result).includes(objectKey));
  assert.notEqual(bannerTupleFingerprint(key, objectKey, 42), bannerTupleFingerprint('c'.repeat(64), objectKey, 42));
  assert.equal(compareBannerInventory(result, [bannerTupleFingerprint(key, objectKey, 42)]).blobMembershipVerified, true);
  assert.equal(compareBannerInventory(result, [bannerTupleFingerprint(key, objectKey, 43)]).blobMembershipVerified, false);
});
test('invalid references and oversized or malformed results fail closed', async () => {
  const result = await inspectBannerReferences(fixture([{ reference_valid: false, asset_valid: false }]), key);
  assert.equal(result.invalidReferences, 1);
  assert.equal(compareBannerInventory(result, []).blobMembershipVerified, false);
  await assert.rejects(inspectBannerReferences(fixture(Array(1001).fill({})), key));
  await assert.rejects(inspectBannerReferences(fixture([]), 'bad'));
  assert.throws(() => bannerTupleFingerprint(key, 'other', 42));
  assert.throws(() => bannerTupleFingerprint(key, objectKey, -1));
});
