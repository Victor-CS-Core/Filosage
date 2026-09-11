# Offline security scanner candidate

The private repository's CodeQL analysis completes, but GitHub rejects result upload because code scanning is unavailable. This candidate adds a free, local Semgrep CE gate. CodeQL remains unchanged until the replacement runs on the release commit, its detector fixtures pass, and actual findings are reviewed. No GitHub license, account, repository visibility, production setting, or billing configuration changes are included.

## Coverage and limits

The six project-owned rules detect request data entering SQL text, shell commands or JavaScript execution; component input entering raw HTML; disabled TLS certificate validation; and unsafe GitHub Actions expression interpolation into shell scripts. Request sources include the Next/Web Request body, URL and headers. SQL fixtures include default and named ESM `pg` imports and a typed `PoolClient`; shell fixtures include ESM aliases. Safe fixtures protect parameterized SQL, fixed-executable argument arrays, ordinary React text and environment-variable workflow input.

This is a deliberately narrow rule set, not CodeQL coverage parity. CE taint analysis does not establish cross-function or cross-file flow. These rules do not prove access control, Stripe lifecycle correctness, sanitizer correctness or absence of vulnerabilities. Existing dependency audits, tracked-secret checks, lint and security regression tests remain required. The raw HTML rule currently covers named function components; follow-up coverage changes need a failing fixture and review.

The engine is Semgrep CE 1.177.0 (LGPL 2.1), pinned to `semgrep/semgrep@sha256:acaac22ffc7b7cc5926de0751b223bce0b2491c33d18422fa72f632c78d81198`. The repository owns these rules; no registry pack is downloaded or vendored. See the [engine license](https://github.com/semgrep/semgrep/blob/v1.177.0/LICENSE), [CE overview](https://docs.semgrep.dev/faq/overview), and [release](https://github.com/semgrep/semgrep/releases/tag/v1.177.0).

## Execution and retained evidence

`.github/workflows/security-scan.yml` runs independently on pull requests, pushes to main and manual dispatch. It checks out the exact PR head, verifies that SHA again, pulls the pinned image, then runs every scanner process with `--network none`. Only the source checkout (read-only) and a temporary report directory are mounted; no credentials or Docker socket are passed. Metrics and version checks are explicitly disabled, all rules are local, and `--oss-only` prevents paid-engine use. Pulling the public image contacts its registry; source scanning has no network access or proprietary platform account. The runner does not submit source to a scanner service or GitHub code scanning.

Before the application scan, all six positive/safe fixture pairs must pass, and a separate synthetic SQL injection must produce a valid nonempty scan with exit code 1. Fixture counts of zero or fewer than six fail. Application findings, scanner errors, parse errors, missing reports, unexpected rule IDs, empty target coverage and contradictory exit codes fail the job. The synthetic fixture is never executed as application code. Each process has a deadline; the workflow is bounded to ten minutes. Tests follow the [Semgrep fixture format](https://docs.semgrep.dev/writing-rules/testing-rules); scan flags follow the [CLI reference](https://docs.semgrep.dev/cli-reference).

Only `test-results/security/summary.json` is uploaded, retained for 14 days in this private repository. It contains the source SHA, pinned scanner identity, fixture/probe status, scanned file counts, and finding rule ID/path/line/column. Raw excerpts, scanner messages, arbitrary metadata, stdout and stderr are excluded; temporary raw reports are removed. Paths and locations are still internal repository information and use the repository's existing artifact access controls. Reports are evidence, not a baseline exemption: every actual finding must be fixed or the rule narrowed with an explicit safe fixture and review. Inline suppression is disabled.

## Repeatable verification and rollout

With Node 22 and Docker available, from the repository root:

```sh
node --test tests/security/semgrep-report.test.mjs
EXPECTED_RELEASE_SHA="$(git rev-parse HEAD)" node scripts/run-security-scan.mjs
```

The runner itself proves synthetic failure before it can report an application pass. To repeat only this CI job without waiting for browser jobs, identify the pull-request run of `security-scan.yml` and rerun that workflow. PR pushes trigger it automatically; no deployment is required.

Local validation covers the report contract and source/static checks only. No local Docker runtime is available, so no Semgrep engine, detector-fixture or full source scan pass is claimed. Required next evidence: the pinned image and all six fixtures run successfully in CI; the synthetic vulnerability fails as expected; the complete source scan succeeds after triage; and the sanitized artifact matches that exact release SHA. Only after reviewing this evidence may a separate checkpoint remove the inoperable CodeQL workflow. This candidate must not silently turn an unavailable scanner into a passing release gate.
