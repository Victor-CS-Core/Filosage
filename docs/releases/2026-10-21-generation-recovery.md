# Generation progress and real-provider recovery

Owner requested diagnosis/fix of provider-outcome-unknown course creation and restoration of meaningful generation progress, explicitly authorizing real course and lesson end-to-end testing. Preserve request identities, credit/idempotency/evaluation controls, production data and all billing/Spark disabled flags.

- [x] Read sanitized production provider failure evidence and establish cause.
- [x] Add failing regression tests for the diagnosed provider issue and active-progress/recovery behavior.
- [x] Implement minimal fixes; preserve paid-call uncertainty safeguards.
- [x] Validate local unit/browser/actual Workers bundle behavior and obtain review.
- [x] Commit/push candidate; pass exact engineering/security/full browser release gates.
- [ ] Deploy validated committed source, verify production and real authenticated course/lesson creation where session access permits.
- [ ] Record evidence, limitations and final documentation separately from deployed SHA.

Current observation: create immediately sets recoverable state, which selects the recovery return before the older progress UI. The specific quoted error originates from the provider-call catch, which emits sanitized generation_provider_outcome_unknown telemetry. The provider causes and later real test are established in the evidence below.

## Diagnosed cause and local correction

Production persisted telemetry at 2026-10-21T19:59:40.968Z records HTTP 401 / invalid_api_key / invalid_request_error on the deployed source. Provider request id req_77e185f20aa6457491a0abde87c54ab9; no key, message, prompt or personal data recorded here. Owner asked to replace OPENAI_API_KEY directly in Cloudflare; browser sign-in is separately required for real authenticated testing. No key is requested in chat.

The correction distinguishes only explicit 401 invalid_api_key from ambiguous transport/provider outcomes. It records confirmed zero usage before guarded personal cleanup and terminal refund. Late explicit sibling rejections replace their own uncertainty through existing global/personal reconciliation; late successes retain actual cost and unknown siblings retain uncertainty. A terminal identity never redispatches. Other errors remain fail-closed.

The active creation branch now shows a spinner, indeterminate progress indicator and actual stage text. Running saved operations poll status via GET even when the original POST has stopped; the existing status endpoint reconciles expired leases. GET never starts provider work. The selected server operation ID takes precedence over stale local ID. Account-session and unmount guards prevent stale polling updates. Completed background work opens its course; failed reconciliation shows credit recovery. Saved identity is retained while active.

Test evidence: explicit-rejection route test failed 409 versus expected503 before correction, then passed; concurrent late-rejection regression failed ownership check before correction, then passed. New active-progress and automatic-reconciliation browser tests both failed before UI changes, then passed2/2. Stale-ID browser regression failed with old-operation GET before ID priority correction. Full local recovery initially had one existing cold-navigation 5-second timeout (blank URL while waiting for navigation), unchanged test recheck passed6/6. Expanded final suite pending. Independent first review found concurrent uncertainty and stale-ID polling; both addressed, re-review pending.

## Reviewed candidate checkpoint

Expanded unit25/25 plus receiver15/15, Python deployment3/3, TypeScript clean, lint0errors/four pre-existing navigation warnings, secret scanner and support-wiki checks pass. Final local learner-recovery browser suite7/7 passes. Both review findings were corrected and independent re-review reports no remaining critical/important issue. Actual committed Workers bundle and remote release gates remain pending. Owner confirmed the production OPENAI_API_KEY was replaced/deployed privately; real provider/authenticated acceptance is still unverified pending browser sign-in and testing. Prior application source is unchanged until candidate deployment.

## Real provider test uncovered schema incompatibility

After owner privately replaced the key and signed in, an authorized small private course test passed authentication but both research/bibliography were explicitly rejected with400 invalid_json_schema param text.format.schema (2026-10-21T20:13:54Z). Operation e56f6606abe197d1ad9adda01bdb32c5843be8147e7e174972ca84c2268adc5e and saved identity retained; no successful course or lesson result is claimed. Research request req_7f2d77708dda45d18400b0a35b0a2479; bibliography req_25b51e7db800489698c4cf194260e620. The previous401 is resolved, but the first candidate8f40699 is superseded before deployment/full-regression dispatch.

The installed zodTextFormat conversion emits unsupported format starts_with from the HTTPS prefix validator. Official OpenAI Structured Outputs documentation supports pattern and a fixed set of formats (https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas). Three response-schema regressions failed on this exact generated format, then passed after equivalent anchored HTTPS regex constraints. URL/host/deep-link/source certification remain intact. The confirmed400 invalid_json_schema/text.format.schema rejection now uses the same confirmed-zero-usage/refund path as401invalid_api_key; every other outcome remains unchanged. Its behavioral test failed before correction then passed. Final local unit26/26, receiver15/15, Python3/3, source/bibliography/profile contracts45/45, types/lint/secrets pass. Follow-up independent review finds no important issue. No new application code deployed yet.

