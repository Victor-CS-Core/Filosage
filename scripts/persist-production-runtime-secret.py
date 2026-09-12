#!/usr/bin/env python3
"""Persist only the verified dedicated runtime credential and its exact MI scope."""
from __future__ import annotations
import argparse
import base64
import hashlib
import hmac
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import signal
import subprocess
import tempfile
import time
import uuid
from datetime import datetime, timezone

SUB = "bfc8f890-2681-43dc-8eac-51644341ae12"
GROUP = "filosage-staging-central-rg"
PREFIX = f"/subscriptions/{SUB}/resourceGroups/{GROUP}"
VAULT_NAME = "filosagestg-p4ujucgnxq3g"
VAULT = f"{PREFIX}/providers/Microsoft.KeyVault/vaults/{VAULT_NAME}"
SECRET = "database-url-runtime-v1"
SCOPE = f"{VAULT}/secrets/{SECRET}"
SECRET_URL = f"https://{VAULT_NAME}.vault.azure.net/secrets/{SECRET}"
ROLE = "4633458b-17de-408a-b874-0445c86b69e6"
PROD = {"app": "filosagestg-app", "revision": "filosagestg-app--green-93f60f24-1", "sha": "93f60f24afe59b19b6a592f455a09e8e813f1f84", "image": "filosagestp4ujucgnxq3gsacr.azurecr.io/filosage@sha256:0c006852322a91d5e2540cfd27ab58e47dad33a3a1f793fd6afc1e2240bbadf2", "principal": "ed1a4afb-922a-4a2f-a70e-37602cad5dbf", "client": "fc8fec59-9873-4502-80e2-21f4dacc301c"}
QA = {"app": "filosageqa-app", "revision": "filosageqa-app--qa-stripe-test-1", "sha": "c7d9c2c274bfcaee805332a83d94a208af32f09e", "image": "filosagestp4ujucgnxq3gsacr.azurecr.io/filosage-qa@sha256:3d33eacc178c4e6323c957ab9fd1d81c2dd2f8e149b3b43bbe44e9b09a76bf14", "principal": "ace6a746-1953-483b-b4e0-d4429753d6b6", "client": "aa4f7188-36bc-49dd-a4eb-a6f296b81094"}
ASSIGNMENT_NAME = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{SCOPE.lower()}:{PROD['principal']}:{ROLE}"))
ASSIGNMENT_ID = f"{SCOPE}/providers/Microsoft.Authorization/roleAssignments/{ASSIGNMENT_NAME}"
CATALOG_KEYS = {"attributes", "database_acl", "schema_acl", "dml", "no_ddl", "exact_acl", "no_memberships", "owns_nothing", "no_qa_connect"}
TRANSPORT_PATH = "/home/ktr0nn/Work/Filosage/.worktrees/visitor-resume/.superpowers/sdd/outcome-checklist/qa-bootstrap/qa_bootstrap.py"
TRANSPORT_SHA = "ebf0b21413caea1127f81cfc398547b0460d4c2bef73b77e972e595fd2de1f40"

def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

def cli_env():
    return {**{key: value for key, value in os.environ.items() if not key.startswith("AZURE_STORAGE_")}, "AZURE_LOGGING_ENABLE_LOG_FILE": "false", "AZURE_CORE_COLLECT_TELEMETRY": "false"}

def azure(args, mutate=False):
    result = subprocess.run(["az", *args, "--subscription", SUB, "--only-show-errors", "-o", "none" if mutate else "json"], stdin=subprocess.DEVNULL, capture_output=True, timeout=30, env=cli_env(), check=False)
    if result.returncode or len(result.stdout) > 4 * 1024 * 1024:
        raise RuntimeError("Azure operation failed; private output suppressed.")
    return None if mutate else json.loads(result.stdout or b"null")

