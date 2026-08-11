# Release Evidence

Date: 2026-08-11. Decision: **ready for an owner-only production canary, not for general release**. Decision-changing V2 behavior is account-scoped, dependency-checked, and owner-only by default. Billing remains disabled.

## Executed local gates

- Preserved failing fixtures reproduced both original cross-stage denials before the fixes.
- `npm.cmd run lint`: passed with zero warnings.
- `npm.cmd exec tsc -- --noEmit`: passed.
- `npm.cmd run build`: passed; Next.js 16.2.12 compiled and generated 73 pages.
- Full Playwright desktop/mobile matrix: 702 total, 677 passed, 25 intentional skips, 0 failed.
- Focused V2 contract suite: 34 passed, including false-denial, language, capability, artifact-scoped feature policy, durable payload-bound lab retry, stale-edit, unpublish atomicity, and late-generation/publish-race regressions.
- Axe automation executes inside the manual-review and targeted-repair authoring journeys; focused publication coverage passed 6 of 6.
- `npm.cmd audit --omit=dev --audit-level=high`: 0 production vulnerabilities.
- Production package/deployment health and the signed-in owner authoring journey are recorded only after they execute; no pre-claim is made here.

## Safety boundary

The deterministic V2 contract no longer calls a course automatically publishable while semantic, claim-support, runtime-accessibility, or asset-availability lanes are absent. It returns typed manual issues (`CQ_SEMANTIC_001`, `CQ_ACCESSIBILITY_001`, `CQ_ASSET_001`) and requires a recently authenticated owner decision over the exact snapshot. This makes the canary conservative rather than weakening publication standards.

Owner-scoped flags enforce dependencies. `COURSE_PUBLICATION_V2` cannot activate unless pipeline and validation V2 are active, and non-owner accounts remain on V1 while `COURSE_PIPELINE_V2_OWNER_ONLY=true`.

## Implemented release-critical controls

- Optional Recognition practice and concise valid lessons no longer create false denials.
- Typed diagnostics, stable rule codes, issue paths, version provenance, objective mappings, and content hashes use the shared contract.
- Validation state commits only if course and lesson fingerprints still match.
- Generated lesson saves reject a concurrent publish or newer author edit and invalidate readiness transactionally.
- Publication revalidates and writes the public course, immutable release, lessons, mutation key, and final stage in one transaction.
- Learner reads use `publishedReleaseId` snapshots when available.
- Public catalog, course detail, and lesson detail use the same immutable release and fail closed when a V2 release is unavailable. A public V2 banner cannot mutate until the draft is unpublished.
- Recognition practice attempts use SHA-256 artifact-bound receipts and durable payload-bound idempotency records, reload from durable per-item evidence in an executed browser journey, and are removed by course/account deletion.
- Deterministic unsupported-lab/visual repair is allowlisted, snapshot-bound, audited, undoable, and attempt-limited.
- Manual review is owner-only, recent-authenticated, source-evidence-gated for high-stakes topics, idempotent, and snapshot-bound.
- V2 records are included in permanent course deletion.
- V2 drafts remain on V2 when flags are paused, while unmigrated legacy artifacts remain on V1; rollback cannot create mixed-version courses.

## Known boundary for general release

- A calibrated independent semantic evaluator and automated claim-to-source support are not implemented; the owner gate is the safe temporary route.
- The 100-request corpus proves deterministic routing/applicability invariants, not 100 live generated courses.
- Course outline generation does not persist a partially completed provider response for restart; lessons are independently resumable by saved lesson.
- Firestore transaction callbacks are behaviorally covered, but a dedicated emulator race suite is still recommended.
- An operator timeline API exists; measured alerts, shadow baselines, and general-cohort thresholds still require real traffic.

These are blockers for cohort/general expansion, not hidden omissions. The canary must stay owner-only until they are resolved or supported by measured evidence.
