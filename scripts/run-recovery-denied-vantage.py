#!/usr/bin/env python3
"""Read-only QA outbound isolated recovery denial probe with pinned private transport."""
from __future__ import annotations

import argparse
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import signal
import subprocess
import sys
import time

SUBSCRIPTION = "bfc8f890-2681-43dc-8eac-51644341ae12"
GROUP = "filosage-staging-central-rg"
APP = "filosageqa-app"
APP_ID = f"/subscriptions/{SUBSCRIPTION}/resourceGroups/{GROUP}/providers/Microsoft.App/containerApps/{APP}".lower()
TRANSPORT_SHA = "ebf0b21413caea1127f81cfc398547b0460d4c2bef73b77e972e595fd2de1f40"
TRANSPORT_PATH = "/home/ktr0nn/Work/Filosage/.worktrees/visitor-resume/.superpowers/sdd/outcome-checklist/qa-bootstrap/qa_bootstrap.py"


def cli_env():
    return {**{key: value for key, value in os.environ.items() if not key.startswith("AZURE_STORAGE_")},
            "AZURE_LOGGING_ENABLE_LOG_FILE": "false", "AZURE_CORE_COLLECT_TELEMETRY": "false"}


def az_json(args: list[str]) -> dict:
    result = subprocess.run(["az", *args, "--subscription", SUBSCRIPTION, "--only-show-errors", "-o", "json"],
                            stdin=subprocess.DEVNULL, capture_output=True, timeout=25, check=False, env=cli_env())
    if result.returncode:
        raise RuntimeError("Target metadata read failed.")
    return json.loads(result.stdout)


def validate_revision(app: dict, revision: dict, name: str, sha: str, digest: str) -> None:
    if not re.fullmatch(rf"{APP}--[a-z0-9-]+", name) or not re.fullmatch(r"[a-f0-9]{40}", sha) or not re.fullmatch(r"sha256:[a-f0-9]{64}", digest):
        raise RuntimeError("Invalid exact revision identity.")
    if str(app.get("id", "")).lower() != APP_ID or revision.get("name") != name or revision.get("properties", {}).get("active") is not True:
        raise RuntimeError("Active revision target mismatch.")
    identities = app.get("identity", {}).get("userAssignedIdentities", {})
    if len(identities) != 1 or next(iter(identities.values())).get("principalId") != "ace6a746-1953-483b-b4e0-d4429753d6b6" or next(iter(identities.values())).get("clientId") != "aa4f7188-36bc-49dd-a4eb-a6f296b81094":
        raise RuntimeError("QA managed identity changed.")
    containers = revision.get("properties", {}).get("template", {}).get("containers", [])
    if len(containers) != 1 or containers[0].get("image") != f"filosagestp4ujucgnxq3gsacr.azurecr.io/filosage-qa@{digest}":
        raise RuntimeError("Immutable image target mismatch.")
    entries = containers[0].get("env", [])
    versions = [item.get("value") for item in entries if item.get("name") == "SITE_VERSION"]
    databases = [item for item in entries if item.get("name") == "DATABASE_URL"]
    if versions != [sha] or len(databases) != 1 or not databases[0].get("secretRef") or databases[0].get("value"):
        raise RuntimeError("Runtime source or database binding mismatch.")


