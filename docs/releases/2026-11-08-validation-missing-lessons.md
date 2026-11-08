# Missing-lesson validation release

Owner authorized implementation, commit, push and production deployment on November 8. Scope: normalize absent lesson snapshots without weakening real-change, moderation or publication guards. Preserve production data and disabled billing/Spark settings.

- [x] Reproduce outline-only validation failure through the real route (409 STALE_VALIDATION_SNAPSHOT instead of 200).
- [x] Normalize missing lessons and verify partial drafts and concurrent creation (41/41 publication fixture cases pass).
- [x] Run publication contracts, unit/type/lint checks and independent review (clean full contracts459/459, publication fixture41/41).
- [ ] Commit/push and collect exact-source release gates.
- [ ] Build/smoke the Worker, deploy with preserved bindings, verify production.

Starting source: d07c88fa1fff9d850e82192c298800f953fe5a61. No production changes yet.

Fix is restricted to normalizing the route's missing lesson to null, matching transaction reads. Existing proof and concurrency checks are unchanged. Independent read-only review confirmed the cause and proposed test scope. TypeScript and lint pass (four existing navigation warnings); unit suites pass. OpenNext build succeeds. Local Worker smoke cannot start because uv_interface_addresses fails in this host. Wrangler is unauthenticated, and CLI Git push also lacks a login; use GitHub connector for source checkpoint. Exact-source CI, full regression and production deploy remain pending. Earlier concurrent contract/lint attempts overlapped build-time source swaps and are not clean evidence; rerun without builds.
