#!/usr/bin/env python3
"""Stage private recovery assets under original keys; never mutate source assets."""
import argparse
from datetime import datetime,timezone,timedelta
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time

_spec=importlib.util.spec_from_file_location('blob_recovery',Path(__file__).with_name('rehearse-blob-recovery.py'))
M=importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(M)
ACCOUNT=M.ACCOUNT
SOURCE=M.SOURCE
TARGET='recovery-20260912-assets-b'
class Azure:
 def __init__(self):self.deadline=time.monotonic()+300
 def call(self,kind,action,container,*args,cleanup=False):
  allowed={'blob':{'list','show','download','upload'},'container':{'exists','show','create','delete'}}
  if kind not in allowed or action not in allowed[kind] or container not in (SOURCE,TARGET):raise RuntimeError('Unapproved operation.')
  if action in ('create','upload','delete') and container!=TARGET:raise RuntimeError('Source mutation denied.')
  remaining=self.deadline-time.monotonic()
  if remaining<=0 and not cleanup:raise RuntimeError('Asset staging deadline exceeded.')
  env={k:v for k,v in os.environ.items() if not k.startswith('AZURE_STORAGE_')}
  env.update(AZURE_LOGGING_ENABLE_LOG_FILE='false',AZURE_CORE_COLLECT_TELEMETRY='false')
  r=subprocess.run(['az','storage',kind,action,'--account-name',ACCOUNT,'--auth-mode','login','--container-name' if kind=='blob' else '--name',container,*args,'--only-show-errors','-o','json'],capture_output=True,stdin=subprocess.DEVNULL,env=env,timeout=25 if cleanup else max(1,min(25,remaining)))
  if r.returncode or len(r.stdout)>2*1024*1024:raise RuntimeError('Storage operation failed; private output suppressed.')
  return json.loads(r.stdout or b'null')

def cleanup(az,owner):
 row=az.call('container','show',TARGET,cleanup=True)
 if M.metadata(row)!={'recovery_owner':owner} or row.get('properties',{}).get('hasLegalHold') is True or row.get('properties',{}).get('hasImmutabilityPolicy') is True:raise RuntimeError('Ownership or retention mismatch.')
 az.call('container','delete',TARGET,'--fail-not-exist',cleanup=True)
 if az.call('container','exists',TARGET,cleanup=True).get('exists') is not False:raise RuntimeError('Cleanup not verified.')

def stage(az,key,owner):
 if not isinstance(key,bytes) or len(key)!=32 or len(owner)!=48 or any(c not in '0123456789abcdef' for c in owner):raise RuntimeError('Invalid private context.')
 attempted=False
 try:
  if az.call('container','exists',TARGET).get('exists') is not False:raise RuntimeError('Destination exists.')
  rows=az.call('blob','list',SOURCE,'--num-results','101','--include','m');total=M.inventory(rows)
  attempted=True
  if az.call('container','create',TARGET,'--fail-on-exist','--public-access','off','--metadata',f'recovery_owner={owner}').get('created') is not True:raise RuntimeError('Creation uncertain.')
  row=az.call('container','show',TARGET)
  if M.metadata(row)!={'recovery_owner':owner} or 'publicAccess' not in row.get('properties',{}) or row['properties']['publicAccess'] not in (None,'off'):raise RuntimeError('Private ownership check failed.')
  combined=hashlib.sha256()
  with tempfile.TemporaryDirectory(prefix='filosage-service-assets-') as directory:
   src=Path(directory)/'source';dst=Path(directory)/'copy'
   for row in sorted(rows,key=lambda r:r['name']):
    name=row['name'];props=row['properties'];meta=M.metadata(row);headers=M.headers(row)
    az.call('blob','download',SOURCE,'--name',name,'--file',str(src),'--overwrite','true','--if-match',props['etag'])
    content=M.verify_file(src,props['contentLength'])
    flags=[v for k,f in M.HEADER_FLAGS.items() for v in (f,headers[k])]
    meta_flags=['--metadata',*[f'{k}={v}' for k,v in sorted(meta.items())]] if meta else []
    az.call('blob','upload',TARGET,'--name',name,'--file',str(src),'--overwrite','false',*flags,*meta_flags)
    copied=az.call('blob','show',TARGET,'--name',name)
    az.call('blob','download',TARGET,'--name',name,'--file',str(dst),'--overwrite','true','--if-match',copied['properties']['etag'])
    if content!=M.verify_file(dst,len(content)) or meta!=M.metadata(copied) or headers!=M.headers(copied):raise RuntimeError('Copy verification failed.')
    combined.update(M.fingerprint(key,M.canonical([name,hashlib.sha256(content).hexdigest(),meta,headers])).encode())
  return {'operation':'stage-private-recovery-assets','account':ACCOUNT,'sourceContainer':SOURCE,'recoveryContainer':TARGET,'currentCopiesVerified':True,'originalObjectKeysPreserved':True,'sourceObjects':len(rows),'sourceBytes':total,'privateInventoryFingerprint':combined.hexdigest(),'historicalSourcePointVerified':False,'databaseOwnershipReferencesVerified':False,'serviceRecoveryVerified':False,'retainedForLearnerChecks':True}
 except Exception:
  if attempted:cleanup(az,owner)
  raise RuntimeError('Asset staging failed; private details suppressed.') from None

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--execute-reviewed-stage',action='store_true');parser.add_argument('--cleanup-owned',action='store_true');parser.add_argument('--ownership-file',required=True);args=parser.parse_args()
 if args.execute_reviewed_stage==args.cleanup_owned:parser.error('Select one reviewed operation.')
 path=Path(args.ownership_file)
 try:
  if args.cleanup_owned:
   st=path.lstat()
   if not path.is_file() or path.is_symlink() or st.st_uid!=os.getuid() or st.st_mode&0o077 or st.st_size>4096:raise RuntimeError('Private ownership file required.')
   record=json.loads(path.read_text());assert record['target']==TARGET and record['account']==ACCOUNT
   cleanup(Azure(),record['owner']);print(json.dumps({'operation':'cleanup-private-recovery-assets','cleanupVerified':True,'retentionSettingsVerified':False}));return
  record={'owner':secrets.token_hex(24),'key':secrets.token_hex(32),'target':TARGET,'account':ACCOUNT,'expiresAt':(datetime.now(timezone.utc)+timedelta(hours=2)).isoformat()}
  fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
  with os.fdopen(fd,'w') as f:json.dump(record,f)
  result=stage(Azure(),bytes.fromhex(record['key']),record['owner']);result['expiresAt']=record['expiresAt'];print(json.dumps(result,indent=2))
 except Exception:
  print(json.dumps({'passed':False,'failure':'staging-or-cleanup-failed','ownershipRecordRetained':path.exists()}));raise SystemExit(1)
if __name__=='__main__':main()
