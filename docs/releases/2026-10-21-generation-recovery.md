# Generation progress and real-provider recovery

Owner requested diagnosis/fix of provider-outcome-unknown course creation and restoration of meaningful generation progress, explicitly authorizing real course and lesson end-to-end testing. Preserve request identities, credit/idempotency/evaluation controls, production data and all billing/Spark disabled flags.

- [x] Read sanitized production provider failure evidence and establish cause.
- [x] Add failing regression tests for the diagnosed provider issue and active-progress/recovery behavior.
- [x] Implement minimal fixes; preserve paid-call uncertainty safeguards.
- [ ] Validate local unit/browser/actual Workers bundle behavior and obtain review (unit/browser/review complete; committed bundle smoke pending).
- [ ] Commit/push candidate; pass exact engineering/security/full browser release gates.
- [ ] Deploy validated committed source, verify production and real authenticated course/lesson creation where session access permits.
- [ ] Record evidence, limitations and final documentation separately from deployed SHA.

Current observation: create immediately sets recoverable state, which selects the recovery return before the older progress UI. The specific quoted error originates from the provider-call catch, which emits sanitized generation_provider_outcome_unknown telemetry. Provider cause is not yet established. No new production generation call or mutation has been made for this investigation.

## Diagnosed cause and local correction

Production persisted telemetry at 2026-10-21T19:59:40.968Z records HTTP 401 / invalid_api_key / invalid_request_error on the deployed source. Provider request id req_77e185f20aa6457491a0abde87c54ab9; no key, message, prompt or personal data recorded here. Owner asked to replace OPENAI_API_KEY directly in Cloudflare; browser sign-in is separately required for real authenticated testing. No key is requested in chat.

The correction distinguishes only explicit 401 invalid_api_key from ambiguous transport/provider outcomes. It records confirmed zero usage before guarded personal cleanup and terminal refund. Late explicit sibling rejections replace their own uncertainty through existing global/personal reconciliation; late successes retain actual cost and unknown siblings retain uncertainty. A terminal identity never redispatches. Other errors remain fail-closed.

The active creation branch now shows a spinner, indeterminate progress indicator and actual stage text. Running saved operations poll status via GET even when the original POST has stopped; the existing status endpoint reconciles expired leases. GET never starts provider work. The selected server operation ID takes precedence over stale local ID. Account-session and unmount guards prevent stale polling updates. Completed background work opens its course; failed reconciliation shows credit recovery. Saved identity is retained while active.

Test evidence: explicit-rejection route test failed 409 versus expected503 before correction, then passed; concurrent late-rejection regression failed ownership check before correction, then passed. New active-progress and automatic-reconciliation browser tests both failed before UI changes, then passed2/2. Stale-ID browser regression failed with old-operation GET before ID priority correction. Full local recovery initially had one existing cold-navigation 5-second timeout (blank URL while waiting for navigation), unchanged test recheck passed6/6. Expanded final suite pending. Independent first review found concurrent uncertainty and stale-ID polling; both addressed, re-review pending.

## Reviewed candidate checkpoint

Expanded unit25/25 plus receiver15/15, Python deployment3/3, TypeScript clean, lint0errors/four pre-existing navigation warnings, secret scanner and support-wiki checks pass. Final local learner-recovery browser suite7/7 passes. Both review findings were corrected and independent re-review reports no remaining critical/important issue. Actual committed Workers bundle and remote release gates remain pending. Owner confirmed the production OPENAI_API_KEY was replaced/deployed privately; real provider/authenticated acceptance is still unverified pending browser sign-in and testing. Prior application source is unchanged until candidate deployment.
