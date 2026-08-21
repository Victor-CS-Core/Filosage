#!/usr/bin/env python3
"""Log the Multica CLI in from MULTICA_TOKEN without putting the token on argv."""

from __future__ import annotations

import errno
import os
import pty
import re
import select
import subprocess
import sys

CLOUD_SERVER_URL = "https://api.multica.ai"
CLOUD_APP_URL = "https://multica.ai"
SECRET_RE = re.compile(r"(mul_|mcn_)[A-Za-z0-9_-]{8,}")


def redact(text: str) -> str:
    return SECRET_RE.sub("<redacted>", text)


def run(argv: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(argv, check=False, text=True, capture_output=True)


def already_authenticated() -> bool:
    result = run(["multica", "auth", "status"])
    combined = f"{result.stdout}\n{result.stderr}"
    if result.returncode != 0:
        return False
    lowered = combined.lower()
    return "not authenticated" not in lowered and "no server configured" not in lowered


def ensure_cloud_urls() -> None:
    show = run(["multica", "config", "show"])
    text = show.stdout
    if "server_url:" in text and "(not set)" in text.split("server_url:", 1)[1].splitlines()[0]:
        subprocess.run(["multica", "config", "set", "server_url", CLOUD_SERVER_URL], check=True)
    if "app_url:" in text and "(not set)" in text.split("app_url:", 1)[1].splitlines()[0]:
        subprocess.run(["multica", "config", "set", "app_url", CLOUD_APP_URL], check=True)


def login_with_token(token: str) -> None:
    pid, fd = pty.fork()
    if pid == 0:
        os.execvp("multica", ["multica", "login", "--token"])

    sent = False
    output = b""
    while True:
        ready, _, _ = select.select([fd], [], [], 45)
        if not ready:
            os.kill(pid, 9)
            raise SystemExit("timed out waiting for Multica login prompt")
        try:
            chunk = os.read(fd, 4096)
        except OSError as exc:
            if exc.errno == errno.EIO:
                break
            raise
        if not chunk:
            break
        output += chunk
        lowered = output.decode("utf-8", "replace").lower()
        if not sent and ("token" in lowered or "paste" in lowered):
            os.write(fd, f"{token}\n".encode("utf-8"))
            sent = True

    _, status = os.waitpid(pid, 0)
    code = os.waitstatus_to_exitcode(status)
    visible = redact(output.decode("utf-8", "replace"))
    if code != 0:
        print(visible, file=sys.stderr)
        raise SystemExit(f"multica login failed with exit {code}")
    if not sent:
        print(visible, file=sys.stderr)
        raise SystemExit("Multica login did not prompt for a token")


def main() -> int:
    token = os.environ.get("MULTICA_TOKEN", "").strip()
    if already_authenticated():
        print("Multica CLI is already authenticated")
        return 0
    if not token:
        print("MULTICA_TOKEN is unset; Multica CLI login skipped", file=sys.stderr)
        return 0

    ensure_cloud_urls()
    login_with_token(token)
    status = run(["multica", "auth", "status"])
    print(redact(status.stdout.strip() or status.stderr.strip()))
    if status.returncode != 0:
        return status.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
