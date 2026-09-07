# Generation and browser recovery checkpoint

This source checkpoint integrates independently reviewed durable lesson operations, evaluation transport admission, canonical account readiness and browser fixture corrections. It is not a deployment or release acceptance certificate.

The deployment contract remains one Azure Container App and one image serving the frontend and same-origin BFF. Only blue/green revisions are selected; the inactive revision must have zero public traffic during testing. Repository configuration removes the separate QA target. Actual QA retirement and a traffic swap have not occurred.

## Source changes

- Course and lesson operations retain provider output and observed usage before parsing, preserve the original accounting period, and replay completed results without another provider call. Slow eligible lesson repair yields another bounded request wave. Late provider observations reconcile the original immutable lesson attempt and request without clearing a successor lock.
- Every lesson save uses the publication/edit, account-generation and attempt guards. Lesson result, operation completion and accounting commit atomically. Existing owner/nonowner and V1/V2 paths use the same boundary.
- Explicit owner evaluation approval binds the build, profiles, resolved course/lesson configuration, rates and operation ceiling. Every evaluated SDK dispatch reserves its reviewed upper bound before transport; unresolved exposure cannot reset on resume. Missing approval on later operation requests fails before admission. Local stub mode cannot advertise evaluation capability.
- The authenticated operation-list endpoint advertises evaluation capability only after validating both runtime configurations against the explicit approval. The HTTP adapter consumes that contract; it does not make independent provider calls. This capability is source-tested with synthetic intercepted transport, not current provider pricing or live quality evidence.
- Private client reads wait for canonical session and account readiness, including legal and identity gates. Checkout confirmation survives delayed authentication and the application remount. Blocking legal dialogs retain keyboard containment and background isolation.
- Browser fixtures preserve UID ownership and actual account/legal contracts. Course credit exhaustion remains actionable even when a temporary minute throttle also applies; funded requests remain throttled, and denied admission changes no accounting records.

## Local evidence and limits

Fresh integrated runs record 27 evaluation tests, 11 durable lesson tests, 22 lesson integrity tests, 24 course/generic accounting tests and 26 billing tests passing. The existing full-course offline harness also exits successfully. The composed-route fixture generates the complete four-lesson synthetic course through actual authenticated handlers and the installed SDK: 17 intercepted transport calls, 146 synthetic microdollars, disk-checkpoint recovery and completed replay without additional dispatch. It does not establish real provider or pedagogical quality. TypeScript, full lint and the production build pass. Tests use synthetic provider responses; no provider charge or real course-quality acceptance is claimed.

The local release-contract selection initially passed 53/55. One child-runner assertion depended on the Node version's default reporter; the command now requests TAP explicitly and its targeted contract passes. The remaining local umbrella-runner failure requires the unavailable Azure/Bicep compiler. A follow-up fixture replaces the obsolete flashcard comment assertion with two actual accounting-function tests; both pass. Browser discovery finds 309 Chromium, 32 mobile Chromium and 39 mobile WebKit cases, with the manifest updated to retain all 380. Discovery is not browser execution. Hosted Node22/PG16 and browser CI must verify the final pushed commit; local callback/file storage does not prove PostgreSQL concurrency. Two new lesson PostgreSQL cases and the corrected four-cohort clock fixture require actual CI execution.

## Outstanding release gates

The previous pushed commit `f13a95f92a44afcd369e619919fa8e3d22ed5d9c` passed the engineering static/build job and support wiki. Its PostgreSQL and browser jobs failed; those logs are the evidence for this correction work, not evidence this checkpoint passes. Full regression completed and retained artifact `10028516892`. CodeQL analyzed source but its result upload failed because code scanning is not enabled for the repository. That administrative dependency is unresolved.

No merge, Azure deployment or deletion, traffic switch, production verification, secret change, billing activation or paid provider evaluation has been performed. Required live evidence still includes the seven candidate proof packets, previous/new writer compatibility and rollback, runtime privileges, real PG/Blob restore, authentication and learner journeys, payment obligations/lifecycle, independent monitoring and durable alert acknowledgment, support delivery, and qualified content/legal/privacy review. The independent receiver/monitoring service is an unfulfilled operating dependency, not an implemented service.

Root owns integration, final review, commit/push and CI reconciliation. Multica is unavailable in the current environment; no task ID, lifecycle delivery or queued event is claimed. The existing Monday code-quality automation and AppCreator reference are retained without duplication.
