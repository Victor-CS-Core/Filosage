# R04 account deletion implementation report

The release owner accepted the immutable account-generation fence and resumable deletion design. Source implementation is committed in `3da329e` after the accepted R07 proof-token commits. This report distinguishes local execution from integration, hosted verification, and legal-policy approval.

## Implemented behavior

- `accountLifecycles/{uid}` survives account removal. Initialization is transactional; an existing deleted UID cannot register again or silently receive a new generation.
- All existing API handlers that import authentication execute inside `withAccountRequest`. Independently verified identity captures generation before the full asynchronous handler. The commit boundary rereads lifecycle and existing/new ownership in the same transaction for direct puts, generated-ID creates, masked course updates, batches, and transactions. Missing scope, stale generation, deleting owners, and partial-course resurrection fail closed.
- `accountDeletionJobs/{jobId}` persists a stable job identity, billing references, bounded inventory, stage, lease and retry state. Seven durable stages resume. Unknown Stripe cancellation retains account, job and billing identifiers. A live deletion lease rejects a duplicate caller.
- A bounded complete store scan detects unknown account/course subcollections and records. Overflow or unknown classes produce an explicit manual state. It cannot report active data removed from a truncated inventory. Export checks its course/lesson counts against that complete inventory.
- New banners are scoped to account generation with exclusive ownership metadata recorded before upload. A narrow terminal upload receipt can reconcile the existing upload after fencing. An unknown upload remains pending. Only an exclusively owned object with no surviving references is removed; previously shared assets and other learners' work are explicitly retained.
- Managed session markers carry UID and generation as concurrency preconditions. Generation changes invalidate browser session work and that account's persisted drafts. Deletion clears the affected account's browser learning records when active data removal is confirmed. Identity mappings are reported as a separate review, not falsely reported deleted.
- Every active-data removal returns `202`, `deleted:false`, `activeDataRemoved:true`, and retention/identity review status. Exact retained-record durations and holds remain unapproved; no duration or completion authority was invented.

## Executed local evidence

Node `22.23.2`, isolated local datastore and no production/provider calls:

| Check | Result |
| --- | --- |
| `npm run test:api -- --workers=2` | 11/11 passed against the actual Next HTTP server |
| `npm run test:contracts -- tests/account-storage-contracts.spec.ts --workers=1` | 11/11 passed |
| `node --conditions=react-server --import tsx tests/fixtures/publication-proof-behavior.ts` | 36/36 passed; R07 exact proof-token semantics preserved |
| Real mastery PUT paused before its actual store write, followed by real DELETE and writer release | Passed; late PUT is 403 and the record is absent |
| `account-lifecycle-behavior.mjs` real route/store fixture | Passed: interruption after all seven stage commits, concurrent deletion lease, two full-handler ALS requests, actual bounded inventory overflow, unknown subcollection, API-only Stripe readiness, unknown cancellation then retry, exclusive/shared asset recovery, terminal late-upload receipt, stale direct/batch/create/transaction/course writers, global-only AI cost settlement and no automatic UID reopen |
| `npx tsc --noEmit --pretty false` | Passed |
| Focused Oxlint and ESLint | Passed |
| `git diff --check` | Passed |

External providers are substituted in the behavioral fixtures. The local adapter now checks transaction read snapshots at atomic commit, but none of these local fixtures is PostgreSQL evidence.

`tests/postgres/account-lifecycle.test.ts` uses R02's guarded PostgreSQL 16 fixture. It observes a real advisory-lock waiter, commits deletion from an independent connection, rejects the queued owned write, checks absence, and tests an exact-generation ABA replay. This new case was authored but not executed locally. Root owns its actual PostgreSQL CI result at the integrated candidate SHA.

## Integration and acceptance gates

