# React and .NET hosting decision

Prepared September 12 against consolidated source `a99e1f96c2ef54e3f2385cee4a0dfcec175520a8`. This assessment is ready for release review; production release has not yet passed its operational gates. No migration or URL/API change is included in this release.

## Recommendation

Keep Next.js for this release and the first production testing cycle. Filosage already uses React 19.2.7 with Next.js 16.3.4; its React UI and TypeScript backend-for-frontend (BFF) are packaged in one standalone Node application and deployed as one Azure Container App. A .NET backend is feasible, including one ASP.NET Core process serving React assets and `/api`, but there is no measured evidence that a rewrite would improve this app's performance or bill.

The observed release constraints are runtime privileges, legacy writer compatibility, provider review capability and missing hosted acceptance evidence. Changing frameworks would still require resolving these boundaries. Preserve existing public URLs, JSON/error contracts, authentication mode and closed checkout through the current release.

## Hosting choices

| Choice | Deployment shape | Reuse and work | Decision |
| --- | --- | --- | --- |
| Keep Next.js | Browser → one public origin → Node standalone server → PostgreSQL, Blob and providers | Current React components, rendering, all handlers and TypeScript domain code remain. Current container already packages frontend/backend together. | Recommended now; lowest change and validation burden. |
| Incremental .NET | Browser → same public origin → Next rendering and selected private ASP.NET APIs | React, Next rendering and URLs remain. Move one well-bounded server capability at a time; a trusted server boundary must carry verified identity and account-generation context. | Sensible experiment if team capability or a measured bottleneck warrants it. |
| React SPA + ASP.NET Core | Browser → one ASP.NET Core app serving hashed frontend files and `/api` → existing services | Many React components/CSS/assets remain; Next-specific routing/rendering and every TypeScript server responsibility must be adapted or rewritten. | Feasible larger migration, requiring explicit SEO and session-compatibility decisions. |

