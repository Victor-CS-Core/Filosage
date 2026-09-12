#!/usr/bin/env python3
"""Plan or apply only the reviewed exact-seven production secret-scope containment."""
from __future__ import annotations

import argparse
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import secrets
import signal
import subprocess
import sys
import time
import uuid
from urllib.parse import urlsplit

SUB = "bfc8f890-2681-43dc-8eac-51644341ae12"
GROUP = "filosage-staging-central-rg"
APP = "filosagestg-app"
PREFIX = f"/subscriptions/{SUB}/resourceGroups/{GROUP}"
APP_ID = f"{PREFIX}/providers/Microsoft.App/containerApps/{APP}"
IDENTITY_ID = f"{PREFIX}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/{APP}-identity"
PRINCIPAL = "ed1a4afb-922a-4a2f-a70e-37602cad5dbf"
CLIENT = "fc8fec59-9873-4502-80e2-21f4dacc301c"
VAULT = f"{PREFIX}/providers/Microsoft.KeyVault/vaults/filosagestg-p4ujucgnxq3g"
ROLE = "4633458b-17de-408a-b874-0445c86b69e6"
BROAD = "767eec1e-c898-5743-ae0c-90c1f8ed4d5a"
REQUIRED = {"activity-receipt-secret", "database-url", "identity-link-hmac-secret", "migrated-owner-uid", "openai-api-key", "google-easy-auth-client-secret", "external-id-client-secret"}
DENIED = {"database-admin-url", "postgres-admin-password", "postgres-app-password", "database-url-qa", "database-url-qa-runtime-v2", "external-id-client-secret-qa", "identity-link-hmac-secret-qa", "activity-receipt-secret-qa"}
EXPECTED_REVISION = f"{APP}--green-93f60f24-1"
EXPECTED_SHA = "93f60f24afe59b19b6a592f455a09e8e813f1f84"
EXPECTED_IMAGE = "filosagestp4ujucgnxq3gsacr.azurecr.io/filosage@sha256:0c006852322a91d5e2540cfd27ab58e47dad33a3a1f793fd6afc1e2240bbadf2"
TRANSPORT_PATH = "/home/ktr0nn/Work/Filosage/.worktrees/visitor-resume/.superpowers/sdd/outcome-checklist/qa-bootstrap/qa_bootstrap.py"
TRANSPORT_SHA = "ebf0b21413caea1127f81cfc398547b0460d4c2bef73b77e972e595fd2de1f40"


