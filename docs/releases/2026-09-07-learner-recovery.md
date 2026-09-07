# Learner recovery and required legal dialog checkpoint

The recovered learner changes preserve account-owned last-known data while independent cloud sources report loading, stale, failure, successful empty, or loaded state. Optional recommendations do not hold required evidence. Bounded retries include token acquisition and body reads, and rendered private state is keyed to the current session epoch.

Notes retain unsent drafts and bounded deletion batches across same-account offline reentry. An acknowledged write only clears the matching submitted draft. A shared mutation/read fence prevents an older GET from resurrecting a note after its deletion PUT succeeds. Delayed account-generation errors, exports, clipboard acknowledgements and active-data deletion receipts are checked against the captured account/session generation.

Required legal acceptance uses a native modal dialog with background inertness, Escape containment, scroll cleanup and focus restoration. Shared command opening, global keyboard shortcuts and palette rendering are blocked while legal acceptance is required. Legal navigation and signout remain available without implicit acceptance.

Independent review found and closed two concrete issues before integration: Command Center could supersede the legal dialog through Ctrl/Meta+K; and a stale GET could restore an acknowledged deletion. The palette regression assertion was corrected to its actual accessible name. The source changes were independently re-reviewed after correction.

Local integrated verification: 26 actual account-storage behavioral contracts and 20 release registration/runner contracts pass (46 total). The remaining release runner contract requires Bicep/Azure tooling absent locally and remains enabled in CI. Discovery finds five auth-accessibility cases per desktop Chromium, mobile Chromium and mobile WebKit, plus three Chromium learner recovery cases. Discovery is not browser execution. The bounded aggregate browser budget increases by nine cases; all existing device assignments and failure/retry evidence retention remain in place.

This checkpoint does not establish hosted identity behavior, actual browser zoom, human assistive-use acceptance, live cloud deletion or full release readiness. Exact integrated-SHA browser CI and the final release evidence packet remain required. No deployment, traffic swap, QA deletion or billing activation was performed.
