# September 13 production release

**Application deployment accepted; hosted theme acceptance and requested cleanup remain incomplete.**

Filosage.com serves source `0fcb5f502de1159c36c31785e4796b283c7b9a02` and immutable image `sha256:dae13abacb841400d649ec892f4b6455e25e61a49547f937269417e65c8987af`. The reviewed candidate was built once and promoted without rebuilding. Engineering, security, full regression, staging, evidence packaging, candidate verification and promotion all passed on this source. Full regression:458passed,9declaredskips,0unexpected,0flaky.

Flashcards is active under **Study tools**. The existing non-owner account generated one eight-card deck, revealed an answer and saved a review. The deck survived reload and appeared on the public site after promotion; quota decreased once from100to99. Public review writes and fresh Google sign-in passed, with existing8%/1of12lesson progress intact. New paid checkout remains closed.

Public observation ran08:23:56–08:53:56UTC. All72sampled public/rollback health checks passed, with no observed5xx responses or container restarts. The first two metrics queries were rejected because their intervals were shorter than one minute; subsequent cumulative metrics covered the window. Maximum sample gap was53.240seconds, so this is bounded sampling, not continuous instrumentation. Final provider readback08:54:44UTC confirms blue100/green0, exact source/image, unchanged authentication, private endpoint denial, closed billing, enabled receiver monitors and no matching fired alerts in the queried hour. The compatible modern green predecessor remains available. All owned observers and measurement helpers exited.

## Remaining work

- **Hosted authentication:** the reported white canvas and unreadable logos/text are corrected on actual Microsoft sign-in and sign-up in dark mode. Live light-mode verification and exact synchronization with the landing theme toggle remain open. See [theme evidence](../research/artifacts/release-readiness-20260912/hosted-theme-contrast-20260913.json).
- **QA retirement is executing:** QA test Stripe integrations are disabled, QA OAuth entries and two GitHub variables are removed, and both authoritative nameservers confirm the QA CNAME is absent. The old one-hour DNS cache window ends15:25UTC; a bounded task follow-up is scheduled to resume the approved infrastructure cleanup afterward. QA data, shared roles and recovery credentials remain retained. See [retirement evidence](../research/artifacts/release-readiness-20260912/qa-retirement-execution-20260913.json).
- **Measurement limits:** provider-only model latency is absent from stored receipts; a deliberate production scale-from-zero benchmark was not performed. Actual DB/resource/cost measurements are recorded in the [system report](2026-09-12-system-optimization.md). No performance gain or capacity guarantee is claimed.

Victor's AFK approval remains valid for agreed release/retirement execution once these dependencies are satisfied. No repeated general release approval is needed.

[Sanitized acceptance evidence](../research/artifacts/release-readiness-20260912/production-acceptance-0fcb5f5-20260913.json) contains exact workflow/artifact identities and the actual observation samples. [Outcome checklist and handoff](../AGENT_PROGRESS.md) preserves R1–R9.