## Frozen corrected release candidate

Source30f30777672e0ab76c0df2d8d26a1f344ab9539f is committed/pushed. Clean release worktree rebuilt successfully with production vars/SITE_VERSION and no development environment file. Actual local OpenNext Workers smoke4/4 passes, bundled worker SHA-256 2a5ccf6a2f4491114181a1cd2c064b838ea09cad3a31c3a8cf107d8be1b6cabe (smoked bundle and production dry run byte-identical; OpenNext entrypoint hash is a separate input). Security39669021462 passed; engineering39669021616 still running; full regression not dispatched until engineering passes. Immediate rollback version after owner's valid-key update: df1a44f0-298b-44b7-914f-89dd67734f89, deployment321298d4-bdfb-4c91-8f66-386ed4a8fe12 (20:12:24Z). Production source remains e3c5c71. The failed real schema test was reconciled after lease to terminal failed through the supported UI, with the credit recovery message visible. It did not repeat its paid calls.

## October 23 resumed validation

Owner explicitly states no old courses and requests removing defaults. Existing courseOutlineSchema now requires sourceIds/contentBasis; no separate compatibility schema is retained. Fresh contracts exposed ten failures rooted in two valid-outline fixture helpers relying on implicit fields. Those helpers now explicitly supply empty sourceIds and model-knowledge, while the structural-validity test also rejects omission of either field. No validator or assertion is relaxed. Fresh review finds no important issue; final local full contracts459/459, unit26/26, receiver15/15, Python3/3, types/lint/secrets/wiki pass; lint has four pre-existing navigation warnings.

Engineering39669021616 for30f3077 finished failed on smoke-count ceiling38>37 and total browser inventory430>427. Three newly added regressions account for the increase. Budgets increase by three and estimated learner-recovery workload updates to seven; all cases remain enabled. Final six provider-format contracts also cover outline/course-grounding/lesson-grounding. No full browser regression was dispatched before this correction. The prior source/build hashes are historical and will not substitute for the final exact-SHA gate/artifact.

## Necessary security patch discovered on resume

The exactbaf7a2c local clean build stopped on Next.js's security check; engineering39962493121 independently failed npm audit --omit=dev on the same newly reported production advisories. No acknowledgement/disable flag was used to ship the affected version. Registry advisories GHSA-2464-fhr4-w9xw, GHSA-p3m5-59mp-jv5r and GHSA-673q-mjm6-r5xr were published/updated Oct22 and affect16.4.0. Verified sources: https://github.com/advisories/GHSA-2464-fhr4-w9xw and https://github.com/advisories/GHSA-p3m5-59mp-jv5r and https://github.com/advisories/GHSA-673q-mjm6-r5xr.

Minimal patch installs exactnext16.4.2 plus matching @next/env/SWC binaries. No unrelated package version changes or audit exceptions; existing four dev-only braces-chain entries remain the accepted baseline. Production npm audit now0vulnerabilities. Fresh contracts459/459, unit26/26, receiver15/15, Python3/3, types/lint pass (four existing navigation warnings). Independent review finds no important issue; fail-closed OpenNext manifest patch is retained pending actual build/smoke proof. This necessary release-blocker correction supersedesbaf7a2c before full regression or deployment.

Patched Next16.4.2 OpenNext validation build succeeds and the existing manifest workaround still applies exactly once. Actual local Worker smoke passes4/4. Final committed artifact must be rebuilt at its own SITE_VERSION and requalified remotely; no production deployment is inferred from local results.

## Navigation release gate correction

Candidatef8c9229 engineering39963348870 failed the existing release-recovery full-document-navigation contract; its other engineering jobs and security39963348629 passed. Polling completion had introduced client routing. A shared full-document helper now serves direct and polled success, preserving URL encoding. The existing stale-ID browser case now proves completed status opens the course with only the authoritative operation GET. Independent re-review found no important issue. Types/lint pass. Initial local smoke passed35/38 including recovery/navigation; three API/command-center assertions instead reflected ignored development flags disabling Google and command center. The clean-environment rerun excludes that local file and restores it in a finally block. No application deployment or full regression dispatch has occurred.

The clean-environment rerun passed38/38 (2.9minutes); the ignored development environment was restored. Correction is locally validated and independently reviewed, ready for the next exact-source release gates.

Corrected frozen source258f8053bcaead9a5bded7e436322ffbcd4af474 is committed/pushed. Exact engineering39967728300 is running and security39967728083 passed. Clean production OpenNext build and actual local Worker4/4 pass; production dry run is byte-identical (SHA-256810f8c99daeb12b1e4bf4ceb810eb42f3e1866dbeef7f1d10dec8287fc0ecce4). No full regression or deployment yet.

