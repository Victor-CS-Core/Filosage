# System optimization check — September 12, 2026

Status: measured production infrastructure and optimized local UI baseline; candidate cold/warm and hosted model checks remain open. Coordinator owns this report. No compute, scaling or datastore sizing changes.

## Observed production baseline

Azure Monitor read at 15:05 UTC covers the preceding 24 hours in hourly buckets. Source remains `93f60f24`, with 0.5 CPU / 1 GiB, min 0 / max 3. Missing metric buckets are missing observations, not zero. Means below are unweighted means of available hourly averages; these are neither request-weighted means nor percentiles.

| Signal | Mean of available hourly averages | Largest reported maximum |
|---|---:|---:|
| App CPU |0.00525 core|0.1417 core|
| App working set |315.1 MiB|412.2 MiB|
| App restarts |0|0|
| App response time |274.8ms|2395ms|
| PostgreSQL CPU |13.02%|77.53%|
| PostgreSQL memory |60.34%|78.68%|
| PostgreSQL active connections |6.97|18|
| PostgreSQL storage |13.24%|13.24%|

App CPU/memory measurements have 19 populated hourly buckets, response time 18, other listed metrics 24. [Raw metric evidence](../research/artifacts/release-readiness-20260912/system-metrics.json). The database is shared with QA, so its resource metrics cannot be attributed solely to production. This low-traffic baseline does not establish load capacity. No evidence justifies larger app replicas now. Database memory/CPU bursts deserve query/pool measurement before downsizing or resizing.

## Production-build UI and local API evidence

The [completed local UI audit](2026-09-12-ui-release-audit.md) includes three matching Chromium contexts each for landing, catalog and pricing before/after the accessibility fixes. Conditions: 390×844, 4× CPU slowdown, 150 ms latency, 1.6 Mbps downstream, fixed 750 ms managed-session delay, mocked empty catalog and disabled browser cache. Final transferred JavaScript was 198,058 / 204,477 / 201,917 bytes respectively. The shared drawer fix added 36 transferred bytes and 94 decoded bytes per sampled route without adding a request.

Observed UI-ready medians were 3,088 / 3,141 / 3,196 ms, 105–134 ms above baseline. Three samples and synthetic session delay do not establish a causal regression or improvement. No speedup is claimed and no speculative performance rewrite is included.

Three fresh local server processes reached a first successful session response in 633 / 581 / 569 ms; OS caches were retained. These are process starts, not Azure scale-from-zero. Fifteen sequential anonymous reads per endpoint measured medians of 6.0 ms for session (200), 5.9 ms for account (401), 4.3 ms for own courses (401), and 4.9 ms for private lesson (401). The local server had no database/provider credentials. The denials exercise the local production-mode boundary and say nothing about production datastore latency.

## Production database evidence

The reviewed exact-revision read-only catalog probe at 15:16:31 UTC found two current database/runtime sessions including the probe and `max_connections=50`. The existing public collection lookup uses `filosage_documents_collection_path_idx` via a bitmap index scan; estimated index rows 13 and heap/limit cost 18.34. This is EXPLAIN without ANALYZE: it proves a planner choice, not execution time. No new index is justified by that result.

Current source defaults to ten main connections plus one health connection per process. Two modern revisions each reaching max 3 replicas could reserve up to 66 connections, before the still-active QA app and operational connections. Pools are lazy, so this is a configuration ceiling rather than observed simultaneous usage; the observed 24-hour peak was 18. The transition packet must budget all revision/QA/maintenance pools against the server's usable client limit and verify saturation/queue behavior before declaring capacity. Keep scaling unchanged initially; choose any lower pool limit through the isolated concurrency check, without assuming it improves latency. Runtime administrative privileges are a separate confirmed release defect and are tracked in the prerequisite report.

A bounded local follow-up at16:10UTC found no usable isolated PostgreSQL server: clients were present, the dedicated fixture URL was unset, and local Docker inventory was denied. No load test, provider connection, dependency installation or configuration change occurred. [Source/budget evidence](../research/artifacts/release-readiness-20260912/connection-budget-assessment.json) records the independently checked source hashes and arithmetic. The existing `DATABASE_POOL_MAX` override could set three main connections per process, making six modern processes consume at most24 including health. An illustrative total is24production +11QA +5operators +5server-reserved +5spare =50. The QA/operator/reserved figures are proposed bounds, not verified occupancy or provider settings. Actual topology, server reservations and simultaneous-client limits must be proved; a lower pool can increase queuing. Main/health acquisition deadlines are configured as10/3seconds, not measured latency. Do not apply this illustrative budget until matching repeated saturation/recovery tests establish the tradeoff.

## Warm-replica cost comparison

