# CI cost controls prepared for main

Base: `96559246b89b81f5b3cebcc36147932400c8cc4c`. This branch carries only the approved cost controls and compatible verification. The four workflow diffs are identical to the reviewed `1718133` patch.

- Full regression and CodeQL become manual-only. Full regression retains all six execution lanes, its 60-minute cap, source-SHA assertion, and uploaded evidence.
- Automatic PR/main engineering quality remains enabled. Static checks receive a 15-minute cap; browser smoke receives 20 minutes. The existing PostgreSQL job and its 10-minute cap are unchanged.
- Support wiki validation retains its triggers and integrity/change-impact checks, removes dependency installation and cache setup, cancels superseded runs on the same ref, and receives a five-minute cap.
- Pinned action revisions, permissions, dependency audits, tracked-secret checks, and `scripts/azure-blue-green.mjs` are unchanged. Promotion still requires successful quality and full-regression runs for the exact candidate SHA.

The later release branch adds an offline security-scan workflow that is absent from this main base. Its new-workflow assertions are intentionally not copied into this CI-only patch; main's existing security assertions remain. No scanner or application implementation is imported.

Local verification:

- Five focused release-hardening contracts: before workflow changes, three expected trigger-policy failures and two passes; afterward, **5/5 pass**, including rejection of incorrect or failed workflow evidence.
- Focused oxlint and ESLint: pass.
- `node scripts/check-support-wiki.mjs --stale-after 180`: all 19 articles pass without package installation.
- All four workflow documents parse successfully using the existing Azure CLI Python/YAML runtime; no Azure command is invoked. Node `js-yaml` and the generic bundled Python YAML module were unavailable, so neither was used to claim a pass.
- `git diff --check`: pass.

Reproduce the focused contracts with `node node_modules/@playwright/test/cli.js test tests/release-hardening.spec.ts --config=playwright.contracts.config.ts --grep "required quality gate runs|automatic engineering quality workflow|CI cost controls preserve|release automation pins|release workflows accept only exact" --reporter=line` from the repository root.

This record describes local preparation only. The coordinator owns the approved temporary workflow pause, push, integration into main, and subsequent remote verification. No application, billing, tenant, or deployment configuration changes are included.
