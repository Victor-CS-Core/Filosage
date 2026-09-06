# Source-stage completion and resume contract

Reviewed 2026-09-06 for R10. These are application policies; they do not establish live provider behavior or prove that a claim stays current.

## Outgoing cache keys

`stablePromptCacheKey(workload, promptVersion, model, task = "default")` hashes the full tuple before bounding the final normalized key to 64 ASCII characters. The 16-character SHA-256 suffix preserves distinctions that prefix truncation discarded. Bibliography supplies `task: "bibliography"`; its usage metadata records that actual outgoing key.

The [official Responses create reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create) inspected on 2026-09-06 describes `prompt_cache_key` as an optional string without a documented maximum. The installed `openai` SDK 6.47.0 likewise declares `prompt_cache_key?: string`. The reference's explicit 64-character limits apply to metadata keys and safety identifiers. The former 77-character bibliography key is a reproduced construction defect relative to the application's bound; no live provider rejection was established or tested.

Bibliography discovery uses an HTTPS-prefix schema compatible with the existing source-research structured-output contract. Full URL safety, exact provider host, exact catalog record, cited provenance, and resolved metadata are still checked server-side. A completed search is required even when no suitable book is found. Catalog verification always means metadata verification; it never means a book was read or supports a lesson claim.

## Artifact fields and readers

The document remains `courseResearchArtifacts/{requestId}`. Its owner and request fingerprint must be authorized before use.

| Evidence stage | Further-reading stage |
| --- | --- |
| `evidenceResearchComplete` | `bibliographyComplete` |
| `sourcePack` | `furtherReading` |
| `responseId` | `bibliographyResponseId`, `bibliographySearchCallIds` |
| `policyVersion` | `bibliographicPolicyVersion` |
| `evidenceCreatedAt`, `evidenceExpiresAt` | `bibliographyCreatedAt`, `bibliographyExpiresAt` |

At the transaction checkpoint, cached stages are restored again using one current timestamp. A preflight snapshot is never a completion or content fallback if that check fails. An expired cached stage is recorded incomplete with its content/provenance cleared and its original expiry retained; any independently valid opposite stage is saved. Generation then stops before outline requests, and retry refreshes only the missing stage. Completed stages are checked once more after the write returns so storage latency cannot carry an expired snapshot into outline generation.

`researchComplete` remains the conjunction for older readers. Legacy complete artifacts can be restored through their shared `researchComplete`, `createdAt`, and `expiresAt` fields; legacy incomplete artifacts are rerun because they did not record which stage completed.

`restoreEvidenceResearchStage(artifact, { requestFingerprint, freshnessRequired?, now? })` returns null or `{ sourcePack, responseId, createdAt, expiresAt, fallbackReasonCodes }`. It checks current policy, exact URL-derived source and claim identities, authority family/class, provider provenance, source integrity, model-control metadata, and lifetime. Empty and partial results can be completed research: completion describes the finished attempt, while `assessSourceResearchV5` separately describes fully-grounded, hybrid, or model-knowledge coverage.

`restoreBibliographyStage(artifact, context)` returns null or `{ furtherReading, responseId, searchCallIds, createdAt, expiresAt }`. It verifies the schema and canonical bibliographic identity again, rejecting injected metadata, fabricated identity, unsupported quotations, or a contradictory content-verification flag. Bibliography failure never invalidates completed evidence; evidence failure never invalidates completed bibliography. Transaction-time selection preserves each independently completed stage and removes resolved bibliography fallback codes.

## Freshness and publication integration

Evidence reuse is bounded to 30 days normally, or 24 hours when `freshnessRequired` is true or the brief's review policy includes `freshness`. The returned expiry is the earliest bound across the stage and all source retrieval proofs. Future, invalid, and expired proof dates fail closed. A bibliography retry preserves or tightens the evidence expiry; it cannot extend it. Bibliography has its own 30-day metadata reuse window.

At publication, R07 must resolve the course's `sourceResearchArtifactId`, compare `sourceResearchRequestFingerprint` and `sourceResearchResponseId`, and compare the exact source snapshot. Use the effective course review policy when selecting the freshness window. Expired evidence requires a refreshed source snapshot and regenerated/reassessed claims, or an explicitly recorded review of a version that no longer asserts current facts. An empty completed evidence stage cannot support current factual claims. A timestamp alone is not a publication approval. Owner review and generation-output moderation proofs must bind the final stored course/source fingerprint; changes invalidate them.

R07's `createGenerationSafetyProof(courseData, "course")` must be called only after successful output moderation and final payload construction, including all source fields. R08/root integrate that producer after the publication module is available. This change does not edit document-store or publish routes.

## Recovery and accounting boundaries

R08 can checkpoint and resume these two stages independently by the completion flags and validated restoration results. Its operation ID, owner/payload checks, attempt token, lease, and conditional transaction fence remain required. These helpers do not authorize a write, own a worker, or replace those controls.

The synchronous route saves source results before outline generation and attaches its live usage array to failure handling before source requests start. A later caught failure retains completed response token samples and web-search costs. A process crash between response and durable accounting is still an R08 recovery concern. Incomplete evidence validation is retried as an evidence stage; this change does not introduce per-source durable job scheduling. No paid provider calls, production writes, or account/billing changes were used to verify these contracts.

No authority domains were added. Domain inclusion remains a candidate filter; exact URL provenance and independent atomic-claim validation remain required.
