#!/usr/bin/env python3
"""Create FiloSage D1 database and R2 bucket via Cloudflare API."""
import json
import sys
import urllib.request

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import add_surrogate_to_request, read_response_body

API = "https://api.cloudflare.com"
CREDENTIAL = "custom.cloudflare"
ACCOUNT_ID = "447a556505dd5e72b66e7c1c63d754ae"

def api(method, path, body=None):
    url = API + path
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
    add_surrogate_to_request(req, CREDENTIAL, allowed_hosts=["api.cloudflare.com"])
    resp = urllib.request.urlopen(req)
    return json.loads(read_response_body(resp))

# Create D1 database
print("Creating D1 database 'filosage-db'...")
try:
    result = api("POST", f"/client/v4/accounts/{ACCOUNT_ID}/d1/database", {"name": "filosage-db"})
    db = result["result"]
    print(f"  D1 created: {db['uuid']} ({db['name']})")
except Exception as e:
    if "exists" in str(e).lower() or "duplicate" in str(e).lower():
        print("  D1 already exists, listing...")
        result = api("GET", f"/client/v4/accounts/{ACCOUNT_ID}/d1/database")
        for db in result["result"]:
            if db["name"] == "filosage-db":
                print(f"  D1 found: {db['uuid']} ({db['name']})")
    else:
        raise

# Create R2 bucket
print("Creating R2 bucket 'filosage-assets'...")
try:
    result = api("POST", f"/client/v4/accounts/{ACCOUNT_ID}/r2/buckets", {"name": "filosage-assets"})
    print(f"  R2 created: {result['result']['name']}")
except Exception as e:
    if "exists" in str(e).lower() or "duplicate" in str(e).lower():
        print("  R2 bucket already exists")
    else:
        raise

print("Done.")