def validate_apply(value):
    expected = {"schemaVersion": 1, "operation": "production-runtime-preparation", "ok": True, "mode": "apply", "role": "filosage_runtime", "connectionLimit": 18, "sourceSha": PROD["sha"], "revision": PROD["revision"], "imageDigest": PROD["image"].split("@")[1], "runtimeTlsLoginVerified": True, "rolledBackDmlVerified": True, "currentSchemaSqlVerified": True, "oldRuntimeBindingChanged": False}
    if not isinstance(value, dict) or any(type(value.get(k)) is not type(v) or value[k] != v for k, v in expected.items()):
        raise RuntimeError("Verified role evidence is required.")
    if not isinstance(value.get("catalog"), dict) or set(value["catalog"]) != CATALOG_KEYS or any(v is not True for v in value["catalog"].values()):
        raise RuntimeError("Complete runtime allow/deny evidence required.")
    if value.get("capacity") != {"maxConnections": 50, "reservedConnections": 5, "superuserReservedConnections": 10, "modernConnections": 18, "qaAllowance": 11, "operationalReserve": 6}:
        raise RuntimeError("Approved connection capacity differs.")

def secret_decision(current, expected, deleted):
    if deleted:
        raise RuntimeError("Existing soft-deleted secret must not be replaced.")
    if current is None:
        return "create-absent"
    if not isinstance(current, str) or not hmac.compare_digest(current, expected):
        raise RuntimeError("An unrelated credential already exists; no overwrite.")
    return "existing-equal"

def secret_names(args):
    value = azure(args)
    if not isinstance(value, list) or any(not isinstance(name, str) or not name for name in value) or len(value) != len(set(value)):
        raise RuntimeError("Incomplete secret inventory.")
    return value

def version_from_id(value):
    if not isinstance(value, str) or not re.fullmatch(re.escape(SECRET_URL) + r"/[a-f0-9]{32}", value):
        raise RuntimeError("Unexpected secret version target.")
    return value.rsplit("/", 1)[1]

def without_new_assignment(rows):
    return sorted([row for row in rows if row.get("id", "").lower() != ASSIGNMENT_ID.lower()], key=lambda row: row["id"].lower())

def new_assignment_present(rows):
    found = []
    for row in rows:
        scope = row.get("scope", "").lower()
        if not scope:
            raise RuntimeError("Missing assignment scope.")
        if SCOPE.lower() == scope or SCOPE.lower().startswith(scope + "/"):
            if scope != SCOPE.lower() or row.get("id", "").lower() != ASSIGNMENT_ID.lower() or row.get("principalId", "").lower() != PROD["principal"] or row.get("condition") or row.get("roleDefinitionId", "").lower() != f"/subscriptions/{SUB}/providers/Microsoft.Authorization/roleDefinitions/{ROLE}".lower():
                raise RuntimeError("Unexpected effective runtime secret grant.")
            found.append(row)
    if len(found) > 1:
        raise RuntimeError("Duplicate runtime secret grant.")
    return bool(found)

def assignments():
    return sorted(azure(["role", "assignment", "list", "--assignee-object-id", PROD["principal"], "--all", "--include-inherited", "--query", "[].{id:id,scope:scope,roleDefinitionId:roleDefinitionId,principalId:principalId,condition:condition}"]), key=lambda row: row["id"].lower())

