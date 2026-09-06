# Durable course generation and accounting

R08 introduces version 1 course operations. A verified, accepted account can recover its reserved operation even after its last course credit has been redeemed or its plan changes. Fresh admission still enforces the current plan, course-credit balance, rate limit, user budget and shared budget. Billing remains separately disabled until its activation gates pass.

## API and request lifetime

`POST /api/generate-course` accepts the existing bounded course request and an `Idempotency-Key` of 12–200 characters. Its operation ID is SHA-256 of `uid:course_outline:key`. Admission binds the canonical parsed request fingerprint, account generation, credit claim, original AI accounting paths and attempt token in one transaction. Reusing a key with another payload fails before any debit. A completed operation returns its committed course without generation.

The request executes bounded provider waves. Each provider call has an existing independent deadline plus a maximum 120-second bound, hidden SDK retries are disabled, the request budget is 150 seconds, and the lease is 180 seconds. Calls starting in the same short wave may run concurrently. Completed provider responses and exact observed usage are checkpointed before certification, parsing-dependent work, or further paid calls. Later waves use saved responses. Reused source response timestamps remain the original observation times; cache reuse does not renew evidence freshness. Reopening runs the next pending wave; no background completion service is installed.

The client gives an individual request 170 seconds and a foreground continuation loop at most 12 waves/20 minutes. It establishes recovery state before the first POST and retains that request key after any lost or unreadable response, including when form inputs change. Only a confirmed terminal operation or an explicit server no-admission response permits clearing it. A no-admission response follows an atomic operation/request absence check and a permanent not-admitted key marker; an older queued POST cannot later admit that discarded key. It stores request identity in R03's account-scoped `generation-operation` storage family, uses the existing authenticated session/abort guards, and presents actual persisted stage text. It offers saved requests before checking a zero balance. The server list supports another session/device; a failed list read remains a recovery error. Ending an idle or expired operation restores its unused course credit. An active lease must end before abandonment can supersede it.

| Endpoint/result | Contract |
| --- | --- |
| `POST /api/generate-course`, 200 | `courseId`, `operationId`; completed replay adds `recovered:true` |
| Same endpoint, 202 | `GENERATION_RESUME_REQUIRED`, pending operation ID; resume from the saved request |
| `GET /api/generation-operations` | Up to 100 operations owned by the captured UID/generation, returned as status metadata |
| `GET /api/generation-operations/:id` | `running`, `pending`, `completed`, or `failed`; stage, result ID, retry time, terminal reason, and actionable saved recovery when present |
| `POST /api/generation-operations/:id` | Resumes using the stored request/key; caller content cannot replace the request |
| `DELETE /api/generation-operations/:id` | Ends a pending/expired operation; an active lease returns 409 |
| Owner status GET with `x-filosage-model-evaluation:1` | Bounded durable usage/uncertainty/call samples and actual configured provider/stub/profile identity |

All operation endpoints are private/no-store and use R04's whole-request account scope. The operation result, credit completion, complete planned-lesson grant, product allowance settlement, original-period budgets and terminal state commit together. A response lost after that commit does not trigger another provider call or debit. Initial covers use the existing deterministic `CourseBanner`/`CourseArtwork` fallback; course creation no longer invokes a paid banner workflow. Banner regeneration was already absent and remains absent.

## Lost and late provider outcomes

Before an external call, the operation, stage and retained global receipt record that call as in flight. If a process dies before its returned result can be durably saved, a `store:false` provider response cannot be truthfully recovered by inventing a background job or replaying the paid request. Expired ambiguous calls therefore end the product operation and refund its credit once. Unused reservation is released; the remaining possible provider spend is recorded explicitly as `uncertainCostMicros`, never as invented token usage or proven actual cost. Both shared and individual admission account for this uncertainty.

A late actual response replaces that call's estimated uncertainty exactly once. Its authoritative global accounting can complete after account deletion without recreating personal data. Where the original personal request still exists and its captured generation remains active, its accounting can also be updated without changing a newer request's lock. Maintenance can repair a delayed personal checkpoint. Unknown provider outcomes without a subsequent response remain an explicit provider-reconciliation obligation, not evidence of zero spend.

