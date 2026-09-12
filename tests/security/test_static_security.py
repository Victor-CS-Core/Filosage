"""Behavioral tests for fail-closed, source-free scanner reporting."""

import importlib.util
import io
import os
from contextlib import redirect_stdout
from pathlib import Path
import shutil
import tempfile
import time
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]


class SecurityReportTests(unittest.TestCase):
    def setUp(self):
        runner = ROOT / "scripts/run-static-security.py"
        self.assertTrue(runner.is_file(), "The fail-closed scanner runner must exist")
        spec = importlib.util.spec_from_file_location("static_security", runner)
        self.runner = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.runner)
        self.clean = {
            "version": "1.30.0", "results": [], "errors": [],
            "paths": {"scanned": ["src/example.ts"]},
        }

    def evaluate(self, report, status=0):
        with redirect_stdout(io.StringIO()) as output:
            result = self.runner.check_report(report, status, {"src/example.ts"})
        return result, output.getvalue()

    def test_only_complete_error_free_scan_passes(self):
        self.assertEqual(self.evaluate(self.clean)[0], 0)
        for report in [
            {}, {**self.clean, "version": "different"},
            {**self.clean, "errors": [{"type": "Timeout", "message": "PRIVATE"}]},
            {**self.clean, "paths": {"scanned": []}},
            {**self.clean, "results": "invalid"},
            {**self.clean, "errors": None},
        ]:
            with self.subTest(report=report):
                code, output = self.evaluate(report)
                self.assertNotEqual(code, 0)
                self.assertNotIn("PRIVATE", output)
        for status in [1, 2, 7, -9, None]:
            self.assertNotEqual(self.evaluate(self.clean, status)[0], 0)

    def test_findings_fail_with_only_allowed_summary_fields(self):
        report = {**self.clean, "results": [{
            "check_id": "security.example", "path": "src/example.ts",
            "start": {"line": 12},
            "extra": {"severity": "ERROR", "message": "PRIVATE", "lines": "SECRET SOURCE"},
        }]}
        code, output = self.evaluate(report, 1)
        self.assertEqual(code, 1)
        self.assertEqual(output, "ERROR security.example src/example.ts 12\n")
        self.assertEqual(self.evaluate(report, 0)[0], 1)

    def test_malformed_or_injected_findings_fail_without_echoing_input(self):
        for finding in [None, {}, {
            "check_id": "::error::PRIVATE", "path": "src/example.ts\nSECRET",
            "start": {"line": -1}, "extra": {"severity": "ERROR"},
        }]:
            code, output = self.evaluate({**self.clean, "results": [finding]}, 1)
            self.assertNotEqual(code, 0)
            self.assertNotIn("PRIVATE", output)
            self.assertNotIn("SECRET", output)

    def test_missing_or_substituted_rule_execution_cannot_pass(self):
        for timing in [{}, {"rules": []}, {"rules": ["different"]}, {"rules": [None]}]:
            report = {**self.clean, "time": timing}
            self.assertEqual(self.runner.check_report(report, 0, {"src/example.ts"}, {"expected"}), 2)
        report = {**self.clean, "time": {"rules": ["expected", "expected"]}}
        self.assertEqual(self.runner.check_report(report, 0, {"src/example.ts"}, {"expected"}), 0)

    def test_vendored_rule_changes_and_missing_files_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            shutil.copytree(ROOT / "security/rules", root / "security/rules")
            with patch.object(self.runner, "ROOT", root):
                self.assertEqual(len(self.runner.verify_rules()), 83)
                rule = next((root / "security/rules/javascript").rglob("*.yml"))
                original = rule.read_bytes()
                rule.write_bytes(original + b"\n# modified\n")
                with self.assertRaises(ValueError):
                    self.runner.verify_rules()
                rule.write_bytes(original)
                rule.unlink()
                with self.assertRaises(ValueError):
                    self.runner.verify_rules()

    @unittest.skipUnless(os.name == "posix", "Linux process-group supervision")
    def test_scanner_timeout_terminates_the_process_group_without_echoing_logs(self):
        with tempfile.TemporaryDirectory() as temporary:
            evidence = Path(temporary)
            helper = evidence / "slow-scanner"
            marker = evidence / "survived"
            # The child would outlive its parent if only the parent were killed.
            helper.write_text("#!/usr/bin/python3\nimport subprocess,time\n"
                              "subprocess.Popen(['/usr/bin/python3', '-c', "
                              + repr("import time; from pathlib import Path; time.sleep(1); Path(" + repr(str(marker)) + ").touch()")
                              + "])\nprint('PRIVATE', flush=True)\ntime.sleep(20)\n")
            helper.chmod(0o700)
            with patch.object(self.runner, "SCAN_TIMEOUT_SECONDS", 0.25), redirect_stdout(io.StringIO()) as output:
                code, report = self.runner.run_scan(helper, evidence, "timeout", ["security/fixtures/validation"], set())
            self.assertEqual((code, report), (2, None))
            self.assertEqual(output.getvalue(), "")
            time.sleep(1.1)
            self.assertFalse(marker.exists(), "No descendant may survive the deadline")

    @unittest.skipUnless(os.name == "posix", "Linux scanner process")
    def test_invalid_scanner_json_stays_private_and_blocks(self):
        with tempfile.TemporaryDirectory() as temporary:
            evidence = Path(temporary)
            # Exercise the post-process boundary with an actual child executable.
            helper = evidence / "invalid-scanner"
            helper.write_text("#!/usr/bin/python3\nimport sys\nfrom pathlib import Path\n"
                              "Path(sys.argv[sys.argv.index('--output') + 1]).write_text('PRIVATE invalid JSON')\n")
            helper.chmod(0o700)
            with redirect_stdout(io.StringIO()) as output:
                code, report = self.runner.run_scan(helper, evidence, "invalid", ["security/fixtures/validation"], set())
            self.assertEqual((code, report), (2, None))
            self.assertEqual(output.getvalue(), "")

    def test_source_inventory_refuses_empty_or_missing_targets(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "empty").mkdir()
            with patch.object(self.runner, "ROOT", root):
                for target in ["empty", "missing"]:
                    with self.assertRaises(ValueError):
                        self.runner.source_paths([target])


if __name__ == "__main__":
    unittest.main()
