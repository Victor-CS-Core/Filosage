# Cloudflare-only cleanup

Status: complete. This change removes obsolete Azure and PostgreSQL runtime, release, CI, dependency, and operator surfaces after the completed Cloudflare migration. Historical release evidence may retain provider names only when needed to describe past infrastructure; it must not be executable or presented as current architecture.

## Outcome checklist

- [x] Make the production document store unconditionally use D1 and validate the focused D1 suite.
- [x] Make binary object storage unconditionally use R2 and remove Azure SDK dependencies.
- [x] Remove Azure authentication, infrastructure, PostgreSQL, backup, migration, and deployment code from active application and operator surfaces.
- [x] Remove obsolete Azure workflows, infrastructure, scripts, PostgreSQL tests, package scripts, and dependencies.
- [x] Replace release and CI gates with Cloudflare/D1 equivalents and remove the stale Azure release preflight.
- [x] Update user-facing legal, support, admin, and current-state text to describe Cloudflare only.
- [x] Prove no active Azure/PostgreSQL imports, environment variables, package dependencies, workflows, scripts, or runtime branches remain. Credential signatures remain only in the tracked-secret scanner and its tests.
- [x] Pass focused D1/storage/auth/contracts tests, type checking, lint, production build, Cloudflare build, and Worker smoke.
- [x] Prepare a coherent checkpoint without deploying, migrating, changing secrets, or mutating remote resources.

## Validation

- Contracts: 377 passed.
- D1: 13 passed; API: 11 passed; billing: 32 passed.
- Spark, evaluation-budget, lesson-integrity, lesson-operations, and evaluation harness: 109 passed.
- TypeScript, production build, Cloudflare build, Worker bundle smoke, tracked-secret scan, and diff checks pass.
- Lint has zero errors and four existing Next.js internal-navigation warnings.

## Safety boundaries

Production remains unchanged. Preserve existing D1/R2 data, direct Google authentication, billing closure, all Spark flags, routes, secret bindings, and the current rollback version. Do not delete historical evidence merely to make a text search empty; historical records must be clearly non-operative.
