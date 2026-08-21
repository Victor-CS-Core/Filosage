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
- Production package/deployment health and the signed-in owner authoring journey completed successfully; the executed evidence is recorded below.

## Executed production owner acceptance

- Application build `d0155008c12354f6fb8bd2d0f4e9cdc66d7b14f5` was pushed to `origin/main` and the Sites-managed source before deployment. Sites version 114 deployed successfully with environment revision 84.
- Exact-SHA production health passed on `https://filosage.com`, `https://www.filosage.com`, and `https://teach-app-victo.ktr0nn.chatgpt.site`.
- Google same-tab redirect sign-in completed in the production browser with the owner account after registering both custom-domain OAuth callbacks and OAuth authorized origins.
- The owner generated and inspected the complete course `Evidence-based product decisions for small software teams` (`06f9ad150a1cd1d7d9c311f82113f0af94141780d42a27ce24ff61679ced7c7a`): 4 modules, 12 generated lessons, and four-stage activity workspaces for every lesson.
- Deterministic validation routed the exact snapshot to manual review only for the explicitly unexecuted semantic/claim-support, runtime-accessibility, and asset-availability lanes. The owner recorded a review reason on the exact hash, approved it, reran publication preflight, and published successfully.
- The public course API returned 200 with `isPublic: true`. The authenticated immutable learner lesson returned 200, rendered its explanation and banner, and opened the four-stage activity workspace.
- Recent production logs showed no 5xx responses during acceptance. Datastore contention on concurrent post-sign-in account reads was retried successfully and each associated request returned 200.
- Production `BILLING_ENABLED` remained `false`.

The application acceptance ran on `d0155008...`. The successor release-record commit contains documentation only and must still follow the same Git-first, Sites-second, exact-SHA deployment check.

## Authentication relay security evidence

- The rejected broad external rewrite was removed. Azure Container Apps Easy Auth terminates Google OAuth before requests reach Next.js.
- The relay does not forward cookies, authorization headers, or API keys; it forwards a small request-header allowlist, caps request bodies at 1 MiB, and applies a response-header allowlist.
- The production `__/auth/iframe` relay returned 200 without frame-denial headers, while the rest of the application retained its normal security headers.
- The Sites build completed without the external-rewrite credential-forwarding warning.

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

- Automatic provider research, server source classification, outline grounding, and lesson claim-to-evidence evaluation are implemented for private creation as of 2026-08-14. Live calibration across adversarial factual domains is still required before describing the system as infallible or removing separate high-stakes publication controls.
- The 100-request corpus proves deterministic routing/applicability invariants, not 100 live generated courses.
- A certified request-bound research snapshot is persisted before outline generation and reused after a restart; incomplete or rejected provider research is never persisted as eligible evidence. Lessons remain independently resumable by saved lesson.
- document transaction callbacks are behaviorally covered, but a dedicated emulator race suite is still recommended.
- An operator timeline API exists; measured alerts, shadow baselines, and general-cohort thresholds still require real traffic.

These are blockers for cohort/general expansion, not hidden omissions. The canary must stay owner-only until they are resolved or supported by measured evidence.