Microsoft documents React/ASP.NET project templates, modern frontend tooling and publishing built SPA assets with the backend. A production frontend can be served from `wwwroot`; development's frontend proxy is a separate concern. Use a maintained Vite-based project if prototyping rather than copying the documentation's legacy Create React App example. [Microsoft SPA overview](https://learn.microsoft.com/en-us/aspnet/core/client-side/spa/intro?view=aspnetcore-10.0).

For incremental .NET, one public origin does not mean one process. Keep two private services behind controlled routing, or package Node and .NET as coordinated containers in one Container App revision. The latter shares scaling and release lifetime and does not remove the Node server. Azure supports multiple containers in an app revision; each container still consumes CPU/memory. [Azure container model](https://learn.microsoft.com/en-us/azure/container-apps/containers). A static React SPA with ASP.NET Core can use a single server process; retaining dynamic Next rendering cannot simply replace Node with .NET.

## Scope grounded in the repository

The [complete inventory](../research/artifacts/release-readiness-20260912/react-dotnet-route-inventory.json) lists all **68 API route files and 87 exported HTTP methods**, including exact paths, direct authorization calls and local imports. These static labels support review; delegated authorization and transaction boundaries require semantic inspection. The count is route files, not 68 independent business services.

| Area | Route files | Required migration boundary |
| --- | ---: | --- |
| Account, identity/session, legal acceptance | 7 | Canonical provider identity, verified email, legal versions, account generation/deletion, recent authentication and recovery. |
| Owner administration | 16 | Ownership/plan authorization, approvals, support tickets, publication overrides, audit and bounded command-center operations. |
| Billing | 4 | Checkout containment, customer-bound Portal, public status, raw signed webhook body and durable event/account ordering. |
| Courses and banners | 6 | Public outline DTOs, private lesson bodies, publication proof, repair/validation, Blob ownership and content type. |
| Learning state and practice | 7 | Progress, mastery, activities/interactions, capstone/baseline assessment and learner-state synchronization. |
| Generation, chat and analysis | 6 | Course/lesson generation, durable leases/attempts, resumability, provider response reconciliation, chat and capstone analysis. |
| Flashcards | 4 | Deck ownership, review state, feature gates and generation budgets. |
| Evidence sharing/export | 3 | Owner-authorized creation/export, token hashing/expiry/revocation, minimized shared DTOs and no-referrer behavior. |
| Support | 5 | Public article/capability reads, owner-only documentation, account-bound ticket records and recovery. |
| Health | 4 | Separate live/startup/ready checks, exact version/digest/capability identity and bounded database readiness. |
| Feedback and acquisition | 6 | Content reports, outcome feedback, pricing intent, referrals, telemetry, waitlist and request validation/rate limits. |

Group boundaries above cover all 68 files without treating public endpoints as anonymous mutation authorization. `generation-operations` contributes two files within generation; the area totals are verified against the inventory. Preserve the individual method/route list when splitting ownership.

### Authentication and browser security

Production currently trusts platform-verified Easy Auth identities in migration-dual mode (Google and External ID), then resolves the canonical Filosage account. `auth-server.ts` checks verified email, account status, current legal acceptance, ownership/capability and recent authentication. `withAccountRequest` binds the account generation for the entire async request and rejects stale/deleted-account operations. This is more than a login page or JWT decoder.

A .NET port must preserve the trusted ingress boundary, reject spoofed identity headers at every reachable origin, retain provider issuer/subject canonical links, preserve candidate callback return hosts and cover direct account-switch/session-expiry behavior. Do not assume Next or platform cookies can be read by ASP.NET's cookie handler. Decide whether Easy Auth remains the session authority; if introducing application cookies, separately design protection-key persistence across revisions, expiry, logout and cutover recovery. ASP.NET cookie authentication is supported, but that alone proves no compatibility with the existing session. [Microsoft cookie authentication](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/cookie?view=aspnetcore-10.0).

Port origin/Fetch Metadata checks and bounded JSON parsing from `api-security.ts`; retain a separate raw-body/signature path for Stripe webhooks. Port nonce-bearing CSP, HTTPS/HSTS, canonical www redirect, no-referrer evidence links and no-store private responses from `security-headers.ts`, `proxy.ts` and route handlers. Restrict forwarded headers to the actual trusted proxy. SPA fallback routing must not turn missing `/api` routes or protected assets into a successful `index.html` response.

### Data and concurrent writers

`postgres-document-store.ts` stores JSONB documents with stable paths, versions and collection indexes. It implements bounded transactions, advisory/row locks, optimistic checks and connection discard after uncertain commit outcomes. Domain wrappers enforce account generations, publication epochs/proofs, immutable generation attempts and atomic lesson/result/accounting settlement.

A C# implementation must reproduce these semantics and JSON/date/null/number/error contracts; replacing the adapter with an ORM alone does not do so. Preserve SQL lock namespaces/order and the actual database schema initially. Prove Node↔.NET overlap using separate clients, including account deletion versus late saves, revocation versus lesson access/publication, duplicate requests, lease takeover, cancellation and timeout during COMMIT. Never dual-write billing, lessons or usage as a migration shortcut. Keep one implementation authoritative for each write family until cross-runtime compatibility passes.

### Billing and AI

Port Stripe SDK calls plus customer/subscription ownership binding, offer allowlists, event signature verification, idempotency, event ordering, durable auditing and entitlement behavior. New checkout remains disabled while required existing-customer servicing paths retain their contracts. An empty live subscription inventory today reduces current servicing exposure; it does not justify deleting billing logic or weakening its tests.

AI operations include prompt/schema validation, moderation, source/provenance and publication rules, budget reservation, durable provider responses, leases, retries, cancellation, unknown-cost reconciliation and original-period accounting. Model SDK calls are a small part of the port. Keep prompt/schema/evaluation assets versioned and preserve safety/output contracts; exact natural-language equivalence is not a sensible regression criterion. Never duplicate paid calls to compare implementations. Start with recorded or isolated synthetic provider responses and replay sanitized contracts.

### Rendering and reusable frontend

Reusable: React presentation components, CSS/design tokens, icons/fonts/assets, most client hooks and pure TypeScript DTO/validation logic. They need an import/API audit; being a `.tsx` file does not prove framework independence. Existing Playwright browser tests can exercise preserved URLs against either host.

Rewrite/adapt: App Router pages/layouts and navigation hooks, server components, route handlers, request headers/cookies, server-only imports, dynamic metadata, sitemap/robots, error/loading boundaries, cache/revalidation behavior, deployment asset identity and security middleware. TypeScript BFF modules do not run inside .NET without retaining a JavaScript runtime. Read the installed Next static-export guide before any experiment: request-dependent handlers, proxy/header behavior and dynamic rendering prevent a configuration-only static export of this application.

A pure SPA changes initial HTML, crawler/social previews, deep-link HTTP statuses and content loading. Public landing/catalog/course outlines need equivalent indexable metadata and content through prerendering/SSR or a separately approved product tradeoff. Define canonical URLs, structured data, sitemap freshness and private-content exclusion as acceptance tests before removing Next rendering. Preserve accessibility and loading/retry behavior during client-router conversion.

## Migration sequence and acceptance

1. Finish this release on Next, including privileges, recovery, exact-image hosted proof and rollback. Capture the measured baseline under repeatable conditions.
2. Create language-neutral request/response fixtures for all 87 methods: status, body, error code, headers, cookies, cache and authorization matrix. Existing source-pattern contracts help guard the TypeScript implementation but are not portable behavioral proof.
3. Build an isolated .NET feasibility spike: static asset/deep-link hosting plus one public read-only endpoint, trusted identity adapter and health/version contract. Use a temporary PostgreSQL fixture and recorded provider responses. Do not connect a new writer to production.
4. Compare matching CPU/memory allocations, Node/.NET runtime versions, payloads, concurrency, dataset and warm/cold conditions. Measure p50/p95/p99 latency, transferred bytes, connections, saturation and monthly resource estimates; include errors/timeouts and repeated runs.
5. If justified, move read responsibilities first. For each subsequent write family, port the complete protocol and prove mixed-runtime PostgreSQL behavior before changing routing. Billing and durable AI/accounting are late steps, each with independent review and isolated failure fixtures.
6. For a full SPA, migrate routing/rendering/security only after API parity; verify SEO/deep links and browser regression on desktop/mobile Chromium/WebKit in both themes. Stage exact digest at zero traffic, prove candidate session/privacy, then promote against a compatible predecessor with the same observation/rollback gates.

Contract coverage must include anonymous outline access versus denied lesson bodies; account A→B and owner→learner isolation; expired and canceled authentication; stale account generations; active versus revoked publication; progress save/retry/idempotency; billing duplicates/out-of-order/invalid-signature/customer mismatch; unknown provider outcomes/late completion; exports/token revocation; read-only startup and least-privilege allow/deny. Existing PostgreSQL, billing, lesson-integrity/operations and browser suites are useful fixtures, not evidence of a future C# implementation passing.

## Effort and cost

These are planning ranges inferred from the inspected scope, not estimates from an implemented .NET prototype. One experienced developer familiar with React, ASP.NET, PostgreSQL and the codebase, with reviewer support, is assumed. Calendar time grows with part-time availability, unexpected provider behavior and new features.

| Work | Indicative effort | Operating implication |
| --- | --- | --- |
| Keep Next and measure/tune demonstrated bottlenecks | No platform port; release work is tracked separately | Current one-app baseline. |
| Isolated read-only .NET spike and comparison | 1–2 developer-weeks | Temporary test resources only; no evidence of ongoing savings yet. |
| First production responsibility behind existing Next origin | 3–6 developer-weeks after spike, depending on boundary | Two runtimes/services until more work moves; added routing, deployment and observability. |
| Full 68-route BFF port plus React SPA/rendering parity | 16–28 developer-weeks including contract port, concurrency/security review and rollout | Can return to one process, but exact required allocation remains unmeasured. |

At current Azure Central US retail rates and allocation (0.5 CPU / 1 GiB), a 730-hour month with one warm replica is approximately **$11.83 gross while idle** or **$39.42 gross if continuously active**; actual use, subscription-shared free grants and other service charges change the bill. These are allocation scenarios, not .NET benchmarks. Existing production CPU/memory does not establish what .NET would need. See the [measured system report](2026-09-12-system-optimization.md) and its captured rate/metric artifacts. An incremental same-size second runtime could add roughly another allocation's consumption; shared grants cannot be counted twice. PostgreSQL, AI, storage, logs, networking and engineering costs remain separate.

No measured before/after .NET cost or latency claim is available. Approve a migration only if the isolated spike demonstrates a meaningful benefit or team-maintenance requirement that justifies the port and permanent operational burden. Current evidence supports releasing and testing the existing React/Next app first.
