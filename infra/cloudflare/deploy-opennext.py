#!/usr/bin/env python3
"""Deploy the FiloSage OpenNext worker to Cloudflare via the REST API.

Usage: deploy-opennext.py [--env staging|production] [--message TEXT]

Replicates `wrangler deploy [--env ...]` for the OpenNext build output:
  1. builds the Workers Static Assets manifest for .open-next/assets
  2. creates an assets upload session, uploads changed files
  3. uploads the worker version (.open-next/worker.js + metadata with
     D1/R2/vars/assets bindings)
  4. creates a deployment routing 100% of traffic to the new version

Auth uses the stored `custom.cloudflare` connector via authd surrogates.
Staging deploys do NOT need user approval. Production deploys DO.
"""
import base64
import json
import mimetypes
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request, read_response_body

API = "https://api.cloudflare.com"
ALLOWED = ["api.cloudflare.com"]
CREDENTIAL = "custom.cloudflare"
ACCOUNT_ID = "447a556505dd5e72b66e7c1c63d754ae"
REPO = os.path.expanduser("~/workspace/filosage-push/merge")
BIN = os.path.expanduser("~/workspace/skills/cloudflare/bin")

ENVS = {
    "staging": {
        "script": "filosage-staging",
        "d1": {"binding": "FILOSAGE_D1", "database_id": "6805f7f9-610a-4699-9253-65bdfc88de40"},
        "r2": {"binding": "FILOSAGE_R2", "bucket_name": "filosage-assets-staging"},
        "vars": {
            "CLOUDFLARE_D1_ENABLED": "true",
            "CLOUDFLARE_R2_ENABLED": "true",
            "NODE_ENV": "production",
            "DEPLOYMENT_ENVIRONMENT": "qa",
        },
    },
    "production": {
        "script": "filosage",
        "d1": {"binding": "FILOSAGE_D1", "database_id": "5fa98a30-1ece-4d6a-8771-db4b2f0aad34"},
        "r2": {"binding": "FILOSAGE_R2", "bucket_name": "filosage-assets"},
        "vars": {
            "CLOUDFLARE_D1_ENABLED": "true",
            "CLOUDFLARE_R2_ENABLED": "true",
            "NODE_ENV": "production",
            "DEPLOYMENT_ENVIRONMENT": "production",
        },
    },
}


def api_request(method, path, body=None, headers=None, credential=True):
    url = API + path
    data = None
    req_headers = dict(headers or {})
    if body is not None and not isinstance(body, (bytes, bytearray)):
        data = json.dumps(body).encode()
        req_headers.setdefault("Content-Type", "application/json")
    else:
        data = body
    req = urllib.request.Request(url, data=data, method=method, headers=req_headers)
    if credential:
        add_surrogate_to_request(req, CREDENTIAL, allowed_hosts=ALLOWED)
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            payload = json.loads(read_response_body(resp).decode())
    except urllib.error.HTTPError as e:
        raw = read_response_body(e).decode()
        raise RuntimeError(f"Cloudflare API {e.code} on {method} {path}: {raw[:600]}")
    if isinstance(payload, dict) and "success" in payload and not payload["success"]:
        raise RuntimeError(f"Cloudflare API error on {method} {path}: {json.dumps(payload.get('errors'))[:600]}")
    return payload.get("result", payload) if isinstance(payload, dict) else payload


def encode_multipart(fields):
    boundary = "----cfdeploy" + base64.urlsafe_b64encode(os.urandom(12)).decode().rstrip("=")
    body = bytearray()
    for name, value, filename, content_type in fields:
        body += f"--{boundary}\r\n".encode()
        disp = f'Content-Disposition: form-data; name="{name}"'
        if filename:
            disp += f'; filename="{filename}"'
        body += disp.encode() + b"\r\n"
        body += f"Content-Type: {content_type or 'text/plain'}".encode() + b"\r\n\r\n"
        body += value if isinstance(value, (bytes, bytearray)) else str(value).encode()
        body += b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    return bytes(body), boundary


def build_manifest(asset_dir):
    out = subprocess.run(
        ["node", os.path.join(BIN, "manifest.js"), asset_dir],
        capture_output=True, text=True, check=True,
    )
    return json.loads(out.stdout)


