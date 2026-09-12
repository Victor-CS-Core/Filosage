import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('probe',Path(__file__).resolve().parents[2]/'scripts/run-recovery-denied-vantage.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class TargetTests(unittest.TestCase):
    def test_exact_qa_target_and_identity_required(self):
        name='filosageqa-app--qa-stripe-test-1';sha='c7d9c2c274bfcaee805332a83d94a208af32f09e';digest='sha256:3d33eacc178c4e6323c957ab9fd1d81c2dd2f8e149b3b43bbe44e9b09a76bf14'
        app={'id':m.APP_ID,'identity':{'userAssignedIdentities':{'qa':{'principalId':'ace6a746-1953-483b-b4e0-d4429753d6b6','clientId':'aa4f7188-36bc-49dd-a4eb-a6f296b81094'}}}}
        revision={'name':name,'properties':{'active':True,'template':{'containers':[{'image':'filosagestp4ujucgnxq3gsacr.azurecr.io/filosage-qa@'+digest,'env':[{'name':'SITE_VERSION','value':sha},{'name':'DATABASE_URL','secretRef':'existing'}]}]}}}
        m.validate_revision(app,revision,name,sha,digest)
        for changed in [{**app,'id':'wrong'},{**app,'identity':{}}]:
            with self.assertRaises(RuntimeError):m.validate_revision(changed,revision,name,sha,digest)
        with self.assertRaises(RuntimeError):m.validate_revision(app,revision,name,'a'*40,digest)
        with self.assertRaises(RuntimeError):m.validate_revision(app,revision,name,sha,'sha256:'+'b'*64)

    def test_cli_logging_and_ambient_storage_credentials_suppressed(self):
        from unittest.mock import patch
        with patch.dict(m.os.environ,{'AZURE_STORAGE_KEY':'private','AZURE_LOGGING_ENABLE_LOG_FILE':'true'}):
            env=m.cli_env()
        self.assertNotIn('AZURE_STORAGE_KEY',env)
        self.assertEqual(env['AZURE_LOGGING_ENABLE_LOG_FILE'],'false')
        self.assertEqual(env['AZURE_CORE_COLLECT_TELEMETRY'],'false')

if __name__=='__main__':unittest.main()
