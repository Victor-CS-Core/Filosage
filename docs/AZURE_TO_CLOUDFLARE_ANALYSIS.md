# FiloSage: Azure → Cloudflare Migration Analysis

**Date:** 2026-10-01
**Current Azure forecast:** $33/mo (user ceiling: ~$7-8/mo)

---

## Current Azure Architecture

| Component | Azure Resource | Est. Cost/mo |
|---|---|---|
| Next.js 16 app (Docker) | Container App (consumption) | ~$1-3 |
| Document database (JSONB) | PostgreSQL Flexible Server, Burstable B1ms | ~$16-20 |
| Course images (WebP) | Blob Storage | ~$1-2 |
| Container images | Container Registry (Basic) | $5 |
| Logs | Log Analytics workspace | ~$2-5 |
| DNS | DNS zone | $0.50 |
| Network | VNet + private DNS for Postgres | ~$0 |
| **Total** | | **~$26-36** |

The two biggest costs are **PostgreSQL** (~$18) and **Container Registry** ($5). These have no scale-to-zero — they bill 24/7 whether anyone visits the site or not.

---

## Cloudflare Target Architecture

| Azure Component | Cloudflare Equivalent | Free Tier | Paid |
|---|---|---|---|
| Container App | Workers (via OpenNext adapter) | 100k req/day, 10ms CPU | $5/mo: 10M req + 30M CPU-ms |
| PostgreSQL | D1 (SQLite) **or** Hyperdrive + Neon | 5M rows read/day, 100k writes/day, 5GB | $5/mo Workers Paid unlocks 25B reads/mo |
| Blob Storage | R2 | 10GB storage, 1M writes + 10M reads/mo, $0 egress | $0.015/GB-mo after |
| Container Registry | Not needed (Workers deploy from code) | — | — |
| Log Analytics | Workers Logs / Tail | Basic included | — |
| Easy Auth | App-level direct auth (already supported) | — | — |
| DNS | Cloudflare DNS | Free | — |

**Projected Cloudflare cost: $0-5/mo**

---

## Migration Complexity by Component

### 1. Next.js → Workers (Moderate-High)
- Use the OpenNext Cloudflare adapter (`@opennextjs/cloudflare`)
- `output: "standalone"` must be removed/changed
- `pg` (node-postgres) **will not work** — Workers have no raw TCP sockets
- `node:crypto` and most Node APIs work via `nodejs_compat`
- `proxy.ts` (middleware) needs verification under the adapter
- **Risk:** 10ms CPU limit on free tier is tight for Next.js SSR. Realistic plan needs Workers Paid ($5/mo).

### 2. PostgreSQL → D1 (High — biggest risk)
- The app uses a Firestore-like document abstraction over PostgreSQL JSONB (`postgres-document-store.ts`, ~large file)
- Uses: JSONB operators (`@>`, `#>>`), `pg` connection pooling, transactions with lock/statement timeouts, structured queries
- D1 is SQLite: has JSON1 functions but **different syntax**, no `pg` protocol, different transaction model
- Requires rewriting the document store implementation (~significant work)
- **Alternative:** Keep PostgreSQL via Hyperdrive + Neon free tier (3GB) — minimal code change, just connection string. Neon paid starts ~$15-20/mo if free tier is exceeded.

### 3. Azure Blob → R2 (Low-Moderate)
- R2 has S3-compatible API
- Replace `@azure/storage-blob` SDK with S3-compatible client (`@aws-sdk/client-s3`)
- Only 2 files use blob storage: `course-banner-storage.ts`, `course-illustration-storage.ts`
- Straightforward migration

### 4. Easy Auth → Direct Auth (Moderate)
- Good news: the app **already supports** direct Google auth (`DIRECT_GOOGLE_AUTH_ENABLED` defaults to true) and External ID without the Azure platform
- The platform Easy Auth layer would be removed; app handles OAuth directly
- Session management needs verification (currently relies on platform headers)

### 5. OpenAI Integration (No change)
- External API, works the same from Workers
- ~$0.40/course generation cost unchanged

---

## Cost Comparison

| | Azure (current) | Cloudflare (full) | Cloudflare (hybrid w/ Neon) |
|---|---|---|---|
| Compute | ~$1-3 | $0-5 | $0-5 |
| Database | ~$16-20 | $0 | $0-20 |
| Object storage | ~$1-2 | $0 | $0 |
| Registry | $5 | $0 | $0 |
| Logging | ~$2-5 | $0 | $0 |
| DNS | $0.50 | $0 | $0 |
| **Total** | **~$33** | **$0-5** | **$0-25** |

---

## Recommendation

**Full Cloudflare (Workers + D1 + R2) gets to $0-5/mo** but requires the most engineering:
1. Rewrite `postgres-document-store.ts` for D1/SQLite (~1-2 weeks)
2. Next.js OpenNext adapter migration and testing (~1 week)
3. Blob → R2 SDK swap (~2-3 days)
4. Auth cutover from Easy Auth to direct (~3-5 days)
5. Full regression + staging validation

**Hybrid (Workers + Hyperdrive + Neon Postgres + R2)** is less work (skip the D1 rewrite) but Neon free tier (3GB) may not hold production data long-term.

**Alternative worth considering:** A single small VPS (Hetzner ~$5/mo) running Docker + Postgres would hit ~$5-7/mo with **far less migration work** — just deploy the existing Docker image. But you asked about Cloudflare specifically.

---

## Open Questions
- Actual database size (to verify D1 5GB / Neon 3GB free tier fit)
- Traffic volume (to verify Workers free tier 100k req/day is sufficient)
- Whether the $33 Azure forecast includes one-time vs recurring charges
