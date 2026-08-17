# Hermes High-Reliability Filosage Operator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Hermes retain the complete user outcome, reason at a higher configured effort, update Multica automatically, avoid unbounded CI waits, and report only evidence-backed terminal states.

**Architecture:** Keep repository policy in `AGENTS.md`, inject a short Filosage operating contract through the repository-gated Multica plugin on every LLM turn, and add a reusable Hermes skill for goal/release execution. Use configuration for model reasoning and loop safety; do not fork or rewrite Hermes core unless a reproducible core defect remains after these controls.

**Tech Stack:** Hermes Agent 0.20.1, GPT-5.6 Sol via `openai-codex`, Python plugin hooks, YAML configuration, unittest, Multica CLI 0.4.28.

## Global Constraints

- Apply Filosage-specific behavior only when canonical Git identity matches `github.com/Victor-CS-Core/Filosage`.
- Never place tokens, environment values, prompts, raw terminal output, or full conversations in Multica.
- A task is not complete when a requested push, deployment, review, or production check remains.
- Use bounded polling rather than background `--watch` commands.
- Do not modify Hermes core installation unless plugin/config/skill controls cannot address a reproduced defect.

---

### Task 1: Encode the operator contract

**Files:**
- Modify: `AGENTS.md`
- Modify: `C:\Users\vitic\AppData\Local\hermes\plugins\filosage_multica_sync\__init__.py`
- Test: `C:\Users\vitic\AppData\Local\hermes\plugins\filosage_multica_sync\tests\test_plugin.py`

**Interfaces:**
- Consumes: repository identity and Multica project snapshot
- Produces: bounded `pre_llm_call` context containing the immutable outcome and completion gates

- [ ] **Step 1: Add a failing plugin contract test**

Assert that an in-repository `pre_llm_call` context contains: preserve full user outcome, plan before tools, bounded CI polling, Multica lifecycle, and separate local/commit/push/deploy/production states. Assert unrelated repositories receive no context.

- [ ] **Step 2: Run the focused test and observe failure**

Run: `python -m unittest filosage_multica_sync.tests.test_plugin.PluginTests.test_pre_llm_includes_operator_contract`

Expected: failure because the static operator contract is absent.

- [ ] **Step 3: Add the bounded operating contract**

Prepend a concise trusted contract to the sanitized project snapshot without exceeding the plugin's context limit or including issue/comment text as instructions.

- [ ] **Step 4: Run focused and full plugin tests**

Run the focused test, then `python -m unittest discover -s filosage_multica_sync/tests -v` from the plugin parent directory.

Expected: all plugin tests pass.

### Task 2: Create the reusable Filosage operator skill

**Files:**
- Create: `C:\Users\vitic\AppData\Local\hermes\skills\filosage-operator\SKILL.md`
- Create: `C:\Users\vitic\AppData\Local\hermes\skills\filosage-operator\agents\openai.yaml`
- Create: `C:\Users\vitic\AppData\Local\hermes\skills\filosage-operator\scripts\verify-goal-state.ps1`

**Interfaces:**
- Consumes: a user request, repository state, associated Multica issue, and expected release target
- Produces: a persisted goal contract and deterministic final-state evidence

- [ ] **Step 1: Initialize the skill with the official skill creator**

Run `init_skill.py filosage-operator` under the Hermes skills directory with `scripts` resources and generated interface metadata.

- [ ] **Step 2: Implement the concise skill**

Require outcome extraction, plan/risk/approval capture, one Multica parent, bounded progress events, condition-based CI polling, fresh verification, and a terminal report that cannot claim completion while requested external states remain false.

- [ ] **Step 3: Add the deterministic state checker**

The PowerShell script must print branch, HEAD, origin/main, ahead/behind, dirty state, active `gh pr checks` processes, and configured Git remotes without reading secrets or mutating the repository.

- [ ] **Step 4: Validate and exercise the skill**

Run `quick_validate.py` on the skill and execute `verify-goal-state.ps1` against the isolated Filosage worktree. Expected: validation exit 0 and accurate current Git/process evidence.

### Task 3: Raise reasoning and loop reliability

**Files:**
- Modify: `C:\Users\vitic\AppData\Local\hermes\config.yaml`

**Interfaces:**
- Consumes: Hermes GPT-5.6 Sol configuration
- Produces: higher reasoning effort and fail-closed no-progress behavior

- [ ] **Step 1: Preserve a recoverable config backup**

Copy the current config to a timestamped backup inside the Hermes profile before editing.

- [ ] **Step 2: Raise reasoning effort one level**

Change `agent.reasoning_effort` from `high` to `xhigh`; keep `gpt-5.6-sol`, `openai-codex`, service tier, and 500-turn budget unchanged.

- [ ] **Step 3: Enable hard no-progress stopping**

Set `tool_loop_guardrails.hard_stop_enabled: true` while preserving the existing warning and stop thresholds.

- [ ] **Step 4: Validate configuration**

Run Hermes config/status diagnostics and confirm the reported model, provider, reasoning effort, repository cwd, plugins, and toolsets without printing credentials.

### Task 4: Prove the improved runtime behavior

**Files:**
- Test only; no product source changes

**Interfaces:**
- Consumes: updated config, skill, plugin, and repository `AGENTS.md`
- Produces: evidence that a fresh Filosage session sees the right contract and can update Multica

- [ ] **Step 1: Run plugin doctor and tests**

Expected: `filosage_multica_event`, `pre_llm_call`, and `on_session_end` register successfully; the complete plugin suite passes.

- [ ] **Step 2: Start a fresh no-code Filosage smoke session**

Ask Hermes to inspect only `README.md`, create/reuse one Multica item, report project name and Git state, use no background watcher, then finish with separate local/commit/push/deploy/production fields.

- [ ] **Step 3: Verify Multica and session closure evidence**

Confirm exactly one issue was used, meaningful lifecycle events were recorded, no duplicate appeared, and Hermes produced a final response without an unresolved process wait.

- [ ] **Step 4: Record rollback instructions**

Retain the config backup path and document that removing the skill, restoring the backup, and reverting the plugin files returns Hermes to its prior behavior.
