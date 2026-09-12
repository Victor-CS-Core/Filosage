#!/usr/bin/env python3
"""Reviewed isolated Blob copy/version rehearsal; no source writes or account changes."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import hmac
import json
import os
import re
from pathlib import Path
import secrets
import subprocess
import tempfile
import time

ACCOUNT = "filosagestp4ujucgnxq3gss"
SOURCE = "course-banners"
TARGET = "recovery-20260912-assets-a"
MAX_BYTES = 10 * 1024 * 1024
MAX_OBJECTS = 100

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()

def fingerprint(key, value):
    return hmac.new(key, value, hashlib.sha256).hexdigest()

def inventory(rows):
    if not isinstance(rows, list) or len(rows) > MAX_OBJECTS - 6:
        raise RuntimeError("Inventory count bound failed.")
    total = 0
    names = set()
    for row in rows:
        name = row.get("name")
        size = row.get("properties", {}).get("contentLength")
        etag = row.get("properties", {}).get("etag")
        if (not isinstance(name, str) or not name or len(name) > 1024 or name in names
            or not isinstance(size, int) or isinstance(size, bool) or size < 0
            or not isinstance(etag, str) or not etag or len(etag) > 200):
            raise RuntimeError("Incomplete source inventory.")
        names.add(name)
        total += size
    if total > MAX_BYTES - 1024:
        raise RuntimeError("Inventory byte bound failed.")
    return total

class Azure:
    def __init__(self):
        self.deadline = time.monotonic() + 300

    def call(self, kind, action, container, *args, cleanup=False):
        if kind not in ("blob", "container") or container not in (SOURCE, TARGET):
            raise RuntimeError("Unapproved target.")
        allowed = {"blob": {"list", "show", "download", "upload", "delete"}, "container": {"exists", "show", "create", "delete"}}
        if action not in allowed[kind] or (action in ("create", "upload", "delete") and container != TARGET):
            raise RuntimeError("Source mutation denied.")
        remaining = self.deadline - time.monotonic()
        if remaining <= 0 and not cleanup:
            raise RuntimeError("Rehearsal deadline exceeded.")
        env = {key: value for key, value in os.environ.items() if not key.startswith("AZURE_STORAGE_")}
        # Disable per-command logs and telemetry without changing the user's CLI configuration.
        env.update({"AZURE_LOGGING_ENABLE_LOG_FILE": "false", "AZURE_CORE_COLLECT_TELEMETRY": "false"})
        command = ["az", "storage", kind, action, "--account-name", ACCOUNT, "--auth-mode", "login",
            "--container-name" if kind == "blob" else "--name", container, *args, "--only-show-errors", "--output", "json"]
        result = subprocess.run(command, stdin=subprocess.DEVNULL, capture_output=True, env=env,
            timeout=25 if cleanup else max(1, min(25, remaining)), check=False)
        if result.returncode or len(result.stdout) > 2 * 1024 * 1024:
            raise RuntimeError("Bounded storage operation failed.")
        return json.loads(result.stdout or b"null")

def metadata(row):
    value = row.get("metadata") or {}
    if not isinstance(value, dict) or any(not isinstance(k, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", k) or not isinstance(v, str) for k, v in value.items()):
        raise RuntimeError("Invalid metadata.")
    return value

HEADER_FLAGS = {"contentType": "--content-type", "contentEncoding": "--content-encoding", "contentLanguage": "--content-language", "contentDisposition": "--content-disposition", "cacheControl": "--content-cache-control"}

def headers(row):
    settings = row.get("properties", {}).get("contentSettings")
    if not isinstance(settings, dict):
        raise RuntimeError("Missing content headers.")
    result = {}
    for name in HEADER_FLAGS:
        value = settings.get(name)
        if value is not None and not isinstance(value, str):
            raise RuntimeError("Invalid content header.")
        result[name] = value or ""
    return result

def verify_file(path, expected_size):
    if not path.is_file() or path.stat().st_size != expected_size or expected_size > MAX_BYTES:
        raise RuntimeError("Downloaded byte bound or size mismatch.")
    return path.read_bytes()

def version_id(response):
    version = response.get("versionId") or response.get("version_id")
    if not isinstance(version, str) or not version or len(version) > 128 or any(ord(c) < 32 for c in version):
        raise RuntimeError("Versioning did not produce a version identity.")
    return version

def rehearse(azure, key):
    if not isinstance(key, bytes) or len(key) != 32:
        raise RuntimeError("Private HMAC key required.")
    started = time.monotonic()
    owner = secrets.token_hex(24)
    result = {"schemaVersion": 1, "operation": "isolated-blob-recovery-rehearsal", "passed": False,
        "currentCopiesVerified": False, "replacedFixtureRecovered": False, "deletedFixtureRecovered": False,
        "historicalSourcePointVerified": False, "databaseOwnershipReferencesVerified": False,
        "serviceRecoveryVerified": False, "cleanupVerified": False, "retentionSettingsVerified": False,
        "account": ACCOUNT, "sourceContainer": SOURCE, "recoveryContainer": TARGET,
        "startedAt": datetime.now(timezone.utc).isoformat(), "ownerFingerprint": hashlib.sha256(owner.encode()).hexdigest()}
    attempted = False
    try:
        if azure.call("container", "exists", TARGET).get("exists") is not False:
            raise RuntimeError("Recovery target must be absent.")
        rows = azure.call("blob", "list", SOURCE, "--num-results", "101", "--include", "m")
        total = inventory(rows)
        result.update({"sourceObjects": len(rows), "sourceBytes": total})
        attempted = True
        created = azure.call("container", "create", TARGET, "--fail-on-exist", "--public-access", "off", "--metadata", f"recovery_owner={owner}")
        if created.get("created") is not True:
            raise RuntimeError("Container creation was not confirmed.")
        observed = azure.call("container", "show", TARGET)
        if metadata(observed) != {"recovery_owner": owner} or "publicAccess" not in observed.get("properties", {}) or observed["properties"]["publicAccess"] not in (None, "off"):
            raise RuntimeError("Private owned container verification failed.")
        combined = hmac.new(key, digestmod=hashlib.sha256)
        with tempfile.TemporaryDirectory(prefix="filosage-blob-recovery-") as directory:
            private = Path(directory)
            os.chmod(private, 0o700)
            source_file, restored_file = private / "source", private / "restored"
            for row in sorted(rows, key=lambda value: value["name"]):
                name, properties = row["name"], row["properties"]
                opaque = "asset-" + fingerprint(key, name.encode())
                source_meta = metadata(row)
                source_headers = headers(row)
                header_args = [value for name, flag in HEADER_FLAGS.items() for value in (flag, source_headers[name]) ]
                azure.call("blob", "download", SOURCE, "--name", name, "--file", str(source_file), "--overwrite", "true", "--if-match", properties["etag"])
                source_bytes = verify_file(source_file, properties["contentLength"])
                meta_args = [item for k, v in sorted(source_meta.items()) for item in [f"{k}={v}"]]
                azure.call("blob", "upload", TARGET, "--name", opaque, "--file", str(source_file), "--overwrite", "false", *header_args, *( ["--metadata", *meta_args] if meta_args else []))
                restored = azure.call("blob", "show", TARGET, "--name", opaque)
                azure.call("blob", "download", TARGET, "--name", opaque, "--file", str(restored_file), "--overwrite", "true", "--if-match", restored["properties"]["etag"])
                restored_bytes = verify_file(restored_file, len(source_bytes))
                if fingerprint(key, source_bytes) != fingerprint(key, restored_bytes) or canonical(source_meta) != canonical(metadata(restored)) or source_headers != headers(restored):
                    raise RuntimeError("Source copy content or metadata mismatch.")
                combined.update(canonical([opaque, fingerprint(key, source_bytes), fingerprint(key, canonical(source_meta)), fingerprint(key, canonical(source_headers))]))
            result["currentCopiesVerified"] = True
            result["copiesHmac"] = combined.hexdigest()
            for scenario in ("replaced", "deleted"):
                name = "fixture-" + scenario
                original = b"Filosage isolated recovery fixture version one.\n"
                source_file.write_bytes(original)
                response = azure.call("blob", "upload", TARGET, "--name", name, "--file", str(source_file), "--overwrite", "false", "--metadata", "synthetic=true")
                original_version = version_id(response)
                if scenario == "replaced":
                    source_file.write_bytes(b"Filosage isolated replacement fixture.\n")
                    azure.call("blob", "upload", TARGET, "--name", name, "--file", str(source_file), "--overwrite", "true", "--metadata", "synthetic=true")
                else:
                    current = azure.call("blob", "show", TARGET, "--name", name)
                    azure.call("blob", "delete", TARGET, "--name", name, "--if-match", current["properties"]["etag"])
                azure.call("blob", "download", TARGET, "--name", name, "--version-id", original_version, "--file", str(restored_file), "--overwrite", "true")
                if verify_file(restored_file, len(original)) != original:
                    raise RuntimeError("Historical fixture version mismatch.")
                restored_name = "restored-" + scenario
                azure.call("blob", "upload", TARGET, "--name", restored_name, "--file", str(restored_file), "--overwrite", "false", "--metadata", "synthetic=true")
                azure.call("blob", "download", TARGET, "--name", restored_name, "--file", str(source_file), "--overwrite", "true")
                restored_meta = azure.call("blob", "show", TARGET, "--name", restored_name)
                if verify_file(source_file, len(original)) != original or metadata(restored_meta) != {"synthetic": "true"}:
                    raise RuntimeError("Restored fixture validation failed.")
                result[scenario + "FixtureRecovered"] = True
        result["passed"] = True
    except Exception:
        result["failure"] = "bounded-rehearsal-failed"
    finally:
        result["validationSeconds"] = round(time.monotonic() - started, 3)
        if attempted:
            try:
                owned = azure.call("container", "show", TARGET, cleanup=True)
                if metadata(owned) != {"recovery_owner": owner} or owned.get("properties", {}).get("hasLegalHold") is True or owned.get("properties", {}).get("hasImmutabilityPolicy") is True:
                    raise RuntimeError("Cleanup ownership or retention mismatch.")
                azure.call("container", "delete", TARGET, "--fail-not-exist", cleanup=True)
                result["cleanupVerified"] = azure.call("container", "exists", TARGET, cleanup=True).get("exists") is False
            except Exception:
                result["cleanupFailure"] = "owned-container-cleanup-unverified"
        result["totalSeconds"] = round(time.monotonic() - started, 3)
        result["finishedAt"] = datetime.now(timezone.utc).isoformat()
        result["passed"] = result["passed"] and result["cleanupVerified"]
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute-isolated-rehearsal", action="store_true")
    parser.add_argument("--key-file", required=True)
    args = parser.parse_args()
    if not args.execute_isolated_rehearsal:
        parser.error("Independent review precedes --execute-isolated-rehearsal")
    try:
        path = Path(args.key_file)
        if path.is_symlink() or not path.is_file() or path.stat().st_uid != os.getuid() or path.stat().st_mode & 0o077 or path.stat().st_size > 65:
            raise RuntimeError("Invalid private key file.")
        text = path.read_text().strip()
        if len(text) != 64 or any(c not in "0123456789abcdef" for c in text):
            raise RuntimeError("Invalid private key.")
        result = rehearse(Azure(), bytes.fromhex(text))
        print(json.dumps(result, indent=2))
        return 0 if result["passed"] else 1
    except Exception:
        print(json.dumps({"passed": False, "failure": "preflight-failed"}))
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