1. The R08 followup calls `abandonAiUsage(requestId)` for every inventoried AI request and `abandonGenerationUsage(operationId)` for every inventoried generation operation before deleting personal records. Root must integrate R08’s generic-abandonment export along with this hook. A missing/legacy accounting pointer or unconfirmed global receipt still holds deletion for explicit reconciliation.
2. R23 must supply `billingConfiguration().apiReady` and cancellation final-inventory verification. This branch gates on `apiReady` only; it never falls back to Portal readiness. Signed webhook scopes and erased-account containment are owned by R23 and require integrated paid-path tests.
3. Root owns shared suite manifest registration, integration of source-expiry R07 tests, exact candidate CI, and the new PostgreSQL case. No remote action was performed by this worker.
4. Owner/privacy review must approve exact retention durations, holds and the manual review procedure. Legacy incomplete deletion flags without a durable job are closed to writes and require reviewed recovery. Unknown uploads require independently verified object recovery; no automatic age-based assumption closes them.
5. Already-loaded legacy clients and old binary revisions must be retired during the one-ContainerApp blue/green cutover before deletion is accepted as hosted-proven. There is no automatic deleted-UID reopen. A future approved reopen must allocate a fresh generation and preserve old job history.
6. Hosted identity, PostgreSQL/Blob behavior, paid cancellation and final privacy acceptance remain separate gates. No Azure mutation, identity-provider deletion, deployment, billing activation, mailbox operation, or fictional hosted acceptance was performed.

Multica: unavailable; no item ID or queued delivery was invented. Owner: R04 worker for source/local evidence; root for integration/remote/CI; R08 and R23 owners for their scoped dependencies; owner/privacy reviewer for retention. Status: source implemented, local verification passed, integration and hosted/legal acceptance pending. Commit: local `3da329e` plus report followup. Push: root responsibility, not performed by this worker. Deployment: not performed. Production verification: not performed.

## Independent review corrections

Two P1 findings were reproduced by independent review and corrected before hosted acceptance. Course ownership now propagates only to explicit author artifact classes and their lesson descendants. Another learner's evidence share, share reference, feedback, mastery evidence and surviving course remain intact; public share reading already reports unavailable if its source course was removed. The deletion commit fence independently rejects a different owner's record even when its path was erroneously added to the saved inventory. Ambiguous shared ownership produces manual review instead of a removal claim. Release identities survive interrupted removal, and unknown course/release descendants still fail closed.

Banner lease retries now allocate a distinct immutable asset and Blob key for every claim. The uploading marker is created transactionally only while that claim owns the key; terminal receipts match the original claim, and stale completion cannot replace the winning key. Every upload marker stays inventoried until its outcome is reconciled. The real local-store regression pauses two mocked external uploads, finishes A, starts deletion while B remains uploading, observes `409` with `activeDataRemoved:false`, then finishes B and confirms both objects are removed before `202`.

Executed evidence: extended `account-lifecycle-behavior.mjs` passed cross-owner preservation and rejection of a poisoned inventory; `banner-deletion-race.mjs` passed two distinct upload attempts and the late claim-bound receipt. Provider upload/removal is mocked explicitly; this is not an Azure or PostgreSQL acceptance result.

## AI accounting and Checkout containment followup

Deletion now reconciles both course-operation reservations and generic lesson/tutor/banner AI reservations before private requests, attempt records, stages, credit ledgers and budgets are removed. Generic attempts retain an owner-free global receipt; operation receipts must show zero remaining reserve before personal removal. Unknown calls retain explicit uncertain cost, and an actual late provider response replaces that uncertainty once. Missing operation receipts and legacy reservations without original token/path remain manual review; a reconciliation failure keeps deletion pending.

The actual route/store regression now executes a real generation operation and pauses its provider result. A simulated interruption immediately after the global accounting commit returns a saved pending job with personal operation data intact; retry removes personal data, and the late provider result records 400 cost micros without recreation. A real generic lesson reservation similarly survives account deletion only as global accounting; repeated late finalization records 70 cost micros once, with no request, attempt, period or user-budget resurrection. These are real local-store integration cases with controlled provider results, not hosted provider or PostgreSQL proof.

Checkout containment now requires the existing creating/replacing claim and preserves immutable claim, customer and plan fields. The scope permits only a job-bound terminal receipt: `contained` with the real confirmed session ID, or `not_created` with a null session ID when creation provably never started. Missing/replaced claims cannot be recreated. The billing worker owns provider proof and prior-attempt provenance; an unknown earlier SDK outcome must never be certified not-created. Fence regressions reject changed claims/customers/jobs and an absent session for a contained outcome, accept the two exact receipt shapes, resume deletion and reject later claim recreation.
