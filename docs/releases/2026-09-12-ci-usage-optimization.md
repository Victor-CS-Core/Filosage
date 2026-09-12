# PR documentation checks and CI usage

Status: locally verified and independently reviewed; not yet merged or active on main.

Validation: 24 Node scope/evidence tests and all 480 contracts pass, along with TypeScript, lint (four existing navigation warnings), workflow YAML, tracked-secret and wiki checks. Hosted PR verification is pending.

The September 11 changes removed automatic full regression and CodeQL runs. The remaining volume comes primarily from updates to open PRs: each update starts engineering, security and wiki workflows. Record updates alone should not cause an immediate push; batch locally validated changes into coherent review checkpoints as specified in AGENTS.md.

Engineering now classifies the complete PR diff against its merge base. Only regular non-executable `docs/**/*.md`, root `README.md` and `AGENTS.md` files qualify for lightweight checks. Source, dependencies, workflow/config files, documentation data, unknown files and mixed PRs get full tests. Rename detection is disabled so a source-to-documentation rename cannot hide a code deletion. Missing history, invalid identities, empty diffs and comparison errors select full testing. Classification uses local NUL-delimited Git output without a provider file-list cutoff.

The existing static job validates source identity, CI regression safeguards, tracked secrets and wiki integrity even for documentation-only PRs. It skips package installation, lint/type/build/domain/contract work for those PRs; database and browser jobs are conditionally skipped before allocating runners. Required job names remain stable; the workflow itself is not path-filtered. Security scans and the separate wiki change-impact check remain automatic. Scheduled backup observation and quarterly wiki freshness remain unchanged.

Main pushes and manual Engineering quality gate dispatch always run the full suite. Code PRs retain full checks, including after a documentation-only follow-up commit. This prioritizes safe evidence over reusing prior checks across changed SHAs. PostgreSQL and browser checks now start after static checks succeed, so failed static work also avoids unnecessary database execution.

A green lightweight workflow is insufficient release evidence. Release verification must validate that all three engineering jobs actually completed successfully for the exact workflow run, attempt and source SHA, rejecting missing, skipped, duplicate or incomplete job evidence. Existing full source PR runs remain eligible. Full browser regression remains a separate manual release requirement; this optimization does not waive either gate.

Expected savings: a documentation-only PR avoids the expensive engineering work and two runner allocations. The observed full engineering sample used 11m54s combined job time; exact savings depend on runner startup, lightweight checks and billing rounding. No measured post-change savings or billing reduction is claimed before hosted readback. Ordinary code PRs still run full checks and main rechecks the merged source.
