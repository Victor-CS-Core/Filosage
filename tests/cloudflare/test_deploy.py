import contextlib
import importlib.util
import io
import json
import sys
from types import SimpleNamespace
from email import policy
from email.parser import BytesParser
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("filosage_deploy", ROOT / "infra/cloudflare/deploy-opennext.py")
deploy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(deploy)
FIXTURE_SHA = "1" * 40


class DeploymentLoggingTests(unittest.TestCase):
    def test_cli_rejects_site_version_that_does_not_match_source(self):
        different_sha = "2" * 40
        with (
            patch.object(sys, "argv", ["deploy-opennext.py", "--site-version", different_sha]),
            patch.object(deploy.subprocess, "run", return_value=SimpleNamespace(stdout=f"{FIXTURE_SHA}\n")),
            patch.object(deploy, "deploy") as deploy_call,
            contextlib.redirect_stderr(io.StringIO()),
        ):
            self.assertEqual(deploy.main(), 2)
        deploy_call.assert_not_called()

    def test_both_wrangler_environments_persist_invocations(self):
        config = json.loads((ROOT / "wrangler.jsonc").read_text())
        for name, environment in [("production", config), ("staging", config["env"]["staging"])]:
            with self.subTest(environment=name):
                observability = environment.get("observability", {})
                self.assertTrue(observability.get("enabled"))
                logs = observability.get("logs", {})
                self.assertTrue(logs.get("enabled"))
                self.assertTrue(logs.get("invocation_logs"))
                self.assertTrue(logs.get("persist"))
                self.assertEqual(logs.get("head_sampling_rate"), 1)

    def test_oauth_deployment_passes_logging_configuration_to_wrangler(self):
        def inspect_command(command, **kwargs):
            self.assertIn("--autoconfig=false", command)
            self.assertNotIn("--x-autoconfig=false", command)
            self.assertIn("--keep-vars", command)
            self.assertEqual(command[command.index("--var") + 1], f"SITE_VERSION:{FIXTURE_SHA}")
            config_path = Path(command[command.index("--config") + 1])
            config = json.loads(config_path.read_text())
            name = command[command.index("--env") + 1]
            self.assertTrue(config["env"][name].get("observability", {}).get("logs", {}).get("persist"))
            self.assertEqual(Path(kwargs["cwd"]), ROOT)

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / ".open-next"
            (output / "assets").mkdir(parents=True)
            (output / "worker.js").write_text("export default {}")
            # Only bundle existence uses the temporary root; Wrangler's config
            # is read from the actual repository by the callback below.
            original = deploy.deploy_with_wrangler

            def run_wrangler(name, message, site_version):
                with patch.object(deploy, "REPO", str(ROOT)):
                    return original(name, message, site_version)

            with patch.object(deploy, "REPO", directory), patch.object(deploy, "add_surrogate_to_request", None), patch.object(deploy, "deploy_with_wrangler", side_effect=run_wrangler), patch.object(deploy.subprocess, "run", side_effect=inspect_command), contextlib.redirect_stdout(io.StringIO()):
                deploy.deploy("staging", "fixture", FIXTURE_SHA)

    def test_rest_settings_use_the_same_environment_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / ".open-next"
            (output / "assets").mkdir(parents=True)
            (output / "worker.js").write_text("export default {}")
            config = json.loads((ROOT / "wrangler.jsonc").read_text())
            expected = {"enabled": True, "logs": {"enabled": True, "invocation_logs": True, "persist": True, "head_sampling_rate": 0.5}}
            config["env"]["staging"]["observability"] = expected
            (root / "wrangler.jsonc").write_text(json.dumps(config))
            requests = []

            def api(method, path, body=None, headers=None):
                requests.append((method, path, body, headers))
                return {"id": "fixture-version"}

            with patch.object(deploy, "REPO", directory), patch.object(deploy, "add_surrogate_to_request", object()), patch.object(deploy, "build_worker_bundle", return_value=b"worker"), patch.object(deploy, "sync_assets", return_value="fixture-assets"), patch.object(deploy, "current_secret_names", return_value=["FIXTURE_SECRET"]), patch.object(deploy, "api_request", side_effect=api), contextlib.redirect_stdout(io.StringIO()):
                deploy.deploy("staging", "fixture", FIXTURE_SHA)
            method, path, body, headers = next(r for r in requests if "/versions" in r[1])
            self.assertEqual(method, "POST")
            message = BytesParser(policy=policy.default).parsebytes(
                f"Content-Type: {headers['Content-Type']}\r\nMIME-Version: 1.0\r\n\r\n".encode() + body
            )
            metadata = json.loads(next(message.iter_parts()).get_payload(decode=True))
            self.assertIn(
                {"name": "SITE_VERSION", "type": "plain_text", "text": FIXTURE_SHA},
                metadata["bindings"],
            )
            method, path, body, headers = next(r for r in requests if r[0] == "PATCH")
            self.assertTrue(path.endswith("/filosage-staging/settings"))
            message = BytesParser(policy=policy.default).parsebytes(
                f"Content-Type: {headers['Content-Type']}\r\nMIME-Version: 1.0\r\n\r\n".encode() + body
            )
            settings = json.loads(next(message.iter_parts()).get_payload(decode=True))
            self.assertEqual(settings["observability"], expected)


if __name__ == "__main__":
    unittest.main()
