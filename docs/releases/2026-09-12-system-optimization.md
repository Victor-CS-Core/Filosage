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

## Warm-replica cost comparison

The official Azure Retail Prices API currently lists Central US consumption USD rates: active CPU0.000024/core-second; idle CPU0.000003/core-second; memory0.000003/GiB-second in either mode. At the existing0.5-core/1Gi allocation and730 hours/month, one continuously idle warm replica costs approximately$11.83/month before shared free grants; continuously active costs$39.42 before grants. If the complete monthly CPU/memory free grants are available, these illustrative figures become$10.21 and$34.02. Actual incremental cost depends on current active use, subscription-wide grants and billing classification; these figures exclude requests, database, storage, network and monitoring. They are not an invoice forecast or a recommendation to change minReplicas.

Source: [Azure Container Apps pricing](https://azure.microsoft.com/en-us/pricing/details/container-apps/), [official Retail Prices API](https://prices.azure.com/api/retail/prices). Exact returned rate evidence is retained with this release. Container Apps can bill a nominally idle replica at active rates when it processes requests or crosses CPU/bandwidth thresholds. Current scaling remains unchanged as approved; candidate cold/warm page measurements must determine whether a warm replica is useful.

## Remaining measurements

Hosted candidate page/API measurements, repeat database execution latency and actual model-call duration/cost remain open. Model telemetry must use existing sanitized aggregate receipts or isolated recorded-provider fixtures; do not trigger paid calls merely to create benchmark data or export prompts/responses. Cold-start measurements must identify initial replica state and compare like conditions. Do not warm legacy zero-traffic revisions for measurement: their startup runs schema migration and they lack the modern write protocol. A candidate built on the verified modern baseline is the appropriate hosted comparison target. This report does not claim a measured warm-replica benefit or .NET performance advantage.
