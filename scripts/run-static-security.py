"""Pinned, network-isolated static scan. Detailed output stays in RUNNER_TEMP."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import socket
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
RULES = "security/rules/javascript"
VERSION = "1.30.0"
BINARY_SHA256 = "35779bdd72e92129c8df2a77f0c55e8c08356801ea92591ef32108d6b28d564c"
SOURCE_SUFFIXES = {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"}
SCAN_TIMEOUT_SECONDS = 300


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def check_report(report, status, expected_paths, expected_rules=None):
    """Never trust exit zero alone, and never echo scanner messages or source."""
    if not isinstance(report, dict) or report.get("version") != VERSION:
        return 2
    findings = report.get("results")
    if not isinstance(findings, list) or report.get("errors") != []:
        return 2
    paths = report.get("paths")
    if not isinstance(paths, dict) or not isinstance(paths.get("scanned"), list):
        return 2
    scanned = paths["scanned"]
    if not all(isinstance(path, str) for path in scanned) or not expected_paths.issubset(set(scanned)):
        return 2
    if expected_rules is not None:
        timing = report.get("time", {})
        if not isinstance(timing, dict) or not isinstance(timing.get("rules"), list):
            return 2
        rules = timing["rules"]
        if not all(isinstance(rule, str) for rule in rules) or set(rules) != expected_rules:
            return 2
    summaries = []
    for finding in findings:
        if not isinstance(finding, dict):
            return 2
        extra, start = finding.get("extra"), finding.get("start")
        if not isinstance(extra, dict) or not isinstance(start, dict):
            return 2
        severity, rule, path, line = extra.get("severity"), finding.get("check_id"), finding.get("path"), start.get("line")
        if (severity not in {"ERROR", "WARNING", "INFO"}
                or not isinstance(rule, str) or not re.fullmatch(r"[A-Za-z0-9_.-]+", rule)
                or not isinstance(path, str) or path not in expected_paths
                or any(ord(char) < 32 or ord(char) == 127 for char in path)
                or type(line) is not int or line < 1):
            return 2
        summaries.append((severity, rule, path, line))
    if status not in (0, 1) or type(status) is not int or (status == 1 and not findings):
        return 2
    for summary in summaries:
        print(*summary)
    return 1 if findings else 0


def source_paths(targets):
    result = set()
    for target in targets:
        path = ROOT / target
        if not path.exists() or path.is_symlink():
            raise ValueError("Invalid scan target")
        files = path.rglob("*") if path.is_dir() else [path]
        for file in files:
            if file.is_symlink():
                raise ValueError("Symlink in scan target")
            if file.is_file() and file.suffix in SOURCE_SUFFIXES:
                result.add(file.relative_to(ROOT).as_posix())
    if not result:
        raise ValueError("Empty scan target")
    return result


def verify_rules():
    manifest = json.loads((ROOT / "security/rules/manifest.json").read_text())
    if manifest["commit"] != "7051ea7602a210dfb0793916afedc9a0555addb7":
        raise ValueError("Unexpected rule provenance")
    files = manifest["files"]
    actual = {path.relative_to(ROOT / "security/rules").as_posix()
              for path in (ROOT / RULES).rglob("*") if path.is_file()}
    if actual != set(files) or len(files) != 83:
        raise ValueError("Incomplete rule pack")
    rules = set()
    for relative, expected in files.items():
        path = ROOT / "security/rules" / relative
        if path.is_symlink() or digest(path) != expected["sha256"]:
            raise ValueError("Changed vendored rule")
        prefix = ".".join(("security/rules/" + relative).split("/")[:-1])
        rules.add(prefix + "." + expected["id"])
    if len(rules) != 83:
        raise ValueError("Duplicate rule identity")
    return rules


def run_scan(binary, evidence, name, targets, expected_rules):
    expected_paths = source_paths(targets)
    output = evidence / (name + ".json")
    # Explicit local config, no remote meta-lint validation, no ignore comments.
    command = [str(binary), "scan", "--experimental", "--disable-version-check",
               "--strict", "--error", "--taint-intrafile", "--disable-nosem",
               "--no-git-ignore", "--max-target-bytes", "0", "--timeout", "15",
               "--timeout-threshold", "1", "--jobs", "2", "--time",
               "--config", RULES, "--json", "--output", str(output), *targets]
    environment = {"PATH": "/usr/bin:/bin", "HOME": str(evidence),
                   "TMPDIR": str(evidence), "LANG": "C.UTF-8",
                   "OPENGREP_ENABLE_VERSION_CHECK": "0"}
    with (evidence / (name + ".log")).open("w") as log:
        process = subprocess.Popen(command, cwd=ROOT, env=environment,
                                   stdout=log, stderr=log, start_new_session=True)
        try:
            status = process.wait(timeout=SCAN_TIMEOUT_SECONDS)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
            return 2, None
    try:
        report = json.loads(output.read_text())
    except (OSError, ValueError):
        return 2, None
    return check_report(report, status, expected_paths, expected_rules), report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binary", required=True, type=Path)
    args = parser.parse_args()
    try:
        # Require a Linux network namespace with no external interfaces.
        if sys.platform != "linux" or any(name != "lo" for _, name in socket.if_nameindex()):
            raise ValueError("Network isolation is required")
        binary = args.binary.resolve(strict=True)
        if digest(binary) != BINARY_SHA256:
            raise ValueError("Scanner checksum mismatch")
        base = Path(os.environ["RUNNER_TEMP"]).resolve(strict=True)
        if base.is_relative_to(ROOT):
            raise ValueError("Private output must be outside the repository")
        os.umask(0o077)
        evidence = Path(tempfile.mkdtemp(prefix="static-security-", dir=base))
        expected_rules = verify_rules()
        # Compile and execute every rule on a harmless target before scanning input.
        code, _ = run_scan(binary, evidence, "validation", ["security/fixtures/validation"], expected_rules)
        if code != 0:
            raise ValueError("Rule validation failed")
        code, report = run_scan(binary, evidence, "vulnerable", ["security/fixtures/vulnerable"], expected_rules)
        fixture_paths = source_paths(["security/fixtures/vulnerable"])
        expected_id = "security.rules.javascript.eval.rules_lgpl_javascript_eval_rule-eval-nodejs"
        if (code != 1 or report is None or len(report["results"]) != 3
                or {item["path"] for item in report["results"]} != fixture_paths
                or any(item["check_id"] != expected_id for item in report["results"])):
            raise ValueError("Vulnerable fixture did not fail as expected")
        code, _ = run_scan(binary, evidence, "sanitized", ["security/fixtures/sanitized"], expected_rules)
        if code != 0:
            raise ValueError("Sanitized fixture did not pass")
        code, _ = run_scan(binary, evidence, "repository", ["src", "scripts", "next.config.ts"], expected_rules)
        if code == 2:
            raise ValueError("Repository scan was incomplete")
        return code
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        print("Static security gate could not complete.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
