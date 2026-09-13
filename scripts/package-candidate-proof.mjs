import { fingerprint } from './blue-green-contract.ts';
import { hostedGates } from './blue-green-review.ts';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 200) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && /^[\x20-\x7e]+$/.test(value);
const keys = (value, names) => object(value) && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));

/** Package reviewed observations; this does not perform or independently certify those gates. */
export function packageHostedProofs(packet, candidate, candidateArtifact, now = Date.now()) {
  if (Buffer.byteLength(JSON.stringify(packet) || '') > 32768
    || !keys(packet, ['schemaVersion', 'candidateFingerprint', 'evidence']) || packet.schemaVersion !== 1
    || packet.candidateFingerprint !== fingerprint(candidate) || !Array.isArray(packet.evidence) || packet.evidence.length !== hostedGates.length) throw Error('Exact candidate and seven reviewed sources required.');
  const seen = new Set();
  return packet.evidence.map(entry => {
    if (!keys(entry, ['gate', 'result', 'reviewedBy', 'method', 'observedAt', 'source', 'sourceSha256'])
      || !hostedGates.includes(entry.gate) || seen.has(entry.gate) || entry.result !== 'passed' || !text(entry.reviewedBy)
      || !['operator-reviewed', 'automated-probe-reviewed'].includes(entry.method)
      || typeof entry.observedAt !== 'string' || !Number.isFinite(Date.parse(entry.observedAt)) || Date.parse(entry.observedAt) > now + 60000
      || !keys(entry.source, ['reference', 'observations']) || !text(entry.source.reference, 500)
      || !Array.isArray(entry.source.observations) || !entry.source.observations.length || entry.source.observations.length > 20
      || entry.source.observations.some(row => !keys(row, ['check', 'expected', 'observed', 'result'])
        || !text(row.check) || !text(row.expected, 500) || !text(row.observed, 1000) || row.result !== 'passed')
      || entry.sourceSha256 !== fingerprint(entry.source)) throw Error('Missing, failed or changed reviewed observations.');
    seen.add(entry.gate);
    return { source: entry.source, proof: {
      schemaVersion: 1, candidateFingerprint: fingerprint(candidate), gate: entry.gate, result: entry.result,
      sha: candidate.sha, imageDigest: candidate.imageDigest, appId: candidate.appId, revision: candidate.revision,
      manifestFingerprint: fingerprint(candidate.manifest), authConfigSha256: candidate.authConfigSha256, productionOrigin: candidate.productionOrigin,
      observedAt: entry.observedAt, method: entry.method, reviewedBy: entry.reviewedBy,
      sourceSha256: entry.sourceSha256, candidateArtifact, evidenceKind: entry.method,
      automatedGateExecution: false, packagingDoesNotEstablishApproval: true,
    } };
  });
}
