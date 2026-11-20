# Spark production release — November 20, 2026

Decision: retain the released fix with public Spark and billing off. Grounding, replay, isolation, versioning, downgrade and kill-switch production checks passed. Disposable active app data was removed and verified, but final retention/identity review remains pending. Public rollout requires that review and separate owner approval.

## Identity and qualification

- Spark-qualified source: `eaefccb80c2062e455d9967060c0743dae6804f1`.
- Final flags-off Worker: `26de1e30-ba94-451f-bcbe-f042dd7a6238`, deployment `30598382-06ff-4824-a217-a975f4666f4a`, 100% traffic.
- Initial flags-off Worker for this source: `94b38830-a84f-41c2-840d-e47bae3da12f`.
- Private paid-window Worker: `aff203b9-3210-4d10-9a40-7967ca5a8c4b`.
- Rechecked pre-release rollback: `3d27e36c-0b52-41b7-9771-c7c3994af88d`, source `4932ee0e06a4cb6793db26659d00c02ef66c370b`. No historical October/v18 rollback target was used.
- Exact-source [engineering44606326535](https://github.com/Victor-CS-Core/Filosage/actions/runs/44606326535), [security44606329806](https://github.com/Victor-CS-Core/Filosage/actions/runs/44606329806), and [full browser44607556088](https://github.com/Victor-CS-Core/Filosage/actions/runs/44607556088) passed. Combined browser report:480 expected,65 skipped,0 unexpected,0 flaky.
- Local Spark37/37, production Cloudflare build, preserved-build Worker smoke4/4 passed.
- Clean exact-source managed checkout and ordinary branch push were used. No staging deployment, force push, protection bypass, migration, arithmetic publication or billing activation occurred. Unrelated course-creation/image edits were excluded.
- Existing OpenAI secret binding was inherited; its value was never read or exposed.

## Private canary evidence

Owner approved an additional50,000-microUSD ($0.05) cap. The existing monthly total cap remained50,000 including2,109 historical usage, so the available additional allowance was stricter. Runtime and ledger concurrency were1. One disposable app UID was admitted through the server-only canary binding; public UI and semantic retrieval remained off.

| Gate | Production result |
| --- | --- |
| Excluded account admission | Owner reported direct session/turn/attempt/preparation POST4/4 returned403 SPARK_ACCOUNT_NOT_ADMITTED with private,no-store on the exact source. Agent also observed authenticated owner session-history denial. |
| Allowlisted preparation/session | Supported endpoint201 created manifest `manifest-16a58c8f690aabce24ef0846`; session201 created `session-34b61444dd1a2ba19314ed91`. D1 confirms both and ready job `prepare-b123ad57571398bd605bee7b`. |
| Cross-account isolation | Disposable account received403 SPARK_SESSION_FORBIDDEN / SPARK_COURSE_FORBIDDEN for the owner's private session/course. |
| Grounding | Request `e09b8e88-c5fe-4d58-8451-e5dd8f59fe06` returned200 and course_supported, correctly naming37 amber tiles and moss lantern482. Cited `chunk-b4f801a0b6a541692310f150` contains both details. |
| Persistence | Independent D1 inspection confirms the identical source ID and response saved in the turn. |
| Exact replay | User receipt:200, Idempotent-Replay:true, identical response and persisted response. One new paid ledger row only; total rows3 to4. |
| Stale version | Old session supplied NEW version `lesson-1e139dd8fe3dd9a32e5bea62f5d590ce` returned409 SPARK_STALE_LESSON under `79a32fad-804d-470c-946f-5dd099b69ed7`. No reservation exists for that ID. |
| Downgrade | Temporary app-only Plus grant revoked through supported owner UI. Free plan,4 of5 questions remaining; user receipt confirms saved history/reference accessible and allowance unchanged through denial tests. |
| Fresh valid kill request | Prepared v2 manifest `manifest-5f07b273a5472335033c50d1`, replacement session `session-06cb4b4dbc23152db2e03b8e`; fresh valid request `2895173a-8155-44e2-b60b-fc56fb70824c` returned503 budget_limited. Runtime live flag was enabled but operator admission was closed. No reservation/call/charge; allowance4 before/after. |
| Disposable app deletion | User confirmed irreversible app-only deletion. Supported UI and fresh Google reauthentication removed the active app profile, synthetic course tree and all owned Spark records; D1 counts0. Owner profile and protected course/session remain. Lifecycle deleted. Both Google/Gmail accounts were preserved. |

The first grounding attempt returned400 because the operator console script used action explain rather than the deployed enum explain_differently. It was rejected before reservation/dispatch. Admission was closed; absence of reservation and charge was confirmed; corrected payload was schema/mock-tested and retried with the SAME original UUID. No new identity or application-source change was introduced for this correction. No unclear provider outcome was retried.

Hosted grounding used the runbook's supported preparation endpoint before session creation. The separate local service regression covers grounding without stored preparation chunks.

## Spend and final controls

One new recorded paid inference cost **742 microUSD ($0.000742)**:1,371 input tokens,0 cached input,121 output; provider response `resp_0b8626a373da4d8c016b004e1fb34487d2a5fc1742f479eaed`. Total Spark committed cost is2,851 microUSD including2,109 prior usage. Reserved/unknown exposure is0/0. Financial ledger evidence was retained through app deletion. No new unresolved Spark provider exposure exists; this does not reconcile unrelated arithmetic/publication operations.

All five flags—SPARK_ENABLED, NEXT_PUBLIC_SPARK_ENABLED, SPARK_LIVE_AI_ENABLED, SPARK_PREPARE_ENABLED, SPARK_SEMANTIC_RETRIEVAL_ENABLED—arefalse. Billing isfalse/closed/tax-not-ready. Ledger ispractice_only, live/preparation admission0, concurrency1; runtime concurrency1. Canary UID binding and its local temporary input file were removed. Original7 secret binding names remain, including OpenAI. Cache-busted apex/direct health, readiness and billing probes6/6 pass on the exact source.

## Outstanding review and UI follow-up

Deletion job `f67e956e8fca947a1938bb2aa1f9e57c64490c8f5a5ec18b6d0002fb8c7380df` reports activeDataRemoved:true, lifecycle deleted, but status/stage retention_review and ACCOUNT_DELETION_RETENTION_REVIEW_PENDING with7 retained paths. **Do not claim complete erasure or bypass retention/identity review.** Public rollout remains blocked by that review and separate owner approval. Billing remains off.

The owner additionally requested removal of Research and Launch readiness from the Control Room. The separate local UI branch removes those sections and moves the existing learner-report queue to Safety. Its lint/type checks and three focused Chromium layout/phone checks pass; hosted qualification and deployment of that UI follow-up are pending. It has not altered this Spark release's source or flags.
