#!/usr/bin/env python3
"""Bounded read-only QA inventory. Review both files before the explicit execution flag.

Imports only the integrity-pinned existing PTY transport; never calls its bootstrap
or secret functions. No credential is read locally or transported. Remote source
is kept in a shell variable, integrity checked, then evaluated without file writes.
"""
import argparse
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import secrets
import subprocess

SUB = 'bfc8f890-2681-43dc-8eac-51644341ae12'
RG = 'filosage-staging-central-rg'
APP = 'filosageqa-app'
REVISION = 'filosageqa-app--qa-stripe-test-1'
IMAGE = 'filosagestp4ujucgnxq3gsacr.azurecr.io/filosage-qa@sha256:3d33eacc178c4e6323c957ab9fd1d81c2dd2f8e149b3b43bbe44e9b09a76bf14'
TRANSPORT = Path('/home/ktr0nn/Work/Filosage/.worktrees/visitor-resume/.superpowers/sdd/outcome-checklist/qa-bootstrap/qa_bootstrap.py')
TRANSPORT_SHA256 = 'ebf0b21413caea1127f81cfc398547b0460d4c2bef73b77e972e595fd2de1f40'
REMOTE = Path(__file__).with_suffix('.cjs')


def validate_result(value):
    """Closed primitive/field allowlist rejects accidental payload or log output."""
    if not isinstance(value, dict) or type(value.get('ok')) is not bool:
        raise ValueError('Invalid result')
    if value['ok'] is False:
        if set(value) != {'ok', 'stage', 'sqlstate'} or value['stage'] not in {
            'target', 'connect', 'transaction', 'catalog', 'aggregates', 'rollback'
        } or (value['sqlstate'] is not None and not __import__('re').fullmatch('[0-9A-Z]{5}', value['sqlstate'])):
            raise ValueError('Invalid error result')
        return value
    expected = {'ok','identity','roles','databases','dependencies','memberships','sessions','relation','counts','summary'}
    if set(value) != expected or value['identity'] != {'correct_database': True, 'correct_role': True, 'read_only': True}:
        raise ValueError('Invalid success result')
    fields = {
        'roles': {'oid','role','login','superuser','create_database','create_role','inherit','bypass_rls'},
        'databases': {'oid','database','owner_oid','bytes','runtime_connect'},
        'dependencies': {'role','database','database_oid','dependency_type','count'},
        'memberships': {'granted_role_oid','member_role_oid','admin_option'},
        'sessions': {'role','connection_count','other_connection_count'},
        'relation': {'oid','owner_oid','bytes','runtime_schema_create','runtime_database_create'},
        'counts': {'category','count'},
    }
    remote_source = REMOTE.read_text()
    # All categories must be literal reviewed collection identifiers in the remote source.
    for key, allowed in fields.items():
        if not isinstance(value[key], list) or len(value[key]) > 250:
            raise ValueError('Invalid result table')
        for row in value[key]:
            if not isinstance(row, dict) or set(row) != allowed:
                raise ValueError('Invalid result row')
            for field, item in row.items():
                if field == 'role' and item not in {'filosageqa_app','filosageqa_runtime'}:
                    raise ValueError('Unexpected role')
                elif field == 'database' and item not in {'filosageqa','filosage','postgres','azure_sys','azure_maintenance','_shared','_other'}:
                    raise ValueError('Unexpected database')
                elif field == 'dependency_type' and item not in {'o','a','r','t','i'}:
                    raise ValueError('Unexpected dependency')
                elif field == 'category' and (not isinstance(item,str) or (item != '_unclassified' and f"'{item}'" not in remote_source)):
                    raise ValueError('Unexpected collection')
                elif field == 'bytes' and not (key == 'databases' and row['database'] == 'filosage' and item is None) and (not isinstance(item,str) or not item.isdecimal()):
                    raise ValueError('Invalid byte count')
                elif field not in {'role','database','dependency_type','category','bytes'} and (type(item) not in {int,bool} or (type(item) is int and item < 0)):
                    raise ValueError('Invalid catalog primitive')
    numeric = {'total_documents','retained_policy_category_documents','documents_with_account_relation',
        'documents_with_course_relation','documents_with_billing_relation','public_course_documents',
        'account_deletion_job_documents','banner_reference_documents'}
    summary = value['summary']
    if not isinstance(summary, dict) or set(summary) != numeric | {'earliest_created_at','latest_updated_at'}:
        raise ValueError('Invalid summary')
    for key,item in summary.items():
        if key in numeric and (type(item) is not int or item < 0): raise ValueError('Invalid count')
        if key not in numeric and item is not None and (not isinstance(item,str) or not __import__('re').fullmatch(r'[0-9T :.Z+\-]+', item)):
            raise ValueError('Invalid aggregate timestamp')
    if sum(row['count'] for row in value['counts']) != summary['total_documents']:
        raise ValueError('Category totals differ')
    return value


