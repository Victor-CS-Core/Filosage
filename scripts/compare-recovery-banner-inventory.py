#!/usr/bin/env python3
"""Read only the exact staged container; compare keyed clone banner references privately."""
import argparse
import hashlib
import hmac
import importlib.util
import json
from pathlib import Path
import re
import subprocess

spec = importlib.util.spec_from_file_location('inspection', Path(__file__).with_name('run-service-recovery-database-inspection.py'))
inspection = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inspection)

def compare(key, references, rows):
    if not re.fullmatch('[a-f0-9]{64}', key) or not isinstance(rows, list) or len(rows) > 100:
        raise RuntimeError('Invalid bounded inventory.')
    fingerprints = set()
    total = 0
    for row in rows:
        name = row.get('name', '')
        length = row.get('properties', {}).get('contentLength')
        if not re.fullmatch(r'course-banners/[a-f0-9]{32}\.webp', name) or type(length) is not int or not 0 < length <= 650000:
            raise RuntimeError('Invalid staged object.')
        total += length
        if total > 10000000: raise RuntimeError('Inventory byte bound exceeded.')
        payload = json.dumps([name, length], separators=(',', ':')).encode()
        fingerprints.add(hmac.new(key.encode(), payload, hashlib.sha256).hexdigest())
    tuples = references.get('blobTupleHmacs')
    if not isinstance(tuples, list) or len(tuples) > 1000 or any(not isinstance(v, str) or not re.fullmatch('[a-f0-9]{64}', v) for v in tuples):
        raise RuntimeError('Invalid reference proof.')
    if references.get('blobReferences') != len(tuples) or type(references.get('invalidReferences')) is not int:
        raise RuntimeError('Incomplete reference counts.')
    missing = sum(value not in fingerprints for value in tuples)
    return {'operation': 'recovery-banner-membership', 'stagedObjects': len(rows), 'stagedBytes': total,
        'blobReferences': len(tuples), 'inlineReferences': references.get('inlineReferences'),
        'invalidReferences': references['invalidReferences'], 'missingBlobReferences': missing,
        'blobMembershipVerified': missing == 0 and references['invalidReferences'] == 0,
        'inlineContentsVerified': False, 'historicalPointConsistencyVerified': False, 'applicationAccessVerified': False}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute-reviewed-read', action='store_true')
    parser.add_argument('--key-file', required=True)
    parser.add_argument('--restored-snapshot', required=True)
    args = parser.parse_args()
    if not args.execute_reviewed_read: parser.error('Review required before inventory read.')
    try:
        key = inspection.read_key(args.key_file)
        path = Path(args.restored_snapshot)
        if path.stat().st_size > 1000000: raise RuntimeError('Snapshot bound exceeded.')
        snapshot = json.loads(path.read_text())
        if snapshot.get('target') != 'restore' or snapshot.get('operation') != 'read-only-recovery-database': raise RuntimeError('Wrong snapshot.')
        references = snapshot['databases'][0]['bannerReferences']
        result = subprocess.run(['az', 'storage', 'blob', 'list', '--account-name', 'filosagestp4ujucgnxq3gss',
            '--container-name', 'recovery-20260912-assets-b', '--auth-mode', 'login', '--num-results', '101',
            '--only-show-errors', '-o', 'json'], stdin=subprocess.DEVNULL, capture_output=True, timeout=30, env=inspection.cli_env())
        if result.returncode or len(result.stdout) > 2000000: raise RuntimeError('Inventory read failed.')
        print(json.dumps(compare(key, references, json.loads(result.stdout)), indent=2))
    except Exception:
        print(json.dumps({'passed': False, 'failure': 'banner-membership-unverified'}))
        return 1
    return 0

if __name__ == '__main__': raise SystemExit(main())
