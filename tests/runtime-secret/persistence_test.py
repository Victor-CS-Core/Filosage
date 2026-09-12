"""Offline runtime-secret persistence boundaries; never reads actual credentials."""
import importlib.util
from pathlib import Path
import unittest
import json
import tempfile
from types import SimpleNamespace
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("persistence", Path(__file__).resolve().parents[2] / "scripts/persist-production-runtime-secret.py")
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)

class PersistenceTests(unittest.TestCase):
    def artifact(self):
        return {"schemaVersion": 1, "operation": "production-runtime-preparation", "ok": True, "mode": "apply", "role": "filosage_runtime", "connectionLimit": 18,
            "sourceSha": M.PROD["sha"], "revision": M.PROD["revision"], "imageDigest": M.PROD["image"].split("@")[1],
            "runtimeTlsLoginVerified": True, "rolledBackDmlVerified": True, "currentSchemaSqlVerified": True, "oldRuntimeBindingChanged": False,
            "catalog": {name: True for name in M.CATALOG_KEYS}, "capacity": {"maxConnections": 50, "reservedConnections": 5, "superuserReservedConnections": 10, "modernConnections": 18, "qaAllowance": 11, "operationalReserve": 6}}

    def test_rejects_incomplete_role_proof_before_secret_write(self):
        M.validate_apply(self.artifact())
        for change in [{"ok": False}, {"mode": "preflight"}, {"role": "filosageadmin"}, {"connectionLimit": -1}, {"catalog": {}}, {"runtimeTlsLoginVerified": False}, {"oldRuntimeBindingChanged": True}]:
            with self.assertRaises(RuntimeError): M.validate_apply({**self.artifact(), **change})

    def test_existing_value_never_overwritten(self):
        self.assertEqual(M.secret_decision("expected", "expected", False), "existing-equal")
        self.assertEqual(M.secret_decision(None, "expected", False), "create-absent")
        with self.assertRaises(RuntimeError): M.secret_decision("unrelated", "expected", False)
        with self.assertRaises(RuntimeError): M.secret_decision(None, "expected", True)

    def test_exact_assignment_and_unrelated_grants(self):
        row = {"id": M.ASSIGNMENT_ID, "scope": M.SCOPE, "roleDefinitionId": "/subscriptions/" + M.SUB + "/providers/Microsoft.Authorization/roleDefinitions/" + M.ROLE, "principalId": M.PROD["principal"], "condition": None}
        self.assertTrue(M.new_assignment_present([row]))
        for changed in [{"scope": M.VAULT}, {"principalId": M.QA["principal"]}, {"condition": "conditional"}, {"id": M.ASSIGNMENT_ID + "other"}]:
            with self.assertRaises(RuntimeError): M.new_assignment_present([{**row, **changed}])
        self.assertEqual(M.without_new_assignment([row]), [])

    def test_secret_version_pin_rejects_other_targets(self):
        value = M.SECRET_URL + "/" + "a" * 32
        self.assertEqual(M.version_from_id(value), "a" * 32)
        for bad in [value.replace(M.SECRET, "other"), value + "?query=x", value + "#fragment", value.replace(".vault.azure.net", ".evil.test")]:
            with self.assertRaises(RuntimeError): M.version_from_id(bad)

    def test_incomplete_inventory_cannot_be_treated_as_absence(self):
        for value in [None, {}, M.SECRET, [None], [M.SECRET, M.SECRET]]:
            with patch.object(M, "azure", return_value=value):
                with self.assertRaises(RuntimeError): M.secret_names([])


    def exercise_run(self, wrong_password=False, uncertain_create=False):
        state = {"value": None, "rows": [], "writes": [], "uncertain": uncertain_create}
        identifier = M.SECRET_URL + "/" + "b" * 32
        def azure(args, mutate=False):
            if args[:2] == ["keyvault", "show"]: return M.VAULT
            if args[:3] == ["keyvault", "secret", "list"]: return [M.SECRET] if state["value"] else []
            if args[:3] == ["keyvault", "secret", "list-deleted"]: return []
            if args[:3] == ["keyvault", "secret", "show"]: return {"id": identifier, "value": state["value"]}
            if args[:3] == ["keyvault", "secret", "set"]:
                state["writes"].append("secret")
                state["value"] = Path(args[args.index("--file") + 1]).read_text()
                if state["uncertain"]:
                    state["uncertain"] = False
                    raise RuntimeError("private provider output")
                return identifier
            if args[:3] == ["role", "assignment", "create"]:
                state["writes"].append("grant")
                state["rows"] = [{"id": M.ASSIGNMENT_ID, "scope": M.SCOPE, "roleDefinitionId": f"/subscriptions/{M.SUB}/providers/Microsoft.Authorization/roleDefinitions/{M.ROLE}", "principalId": M.PROD["principal"], "condition": None}]
                return None
            raise AssertionError("Unexpected provider operation")
        def probe(target, version, deadline, password=None):
            if password:
                if wrong_password: raise RuntimeError("private password failed")
                return {"loginVerified": True}
            return {"passed": True, "status": 200 if target == "production" else 403}
        with tempfile.TemporaryDirectory() as directory:
            evidence = Path(directory) / "apply.json"
            evidence.write_text(json.dumps(self.artifact()))
            password = Path(directory) / "password"
            password.write_text("a" * 64); password.chmod(0o600)
            args = SimpleNamespace(apply_evidence=str(evidence), password_file=str(password), probe_only=False)
            with patch.object(M, "azure", side_effect=azure), patch.object(M, "runtime_snapshot", return_value="stable"), patch.object(M, "assignments", side_effect=lambda: state["rows"]), patch.object(M, "probe", side_effect=probe):
                result = M.run(args)
                if uncertain_create:
                    self.assertFalse(result["passed"])
                    self.assertTrue(result["secretWriteAttempted"])
                    result = M.run(args)
            self.assertTrue(password.exists())
        return result, state

    def test_wrong_password_aborts_before_any_secret_or_grant_write(self):
        result, state = self.exercise_run(wrong_password=True)
        self.assertFalse(result["passed"])
        self.assertEqual(result["failedStage"], "retained-credential-login")
        self.assertEqual(state["writes"], [])
        self.assertNotIn("private password", str(result))

    def test_uncertain_create_retry_reuses_same_secret_without_rotation(self):
        result, state = self.exercise_run(uncertain_create=True)
        self.assertTrue(result["passed"])
        self.assertEqual(state["writes"], ["secret", "grant"])
        self.assertEqual(result["secretDisposition"], "existing-equal")
        self.assertNotIn(state["value"], str(result))

if __name__ == "__main__": unittest.main()