Engineering39967728300 passed all four jobs (hosted Chromium38/38, API passed), security39967728083 passed. Required full regression40004995604 was dispatched once18:38:46Z Oct23 and verified head258f8053bcaead9a5bded7e436322ffbcd4af474;60-minute job deadline. Production remains unchanged pending that gate.

Full regression40004995604 passed at exact258f805: matrix424passed,2passed on existing retries,4existing skips; dedicated command-center UI4passed/5intentional project skips; tier8, command-center contracts9, shared-evidence6 and API11pass. Investigated retries: existing subpixel44px assertion observed43.999969482421875; existing course-discovery heading absent at5seconds, then passed retry (timing cause remains unestablished). No checks/retries weakened. All remote release gates now pass; deployment authorized and pending.

Authorized production deployment completed: source258f805, versiona6bd3b73-aa7f-4d3d-aad4-a334a7a5823d, deploymente809dc5a-98d4-43d0-869f-2a981b33bbc0. Public verifier passed homepage20staticassets, aggregate/readiness/liveness/billing, create-client bytes/evaluationheaderabsent/idempotency/progresspresent,404. Every other binding matches prior version, including secret names, production D1/R2 and disabled billing/Spark; routes/subdomain unchanged. Prior saved failed test reconciled terminal/refunded through UI. New authorized small private real-course request now running with progress screen visible; success remains unverified.

## Real lesson acceptance correction

Authenticated course35d02bbe… completed and persisted course_committed with no pending calls (2modules/6lessons), after normal same-identity recovery from a non-JSON source-validation response with no pending provider calls. Original interruption root cause remains unestablished. Lesson0-0 returned202pending/GENERATION_RESUME_REQUIRED; client treated all2xx as final content and calledquizzes.map on a status object. Persisted lesson operationc9d0e851… ispending with no pending calls. Regression-first correction underway: preserve original identity, continue only explicit pending/resumable stage responses; never redispatch uncertain results. New source release gates required before deploying this correction.

Lesson correction local evidence: stage-continuation regression failed missing resume; unmount guard regression failed expected0/observed1resume, then corrected cleanup. Full Chromium lesson-flow8/8 passes; unknown202 case confirms no automatic operation POST. Contracts459/459, unit26/26, Python3/3, receiver15/15 pass. Independent review found unmount risk, now resolved with no important issue. Inventory grows by one retained unmount case (total431). Later real lesson provider telemetry reported unconfirmed outcome/nameError/no provider status; pendingcall24bd560b… remains preserved, not redispatched. Successful lesson generation remains unverified.

Follow-up frozen source73c6f6640b5beb9d83f8da5464f5db705aed6642 committed/pushed. Engineering40011803373 running/security40011803293 passed. Production OpenNext build and actual Worker4/4 pass, production dry-run identical SHA-2560afd3f5263f8d5ce3f9a04e43f5e673418f3423a518f96c42e32fbfc03af7668. Full regression waits for engineering. Original lessonc9d0e851… was reconciled through unchanged UI identity tofailed/provider_outcome_unknown with uncertain call retained, no redispatch.

Engineering40011803373 now passes all four jobs at73c6f66; security40011803293passed. Full regression40012742615 dispatched once19:36:36Z on exact73c6f6640b5beb9d83f8da5464f5db705aed6642,60-minute execution deadline; pending. Production remains258f805.

Full40012742615attempt1 failed before browser tests: pinned Bicep downloadIncompleteRead (75,497,472received/29,436,368missing). No code failure or artifact qualification inferred. Same-SHA failed-job retry2 started based on that concrete transient download failure; no checks bypassed.

## Bounded runtime and CI download correction

Source73c6f66 is superseded before deployment. Full40012742615attempt2 spent28minutes in Ubuntu dependency downloads viaazure.archive.ubuntu.com (libflite1,13.6MB,took5minutes). Stopped after collecting a new necessary runtime diagnosis; no full-regression proof claimed. CI uses upstreamUbuntuHTTPSmirror, signedpackages/pinnedversions unchanged, APT2retries/30secondconnectiontimeouts, Bicepv0.46.1 bounded3downloads180secondseach.

