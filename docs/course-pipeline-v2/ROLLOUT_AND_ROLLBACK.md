# Rollout and Rollback

Decision-changing V2 flags default false. Account selection is controlled by:

- `COURSE_PIPELINE_V2_OWNER_ONLY=true` by default.
- `COURSE_PIPELINE_V2_COHORT_PERCENT=0` by default.

An owner is eligible regardless of percentage. Non-owners require owner-only false and a stable percentage greater than zero. The percentage bucket is a stable hash of the authenticated UID. Publication and repair dependencies fail closed in code: publication requires pipeline plus validation; repair requires validation; labs and visuals require pipeline.

## Sequence

1. Local: deterministic, security, accessibility, build, and full browser gates.
2. Owner canary: enable selected V2 flags with owner-only true. Every candidate requires exact-snapshot manual review while automated semantic/runtime lanes are absent.
3. Shadow: observe V1/V2 comparisons for a privacy-reviewed cohort without changing user decisions.
4. Limited cohort: set owner-only false and a measured stable percentage only after shadow thresholds pass and automated publication lanes exist.
5. General: 100 percent only after live corpus, false-denial, repair, latency, cost, accessibility, and source-support gates pass.

## Immediate rollback

Set the affected V2 feature flag false and redeploy. Keep `COURSE_PIPELINE_V2_OWNER_ONLY=true` and cohort percent 0. Do not reinterpret a V2 draft through incompatible V1 mutation logic; disable new generation/publication and preserve the draft. Published learners continue reading the immutable release selected by `publishedReleaseId`.

Rollback never requires deleting V2 course, release, repair, review, or timeline records. Billing remains independently locked by `BILLING_ENABLED=false`.

Artifact provenance is authoritative at rollback boundaries. A V2-provenance draft fails closed when its V2 generation or publication path is unavailable. A legacy draft does not enter V2 merely because its author is in the owner canary; migration must be explicit.
