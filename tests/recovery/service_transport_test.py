"""Offline transport boundaries; never opens a provider session."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("recovery", Path(__file__).resolve().parents[2] / "scripts/run-service-recovery-database-inspection.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

class TransportTests(unittest.TestCase):
    def test_private_owned_key_and_rejections(self):
        with tempfile.TemporaryDirectory() as directory:
            key = Path(directory) / "key"
            key.write_text("a" * 64)
            key.chmod(0o600)
            self.assertEqual(MODULE.read_key(str(key)), "a" * 64)
            key.chmod(0o644)
            with self.assertRaises(RuntimeError): MODULE.read_key(str(key))
            key.chmod(0o600)
            link = Path(directory) / "link"
            link.symlink_to(key)
            with self.assertRaises(RuntimeError): MODULE.read_key(str(link))
            key.write_text("not a key")
            with self.assertRaises(RuntimeError): MODULE.read_key(str(key))
            key.write_text("a" * 1000)
            with self.assertRaises(RuntimeError): MODULE.read_key(str(key))

    def test_private_cli_environment(self):
        from unittest.mock import patch
        with patch.dict(MODULE.os.environ, {"AZURE_STORAGE_KEY": "fixture", "AZURE_LOGGING_ENABLE_LOG_FILE": "true"}):
            env = MODULE.cli_env()
        self.assertNotIn("AZURE_STORAGE_KEY", env)
        self.assertEqual(env["AZURE_LOGGING_ENABLE_LOG_FILE"], "false")
        self.assertEqual(env["AZURE_CORE_COLLECT_TELEMETRY"], "false")

    def test_exact_runtime_revision_identity(self):
        sha = "a" * 40
        digest = "sha256:" + "b" * 64
        name = MODULE.APP + "--fixture"
        app = {"id": MODULE.APP_ID}
        revision = {"name": name, "properties": {"active": True, "template": {"containers": [{"image": "filosagestp4ujucgnxq3gsacr.azurecr.io/filosage@" + digest, "env": [{"name": "SITE_VERSION", "value": sha}, {"name": "DATABASE_URL", "secretRef": "fixture"}]}]}}}
        MODULE.validate_revision(app, revision, name, sha, digest)
        for invalid in [sha[:-1], "c" * 40]:
            with self.assertRaises(RuntimeError): MODULE.validate_revision(app, revision, name, invalid, digest)
        revision["properties"]["active"] = False
        with self.assertRaises(RuntimeError): MODULE.validate_revision(app, revision, name, sha, digest)

if __name__ == "__main__": unittest.main()
