import argparse,importlib.util,unittest
from pathlib import Path
from unittest.mock import Mock,patch
p=Path(__file__).with_name('run-legacy-model-aggregate.py')
spec=importlib.util.spec_from_file_location('aggregate_adapter_test',p);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
def args():
 return argparse.Namespace(revision='filosagestg-app--green-93f60f24-1',sha='93f60f24afe59b19b6a592f455a09e8e813f1f84',image_digest='sha256:0c006852322a91d5e2540cfd27ab58e47dad33a3a1f793fd6afc1e2240bbadf2',transport_source=module.TRANSPORT_PATH)
class Tests(unittest.TestCase):
 def test_exact_target_rejected_before_provider(self):
  a=args();a.revision='filosagestg-app--other'
  with patch.object(module,'az_json') as az:
   with self.assertRaises(RuntimeError):module.run(a)
   az.assert_not_called()
 def test_changed_source_rejected_before_provider(self):
  with patch.object(module,'MODULE_SHA','0'*64),patch.object(module,'az_json') as az:
   with self.assertRaises(RuntimeError):module.run(args())
   az.assert_not_called()
 def test_exact_revision_requires_secret_reference(self):
  a=args();app={'id':module.APP_ID};rev={'name':a.revision,'properties':{'active':True,'template':{'containers':[{'image':f'filosagestp4ujucgnxq3gsacr.azurecr.io/filosage@{a.image_digest}','env':[{'name':'SITE_VERSION','value':a.sha},{'name':'DATABASE_URL','secretRef':'database-url'}]}]}}}
  module.validate_revision(app,rev,a.revision,a.sha,a.image_digest)
  rev['properties']['template']['containers'][0]['env'][1]['value']='PRIVATE_CANARY'
  with self.assertRaises(RuntimeError):module.validate_revision(app,rev,a.revision,a.sha,a.image_digest)
 def test_no_secret_output_or_bootstrap_execution_added(self):
  source=p.read_text()
  self.assertIn("trap 'rm -f --",source);self.assertIn("trap 'exit 74' HUP INT TERM",source)
  self.assertIn('transport.finish()',source);self.assertIn('signal.alarm(120)',source)
  self.assertNotIn('reviewed.main(',source);self.assertNotIn('print(result.stderr',source)
  self.assertIn("'--validate-json'",source)
if __name__=='__main__':unittest.main()
