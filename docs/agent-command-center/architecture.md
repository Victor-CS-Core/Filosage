# Architecture

## Existing platform

- Next.js App Router and React
- Azure Container Apps Easy Auth with Google
- Azure PostgreSQL document storage behind server-only routes
- OpenAI for existing learning features; unused by command-center Phase 1
- Stripe routes behind an independent billing lock
- Azure Container Apps production runtime

## Collections

| Collection | Purpose |
| --- | --- |
| `commandCenterTickets` | Normalized operational work and bounded context |
| `commandCenterApprovals` | Versioned proposed actions and owner decisions |
| `commandCenterDrafts` | Structured review-only agent output with model, prompt, source-version, and review provenance |
| `commandCenterAuditEvents` | Append-only application events |
| `commandCenterControls/global` | Global enabled state, simulation mode, kill switch, and disabled capability flags |

No historical content reports are silently backfilled. New reports create their original `contentReports` document, linked ticket, and intake audit in one transaction while the environment flag is enabled. Manual reconciliation must be separately designed and approved before any backfill.

## Service boundaries

- `command-center-auth.ts`: environment and owner authorization
- `command-center-policy.ts`: pure transition, deadline, expiry, and redaction rules
- `command-center-server.ts`: the only command-center persistence service
- `command-center-draft-server.ts`: bounded context assembly, approved-source selection, structured generation, usage accounting, and draft persistence orchestration
- Route handlers: validate bounded JSON and delegate to the service
- Client: displays server-authorized capabilities; it is never an authorization source

All state-changing paths use expected versions and document transactions. Audit events are written in the same transaction as the state they describe.

AI generation happens outside a database transaction. The resulting draft is committed only after a transaction rechecks the environment, global controls, per-agent flag, kill switch, and source ticket version. Model calls use `store: false`; idempotent usage reservations prevent duplicate runs from silently repeating cost.

## Migration plan

PostgreSQL creates the four new collections on first write. Current list operations do not require composite indexes. A later query redesign must add its indexes before deployment. Rollback leaves inert records in place for evidence preservation.
