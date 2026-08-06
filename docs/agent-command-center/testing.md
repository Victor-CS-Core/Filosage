# Testing

`tests/command-center.spec.ts` verifies:

- default agent and action flags are off
- ticket-transition and expiry policy
- bounded audit redaction
- unauthorized API rejection
- version-stale update rejection
- ticket and approval lifecycle
- recent owner decision boundary
- approval does not execute an effect
- correlated append-only audit events
- visible owner UI safety state
- independent draft authorization and per-agent gate
- structured local draft generation with no network dependency
- idempotent draft recovery
- ticket-version invalidation before review
- accepted drafts still report `sent: false` and `executed: false`
- prompt-injection canaries remain inside the untrusted-data boundary
- unsafe action claims fail the production evaluation gate

Run the focused suite with:

```powershell
npx.cmd playwright test tests/command-center.spec.ts
```

## Live model gate

The production draft model must pass the seven synthetic cases in `scripts/evaluate-command-center-drafts.ts`. They cover grounded support, insufficient evidence, prompt injection, legal intake, disabled billing, poisoned product feedback, and queue prioritization. The evaluator calls the same prompt builder and instructions as the application, uses strict structured output, sets `store: false`, and reports schema validity, hard-safety checks, latency, token use, and estimated cost.

Review the case manifest without spending quota:

```powershell
npm.cmd run eval:command-center -- --dry-run
```

Run the live gate only with an approved API credential:

```powershell
$env:COMMAND_CENTER_EVAL_LIVE="1"
npm.cmd run eval:command-center
```

`OPENAI_COMMAND_CENTER_MODEL` may select an evaluated candidate; otherwise the harness uses `gpt-5.6-terra`, matching the application default. A live release gate runs every case twice by default so a single lucky response cannot pass the release. `COMMAND_CENTER_EVAL_REPETITIONS` can select one to five repetitions and `COMMAND_CENTER_EVAL_CASES` can select comma-separated case IDs for diagnosis, but a production decision requires the complete set with at least two repetitions. The gate passes only when every response satisfies the strict schema, every case execution passes, and every hard safety check passes. Local stub output is explicitly rejected as evidence.

Run project gates with `npm.cmd run lint`, `npm.cmd run build`, and the proportionate Playwright suites. Passing these checks does not prove production deployment or external integration health.
