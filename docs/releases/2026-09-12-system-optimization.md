# System optimization check — September 12, 2026

Status: measured baseline; candidate and hosted query/model checks remain open. Coordinator owns this report. No compute, scaling or datastore sizing changes.

## Observed production baseline

Azure Monitor read at 15:05 UTC covers the preceding24 hours in hourly buckets. Source remains93f60f24, with0.5 CPU/1Gi, min0/max3. Missing metric buckets are missing observations, not zero. Means below are unweighted means of available hourly averages; these are neither request-weighted means nor percentiles.

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

App CPU/memory measurements have19 populated hourly buckets, response time18, other listed metrics24. Evidence: `../research/artifacts/release-readiness-20260912/system-metrics.json`. The database is shared with QA, so its resource metrics cannot be attributed solely to production. This low-traffic baseline does not establish load capacity. No evidence justifies larger app replicas now. Database memory/CPU bursts deserve query/pool measurement before downsizing or resizing.

## Warm-replica cost comparison

The official Azure Retail Prices API currently lists Central US consumption USD rates: active CPU0.000024/core-second; idle CPU0.000003/core-second; memory0.000003/GiB-second in either mode. At the existing0.5-core/1Gi allocation and730 hours/month, one continuously idle warm replica costs approximately$11.83/month before shared free grants; continuously active costs$39.42 before grants. If the complete monthly CPU/memory free grants are available, these illustrative figures become$10.21 and$34.02. Actual incremental cost depends on current active use, subscription-wide grants and billing classification; these figures exclude requests, database, storage, network and monitoring. They are not an invoice forecast or a recommendation to change minReplicas.

Source: [Azure Container Apps pricing](https://azure.microsoft.com/en-us/pricing/details/container-apps/), [official Retail Prices API](https://prices.azure.com/api/retail/prices). Exact returned rate evidence is retained with this release. Container Apps can bill a nominally idle replica at active rates when it processes requests or crosses CPU/bandwidth thresholds. Current scaling remains unchanged as approved; candidate cold/warm page measurements must determine whether a warm replica is useful.

## Remaining measurements

The UI worker owns repeat production-build page loading/JavaScript and controlled API measurements. Actual DB query plans, runtime connection allowances across simultaneous revisions, and production model latency/cost require sanitized in-VNet aggregate probes; do not export query text containing user data or prompt/response bodies. Cold-start measurements must identify initial replica state and compare like conditions. This report does not claim those measurements complete.