Actual lesson unknown outcome occurred42.1seconds after attempt start, matching40-second provider/48-secondtotal limits. SDKtimeout inheritsnameError; added fixed timeout/connection classifications without rawmessages. HistoricalSept24smoke had independently recorded50-secondlesson calls failing this bound; historical notes do not replace current acceptance. Cloudflare HTTP Workers duration docs confirm no60-secondwalllimit while connected (https://developers.cloudflare.com/workers/platform/limits/#duration). Deliberate platform-aware bound:120-secondlesson,90-secondattempt,6-secondcleanup, below existing150-secondrequest/180-secondlease/client170seconds. Existing retriesdisabled, checkpoints/evaluation/credit/uncertainty fences unchanged. Updatedcontract now checks realrequest/cleanup/repair/expiry bounds; test failed40,000versusexpected>60,000 beforefix, then fullcontracts459pass. SafeSDKtimeoutdiagnostic test failedbeforeclassification, thenbrowser1/1passes withprivatemessageexclusion. Independent review noimportantfindings. Fresh committed-source release gates required.

Revised frozen source52f3cc4e384881beac9ea5b7801298316e992a56 committed/pushed. Exact engineering40017465857 running/security40017465846passed; production OpenNext build and actual Worker4/4pass, dry-run-identical SHA-2561bea98e9b5b88a61498d48239214ea7a20680a9a6f72bedb5095b0f9af684ca6. Full regression awaits engineering.

Final candidate52f3cc4 exact engineering40017465857/all4jobs and security40017465846passed; Chromium38/38 without retries. Browser installation completed promptly with upstreamUbuntu mirror. Required full40018545140 dispatched once20:21:11Z on exact52f3cc4e384881beac9ea5b7801298316e992a56,60-minute execution deadline; running.

## October27 final deployment and acceptance limit

Source52f3cc4 exact full40018545140passed (427matrixpass/4existing skips/no retries; dedicatedUI4pass/5projectskips), engineering40017465857/security40017465846passed. Deployedversionf941ab28-5447-4676-b18d-ba5f6eea1e90/deploymentdaaee0c4-49b4-44a2-b12b-e375634750db. Rollbacka6bd3b73-aa7f-4d3d-aad4-a334a7a5823d recorded. Public health/readiness/liveness/billing/homepage20assets/create+lessonclientbytes/404pass. All non-version bindings and routes preserved.

Real lesson0-0 now generated and rendered after automatic saved-stage continuation. However its content explicitly declares insufficient atomic evidence for the synthetic calculation outputs and scored feedback, requesting replanning. This is a concrete content-quality acceptance blocker; successful lesson transport is NOT a successful full learning flow. No publication, grounding bypass or synthetic success claim. Requires investigation of replan-required artifact admission and the evidence treatment of valid synthetic arithmetic. Final documentation is committed separately from deployed source.

## October27 content-quality blocker resolution — started

Owner explicitly requests resolving the remaining blocker. Acceptance: derived calculations from declared synthetic inputs may teach a source-supported rule without invented citations; external factual/domain assertions remain grounded; a self-declared unable-to-deliver/replan-required artifact must never be saved as a ready lesson. Preserve existing data and saved identities, disabled billing/Spark, evaluation/idempotency/accounting fences.

- [x] Reproduce rejected/accepted boundary in failing regressions.
- [x] Align generation/verifier policy for transparent synthetic arithmetic; add fail-closed readiness guard.
- [x] Run local verification and independent review; coherent candidate prepared for commit/push.
- [ ] Pass exact engineering/security/full browser and actual Workers smoke before authorized deployment.
- [ ] Verify live settings/assets and fresh real lesson learning flow; record source and later documentation SHA separately.

Diagnosis: generation prompt requires a separate atomic evidence claim for every factual sentence, including synthetic worked-example outputs. Independent grounding exempts hypotheticalscenarios but does not explain derivations. Readiness checks validate matching objective text/fieldbindings without detecting a lesson explicitly declaring the planned teaching unavailable. Proposed approach fixes both policy mismatch and admission; no automaticgroundingdowngrade or fictitioussourceclaims.

Local checkpoint: final contracts459/459, types/lint (four existing warnings), units26/Python3/receiver15, tracked-secret scan pass. Independent review clear after narrowing the guard to promised capabilities. Regressions cover unchanged-objective refusals, practice/model responses/feedback, valid domain disclaimers and quoted/code examples. Shared policy explicitly reaches generator/final boundary/verifier; arithmetic failures use unsupportedClaims. Grounding evaluator v5 distinguishes this policy. Real arithmetic acceptance still requires a fresh generated lesson; prompt contracts are not numerical proof.

Candidate8e6b546 superseded before full dispatch/deployment by fresh security audit: new high advisories [MSAL](https://github.com/advisories/GHSA-xcx6-jx8p-x3h5), [Undici](https://github.com/nodejs/undici/releases/tag/v7.30.1), [body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828). Pin Identity4.13.0 (unaffected MSAL3; latestIdentity4.14 still requiresMSAL6), patch Undici7.30.1 and locked development body-parser2.4.0. No audit threshold/exception change. Fresh full audit zero high/critical, three moderate UUID-chain findings remain. Independent dependency review clear; live Azure credential use is not tested or changed.