def run():
    if hashlib.sha256(TRANSPORT.read_bytes()).hexdigest() != TRANSPORT_SHA256:
        raise ValueError('Reviewed transport integrity changed')
    check = subprocess.run(['az','containerapp','revision','show','--subscription',SUB,'-g',RG,'-n',APP,
        '--revision',REVISION,'--query','{name:name,active:properties.active,image:properties.template.containers[0].image}',
        '-o','json','--only-show-errors'],capture_output=True,text=True,timeout=25)
    if check.returncode != 0 or json.loads(check.stdout) != {'name':REVISION,'active':True,'image':IMAGE}:
        raise ValueError('Exact QA revision preflight failed')
    spec = importlib.util.spec_from_file_location('reviewed_qa_transport', TRANSPORT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    nonce = secrets.token_hex(16)
    source = REMOTE.read_text().replace('__PROTOCOL_NONCE__', nonce)
    encoded = base64.b64encode(source.encode()).decode()
    digest = hashlib.sha256(encoded.encode()).hexdigest()
    transport = module.PtyTransport(['az','containerapp','exec','--subscription',SUB,'-g',RG,'-n',APP,
        '--revision',REVISION,'--command','sh','--only-show-errors'], os.environ.copy(), timeout=100)
    try:
        transport.wait_input_ready()
        transport.send_public(f"printf '\\n%s%s%s\\n' '__FSG_' 'CONNECTION_' '{nonce}__'\n")
        transport.expect(f'__FSG_CONNECTION_{nonce}__'.encode())
        transport.send_public('stty -echo -echonl 2>/dev/null && case " $(stty -a 2>/dev/null) " in '
            f'*" -echo "*) printf \'\\n%s%s%s\\n\' \'__FSG_ECHO_\' \'OFF_\' \'{nonce}__\';; *) exit 72;; esac\n')
        transport.expect(f'__FSG_ECHO_OFF_{nonce}__'.encode())
        transport.send_public("_qa_inventory_source=''\n")
        for offset in range(0,len(encoded),512):
            transport.send_public(f"_qa_inventory_source=\"$_qa_inventory_source\"'{encoded[offset:offset+512]}'\n")
        command = ('node -e "const c=require(\'crypto\'),s=process.argv[1];'
            f"if(s.length!=={len(encoded)}||c.createHash('sha256').update(s).digest('hex')!=='{digest}')process.exit(73);"
            f"process.stdout.write('\\n__FSG_SOURCE_VERIFIED_{nonce}__\\n');eval(Buffer.from(s,'base64').toString())"
            '" "$_qa_inventory_source"; unset _qa_inventory_source; exit\n')
        transport.send_public(command)
        transport.expect(f'__FSG_SOURCE_VERIFIED_{nonce}__'.encode())
        frame = transport.expect_frame(f'__FSG_RESULT_{nonce}__'.encode())
        return validate_result(json.loads(base64.b64decode(frame,validate=True)))
    finally:
        transport.finish()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute-read-only-inventory', action='store_true')
    args = parser.parse_args()
    if not args.execute_read_only_inventory: parser.error('Review first, then use the explicit read-only execution flag.')
    try:
        result = run()
        print(json.dumps(result,sort_keys=True))
        raise SystemExit(0 if result['ok'] else 1)
    except Exception:
        print('{"ok":false,"error":"QA inventory failed; raw output suppressed"}')
        raise SystemExit(1)