Generic non-operation AI reservations retain token-scoped personal accounting receipts under `aiRequests/:requestId__attempt__:token`, with UID/generation and original period paths. A replacement request cannot overwrite the older attempt’s uncertainty or settlement marker. Late observed usage and maintenance reconcile each attempt once, even after same-key replacement, without changing the newer lock. Generic reservations now retain original accounting paths and attempt tokens, and finalizers clear locks only when both the active request and token match. Expired unconfirmed generic calls require reconciliation rather than automatic paid replay. A failed call with no observed response preserves uncertainty. This does not supply lesson-stage output recovery: R09 still owns the guarded lesson write and its operation integration.

## Persisted records and deletion

| Record | Ownership/role |
| --- | --- |
| `generationOperations/:id` | UID + account generation; private canonical request, key, fingerprint, attempt, stage, original paths, result and recovery |
| `generationStages/:callId` | UID + account generation; opaque input fingerprint, original attempt, bounded full provider response/checkpoint |
| `courseResearchArtifacts/:id` | UID + account generation plus existing owner/source identity; certified R10 stage snapshots |
| `aiRequests/:id`, credit claims, user budgets/periods | Original account generation and reservation identity; existing R04 owned inventory |
| `generationUsageReceipts/:id`, `systemUsageShards/:period` | Global accounting only; no UID, prompt, private request or generated course body |

R04 must call `await abandonAiUsage(requestId)` for every inventoried `aiRequests` record and `await abandonGenerationUsage(operationId)` for every private operation before deleting them. The generic helper skips attempt and operation-backed records, contains generic in-flight reservations globally, and fails closed for unidentifiable legacy reservations. It releases unused global reservation and preserves explicit uncertainty for calls still in flight. Repeating it is safe. The retained global scope is restricted by R04 to the two global accounting collections. Generation operations and full stage outputs must remain in account export/deletion inventory.

The course's complete final payload—including ownership, grants and all R10 source references—is prepared before successful real output moderation and `createGenerationSafetyProof(payload, 'course')`. A local provider stub does not mint remote moderation proof. Existing publications and historical moderation evidence are not fabricated. R11's typed learning-design blocker is persisted as a failed/refunded operation with instructions to revise the Course Studio brief and deliberately submit a new request; it does not automatically regenerate.

## Maintenance and safe revision cutover

Run `node --conditions=react-server --import tsx scripts/reconcile-generation-operations.ts --dry-run`. `--apply` explicitly enables mutations. The tool has a 50-second run bound, paged reads, repeat-safe terminal transitions, and nonzero exit for incomplete/blocked work. It also contains expired generic AI reservations and flags old reserved credit claims lacking operation identity for manual reconciliation. It is an operator command, not an installed scheduler.

Before a blue/green BFF traffic swap on the shared database:

1. Every writable revision must enforce R04 UID/generation guards, R07 publication proof checks, and R08 operation/token/accounting semantics including immutable per-attempt personal accounting. An earlier R08 writer that overwrites those markers is not a safe rollback target. Sharing a schema does not make an older writer safe.
2. Stop/drain old generation writers for their bounded envelope. Inventory old `aiRequests` and reserved credit claims; reconcile incomplete legacy records before enabling the new paid authoring path. Legacy records without original ownership/path identity fail closed. The tool does not guess how to match old differently hashed credit claims to request keys.
3. Keep current operations on their original provider/model/prompt/stub configuration. An incompatible configuration change returns an explicit writer-configuration conflict; finish or reconcile those operations before cutover. Do not allow old binaries to bypass the new durable path during rollback.
4. Verify actual PostgreSQL competing connections, account deletion races, complete candidate CI and the exact hosted revision/image. Preserve billing-off until separately approved.

The reservation estimate is not a proven hard provider-spend ceiling. The owner evaluation API deliberately does not advertise a live-evaluation capability claiming such enforcement. R13 must fail closed until a separately verified hard ceiling and complete lesson operation contract exist. No live OpenAI request, actual PostgreSQL pass, hosted browser pass, deployment, traffic switch or production mutation is claimed by local fixtures.
