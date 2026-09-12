import importlib.util
from pathlib import Path
import unittest
from blob_test import FakeAzure

def load(name, path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
M=load('service_assets',Path(__file__).resolve().parents[2]/'scripts/stage-recovery-assets.py')
class ServiceAssetsTests(unittest.TestCase):
 def test_original_keys_and_private_evidence(self):
  az=FakeAzure();r=M.stage(az,b'k'*32,'a'*48)
  self.assertTrue(r['currentCopiesVerified']);self.assertTrue(az.exists)
  self.assertIn('private/owner-id.png',az.objects)
  self.assertNotIn('private/',str(r));self.assertNotIn('private-owner',str(r));self.assertNotIn('a'*48,str(r))
  self.assertFalse(r['historicalSourcePointVerified']);self.assertFalse(r['databaseOwnershipReferencesVerified'])
  self.assertFalse(any(c==M.SOURCE and action in ('upload','delete','create') for _,action,c,_ in az.calls))
 def test_failure_cleans_owned_target_and_existing_target_is_untouched(self):
  for options in ({'fail_upload':True},{'corrupt_header':True}):
   az=FakeAzure(**options)
   with self.assertRaises(RuntimeError):M.stage(az,b'k'*32,'a'*48)
   self.assertFalse(az.exists)
  az=FakeAzure(exists=True)
  with self.assertRaises(RuntimeError):M.stage(az,b'k'*32,'a'*48)
  self.assertFalse(any(action=='delete' for _,action,_,_ in az.calls))
 def test_source_and_arbitrary_target_rejected_before_command(self):
  az=M.Azure()
  for kind,action,target in [('blob','upload',M.SOURCE),('container','delete',M.SOURCE),('container','create','unrelated'),('account','keys',M.TARGET)]:
   with self.assertRaises(RuntimeError):az.call(kind,action,target)
 def test_cleanup_refuses_changed_ownership(self):
  az=FakeAzure(wrong_owner=True)
  result=M.stage(az,b'k'*32,'a'*48)
  self.assertTrue(result['currentCopiesVerified'])
  with self.assertRaises(RuntimeError):M.cleanup(az,'a'*48)
  self.assertFalse(any(action=='delete' for _,action,_,_ in az.calls))
if __name__=='__main__':unittest.main()
