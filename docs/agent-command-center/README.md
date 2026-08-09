# Filosage Agent Command Center

The command center is Filosage's owner-only operational workspace at `/admin/command-center`. Phase 1 normalizes operational work. Phase 2 adds bounded, review-only drafts without adding any send or effect executor.

## Phase 1 contract

- `COMMAND_CENTER_ENABLED` is the production environment gate.
- The verified Filosage owner is the only authorized role.
- Simulation mode is permanently on.
- Every domain-agent flag and external-action flag is off.
- Approval records a human decision but never performs the proposed action.
- `BILLING_ENABLED=false` is unchanged and remains independently controlled.

## Phase 2 draft contract

- `COMMAND_CENTER_DRAFTS_ENABLED` is a second production environment gate.
- Support, legal intake, billing explanation, product-operations, and founder-brief agents can be enabled individually by the owner.
- Every run uses a strict structured-output schema, approved local knowledge, a pseudonymous safety identifier, cost budgets, and an idempotency key.
- Ticket drafts are bound to the exact ticket version used for generation. A changed ticket invalidates acceptance.
- Draft acceptance is an internal review decision. It does not send a message, modify a ticket classification, or execute an external action.
- Privacy, content-action, and knowledge-maintenance agents remain unavailable.
- A representative live-model evaluation is a release gate; source, stub, and dry-run checks cannot substitute for it.

## Local setup

Development enables the command center when `COMMAND_CENTER_ENABLED` is unset. Set it explicitly when testing production-style configuration:

```powershell
$env:COMMAND_CENTER_ENABLED="true"
$env:COMMAND_CENTER_DRAFTS_ENABLED="true"
npm.cmd run dev
```

Sign in as the local owner and open `/admin/command-center`.

## Release status

Implementation, Git publication, and Sites deployment are separate states. The presence of this source code does not mean the feature is enabled or deployed in production.
