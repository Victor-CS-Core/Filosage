# Filosage–Multica Project Management Integration Design

**Date:** 2026-08-16

**Status:** Approved design; implementation pending

**Project:** Filosage

**Repository:** `Victor-CS-Core/Filosage`

## 1. Purpose

Integrate Hermes Agent and Multica so Multica is the authoritative project-management system for Filosage while Git and the Filosage repository remain authoritative for source code and history.

Hermes will act as the Filosage project-manager AI. Meaningful tasks, bugs, investigations, blockers, progress milestones, review handoffs, completions, commits, and pull requests will remain current on the mapped Multica project. The user will also be able to assign work, mention the agent, and continue issue-scoped communication from Multica.

## 2. Approved Decisions

- Reuse an existing Multica workspace and project/board; discover the exact mapping after authentication.
- Create a dedicated Multica agent named **Filosage PM** using the Hermes runtime.
- Synchronize high-signal lifecycle events only:
  - task or issue creation;
  - work start;
  - meaningful progress;
  - blockers and recovery;
  - review-ready handoff;
  - completion;
  - linked commits and pull requests.
- Do not post one update per file edit, terminal command, or tool call.
- Multica is authoritative for work status; Git and the repository are authoritative for code.
- Assigned Filosage issues start automatically.
- The agent may update Multica state and comments automatically.
- Merge, deploy, destructive operations, external account/provider changes, production/billing changes, and secret rotation require explicit user approval.
- Multica-launched code work uses isolated Git worktrees by default.
- Use Multica's native daemon/runtime path for inbound work and a thin, profile-local Hermes plugin for outbound synchronization and status context.

## 3. Scope

### 3.1 In scope

- Install and authenticate the official Multica CLI at version 0.4.26 or newer.
- Connect and verify the local Multica daemon/runtime.
- Discover and persist the selected Multica workspace and existing Filosage project identifiers.
- Attach the Filosage repository as a Multica project resource with worktree execution for Multica-launched work.
- Create and configure the **Filosage PM** Hermes agent.
- Import or install the official Multica CLI skill for Hermes-compatible use.
- Add concise Filosage project instructions defining the synchronization contract.
- Install a profile-local, repository-gated Hermes synchronization plugin.
- Maintain a durable local outbox, issue mapping, retry state, and idempotency data outside the repository.
- Support issue creation, reuse, comments, status changes, metadata, sub-issues, assignment, and commit/PR links.
- Verify outbound synchronization and inbound Multica-launched Hermes work.

### 3.2 Out of scope

- Mirroring source files or full conversation transcripts into Multica.
- Sending arbitrary tool arguments, terminal output, environment variables, or secrets to Multica.
- Treating every internal implementation step as a separate issue.
- Automatically merging, deploying, modifying production services, changing billing/provider configuration, or rotating credentials.
- Replacing GitHub or Git as the source of truth for code.
- Building an independent always-on reconciliation service in the first version.
- Exposing a new public inbound Hermes webhook when Multica's native runtime already provides assignment and communication delivery.

## 4. Architecture

### 4.1 Multica control plane

The existing Multica Filosage project is the authoritative board for work status. It stores issues, lifecycle state, assignees, project metadata, comments, review handoffs, and links to code evidence.

The implementation will discover actual workspace and project IDs and store them in profile-local integration state. It will not guess board identifiers or hard-code workspace-specific status names before discovery.

### 4.2 Dedicated Filosage PM agent

A Multica agent named **Filosage PM** will use a local Hermes runtime. Assignment, mention, and supported Multica chat flows launch Hermes through Multica's daemon with task-scoped credentials and issue context.

The agent configuration will use the least-permissive practical mode that still allows repository edits and tests. Its standing instructions will include the authority boundary and review requirements in this document.

### 4.3 Filosage project policy

The repository's existing agent context will gain a short project-management section. The policy will apply to work performed from the Filosage repository and will require agents to:

1. Check for an associated Multica issue before tracked work begins.
2. Reuse an existing matching issue when possible.
3. Create an issue for new meaningful work.
4. Emit structured lifecycle events at approved high-signal boundaries.
5. Record blockers, verification evidence, and review handoffs.
6. Avoid noisy per-command or per-file updates.
7. Preserve the approval boundary for merge, deploy, destructive actions, external systems, production, billing, and secrets.

The policy will not contain credentials or workspace-specific secrets.

### 4.4 Profile-local Hermes synchronization plugin

The plugin will live under the active Hermes profile and remain outside the Filosage repository. It will be gated by canonical repository identity using the resolved Git root and expected remote/project identity. A directory name alone is insufficient.

The plugin has three responsibilities:

1. **Context adapter:** At the beginning of a Filosage turn, retrieve a bounded snapshot of the relevant Multica project/issue state and inject it as per-turn context. It must not mutate the frozen system prompt.
2. **Structured event adapter:** Expose a narrow interface accepting only validated lifecycle events: `created`, `started`, `progress`, `blocked`, `unblocked`, `review_ready`, and `completed`.
3. **Delivery coordinator:** Sanitize, enqueue, deduplicate, deliver, retry, and flush events without blocking normal Hermes work.