def fingerprint(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def azure(args: list[str], mutate: bool = False) -> object:
    result = subprocess.run(["az", *args, "--subscription", SUB, "--only-show-errors", "-o", "none" if mutate else "json"],
                            stdin=subprocess.DEVNULL, capture_output=True, timeout=30, check=False)
    if result.returncode:
        raise RuntimeError("Required Azure operation failed; provider output suppressed.")
    return None if mutate else json.loads(result.stdout)


def validate_assignments(rows: list[dict]) -> tuple[list[dict], dict[str, dict]]:
    broad = []
    narrow = {}
    for row in rows:
        scope = row["scope"].lower()
        relevant = scope == VAULT.lower() or VAULT.lower().startswith(scope + "/") or scope.startswith(VAULT.lower() + "/")
        if not relevant:
            continue
        if row.get("principalId", "").lower() != PRINCIPAL or row.get("condition") or not row.get("roleDefinitionId", "").lower().endswith("/" + ROLE):
            raise RuntimeError("Unexpected effective vault assignment.")
        if scope == VAULT.lower() and row["id"].lower() == f"{VAULT}/providers/Microsoft.Authorization/roleAssignments/{BROAD}".lower():
            broad.append(row)
        elif scope in {f"{VAULT}/secrets/{name}".lower() for name in REQUIRED}:
            name = scope.rsplit("/", 1)[1]
            if name in narrow:
                raise RuntimeError("Duplicate runtime secret assignment.")
            narrow[name] = row
        else:
            raise RuntimeError("Unexpected vault secret consumer or assignment.")
    if len(broad) > 1 or (not broad and set(narrow) != REQUIRED):
        raise RuntimeError("No supported initial or completed containment state.")
    return broad, narrow


def snapshot() -> dict:
    app = azure(["containerapp", "show", "-g", GROUP, "-n", APP])
    if app["id"].lower() != APP_ID.lower() or app["identity"]["type"] != "UserAssigned":
        raise RuntimeError("Wrong production identity.")
    identities = app["identity"]["userAssignedIdentities"]
    if len(identities) != 1:
        raise RuntimeError("Unexpected runtime identities.")
    key, identity = next(iter(identities.items()))
    if key.lower() != IDENTITY_ID.lower() or identity["principalId"] != PRINCIPAL or identity["clientId"] != CLIENT:
        raise RuntimeError("Runtime principal changed.")
    config = app["properties"]["configuration"]
    if config["activeRevisionsMode"] != "Multiple":
        raise RuntimeError("Unexpected revision mode.")
    traffic = sorted(config["ingress"]["traffic"], key=lambda row: row.get("label", ""))
    if traffic != [{"label": "blue", "revisionName": f"{APP}--blue-7abae96f-1", "weight": 0}, {"label": "green", "revisionName": EXPECTED_REVISION, "weight": 100}]:
        raise RuntimeError("Production traffic changed.")
    refs = config["secrets"]
    required = []
    app_refs = set()
    for entry in refs:
        url = urlsplit(entry.get("keyVaultUrl", ""))
        parts = url.path.split("/")
        if entry.get("identity", "").lower() != IDENTITY_ID.lower() or url.scheme != "https" or url.netloc != "filosagestg-p4ujucgnxq3g.vault.azure.net" or len(parts) != 4 or parts[1] != "secrets" or parts[2] not in REQUIRED or len(parts[3]) != 32 or url.query or url.fragment:
            raise RuntimeError("Secret reference target changed.")
        required.append({"name": parts[2], "url": entry["keyVaultUrl"]})
        app_refs.add(entry["name"])
    if len(refs) != 7 or {entry["name"] for entry in required} != REQUIRED or len(app_refs) != 7:
        raise RuntimeError("Expected exactly seven versioned references.")
    auth = azure(["containerapp", "auth", "show", "-g", GROUP, "-n", APP])
    consumed = set()
    def visit(value: object) -> None:
        if isinstance(value, dict):
            for name, child in value.items():
                if name.lower().endswith("secretsettingname") and isinstance(child, str): consumed.add(child)
                else: visit(child)
        elif isinstance(value, list):
            for child in value: visit(child)
    visit(auth)
    revisions = azure(["containerapp", "revision", "list", "-g", GROUP, "-n", APP])
    active = []
    for row in revisions:
        if row["properties"]["active"] is not True: continue
        revision = azure(["containerapp", "revision", "show", "-g", GROUP, "-n", APP, "--revision", row["name"]])
        containers = revision["properties"]["template"]["containers"]
        if len(containers) != 1: raise RuntimeError("Unexpected revision containers.")
        env = containers[0]["env"]
        if len({entry["name"] for entry in env}) != len(env): raise RuntimeError("Duplicate environment names.")
        consumed.update(entry["secretRef"] for entry in env if entry.get("secretRef"))
        if row["name"] == EXPECTED_REVISION and (containers[0]["image"] != EXPECTED_IMAGE or [e.get("value") for e in env if e["name"] == "SITE_VERSION"] != [EXPECTED_SHA]):
            raise RuntimeError("Live image changed.")
        active.append({"name": row["name"], "template": revision["properties"]["template"]})
    if {row["name"] for row in active} != {EXPECTED_REVISION, f"{APP}--blue-7abae96f-1"} or consumed != app_refs:
        raise RuntimeError("Active revision or shared-auth consumer mismatch.")
    names = azure(["keyvault", "secret", "list", "--vault-name", "filosagestg-p4ujucgnxq3g", "--query", "[].name"])
    if not REQUIRED | DENIED <= set(names): raise RuntimeError("Required allow/deny metadata target is absent.")
    rows = azure(["role", "assignment", "list", "--assignee-object-id", PRINCIPAL, "--all", "--include-inherited", "--query", "[].{id:id,scope:scope,roleDefinitionId:roleDefinitionId,principalId:principalId,condition:condition}"])
    rows.sort(key=lambda row: row["id"].lower())
    validate_assignments(rows)
    return {"configurationFingerprint": fingerprint({"identity": app["identity"], "config": config, "auth": auth, "active": sorted(active, key=lambda row: row["name"])}),
            "required": sorted(required, key=lambda row: row["name"]), "assignments": rows}


def validate_probe_result(value: dict, denied: set[str]) -> dict:
    checks = value.get("checks", [])
    expected = {name: 200 for name in REQUIRED} | {name: 403 for name in denied}
    if value.get("operation") != "production-vault-status-probe" or value.get("sourceSha") != EXPECTED_SHA or not isinstance(checks, list) or len(checks) != len(expected):
        raise RuntimeError("Runtime secret status probe returned invalid identity or shape.")
    observed = {}
    for check in checks:
        if not isinstance(check, dict) or set(check) != {"name", "status", "expected"} or not isinstance(check["name"], str) or check["name"] in observed or check["name"] not in expected or type(check["status"]) is not int or not 100 <= check["status"] <= 599 or check["expected"] != expected[check["name"]]:
            raise RuntimeError("Invalid status matrix.")
        observed[check["name"]] = check["status"]
    if set(observed) != set(expected): raise RuntimeError("Incomplete status matrix.")
    passed = observed == expected
    if value.get("passed") is not passed: raise RuntimeError("Inconsistent status summary.")
    return {"sourceSha": EXPECTED_SHA, "revision": EXPECTED_REVISION, "checks": checks, "passed": passed}


def probe(required: list[dict], denied: set[str], deadline: float) -> dict:
    path = Path(TRANSPORT_PATH)
    if hashlib.sha256(path.read_bytes()).hexdigest() != TRANSPORT_SHA: raise RuntimeError("Reviewed transport changed.")
    spec = importlib.util.spec_from_file_location("reviewed_transport", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    source = Path(__file__).with_name("production-vault-status-probe.mjs").read_text()
    encoded = base64.b64encode(source.encode()).decode()
    digest = hashlib.sha256(encoded.encode()).hexdigest()
    nonce = secrets.token_hex(16)
    marker = f"__FSG_VAULT_RESULT_{nonce}__"
    transport = module.PtyTransport(["az", "containerapp", "exec", "--subscription", SUB, "-g", GROUP, "-n", APP,
        "--revision", EXPECTED_REVISION, "--command", "sh", "--only-show-errors"], os.environ.copy(), timeout=min(150, max(1, deadline-time.monotonic())))
    try:
        transport.wait_input_ready()
        transport.send_public(f"printf '\\n%s%s\\n' '__FSG_CONNECTION_' '{nonce}__'\n")
        transport.expect(f"__FSG_CONNECTION_{nonce}__".encode())
        transport.send_public("stty -echo -echonl 2>/dev/null && case \" $(stty -a 2>/dev/null) \" in "
            f"*\" -echo \"*) printf '\\n%s%s\\n' '__FSG_ECHO_OFF_' '{nonce}__';; *) exit 72;; esac\n")
        transport.expect(f"__FSG_ECHO_OFF_{nonce}__".encode())
        transport.send_public(f"umask 077; _fsg_vault=/tmp/filosage-vault-status-{nonce}.b64; : > \"$_fsg_vault\" || exit 73\n")
        for offset in range(0, len(encoded), 512): transport.send_public(f"printf '%s' '{encoded[offset:offset+512]}' >> \"$_fsg_vault\" || exit 73\n")
        options = base64.b64encode(json.dumps({"expectedSha": EXPECTED_SHA, "required": required, "denied": sorted(denied)}).encode()).decode()
        command = ("cd /app && node -e \"const fs=require('fs'),c=require('crypto'),f=fs.readFileSync(process.argv[1],'utf8');"
            f"if(f.length!=={len(encoded)}||c.createHash('sha256').update(f).digest('hex')!=='{digest}')process.exit(73);"
            f"import('data:text/javascript;base64,'+f).then(m=>m.productionVaultStatusProbe(JSON.parse(Buffer.from('{options}','base64').toString())))"
            f".then(v=>process.stdout.write('{marker}'+Buffer.from(JSON.stringify(v)).toString('base64')+'\\n'))"
            f".catch(()=>process.stdout.write('{marker}'+Buffer.from('{{}}').toString('base64')+'\\n'))"
            "\" \"$_fsg_vault\"; _fsg_rc=$?; rm -f \"$_fsg_vault\"; exit $_fsg_rc\n")
        transport.send_public(command)
        value = json.loads(base64.b64decode(transport.expect_frame(marker.encode()), validate=True))
        result = validate_probe_result(value, denied)
        result["probeSourceSha256"] = hashlib.sha256(source.encode()).hexdigest()
        return result
    finally:
        transport.finish()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute-reviewed-containment", action="store_true")
    parser.add_argument("--probe-read-only", action="store_true")
    parser.add_argument("--expected-fingerprint")
    parser.add_argument("--evidence-dir", required=True)
    args = parser.parse_args()
    if args.execute_reviewed_containment and args.probe_read_only:
        parser.error("Choose either reviewed containment or the read-only probe")
    directory = Path(args.evidence_dir)
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if directory.is_symlink() or directory.stat().st_uid != os.getuid() or directory.stat().st_mode & 0o077:
        parser.error("Evidence directory must be an operator-owned private directory")
    stamp = secrets.token_hex(8)
    def save(name: str, value: object) -> None:
        path = directory / f"{stamp}-{name}.json"
        with path.open("x") as handle: json.dump(value, handle, indent=2)
        path.chmod(0o600)
    deadline = time.monotonic() + 600
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(RuntimeError("Containment deadline exceeded.")))
    signal.alarm(600)
    stage = "initial-metadata"
    try:
        before = snapshot()
        plan_fingerprint = fingerprint(before)
        save("before", before)
        if args.probe_read_only:
            stage = "read-only-allow-deny-probe"
            result = probe(before["required"], DENIED, deadline)
            save("read-only-status", result)
            stage = "read-only-final-metadata"
            after = snapshot()
            if fingerprint(after) != plan_fingerprint: raise RuntimeError("State changed during read-only verification.")
            save("read-only-after", after)
            print(json.dumps({"operation": "read-only-vault-verification", "providerMutation": False, **result}))
            return 0 if result["passed"] else 1
        if not args.execute_reviewed_containment:
            print(json.dumps({"operation": "plan-only", "fingerprint": plan_fingerprint, "requiredSecretNames": sorted(REQUIRED), "deniedSecretNames": sorted(DENIED), "broadAssignment": BROAD, "providerMutation": False}))
            return 0
        if args.expected_fingerprint != plan_fingerprint: raise RuntimeError("Reviewed plan changed.")
        broad, narrow = validate_assignments(before["assignments"])
        stage = "grant-exact-scopes"
        for name in sorted(REQUIRED - set(narrow)):
            scope = f"{VAULT}/secrets/{name}"
            assignment = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{PRINCIPAL}|{scope.lower()}|{ROLE}"))
            azure(["role", "assignment", "create", "--name", assignment, "--assignee-object-id", PRINCIPAL, "--assignee-principal-type", "ServicePrincipal", "--role", ROLE, "--scope", scope], mutate=True)
        added = snapshot()
        added_broad, added_narrow = validate_assignments(added["assignments"])
        if added["configurationFingerprint"] != before["configurationFingerprint"] or set(added_narrow) != REQUIRED or bool(added_broad) != bool(broad): raise RuntimeError("Preconditions changed during grant creation.")
        before_other = [row for row in before["assignments"] if row not in narrow.values()]
        added_other = [row for row in added["assignments"] if row not in added_narrow.values()]
        if before_other != added_other: raise RuntimeError("Unrelated assignment changed.")
        stage = "allow-before-removal"
        before_probe = probe(added["required"], set(), deadline)
        save("allow-before", before_probe)
        if not before_probe["passed"]: raise RuntimeError("A required read failed before removal.")
        fresh = snapshot()
        if fingerprint(fresh) != fingerprint(added): raise RuntimeError("State changed before exact grant removal.")
        save("removal-intent", {"configurationFingerprint": before["configurationFingerprint"], "assignment": broad, "restoreRequiresReviewedOperation": True})
        stage = "remove-captured-broad-grant"
        if broad: azure(["role", "assignment", "delete", "--ids", broad[0]["id"]], mutate=True)
        stage = "allow-and-deny-after-removal"
        after_probe = probe(added["required"], DENIED, deadline)
        save("allow-deny-after", after_probe)
        if not after_probe["passed"]: raise RuntimeError("Post-removal access matrix did not pass.")
        after = snapshot()
        remaining_broad, final_narrow = validate_assignments(after["assignments"])
        expected_rows = [row for row in added["assignments"] if row not in broad]
        if remaining_broad or set(final_narrow) != REQUIRED or after["assignments"] != expected_rows or after["configurationFingerprint"] != before["configurationFingerprint"]: raise RuntimeError("Final readback changed.")
        save("after", after)
        print(json.dumps({"operation": "exact-seven-production-vault-containment", "passed": True, "configurationUnchanged": True, "databaseLeastPrivilege": False, "broadAssignmentRemoved": True, "requiredReads": 7, "deniedReads": len(DENIED)}))
        return 0
    except Exception:
        save("stopped", {"stage": stage, "passed": False, "inspectExactAssignmentBeforeRetryOrRecovery": True})
        print(f"Production vault containment stopped at {stage}; inspect private metadata evidence. No provider output retained.", file=sys.stderr)
        return 1
    finally:
        signal.alarm(0)


if __name__ == "__main__":
    raise SystemExit(main())