The official Azure Retail Prices API currently lists Central US consumption USD rates: active CPU0.000024/core-second; idle CPU0.000003/core-second; memory0.000003/GiB-second in either mode. At the existing0.5-core/1Gi allocation and730 hours/month, one continuously idle warm replica costs approximately$11.83/month before shared free grants; continuously active costs$39.42 before grants. If the complete monthly CPU/memory free grants are available, these illustrative figures become$10.21 and$34.02. Actual incremental cost depends on current active use, subscription-wide grants and billing classification; these figures exclude requests, database, storage, network and monitoring. They are not an invoice forecast or a recommendation to change minReplicas.

Source: [Azure Container Apps pricing](https://azure.microsoft.com/en-us/pricing/details/container-apps/), [official Retail Prices API](https://prices.azure.com/api/retail/prices). Exact returned rate evidence is retained with this release. Container Apps can bill a nominally idle replica at active rates when it processes requests or crosses CPU/bandwidth thresholds. Current scaling remains unchanged as approved; candidate cold/warm page measurements must determine whether a warm replica is useful.

## Remaining measurements

Hosted candidate page/API measurements, repeat database execution latency and actual model-call duration/cost remain open. Model telemetry must use existing sanitized aggregate receipts or isolated recorded-provider fixtures; do not trigger paid calls merely to create benchmark data or export prompts/responses. Cold-start measurements must identify initial replica state and compare like conditions. Do not warm legacy zero-traffic revisions for measurement: their startup runs schema migration and they lack the modern write protocol. A candidate built on the verified modern baseline is the appropriate hosted comparison target. This report does not claim a measured warm-replica benefit or .NET performance advantage.

A bounded read-only telemetry check at17:37UTC examined only aggregate metadata from the last seven days of console logs for exact production revision`filosagestg-app--green-93f60f24-1`. Of17,901log rows, zero parsed structured events contained a course-pipeline event, model tag, pipeline duration or recognized cost field. [Availability evidence](../research/artifacts/release-readiness-20260912/model-telemetry-availability.json) retains counts and time coverage, with no raw log, account identifier, prompt or response. This establishes an unavailable console-log measurement for this sample, not zero model use/cost; persisted receipts, differently formatted logs, other destinations and periods are not excluded. No paid benchmark call or provider configuration change occurred. Model latency/cost remains an explicit release measurement gap.

## Retained legacy model cost estimates

A separately reviewed read-only PostgreSQL probe succeeded at17:52:05UTC through the exact live green93f60f24 revision. The repeatable-read transaction returned only closed aggregate groups and rolled back; no new model call, database write or runtime configuration change occurred. [Result, reviewed SQL and adapter evidence](../research/artifacts/release-readiness-20260912/legacy-model-accounting/legacy-model-aggregate-result.json) retain the exact revision/image/probe identities. The source SHA identifies the executing binary; these records may have been created by older revisions and are not candidate3a0e772 measurements.

The34surviving request snapshots cover reservations/updates from August13–21. Their143recorded usage samples reconcile separately to the same3,650,146micro-USD (**$3.650146**) in recorded application estimates. These two views describe the same cost; do not add them. Inputs total562,310tokens and outputs140,956; cached/cache-write token counts are subsets of input. Usage samples can include default or fixed image/search charges and do not prove143individual provider calls.

| Retained request feature/status | Snapshots | Recorded estimate, USD |
| --- | ---: | ---: |
| Course outline, completed | 6 | 2.116293 |
| Course outline, failed | 2 | 1.153505 |
| Lesson generation, completed | 16 | 0.306692 |
| Lesson generation, failed | 1 | 0.023965 |
| Course banner, completed | 6 | 0.036000 |
| Flashcard generation, completed | 1 | 0.010092 |
| Tutor, completed | 2 | 0.003599 |

All returned numeric/timestamp fields pass validation, with no missing or oversized attempt arrays. The database contains18system budget-shard records across its retained periods, but the separate September2026 query returned no rows. That is absent retained September evidence, not verified zero provider spend. Retried request snapshots can be replaced while cumulative budget estimates persist, and deletion/retention can remove records; these snapshots therefore do not establish total historical spend. The stored values use then-configured rates and fixed charges, are not invoice-verified, and should not be repriced or extrapolated to monthly operating cost from this small historical sample.

Per-sample start/end/duration is absent; reservation-to-update elapsed time includes application/queue/retry work and cannot measure model latency. Hosted candidate model latency/cost and matched before/after performance remain open. Both apex/www health returned200, unchanged93f60f24, migration-dual and healthy configuration/datastore at17:52:23UTC after the probe. The runtime is still the existing administrative DB login; this read does not satisfy minimum-access acceptance.

The final legacy-production readback encountered one20-second HTTP read timeout; the failed sequential collector did not retain which host. A bounded independent parallel recheck at18:16:51UTC returned200/healthy/unchanged93f60f24 from apex and www in161/200ms. Azure then reported greenHealthy/Running/one replica at100%, blueHealthy/ScaledToZero/zero replicas at0%. [Final state evidence](../research/artifacts/release-readiness-20260912/final-release-state.json) preserves both the failure and successful recheck. Initial replica state was not captured, so attributing the timeout to scale-from-zero or claiming a measured warm-replica benefit would be unsupported. No scaling or traffic change was made.
