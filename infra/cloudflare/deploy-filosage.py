#!/usr/bin/env python3
"""Deploy the FiloSage Cloudflare Worker using the vaulted Cloudflare credential.

Usage: deploy-filosage.py [--env staging|production] [--dry-run]

Gets a surrogate API token for custom.cloudflare and runs `wrangler deploy`
with it as CLOUDFLARE_API_TOKEN. The surrogate is exchanged for the real
token by the runtime only when talking to api.cloudflare.com.
"""
import os
import subprocess
import sys

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import dynamic_credential_entry

REPO = os.path.expanduser("~/workspace/filosage-push/merge")


def main() -> int:
    env_name = "staging"
    dry_run = False
    for arg in sys.argv[1:]:
        if arg == "--dry-run":
            dry_run = True
        elif arg.startswith("--env="):
            env_name = arg.split("=", 1)[1]
        elif arg in ("staging", "production"):
            env_name = arg
        else:
            print(f"unknown arg: {arg}", file=sys.stderr)
            return 2

    entry = dynamic_credential_entry("custom.cloudflare", "access_token")
    surrogate = entry["surrogate"]
    assert surrogate.startswith("hsurr:"), "expected a surrogate token"

    cmd = ["npx", "wrangler", "deploy", "--env", env_name]
    if dry_run:
        cmd.append("--dry-run")
    print(f"+ {' '.join(cmd)} (env={env_name})")

    child_env = dict(os.environ)
    child_env["CLOUDFLARE_API_TOKEN"] = surrogate
    # Never log the surrogate value itself.
    proc = subprocess.run(cmd, cwd=REPO, env=child_env)
    return proc.returncode


if __name__ == "__main__":
    raise SystemExit(main())
