# Erudoza Agent Workflow SOP

## Purpose

Define a safe, reviewable workflow for Hermes and Codex to support Erudoza. The user remains the decision-maker for external actions, production releases, and approval to implement changes.

## Roles

### Hermes — monitor and report

Hermes may:

- Read approved signals, logs, alerts, GitHub activity, and other explicitly authorized sources.
- Summarize findings, risks, impact, and recommended next steps in a report.
- Draft a GitHub issue when a tracked engineering task is warranted.
- Create the approved GitHub issue after the user gives explicit approval for that external action.
- Verify an implemented fix against the agreed acceptance criteria and report the result.

Hermes must not:

- Change application or production code.
- Deploy, alter production configuration, or change infrastructure.
- Send emails or external messages.
- Merge pull requests or make unapproved external changes.

### Codex — implement and validate

Codex may:

- Implement changes only for a user-approved GitHub issue or explicitly approved work item.
- Work on a dedicated branch, keep the change scoped, and document relevant decisions.
- Run appropriate local checks and tests.
- Open a pull request for user review when the change is ready.

Codex must not:

- Deploy directly to any environment.
- Merge its own pull request or bypass required review.
- Perform unapproved external actions.

## Workflow

1. **Observe:** Hermes checks the approved signals using read-only access.
2. **Report:** Hermes drafts a concise report with evidence, severity, user impact, and a recommended action.
3. **Track:** If work is needed, Hermes drafts an issue. The user explicitly approves any GitHub issue creation; Hermes then creates it.
4. **Approve implementation:** The user reviews the issue and explicitly authorizes Codex to work on it.
5. **Implement:** Codex creates or uses a dedicated branch, makes the scoped code changes, runs relevant tests, and opens a pull request.
6. **Verify:** Hermes independently verifies the pull request or deployed candidate against the issue’s acceptance criteria and reports the outcome.
7. **Release:** The user reviews the pull request, decides whether to merge, and performs or authorizes deployment. Codex does not deploy.

## Safety and approval rules

- Begin with read-only integrations and least-privilege access.
- Use branches and pull requests for every code change; do not work directly on a production branch.
- Treat issue creation, pull-request creation, merges, deployments, configuration changes, messages, and other outside-system actions as external actions requiring explicit user approval.
- Keep production access separate from monitoring and implementation access.
- Preserve an auditable link between the Hermes report, GitHub issue, Codex pull request, verification report, and release decision.
- If scope, impact, or authority is unclear, stop and request user direction before proceeding.