def runtime_snapshot(target):
    expected = PROD if target == "production" else QA
    app = azure(["containerapp", "show", "-g", GROUP, "-n", expected["app"]])
    revision = azure(["containerapp", "revision", "show", "-g", GROUP, "-n", expected["app"], "--revision", expected["revision"]])
    auth = azure(["containerapp", "auth", "show", "-g", GROUP, "-n", expected["app"]])
    if app.get("id", "").lower() != f"{PREFIX}/providers/Microsoft.App/containerApps/{expected['app']}".lower():
        raise RuntimeError("Wrong app identity.")
    identities = app.get("identity", {}).get("userAssignedIdentities", {})
    if len(identities) != 1:
        raise RuntimeError("Ambiguous managed identity.")
    identity = next(iter(identities.values()))
    if identity.get("principalId") != expected["principal"] or identity.get("clientId") != expected["client"]:
        raise RuntimeError("Managed identity changed.")
    props = revision.get("properties", {})
    containers = props.get("template", {}).get("containers", [])
    if revision.get("name") != expected["revision"] or props.get("active") is not True or len(containers) != 1 or containers[0].get("image") != expected["image"]:
        raise RuntimeError("Pinned runtime image changed.")
    entries = containers[0].get("env", [])
    if len({item.get("name") for item in entries}) != len(entries) or [item.get("value") for item in entries if item.get("name") == "SITE_VERSION"] != [expected["sha"]]:
        raise RuntimeError("Pinned runtime source changed.")
    config = app["properties"]["configuration"]
    if any(SECRET in entry.get("keyVaultUrl", "") for entry in config.get("secrets", [])):
        raise RuntimeError("New credential must not already be bound to an app.")
    return fingerprint({"identity": app["identity"], "configuration": config, "template": app["properties"]["template"], "revision": props["template"], "auth": auth})

