# Historical OpenGrep security investigation — findings retained

## September 12 consolidation status

The later approved security policy retains the automatic [Semgrep CE gate](2026-09-11-offline-security-scan.md) and manual-only CodeQL. This OpenGrep implementation is retained as an additional manual workflow, with all 83 immutable rules, strict finding failures, private reports, and fixture checks preserved. Its historical CodeQL deletion and automatic PR, branch, and weekly triggers are superseded. No historical finding is suppressed or reclassified as a pass by this consolidation. The evidence below belongs to the earlier branch and does not certify the current source.

The later shared diagram expression and deterministic operation-count regressions are retained alongside this branch's unique notation, line-boundary, and bounded large-input tests. Named type-only imports remain to support the pinned OpenGrep parser. Both CodeQL action components are being consolidated at the same pinned release while keeping dispatch manual.

## Original branch record

This continuation starts from `origin/main` at
`d7f6a70504fd1665a925fcfe211ae09ba4f92dbe`, on isolated branch
`codex/opengrep-security-20260911`. It preserves the release evidence branch at
`c3b55f70f6af433766a83d8e3aa0f0d412f08397` and the historical implementation
branch at `8b4c8c271243de249ea4a6d5303f6a66186ab4f1`.

## Historical failure and replacement scope

The exact-`d7f6a70` [Engineering run 34548324408](https://github.com/Victor-CS-Core/Filosage/actions/runs/34548324408)
succeeded. Its [CodeQL run 34548324459](https://github.com/Victor-CS-Core/Filosage/actions/runs/34548324459)
failed when GitHub rejected result upload. The handoff identified the repository's
private personal-account arrangement as ineligible for the required Code Security
entitlement. This work does not attempt a licensing bypass, enable scanning,
change repository visibility/ownership, start a trial, or activate billing.

The branch removes the unsupported CodeQL workflow and introduces a standalone
OpenGrep gate using the independently verified binary and immutable vendored
GitLab LGPL rule subset documented in [rule provenance](../../security/rules/PROVENANCE.md).
The scan runs without network interfaces beyond loopback and without inherited
credentials. Acquisition verifies the published binary checksum before execution;
the runner checks it again. Detailed JSON and scanner logs stay under private
`RUNNER_TEMP` directories outside the checkout, with no artifact upload.

The gate validates all 83 local rules on harmless input, requires vulnerable
JS/TS/TSX fixtures to fail and sanitized equivalents to pass, then scans `src`,
`scripts`, and `next.config.ts`. It rejects parser errors, rule omissions, source
coverage omissions, malformed output, scanner failures, timeouts, and findings.
It does not use the scanner's remote meta-lint validation command. Rule definitions
are unchanged; inline ignores are disabled and no exception register exists.

## Genuine corrections and review

- Greek-script processing now evaluates the math-context expression once per
  input, rather than once per Greek run. Both old inspection and sanitization
  paths exceeded an eight-second deadline on 200,000 short runs; the corrected
  behavior passes while preserving the notation/language rules.
- Diagram detection no longer lets multiline indentation consume line separators.
  Both old quality-gate branches exceeded a five-second deadline on 250,000 blank
  lines. The fix preserves fenced syntax, indentation, every JavaScript line
  separator, and ordinary prose classifications.
- Inline TypeScript import types in `document-store.ts` and `AppShell.tsx` were
  changed to named type-only imports because the pinned scanner partially parsed
  the inline form. Runtime imports and strict accounting behavior are unchanged.

Independent read-only source triage and implementation review found no remaining
Critical or Important implementation defect. A Minor test-coverage observation
was addressed with direct rule-integrity, missing-rule, malformed-output, target
coverage, and real process-group timeout tests. Review approves the implementation
of a red, fail-closed gate; it does not certify a clean security scan.

## Local evidence

| Check | Observed result |
| --- | --- |
| OpenGrep binary | v1.30.0, exact downloaded SHA-256 matches the release asset digest |
| Rule integrity and compatibility | All 83 vendored rules loaded and executed; exact manifest hashes checked |
| Vulnerable fixtures | 3 findings, one each in JS, TS, TSX; scanner exit 1 as required |
| Sanitized fixtures | 3 files, 0 findings, 0 errors; exit 0 |
| Corrected repository scan | **416 files, 83 unique rules, 40 findings, 0 errors; exit 1** |
| Runner behavioral tests | 8/8 on Linux, including malformed reports and timeout descendant cleanup |
| Full contracts | 463/463 in a Linux validation checkout at the same baseline plus the implementation patch |
| Focused language and pedagogy contracts | 33/33 in the implementation worktree |
| Actionlint | All eight workflow files valid, actionlint v1.7.12; embedded shell/Python linters disabled |
| Full lint and TypeScript | Passed after source fixes |
| Dependency audits | Production and complete audits: 0 vulnerabilities |
| Tracked-file secret scan | Passed after staging the exact new files and workflow deletion |
| Production build | Passed after source fixes |
| Chromium browser smoke | 33/33, no retries or skips |

The working host is Windows, not the Mac named in the handoff. Windows uses
Node 24.19.0; Linux validation uses verified Node 22.23.2 / npm 10.9.8. The first
Windows contract attempt had eight platform-only failures (CLI lookup, line
endings, symlink permissions, and Node reporter differences). The full Linux
rerun passed. Bicep validation uses the pinned v0.46.1 native compiler through a
local adapter accepting only `az bicep build --file ... --stdout`, with invariant
globalization for this WSL image. It does not contact Azure. This is compiler
validation, not Azure CLI authentication or deployment evidence.

## Remaining security blocker

Victor explicitly chose **“Keep every finding blocking.”** All 40 findings below
therefore block the security gate, including matches independent review considers
false positives. There are no accepted or suppressed matches and no claim of
security cleanliness. The genuine performance fixes expose two additional
matches of the same broad regex heuristic, explaining the increase from the
initial 38 to 40; the initial two parser errors are resolved.

The regex rule detects regex use involving a function's first argument; it does
not itself determine regex complexity. Current matches are bounded or linear,
including the repaired diagram checks. The SSRF rule likewise treats arbitrary
two-argument functions as request handlers, including browser-only callbacks
calling fixed local API routes. The remaining heuristics match an internal lease
comparison, a non-authorizing notification uniqueness hint, and local diagnostic
array filters. These review conclusions document context; they do not waive the
gate or remove findings.

## Release boundaries

Commit and push evidence is recorded separately after publication of this branch;
local checks here do not establish exact-pushed-SHA CI. No main merge, Azure
workflow dispatch, deployment, infrastructure change, provider/secret/billing
mutation, or production verification is performed. The Mac checkout and untracked
handoff are inaccessible from this host and untouched; the dirty Windows primary
checkout and all pre-existing worktrees/evidence remain preserved. Multica is
ignored for this continuation at Victor's explicit instruction.

## Blocking match inventory

Only rule identifiers and source locations are retained here, not scanner source
snippets, taint traces, or detailed JSON.

| Severity | Rule | Path | Line |
| --- | --- | --- | --- |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `scripts/azure-blue-green.mjs` | 43 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `scripts/provision-azure-postgres-roles.ts` | 6 |
| ERROR | `rules_lgpl_javascript_ssrf_rule-node-ssrf` | `src/app/admin/command-center/CommandCenterV2.tsx` | 483 |
| ERROR | `rules_lgpl_javascript_ssrf_rule-node-ssrf` | `src/app/admin/command-center/page.tsx` | 298 |
| ERROR | `rules_lgpl_javascript_ssrf_rule-node-ssrf` | `src/app/admin/page.tsx` | 204 |
| ERROR | `rules_lgpl_javascript_ssrf_rule-node-ssrf` | `src/app/admin/page.tsx` | 230 |
| ERROR | `rules_lgpl_javascript_ssrf_rule-node-ssrf` | `src/app/course/[topic]/page.tsx` | 142 |
| ERROR | `rules_lgpl_javascript_ssrf_rule-node-ssrf` | `src/app/page.tsx` | 107 |
| ERROR | `rules_lgpl_javascript_ssrf_rule-node-ssrf` | `src/app/pricing/page.tsx` | 204 |
| ERROR | `rules_lgpl_javascript_ssrf_rule-node-ssrf` | `src/components/flashcards/FlashcardStudio.tsx` | 112 |
| WARNING | `rules_lgpl_javascript_crypto_rule-node-timing-attack` | `src/lib/account-deletion.ts` | 135 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/auth-audit.ts` | 55 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/auth-audit.ts` | 56 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/command-center-schemas.ts` | 248 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/content-language.ts` | 54 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/content-language.ts` | 60 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/content-language.ts` | 66 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/content-language.ts` | 270 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/content-language.ts` | 273 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/course-banner-storage.ts` | 71 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/course-banners.ts` | 70 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/course-dto.ts` | 72 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/document-store.ts` | 488 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/document-store.ts` | 506 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/document-store.ts` | 546 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/document-store.ts` | 581 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/flashcards.ts` | 204 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/identity-link-policy.ts` | 110 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/identity-link-policy.ts` | 390 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/identity-link-policy.ts` | 391 |
| WARNING | `rules_lgpl_javascript_crypto_rule-node-insecure-random-generator` | `src/lib/learner-storage.ts` | 70 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/learning-design.ts` | 862 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/lesson-quality.ts` | 60 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/lesson-quality.ts` | 88 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/markdown.ts` | 99 |
| WARNING | `rules_lgpl_javascript_dos_rule-layer7-object-dos` | `src/lib/publication-assessment.ts` | 126 |
| WARNING | `rules_lgpl_javascript_dos_rule-layer7-object-dos` | `src/lib/publication-assessment.ts` | 127 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/release-capabilities.ts` | 112 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/release-capabilities.ts` | 113 |
| WARNING | `rules_lgpl_javascript_dos_rule-regex-dos` | `src/lib/release-capabilities.ts` | 115 |