def run(args: argparse.Namespace) -> dict:
    deadline = time.monotonic() + 180
    app = az_json(["containerapp", "show", "-g", GROUP, "-n", APP])
    revision = az_json(["containerapp", "revision", "show", "-g", GROUP, "-n", APP, "--revision", args.revision])
    validate_revision(app, revision, args.revision, args.sha, args.image_digest)
    path = Path(args.transport_source)
    if hashlib.sha256(path.read_bytes()).hexdigest() != TRANSPORT_SHA:
        raise RuntimeError("Reviewed transport source changed; independent review is required.")
    spec = importlib.util.spec_from_file_location("reviewed_transport", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Reviewed transport is unavailable.")
    reviewed = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(reviewed)  # Imports definitions only; never its bootstrap main.
    source = Path(__file__).with_name("recovery-denied-vantage.mjs").read_text(encoding="utf8")
    if not re.fullmatch(r"[a-f0-9]{64}", args.operator_egress_sha256):
        raise RuntimeError("Expected operator egress hash only.")
    encoded = base64.b64encode(source.encode()).decode()
    digest = hashlib.sha256(encoded.encode()).hexdigest()
    nonce = secrets.token_hex(16)
    marker = f"__FSG_DB_RESULT_{nonce}__"
    transport = reviewed.PtyTransport(["az", "containerapp", "exec", "--subscription", SUBSCRIPTION,
        "-g", GROUP, "-n", APP, "--revision", args.revision, "--command", "sh", "--only-show-errors"],
        cli_env(), timeout=max(1, deadline - time.monotonic()))
    try:
        transport.wait_input_ready()
        connection = f"__FSG_DB_CONNECTION_{nonce}__"
        transport.send_public(f"printf '\\n%s%s\\n' '__FSG_DB_CONNECTION_' '{nonce}__'\n")
        transport.expect(connection.encode())
        echo = f"__FSG_DB_ECHO_OFF_{nonce}__"
        transport.send_public("stty -echo -echonl 2>/dev/null && case \" $(stty -a 2>/dev/null) \" in "
            f"*\" -echo \"*) printf '\\n%s%s\\n' '__FSG_DB_ECHO_OFF_' '{nonce}__';; *) exit 72;; esac\n")
        transport.expect(echo.encode())
        transport.send_public(f"umask 077; _fsg_db=/tmp/filosage-db-inventory-{nonce}.b64; : > \"$_fsg_db\" || exit 73\n")
        for offset in range(0, len(encoded), 512):
            transport.send_public(f"printf '%s' '{encoded[offset:offset+512]}' >> \"$_fsg_db\" || exit 73\n")
        command = ("cd /app && node -e \"const fs=require('fs'),c=require('crypto'),f=fs.readFileSync(process.argv[1],'utf8');setTimeout(()=>process.exit(74),150000).unref();"
            f"if(f.length!=={len(encoded)}||c.createHash('sha256').update(f).digest('hex')!=='{digest}')process.exit(73);"
            "import('data:text/javascript;base64,'+f)"
            f".then(m=>m.recoveryDeniedVantage('{args.operator_egress_sha256}'))"
            f".then(v=>process.stdout.write('{marker}'+Buffer.from(JSON.stringify(v)).toString('base64')+'\\n'))"
            f".catch(()=>{{process.stdout.write('{marker}'+Buffer.from(JSON.stringify({{failed:true}})).toString('base64')+'\\n');process.exitCode=1}})"
            "\" \"$_fsg_db\"; _fsg_rc=$?; rm -f \"$_fsg_db\"; exit $_fsg_rc\n")
        transport.send_public(command)
        frame = transport.expect_frame(marker.encode())
        value = json.loads(base64.b64decode(frame, validate=True))
        if not isinstance(value, dict) or value.get("sourceSha") != args.sha or value.get("operation") != "recovery-denied-vantage" or value.get("schemaVersion") != 1:
            raise RuntimeError("Database inventory did not return complete safe evidence.")
        value["revision"] = args.revision
        value["imageDigest"] = args.image_digest
        value["probeSourceSha256"] = hashlib.sha256(source.encode()).hexdigest()
        return value
    finally:
        transport.finish()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute-reviewed-observation", action="store_true")
    parser.add_argument("--operator-egress-sha256", required=True)
    args = parser.parse_args()
    if not args.execute_reviewed_observation:
        parser.error("Independent review precedes actual observation")
    args.revision = "filosageqa-app--qa-stripe-test-1"
    args.sha = "c7d9c2c274bfcaee805332a83d94a208af32f09e"
    args.image_digest = "sha256:3d33eacc178c4e6323c957ab9fd1d81c2dd2f8e149b3b43bbe44e9b09a76bf14"
    args.transport_source = TRANSPORT_PATH
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(RuntimeError("Observation deadline exceeded")))
    signal.alarm(180)
    try:
        print(json.dumps(run(args), indent=2))
        return 0
    except Exception:
        print("Recovery denial probe failed closed; provider output suppressed.", file=sys.stderr)
        return 1
    finally:
        signal.alarm(0)

if __name__ == "__main__":
    raise SystemExit(main())
