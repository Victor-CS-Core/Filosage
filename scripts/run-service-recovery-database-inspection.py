#!/usr/bin/env python3
"""Bounded source/restore inspection; review exact target before execution."""
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
APP = "filosagestg-app"
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
    containers = revision.get("properties", {}).get("template", {}).get("containers", [])
    if len(containers) != 1 or containers[0].get("image") != f"filosagestp4ujucgnxq3gsacr.azurecr.io/filosage@{digest}":
        raise RuntimeError("Immutable image target mismatch.")
    entries = containers[0].get("env", [])
    versions = [item.get("value") for item in entries if item.get("name") == "SITE_VERSION"]
    databases = [item for item in entries if item.get("name") == "DATABASE_URL"]
    if versions != [sha] or len(databases) != 1 or not databases[0].get("secretRef") or databases[0].get("value"):
        raise RuntimeError("Runtime source or database binding mismatch.")


def read_key(filename: str) -> str:
    key_path = Path(filename)
    if key_path.is_symlink() or not key_path.is_file() or key_path.stat().st_mode & 0o077 or key_path.stat().st_uid != os.getuid():
        raise RuntimeError("Fingerprint key must be an owned private regular file.")
    if key_path.stat().st_size > 65:
        raise RuntimeError("Invalid fingerprint key length.")
    key = key_path.read_text().strip()
    if not re.fullmatch(r"[a-f0-9]{64}", key):
        raise RuntimeError("Invalid fingerprint key.")
    return key


def run(args: argparse.Namespace) -> dict:
    deadline = time.monotonic() + 180
    if args.target not in ("source", "restore"):
        raise RuntimeError("Unapproved recovery target.")
    key = read_key(args.key_file)
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
    dependency = Path(__file__).with_name("inspect-runtime-database.mjs").read_bytes()
    source = Path(__file__).with_name("inspect-service-recovery-database.mjs").read_text(encoding="utf8")
    source = source.replace("./inspect-runtime-database.mjs", "data:text/javascript;base64," + base64.b64encode(dependency).decode())
    banners = Path(__file__).with_name("recovery-banner-references.mjs").read_bytes()
    source = source.replace("./recovery-banner-references.mjs", "data:text/javascript;base64," + base64.b64encode(banners).decode())
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
            ".then(async m=>{const rl=require('readline').createInterface({input:process.stdin});"
            "const line=new Promise(resolve=>rl.once('line',resolve));"
            f"process.stdout.write('__FSG_KEY_READY_{nonce}__\\n');"
            "const payload=await line;rl.close();"
            f"return m.runRecoveryInspection('{args.sha}','{args.target}',JSON.parse(payload).key)}})"
            f".then(v=>process.stdout.write('{marker}'+Buffer.from(JSON.stringify(v)).toString('base64')+'\\n'))"
            f".catch(()=>{{process.stdout.write('{marker}'+Buffer.from(JSON.stringify({{failed:true}})).toString('base64')+'\\n');process.exitCode=1}})"
            "\" \"$_fsg_db\"; _fsg_rc=$?; rm -f \"$_fsg_db\"; exit $_fsg_rc\n")
        transport.send_public(command)
        transport.expect(f"__FSG_KEY_READY_{nonce}__".encode())
        transport.send_protected_json({"key": key})
        frame = transport.expect_frame(marker.encode())
        value = json.loads(base64.b64decode(frame, validate=True))
        if not isinstance(value, dict) or value.get("sourceSha") != args.sha or value.get("operation") != "read-only-recovery-database" or value.get("schemaVersion") != 1:
            raise RuntimeError("Database inventory did not return complete safe evidence.")
        if value.get("target") != args.target or value.get("rpoVerified") is not False or value.get("serviceRecoveryVerified") is not False:
            raise RuntimeError("Invalid recovery evidence context.")
        value["revision"] = args.revision
        value["imageDigest"] = args.image_digest
        value["probeSourceSha256"] = hashlib.sha256(source.encode()).hexdigest()
        return value
    finally:
        transport.finish()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute-read-only-probe", action="store_true")
    parser.add_argument("--target", choices=["source", "restore"], required=True)
    parser.add_argument("--key-file", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--image-digest", required=True)
    parser.add_argument("--transport-source", default=TRANSPORT_PATH)
    args = parser.parse_args()
    if not args.execute_read_only_probe:
        parser.error("Independent review precedes --execute-read-only-probe")
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(RuntimeError("Probe deadline exceeded.")))
    signal.alarm(180)
    try:
        result = run(args)
        print(json.dumps(result, indent=2))
        return 0
    except Exception:
        print("Recovery database inspection failed closed; no provider output retained.", file=sys.stderr)
        return 1
    finally:
        signal.alarm(0)


if __name__ == "__main__":
    raise SystemExit(main())
