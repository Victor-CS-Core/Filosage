"""Offline Blob recovery control tests, with no Azure calls."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("blob_recovery", Path(__file__).resolve().parents[2] / "scripts/rehearse-blob-recovery.py")
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)

class FakeAzure:
    def __init__(self, exists=False, corrupt=False, fail_upload=False, wrong_owner=False, corrupt_header=False):
        self.exists = exists
        self.corrupt, self.fail_upload, self.wrong_owner = corrupt, fail_upload, wrong_owner
        self.calls, self.objects, self.versions = [], {}, {}
        self.corrupt_header = corrupt_header
        self.owner = None
        self.counter = 0

    def call(self, kind, action, container, *args, cleanup=False):
        self.calls.append((kind, action, container, args))
        def get(flag, default=None):
            return args[args.index(flag) + 1] if flag in args else default
        name = get("--name")
        if kind == "container":
            if action == "exists": return {"exists": self.exists}
            if action == "create":
                self.exists = True
                self.owner = get("--metadata").split("=", 1)[1]
                return {"created": True}
            if action == "show": return {"metadata": {"recovery_owner": "unrelated" if cleanup and self.wrong_owner else self.owner}, "properties": {"publicAccess": None}}
            if action == "delete": self.exists = False; return {"deleted": True}
        if action == "list": return [{"name": "private/owner-id.png", "metadata": {"owner": "private-owner"}, "properties": {"contentLength": 5, "etag": "source-etag", "contentSettings": {"contentType": "image/png", "cacheControl": "private"}}}]
        if action == "upload":
            if self.fail_upload: raise RuntimeError("PRIVATE PROVIDER DATA")
            data = Path(get("--file")).read_bytes()
            items = args[args.index("--metadata") + 1:] if "--metadata" in args else []
            meta = dict(item.split("=", 1) for item in items)
            self.counter += 1
            version = str(self.counter)
            header = {key: get(flag) or "" for key, flag in M.HEADER_FLAGS.items()}
            self.objects[name] = (data, meta, header)
            self.versions[(name, version)] = (data, meta)
            return {"versionId": version}
        if action == "show":
            settings = dict(self.objects[name][2])
            if self.corrupt_header: settings["contentType"] = "text/plain"
            return {"metadata": self.objects[name][1], "properties": {"etag": "target-etag", "contentSettings": settings}}
        if action == "delete": self.objects.pop(name); return None
        if action == "download":
            if container == M.SOURCE: data = b"hello"
            elif get("--version-id"): data = self.versions[(name, get("--version-id"))][0]
            else: data = self.objects[name][0]
            if self.corrupt and name.startswith("asset-"): data = b"WRONG"
            Path(get("--file")).write_bytes(data)
            return {}
        raise AssertionError("Unexpected fake operation")

class BlobTests(unittest.TestCase):
    def test_full_flow_and_privacy(self):
        azure = FakeAzure()
        result = M.rehearse(azure, b"k" * 32)
        self.assertTrue(result["passed"])
        for flag in ("currentCopiesVerified", "replacedFixtureRecovered", "deletedFixtureRecovered", "cleanupVerified"): self.assertTrue(result[flag])
        self.assertFalse(result["retentionSettingsVerified"])
        self.assertEqual(result["account"], M.ACCOUNT)
        self.assertIn("+00:00", result["startedAt"])
        self.assertFalse(result["historicalSourcePointVerified"])
        self.assertFalse(result["databaseOwnershipReferencesVerified"])
        output = str(result)
        for secret in ("private/", "private-owner", "hello", azure.owner): self.assertNotIn(secret, output)
        self.assertFalse(any(c == M.SOURCE and action in ("delete", "upload", "create") for _, action, c, _ in azure.calls))
        self.assertTrue(any("--version-id" in args for _, action, _, args in azure.calls if action == "download"))

    def test_failure_cleanup_and_redaction(self):
        for options in ({"corrupt": True}, {"fail_upload": True}, {"corrupt_header": True}):
            azure = FakeAzure(**options)
            result = M.rehearse(azure, b"k" * 32)
            self.assertFalse(result["passed"])
            self.assertTrue(result["cleanupVerified"])
            self.assertNotIn("PRIVATE", str(result))

    def test_existing_target_and_changed_owner_never_deleted(self):
        for options in ({"exists": True}, {"wrong_owner": True}):
            azure = FakeAzure(**options)
            self.assertFalse(M.rehearse(azure, b"k" * 32)["passed"])
            self.assertFalse(any(kind == "container" and action == "delete" for kind, action, _, _ in azure.calls))

    def test_size_count_and_file_bounds(self):
        row = {"name": "a", "properties": {"contentLength": 1, "etag": "e"}}
        for rows in ([row] * 101, [row, row], [{**row, "properties": {"contentLength": M.MAX_BYTES + 1, "etag": "e"}}]):
            with self.assertRaises(RuntimeError): M.inventory(rows)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "file"
            path.write_bytes(b"x")
            with self.assertRaises(RuntimeError): M.verify_file(path, 2)

    def test_source_mutations_and_unapproved_targets_fail_before_subprocess(self):
        azure = M.Azure()
        for kind, action, target in [("blob", "upload", M.SOURCE), ("container", "delete", M.SOURCE), ("container", "create", "other"), ("account", "keys", M.TARGET)]:
            with self.assertRaises(RuntimeError): azure.call(kind, action, target)
        azure.deadline = 0
        with self.assertRaises(RuntimeError): azure.call("blob", "list", M.SOURCE)

if __name__ == "__main__": unittest.main()
