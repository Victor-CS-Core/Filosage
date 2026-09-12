# Offline security scanner candidate

The private repository's CodeQL analysis completes, but GitHub rejects result upload because code scanning is unavailable. This candidate adds a free, local Semgrep CE gate. Remote CodeQL remains unchanged. The separately reviewed Actions cost proposal would make it manual-only, subject to Victor's pending approval. No GitHub license, account, repository visibility, production setting, or billing configuration changes are included.

## Coverage and limits

The six project-owned rules detect request data entering SQL text, shell commands or JavaScript execution; component input entering raw HTML; disabled TLS certificate validation; and unsafe GitHub Actions expression interpolation into shell scripts. Request sources include the Next/Web Request body, URL and headers. SQL fixtures include default and named ESM `pg` imports and a typed `PoolClient`; shell fixtures include ESM aliases. Safe fixtures protect parameterized SQL, fixed-executable argument arrays, ordinary React text and environment-variable workflow input.

This is a deliberately narrow rule set, not CodeQL coverage parity. CE taint analysis does not establish cross-function or cross-file flow. These rules do not prove access control, Stripe lifecycle correctness, sanitizer correctness or absence of vulnerabilities. Existing dependency audits, tracked-secret checks, lint and security regression tests remain required. The raw HTML rule currently covers named function components; follow-up coverage changes need a failing fixture and review.

The engine is Semgrep CE 1.177.0 (LGPL 2.1), pinned to `semgrep/semgrep@sha256:acaac22ffc7b7cc5926de0751b223bce0b2491c33d18422fa72f632c78d81198`. The repository owns these rules; no registry pack is downloaded or vendored. See the [engine license](https://github.com/semgrep/semgrep/blob/v1.177.0/LICENSE), [CE overview](https://docs.semgrep.dev/faq/overview), and [release](https://github.com/semgrep/semgrep/releases/tag/v1.177.0).

## Execution and retained evidence

`.github/workflows/security-scan.yml` runs independently on pull requests, pushes to main and manual dispatch. It checks out the exact PR head, verifies that SHA again, pulls the pinned image, then runs every scanner process with `--network none`. Only the source checkout (read-only) and a temporary report directory are mounted; no credentials or Docker socket are passed. Metrics and version checks are explicitly disabled, all rules are local, and `--oss-only` prevents paid-engine use. Pulling the public image contacts its registry; source scanning has no network access or proprietary platform account. The runner does not submit source to a scanner service or GitHub code scanning.

Before the application scan, all six positive/safe fixture pairs must pass, and a separate synthetic SQL injection must produce a valid nonempty scan with exit code 1. Fixture counts of zero or fewer than six fail. Application findings, scanner errors, parse errors, missing reports, unexpected rule IDs, empty target coverage and contradictory exit codes fail the job. The synthetic fixture is never executed as application code. Each process has a deadline; the workflow is bounded to ten minutes. Tests follow the [Semgrep fixture format](https://docs.semgrep.dev/writing-rules/testing-rules); scan flags follow the [CLI reference](https://docs.semgrep.dev/cli-reference).

Only `test-results/security/summary.json` is uploaded, retained for 14 days in this private repository. It contains the source SHA, pinned scanner identity, fixture/probe status, scanned file counts, and finding rule ID/path/line/column. Incomplete scans also retain capped diagnostics with known error types and locations restricted to the trusted Git inventory. Application scan excerpts, messages, arbitrary metadata, stdout and stderr are excluded; temporary raw reports are removed. The separate synthetic-fixture command retains its exit code and up to 8 KiB of plain-text diagnostics, with terminal controls removed, so rule parse errors and missed fixture lines are actionable. That diagnostic field is never populated by application scan output. Paths and locations are still internal repository information and use the repository's existing artifact access controls. Reports are evidence, not a baseline exemption: every actual finding must be fixed or the rule narrowed with an explicit safe fixture and review. Inline suppression is disabled.

## Repeatable verification and rollout

With Node 22 and Docker available, from the repository root:

```sh
node --test tests/security/semgrep-report.test.mjs
EXPECTED_RELEASE_SHA="$(git rev-parse HEAD)" node scripts/run-security-scan.mjs
```

The runner itself proves synthetic failure before it can report an application pass. To repeat only this CI job without waiting for browser jobs, identify the pull-request run of `security-scan.yml` and rerun that workflow. PR pushes trigger it automatically; no deployment is required.

Initial CI run `34638823617` at `7c26c8f` pulled and verified the pinned image, then failed the fixture gate before scanning application source. A worktree-only Semgrep 1.177.0 installation on existing WSL Python reproduced an unquoted YAML shell-options pattern; quoting it exposed a missed typed/destructured React prop. The corrected React source pattern now covers shorthand and aliased destructuring, with ordinary rendered text remaining safe. All six detector fixture pairs pass locally with `--strict`, metrics/version checks disabled and `unshare --user --map-root-user --net` network isolation. The separate synthetic probe returned exit 1, one scanned file and the expected SQL finding at line 8; the production report validator accepted that nonempty result. The subsequent diagnostics and source-compatibility corrections bring report-contract coverage to nine passing checks; TypeScript and focused lint also pass. No system packages were installed; the temporary runtime is ignored and not part of the release.

The pinned Docker workflow still requires a fresh CI run at the final integrated SHA. Required evidence: all six fixtures pass; the synthetic vulnerability fails as expected; complete nonempty source coverage succeeds after triage; and the sanitized artifact matches that SHA. Local WSL engine results do not replace the exact-image CI check. The separate cost proposal retains CodeQL as a manual workflow; no removal is proposed or authorized. This candidate must not silently turn an unavailable scanner into a passing release gate.


## September 11 integrated local source result

At `4bd9d7c1ee947fb7dafc627ef97e4eb449b496f1`, the network-isolated Linux scan finished in 44.881 seconds with exit 0, zero scanner errors and zero findings. Input and rule hashes matched before and after. The safe report records 428 scanned files: 376 in `src`, 43 in `scripts`, and nine workflow files. Independent review matched every recorded input Git blob to that commit and verified the inventory hash. Its 438 target files comprise 428 eligible TypeScript/TSX/MJS/YAML files plus eight CSS files, one SVG and one Markdown file outside the configured rule languages. The six rule files bring the copied inventory to 444.

The original raw report was cleaned up, so its full scanned-path set cannot be compared individually against the eligible inventory; the retained counts agree. The [local scan artifact](../research/artifacts/visitor-release-2026-09-11/security-local-scan.json) records this limitation and the exact source and engine. This proves the local installed-engine run, not execution of the pinned CI image.

Source triage fixed two actual lesson-processing slowdowns; all 43 entries in the older OpenGrep report are documented in [static-security-triage](2026-09-11-static-security-triage.md). The new source scan also exposed two parser incompatibilities in existing JSX href literals and a false SQL match on fixed `import.meta.url`; narrow equivalent href expressions and a tested built-in-source correction resolved those without skipping files or suppressing findings.