def sync_assets(script, asset_dir):
    manifest = build_manifest(asset_dir)
    print(f"asset manifest: {len(manifest)} files")
    session = api_request(
        "POST",
        f"/client/v4/accounts/{ACCOUNT_ID}/workers/scripts/{script}/assets-upload-session",
        {"manifest": {k: {"hash": v["hash"], "size": v["size"]} for k, v in manifest.items()}},
    )
    jwt, buckets = session["jwt"], session.get("buckets", [])
    missing = [h for b in buckets for h in b]
    if not missing:
        print("no new asset files to upload")
        return jwt
    print(f"uploading {len(missing)} new/changed asset files in {len(buckets)} buckets")
    by_hash = {}
    for rel, meta in manifest.items():
        by_hash[meta["hash"]] = (os.path.join(asset_dir, rel.lstrip("/")), meta)
    completion_jwt = ""
    for i, bucket in enumerate(buckets):
        fields = []
        for h in bucket:
            path, meta = by_hash[h]
            with open(path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode()
            ctype = mimetypes.guess_type(path)[0] or "application/null"
            fields.append((h, b64, h, ctype))
        data, boundary = encode_multipart(fields)
        for attempt in range(4):
            try:
                res = api_request(
                    "POST",
                    f"/client/v4/accounts/{ACCOUNT_ID}/workers/assets/upload?base64=true",
                    data,
                    {"Content-Type": f"multipart/form-data; boundary={boundary}",
                     "Authorization": f"Bearer {jwt}"},
                    credential=False,
                )
                completion_jwt = res.get("jwt", "") or completion_jwt
                break
            except RuntimeError as e:
                if attempt == 3:
                    raise
                print(f"bucket {i+1} attempt {attempt+1} failed, retrying: {str(e)[:120]}")
                time.sleep(2 ** attempt)
        print(f"bucket {i+1}/{len(buckets)} uploaded")
    if not completion_jwt:
        raise RuntimeError("asset upload did not return a completion JWT")
    return completion_jwt


def current_secret_names(script):
    try:
        result = api_request("GET", f"/client/v4/accounts/{ACCOUNT_ID}/workers/scripts/{script}/secrets")
        items = result if isinstance(result, list) else result.get("result", [])
        return [s["name"] for s in items if isinstance(s, dict) and s.get("name")]
    except RuntimeError as e:
        if "404" in str(e) or "not found" in str(e).lower():
            return []
        raise


def deploy(env_name, message):
    cfg = ENVS[env_name]
    script = cfg["script"]
    worker_js = os.path.join(REPO, ".open-next", "worker.js")
    asset_dir = os.path.join(REPO, ".open-next", "assets")
    if not os.path.exists(worker_js):
        raise RuntimeError(f"worker bundle missing: {worker_js} (run npm run build:cloudflare first)")
    if not os.path.isdir(asset_dir):
        raise RuntimeError(f"asset dir missing: {asset_dir}")

    assets_jwt = sync_assets(script, asset_dir)

    bindings = [
        {"name": cfg["d1"]["binding"], "type": "d1", "id": cfg["d1"]["database_id"]},
        {"name": cfg["r2"]["binding"], "type": "r2_bucket", "bucket_name": cfg["r2"]["bucket_name"]},
    ]
    for name, text in cfg["vars"].items():
        bindings.append({"name": name, "type": "plain_text", "text": text})
    for name in current_secret_names(script):
        bindings.append({"name": name, "type": "inherit"})
        print(f"inheriting secret binding: {name}")

    metadata = {
        "main_module": "worker.js",
        "bindings": bindings,
        "compatibility_date": "2026-09-01",
        "compatibility_flags": ["nodejs_compat"],
        "assets": {"jwt": assets_jwt, "config": {"not_found_handling": "single-page-application"}},
        "observability": {"enabled": True, "head_sampling_rate": 0.1},
    }
    with open(worker_js, "rb") as f:
        worker_src = f.read()
    print(f"worker bundle: {len(worker_src)} bytes")

    # The worker entry imports sibling modules that wrangler normally
    # resolves; upload them as additional modules. Recursively discover
    # all relative imports starting from worker.js.
    import re
    open_next_dir = os.path.join(REPO, ".open-next")
    discovered = set()
    to_visit = ["worker.js"]
    import_re = re.compile(r'''(?:import|export)[^'"]*?from\s*['"](\./[^'"]+)['"]|import\s*\(\s*['"](\./[^'"]+)['"]\s*\)''')
    while to_visit:
        rel = to_visit.pop()
        if rel in discovered:
            continue
        discovered.add(rel)
        path = os.path.join(open_next_dir, rel)
        if not os.path.exists(path):
            print(f"warning: imported module not found: {rel}")
            continue
        try:
            with open(path, "r", errors="ignore") as f:
                src = f.read()
        except OSError:
            continue
        base = os.path.dirname(rel)
        for m in import_re.finditer(src):
            imp = m.group(1) or m.group(2)
            # Resolve relative to importing file, strip trailing / if any
            target = os.path.normpath(os.path.join(base, imp))
            # Skip directory imports ("./") and non-js
            if target.endswith("/"):
                continue
            # Try with extensions if no exact match
            if not os.path.exists(os.path.join(open_next_dir, target)):
                for ext in (".js", ".mjs", ".cjs"):
                    if os.path.exists(os.path.join(open_next_dir, target + ext)):
                        target = target + ext
                        break
            to_visit.append(target)
    print(f"discovered {len(discovered)} worker modules")
    fields = [("metadata", json.dumps(metadata), None, "text/plain")]
    for rel in sorted(discovered):
        if rel == "worker.js":
            continue
        path = os.path.join(open_next_dir, rel)
        if not os.path.exists(path) or not os.path.isfile(path):
            continue
        with open(path, "rb") as f:
            fields.append((rel, f.read(), rel, "application/javascript+module"))
    fields.append(("worker.js", worker_src, "worker.js", "application/javascript+module"))
    data, boundary = encode_multipart(fields)
    version = api_request(
        "POST",
        f"/client/v4/accounts/{ACCOUNT_ID}/workers/scripts/{script}/versions?bindings_inherit=strict",
        data,
        {"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    version_id = version["id"]
    print(f"version created: {version_id}")
    deployment = api_request(
        "POST",
        f"/client/v4/accounts/{ACCOUNT_ID}/workers/scripts/{script}/deployments",
        {"strategy": "percentage",
         "versions": [{"version_id": version_id, "percentage": 100}],
         "annotations": {"workers/message": message}},
    )
    print(f"deployment live: {json.dumps(deployment)[:300]}")
    print("DEPLOY_OK", version_id)


def main():
    env_name = "staging"
    message = "filosage opennext deploy"
    args = sys.argv[1:]
    if "--env" in args:
        env_name = args[args.index("--env") + 1]
    for a in args:
        if a.startswith("--env="):
            env_name = a.split("=", 1)[1]
    if "--message" in args:
        message = args[args.index("--message") + 1]
    if env_name not in ENVS:
        print(f"unknown env: {env_name}", file=sys.stderr)
        return 2
    if env_name == "production":
        print("production deploys need explicit user approval; refusing", file=sys.stderr)
        return 3
    deploy(env_name, message)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