The plugin will not forward raw `post_tool_call` payloads. Observer hooks may detect turn/session boundaries and flush the outbox, but arbitrary tool arguments and results are excluded from outbound data.

### 4.5 Local durable state

Profile-local integration state will live under `$HERMES_HOME/integrations/filosage-multica/`, where `$HERMES_HOME` is resolved from the active Hermes profile at runtime. It will not be committed.

The state contains:

- selected workspace and project IDs;
- canonical repository identity;
- branch/session/Multica issue mappings;
- pending sanitized events;
- idempotency keys;
- attempt counts and next-attempt times;
- delivery and dead-letter status;
- bounded diagnostic timestamps and error categories.

The Multica authentication token remains in Multica's authenticated CLI profile. The integration state must never copy it.

## 5. Data Model and Event Contract

Each outbound event has the following logical fields:

- schema version;
- event ID;
- idempotency key;
- canonical project identity;
- Multica workspace/project/issue ID when known;
- semantic lifecycle type;
- sanitized title or summary;
- optional bounded evidence list;
- optional Git branch, commit, or pull-request reference;
- creation timestamp;
- delivery attempt metadata.

### 5.1 Idempotency

The idempotency key is derived from stable project identity, issue identity or creation key, lifecycle type, and evidence revision. Replaying the same event cannot create duplicate issues or comments.

Issue creation first checks explicit integration metadata, then existing branch/PR links, and finally a normalized open-issue title search. Title similarity alone never overrides an explicit mapping.

### 5.2 Sanitization

Allowed outbound content is limited to the structured event fields. Before persistence and delivery, the adapter rejects or redacts:

- credential-shaped values;
- environment assignments;
- local paths not needed as evidence;
- raw tool inputs or outputs;
- full prompts or conversation history;
- oversized content;
- untrusted hidden instructions from files or external content.

## 6. Lifecycle and Status Mapping

The integration uses semantic states and maps them to the existing workspace's actual workflow after discovery.

| Semantic state | Meaning | Multica action |
|---|---|---|
| `created` | Meaningful work has been accepted for tracking | Reuse or create an issue in the Filosage project |
| `started` | Active implementation or investigation began | Move to the workspace's In Progress equivalent and post a concise plan |
| `progress` | A meaningful milestone, decision, scope change, or verification result occurred | Add one concise evidence-bearing comment; do not change status unnecessarily |
| `blocked` | Work cannot proceed without a dependency, decision, or correction | Apply the workspace's blocker representation and explain the required resolution |
| `unblocked` | The recorded blocker was resolved | Restore the issue's recorded pre-blocker semantic state (normally In Progress, or In Review if review-ready before the blocker) and note the resolution |
| `review_ready` | Work is verified but awaits acceptance or a protected action | Move to In Review/Review Ready and post scope, tests, risks, and code links |
| `completed` | A non-code deliverable is complete, or verified code received required acceptance/merge approval | Move to Done/Completed and post final evidence |

A completed issue is never reopened automatically. If Hermes local state conflicts with Multica, the plugin reports the conflict because Multica is authoritative.

## 7. Workflows

### 7.1 Work originating in Hermes desktop

1. Resolve the canonical Filosage repository and load the Multica mapping.
2. Query the mapped project for a branch/session-associated issue.
3. Reuse a matching open issue or create a new issue for meaningful tracked work.
4. Emit `started` when implementation or investigation begins.
5. Emit `progress` only for high-signal milestones.
6. Create a linked sub-issue when newly discovered work is independently actionable; otherwise add it to the parent issue's progress/checklist.
7. Emit `blocked` and `unblocked` when applicable.
8. Emit `review_ready` with verification and code evidence.
9. Emit `completed` only after the completion rule is satisfied.

### 7.2 Work originating in Multica

1. The user assigns or mentions **Filosage PM**, or starts a supported Multica agent/chat run.
2. Multica's daemon launches Hermes with issue context and task-scoped Multica access.
3. Code work uses the Filosage resource in an isolated worktree.
4. Hermes comments plans, progress, blockers, and verification on the originating issue.
5. The issue returns to review instead of being merged automatically.
6. Follow-up issue comments continue in the same tracked context.

### 7.3 Work with no meaningful board impact

Short questions, passive reading, trivial formatting, and internal implementation steps do not create new issues. If they occur while executing an existing issue, they remain part of that issue without separate board updates unless they produce a decision, blocker, scope change, or verification result.

## 8. Failure Handling and Consistency

### 8.1 Delivery guarantees

