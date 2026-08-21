#!/usr/bin/env bash
# Install the Multica CLI and the Cursor Multica skill.
# Idempotent. Does not read or write tokens.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_SRC="$ROOT/.cursor/skills/multica-cli"
SKILL_DST="${HOME}/.cursor/skills/multica-cli"

curl -fsSL https://raw.githubusercontent.com/multica-ai/multica/main/scripts/install.sh | bash

if ! command -v multica >/dev/null 2>&1; then
  echo "multica was installed but is not on PATH" >&2
  exit 1
fi

version="$(multica version --output json | python3 -c 'import json,sys; print(json.load(sys.stdin)["version"])')"
python3 - "$version" <<'PY'
import sys
version = sys.argv[1].lstrip("v")
parts = []
for item in version.split("."):
    try:
        parts.append(int(item))
    except ValueError:
        parts.append(0)
parts += [0] * (3 - len(parts))
if tuple(parts[:3]) < (0, 4, 26):
    raise SystemExit(f"multica {version} is older than required 0.4.26")
print(f"multica {version} meets the 0.4.26 floor")
PY

if [ -d "$SKILL_SRC" ]; then
  mkdir -p "$SKILL_DST"
  cp -R "$SKILL_SRC"/. "$SKILL_DST"/
  echo "Installed Cursor Multica skill to $SKILL_DST"
fi