def probe(target, version, deadline, password=None):
    expected = PROD if target == "production" else QA
    path = Path(TRANSPORT_PATH)
    if hashlib.sha256(path.read_bytes()).hexdigest() != TRANSPORT_SHA:
        raise RuntimeError("Reviewed transport changed.")
    spec = importlib.util.spec_from_file_location("reviewed_transport", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    source = Path(__file__).with_name("runtime-secret-status-probe.mjs").read_bytes()
    encoded = base64.b64encode(source).decode()
    digest = hashlib.sha256(encoded.encode()).hexdigest()
    nonce = secrets.token_hex(16)
    marker = f"__FSG_RUNTIME_SECRET_{nonce}__"
    transport = module.PtyTransport(["az", "containerapp", "exec", "--subscription", SUB, "-g", GROUP, "-n", expected["app"], "--revision", expected["revision"], "--command", "sh", "--only-show-errors"], cli_env(), timeout=min(90, max(1, deadline - time.monotonic())))
    try:
        transport.wait_input_ready()
        transport.send_public(f"printf '\\n%s%s\\n' '__FSG_CONNECTION_' '{nonce}__'\n")
        transport.expect(f"__FSG_CONNECTION_{nonce}__".encode())
        transport.send_public("stty -echo -echonl 2>/dev/null && case \" $(stty -a 2>/dev/null) \" in " + f"*\" -echo \"*) printf '\\n%s%s\\n' '__FSG_ECHO_OFF_' '{nonce}__';; *) exit 72;; esac\n")
        transport.expect(f"__FSG_ECHO_OFF_{nonce}__".encode())
        transport.send_public(f"umask 077; _fsg_runtime=/tmp/runtime-secret-{nonce}.b64; : > \"$_fsg_runtime\" || exit 73\n")
        for offset in range(0, len(encoded), 512):
            transport.send_public(f"printf '%s' '{encoded[offset:offset+512]}' >> \"$_fsg_runtime\" || exit 73\n")
        options = base64.b64encode(json.dumps({"target": target, "version": version}).encode()).decode()
        if password is None:
            invoke = f".then(m=>m.runtimeSecretStatusProbe(JSON.parse(Buffer.from('{options}','base64').toString())))"
        else:
            invoke = (".then(async m=>{const rl=require('readline').createInterface({input:process.stdin});"
                "const line=new Promise(resolve=>rl.once('line',resolve));"
                f"process.stdout.write('__FSG_CREDENTIAL_READY_{nonce}__\\n');"
                "const payload=await line;rl.close();return m.verifyRetainedRuntimeCredential(JSON.parse(payload).password)})")
        command = ("cd /app && node -e \"const fs=require('fs'),c=require('crypto'),f=fs.readFileSync(process.argv[1],'utf8');setTimeout(()=>process.exit(74),60000).unref();"
            f"if(c.createHash('sha256').update(f).digest('hex')!=='{digest}')process.exit(73);"
            f"import('data:text/javascript;base64,'+f){invoke}"
            f".then(v=>process.stdout.write('{marker}'+Buffer.from(JSON.stringify(v)).toString('base64')+'\\n'))"
            f".catch(()=>process.stdout.write('{marker}'+Buffer.from(JSON.stringify({{failed:true}})).toString('base64')+'\\n'))"
            "\" \"$_fsg_runtime\"; _fsg_rc=$?; rm -f \"$_fsg_runtime\"; exit $_fsg_rc\n")
        transport.send_public(command)
        if password is not None:
            transport.expect(f"__FSG_CREDENTIAL_READY_{nonce}__".encode())
            transport.send_protected_json({"password": password})
        value = json.loads(base64.b64decode(transport.expect_frame(marker.encode()), validate=True))
        if password is not None:
            if value != {"operation": "runtime-secret-login", "sourceSha": PROD["sha"], "loginVerified": True}:
                raise RuntimeError("Retained credential did not verify against the dedicated runtime role.")
            return value
        wanted = 200 if target == "production" else 403
        if set(value) != {"operation", "target", "sourceSha", "version", "status", "expected", "passed"} or value["operation"] != "runtime-secret-status" or value["target"] != target or value["sourceSha"] != expected["sha"] or value["version"] != version or value["expected"] != wanted or type(value["status"]) is not int or value["passed"] is not (value["status"] == wanted):
            raise RuntimeError("Invalid status-only evidence.")
        return value
    finally:
        transport.finish()

def run(args):
    deadline = time.monotonic() + 600
    evidence = json.loads(Path(args.apply_evidence).read_text())
    validate_apply(evidence)
    result = {"schemaVersion": 1, "operation": "persist-production-runtime-secret", "startedAt": datetime.now(timezone.utc).isoformat(), "passed": False, "applyEvidenceSha256": fingerprint(evidence), "scope": SCOPE, "assignmentId": ASSIGNMENT_ID, "probeOnly": args.probe_only,
        "helperSourceSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "probeSourceSha256": hashlib.sha256(Path(__file__).with_name("runtime-secret-status-probe.mjs").read_bytes()).hexdigest(), "transportSourceSha256": TRANSPORT_SHA}
    stage = "preflight"
    try:
        vault_id = azure(["keyvault", "show", "--name", VAULT_NAME, "--query", "id"])
        if vault_id.lower() != VAULT.lower():
            raise RuntimeError("Wrong vault identity.")
        before = {target: runtime_snapshot(target) for target in ("production", "qa")}
        original_assignments = assignments()
        has_grant = new_assignment_present(original_assignments)
        names = secret_names(["keyvault", "secret", "list", "--vault-name", VAULT_NAME, "--query", "[].name"])
        deleted = secret_names(["keyvault", "secret", "list-deleted", "--vault-name", VAULT_NAME, "--query", "[].name"])
        if args.probe_only:
            if SECRET not in names or SECRET in deleted or not has_grant:
                raise RuntimeError("Completed secret/grant required for read-only probe.")
            identifier = azure(["keyvault", "secret", "show", "--vault-name", VAULT_NAME, "--name", SECRET, "--query", "id"])
        else:
            path = Path(args.password_file)
            if path.is_symlink() or not path.is_file() or path.stat().st_uid != os.getuid() or path.stat().st_mode & 0o077 or path.stat().st_size > 65:
                raise RuntimeError("Invalid private retained password file.")
            password = path.read_text().strip()
            if not re.fullmatch(r"[a-f0-9]{64}", password):
                raise RuntimeError("Invalid retained runtime password.")
            desired = f"postgresql://filosage_runtime:{password}@filosagestg-p4ujucgnxq3gs-pg.postgres.database.azure.com:5432/filosage?sslmode=verify-full"
            stage = "retained-credential-login"
            probe("production", None, deadline, password=password)
            result["retainedCredentialLoginVerified"] = True
            current = azure(["keyvault", "secret", "show", "--vault-name", VAULT_NAME, "--name", SECRET]) if SECRET in names else None
            decision = secret_decision(current.get("value") if current else None, desired, SECRET in deleted)
            result["secretDisposition"] = decision
            stage = "secret-persistence"
            if decision == "create-absent":
                with tempfile.TemporaryDirectory(prefix="filosage-runtime-secret-") as directory:
                    file = Path(directory) / "credential"
                    file.write_text(desired); file.chmod(0o600)
                    # No conditional create API exists: exclusive operator ownership of this exact new name is required.
                    if SECRET in secret_names(["keyvault", "secret", "list", "--vault-name", VAULT_NAME, "--query", "[].name"]):
                        raise RuntimeError("Secret appeared concurrently; stopped without overwrite.")
                    result["secretWriteAttempted"] = True
                    identifier = azure(["keyvault", "secret", "set", "--vault-name", VAULT_NAME, "--name", SECRET, "--file", str(file), "--encoding", "utf-8", "--query", "id"])
            else:
                identifier = current.get("id")
            version_from_id(identifier)
            observed = azure(["keyvault", "secret", "show", "--id", identifier])
            if not hmac.compare_digest(observed.get("value", ""), desired) or observed.get("id") != identifier:
                raise RuntimeError("Credential readback mismatch; retain password for reconciliation.")
            result["credentialReadbackVerified"] = True
        version = version_from_id(identifier)
        result["secretVersion"] = version
        if not has_grant:
            stage = "exact-grant"
            if before != {target: runtime_snapshot(target) for target in ("production", "qa")} or fingerprint(original_assignments) != fingerprint(assignments()):
                raise RuntimeError("Identity/configuration/grants changed before grant.")
            result["assignmentWriteAttempted"] = True
            azure(["role", "assignment", "create", "--name", ASSIGNMENT_NAME, "--assignee-object-id", PROD["principal"], "--assignee-principal-type", "ServicePrincipal", "--role", ROLE, "--scope", SCOPE], mutate=True)
        stage = "status-probes"
        result["checks"] = [probe(target, version, deadline) for target in ("production", "qa")]
        after_assignments = assignments()
        if not new_assignment_present(after_assignments) or fingerprint(without_new_assignment(original_assignments)) != fingerprint(without_new_assignment(after_assignments)):
            raise RuntimeError("Unrelated grants changed.")
        if before != {target: runtime_snapshot(target) for target in ("production", "qa")}:
            raise RuntimeError("Application configuration changed.")
        result["configurationUnchanged"] = True
        result["unrelatedAssignmentsUnchanged"] = True
        result["passed"] = all(check["passed"] for check in result["checks"])
        result["passwordFileRetainedForOperatorCleanup"] = not args.probe_only
    except Exception:
        result["failedStage"] = stage
        result["retainedPasswordRequiredForRetry"] = True
    result["finishedAt"] = datetime.now(timezone.utc).isoformat()
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute-reviewed-operation", action="store_true")
    parser.add_argument("--probe-only", action="store_true")
    parser.add_argument("--apply-evidence", required=True)
    parser.add_argument("--password-file")
    args = parser.parse_args()
    if not args.execute_reviewed_operation or (not args.probe_only and not args.password_file):
        parser.error("Reviewed execution and retained private password are required.")
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(RuntimeError("Operation deadline exceeded.")))
    signal.alarm(600)
    try:
        result = run(args)
        print(json.dumps(result, indent=2))
        return 0 if result["passed"] else 1
    except Exception:
        print(json.dumps({"passed": False, "failedStage": "input-validation", "retainedPasswordRequiredForRetry": True}))
        return 1
    finally:
        signal.alarm(0)

if __name__ == "__main__":
    raise SystemExit(main())