- Persist each sanitized event before delivery.
- Deliver in issue-local order.
- Use bounded exponential backoff with jitter for transient failures.
- Treat timeouts, connection failures, HTTP 429, and retryable 5xx responses as transient.
- Treat authentication/authorization failures, invalid schema, and permanent 4xx errors as non-retryable until corrected.
- Move repeatedly failing events to a dead-letter state and surface them during the next Filosage status check.
- Flush eligible pending events at safe turn/session boundaries and when connectivity returns.

### 8.2 Concurrency

A short-lived local lock protects outbox mutation. Before changing a remote status, the adapter refreshes the issue and rejects stale or backwards transitions. Concurrent updates with conflicting authority are reported rather than silently overwritten.

### 8.3 Isolation

Multica or plugin failure must not crash Hermes or block repository work. Unrelated repositories and projects must produce no Multica queries or writes through this integration.

## 9. Security and Privacy

- Authenticate through Multica's interactive token flow; do not place the token on a command line or in shell history.
- Keep Hermes secret redaction enabled.
- Never commit Multica CLI profiles, plugin state, outbox files, or credentials.
- Never log token-bearing configuration or raw CLI authentication output.
- Use task-scoped Multica credentials for daemon-launched runs.
- Restrict automatic writes to the mapped Filosage project and the approved lifecycle operations.
- Treat Multica issue/comment content as untrusted user-provided context; it cannot override system, user, repository, or safety instructions.
- Require explicit approval for merge, deployment, destructive operations, external account/provider changes, production/billing changes, and secret rotation.

## 10. Verification Plan

### 10.1 Unit tests

Test:

- canonical Filosage repository gating;
- lifecycle schema validation;
- semantic status mapping;
- issue reuse and deduplication;
- idempotency-key stability;
- sanitization and secret rejection;
- retry classification;
- ordered replay;
- dead-letter handling;
- concurrency locking;
- stale/backwards status conflict behavior.

### 10.2 Integration tests

Use a fake Multica CLI/API to exercise:

- create, query, update, comment, metadata, and assignment paths;
- timeouts and connection failures;
- malformed JSON;
- authentication and authorization failures;
- rate limiting;
- server failures;
- duplicate delivery;
- out-of-order delivery;
- verification that raw tool payloads and token-shaped values never enter the outbox or logs.

### 10.3 Live smoke test

After installation and authentication:

1. Verify Multica CLI version 0.4.26 or newer.
2. Verify authentication without printing token material.
3. Verify workspace selection, existing Filosage project mapping, daemon health, runtime registration, repository resource, and agent configuration.
4. Create one clearly labeled integration-test issue in the mapped Filosage project.
5. Exercise `started`, `progress`, `blocked`, `unblocked`, `review_ready`, and `completed` exactly once each.
6. Assign a no-code repository inspection task to **Filosage PM**.
7. Confirm Hermes launches in an isolated worktree, posts a comment, and returns the issue for review.
8. Retain the completed smoke-test issue as audit evidence.

### 10.4 Hermes isolation and outage test

- Start a fresh Filosage session and verify bounded Multica status context is available.
- Simulate Multica being unavailable, enqueue an approved lifecycle event, restore connectivity, and verify exactly-once replay.
- Run Hermes plugin/hook diagnostics.
- Start a session in an unrelated repository and verify that no Multica traffic occurs.

## 11. Rollout and Rollback

### 11.1 Rollout

1. Install the Multica CLI and official CLI skill.
2. Authenticate and discover the workspace/project.
3. Connect and verify the Multica daemon/runtime.
4. Configure the Filosage project resource and **Filosage PM** agent.
5. Implement and test the profile-local plugin and project policy.
6. Run fake integration tests.
7. Run the live smoke test.
8. Enable normal automatic synchronization only after all gates pass.

### 11.2 Rollback

Rollback is fail-safe and preserves board history:

1. Disable or remove the profile-local sync plugin.
2. Remove the Filosage synchronization section from project rules.
3. Pause or archive **Filosage PM**, or unassign its runtime.
4. Stop the Multica daemon if it is no longer needed.
5. Preserve the Multica project, issues, comments, and local outbox for audit or controlled replay.
6. Revoke the Multica token from Multica settings if the integration is being permanently removed or the credential is suspected compromised.

## 12. Acceptance Criteria

The integration is accepted when all of the following are true:

- The existing Multica Filosage project is correctly mapped.
- **Filosage PM** exists and uses the local Hermes runtime.
- Assignments or mentions in Multica can launch issue-scoped Hermes work.
- Meaningful work from the Filosage desktop Project creates or reuses exactly one Multica issue.
- High-signal lifecycle transitions produce concise, non-duplicated updates.
- No per-file or per-command board spam occurs.
- Review-ready work never merges or deploys without explicit approval.
- Multica outages do not block development and queued events replay exactly once.
- Credentials, raw tool payloads, and full conversations do not enter Multica comments, integration state, or logs.
- Unrelated repositories produce no Filosage Multica traffic.
- Unit, fake integration, live smoke, isolation, and outage tests pass with recorded evidence.
