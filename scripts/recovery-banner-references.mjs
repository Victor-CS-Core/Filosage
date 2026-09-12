import { createHmac } from 'node:crypto';

export function bannerTupleFingerprint(key, objectKey, bytes) {
  if (!/^[a-f0-9]{64}$/.test(key) || !/^course-banners\/[a-f0-9]{32}\.webp$/.test(objectKey)
    || !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 650000) throw new Error('Invalid banner tuple.');
  return createHmac('sha256', key).update(JSON.stringify([objectKey, bytes])).digest('hex');
}

/** Caller owns an already-open repeatable-read/read-only transaction and its rollback. */
export async function inspectBannerReferences(client, key) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid fingerprint context.');
  const rows = (await client.query(`SELECT
    coalesce(c.data->'banner'->>'assetId' ~ '^[a-f0-9]{32}$', false) AS reference_valid,
    coalesce(a.data->>'contentType' = 'image/webp', false) AS asset_valid,
    CASE WHEN a.data->>'storage' = 'azure-blob' THEN 'azure-blob'
      WHEN jsonb_typeof(a.data->'data') = 'string' THEN 'inline' ELSE 'invalid' END AS storage,
    CASE WHEN c.data->'banner'->>'assetId' ~ '^[a-f0-9]{32}$'
      THEN 'course-banners/' || (c.data->'banner'->>'assetId') || '.webp' END AS object_key,
    CASE WHEN jsonb_typeof(a.data->'bytes') = 'number' AND a.data->>'bytes' ~ '^[0-9]{1,6}$'
      THEN (a.data->>'bytes')::integer ELSE NULL END AS bytes
    FROM public.filosage_documents c LEFT JOIN public.filosage_documents a
      ON a.path = 'courseBannerAssets/' || (c.data->'banner'->>'assetId')
    WHERE c.collection_path = 'courses' AND c.data->'banner' IS NOT NULL AND c.data->'banner' <> 'null'::jsonb
    ORDER BY c.path COLLATE "C" LIMIT 1001`)).rows;
  if (!Array.isArray(rows) || rows.length > 1000) throw new Error('Banner reference bound exceeded.');
  const result = { references: rows.length, blobReferences: 0, inlineReferences: 0, invalidReferences: 0,
    blobTupleHmacs: [], inlineContentsVerified: false, historicalPointConsistencyVerified: false, applicationAccessVerified: false };
  for (const row of rows) {
    if (row.reference_valid !== true || row.asset_valid !== true || !Number.isSafeInteger(row.bytes) || row.bytes <= 0 || row.bytes > 650000) {
      result.invalidReferences++; continue;
    }
    if (row.storage === 'inline') { result.inlineReferences++; continue; }
    if (row.storage !== 'azure-blob') { result.invalidReferences++; continue; }
    result.blobTupleHmacs.push(bannerTupleFingerprint(key, row.object_key, row.bytes)); result.blobReferences++;
  }
  return result;
}

export function compareBannerInventory(references, inventoryTupleHmacs) {
  if (!Array.isArray(references?.blobTupleHmacs) || !Array.isArray(inventoryTupleHmacs)
    || [...references.blobTupleHmacs, ...inventoryTupleHmacs].some(value => !/^[a-f0-9]{64}$/.test(value))) throw new Error('Invalid keyed inventory.');
  const inventory = new Set(inventoryTupleHmacs);
  const missingBlobReferences = references.blobTupleHmacs.filter(value => !inventory.has(value)).length;
  return { blobReferences: references.blobTupleHmacs.length, missingBlobReferences,
    blobMembershipVerified: references.invalidReferences === 0 && missingBlobReferences === 0,
    inlineContentsVerified: false, historicalPointConsistencyVerified: false, applicationAccessVerified: false };
}
