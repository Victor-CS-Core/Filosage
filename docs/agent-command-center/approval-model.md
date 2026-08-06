# Approval model

Approval requests contain an exact proposed action, risk, affected records, expected side effects, versioned policy references, expiration, expected ticket version, and idempotency key.

Only a recently authenticated owner may approve or reject. A decision fails when the request is expired, no longer pending, version-stale, or attached to a changed ticket.

Phase 1 decisions always return:

- `executionState: "not_executed"`
- `executed: false`
- `simulationMode: true`

No effect executor exists. Adding one requires a separate allowlist, idempotency store, independent tests, incident procedure, and explicit approval.
