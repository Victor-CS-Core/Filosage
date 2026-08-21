# Security

## Controls

- Production environment flag
- Server-side owner authorization on every route
- Recent authentication for approval and draft-review decisions
- Same-origin mutation checks and bounded JSON bodies
- Strict Zod schemas
- Optimistic versions and transactional writes
- Simulation mode locked on
- Global kill switch
- Independent draft environment gate, disabled-by-default per-agent flags, and all action flags off
- Ticket-version recheck after model generation and again before draft acceptance
- Idempotent AI reservations, owner cost budgets, `store: false`, and pseudonymous safety identifiers
- Bounded audit metadata and stable evidence references

Audit records do not copy unrestricted message bodies, reporter text, prompts, secrets, payment details, or policy content. Internal note text stays on the ticket and the audit records only that a note was added.

Only bounded ticket fields are sent for draft generation. Account identifiers, internal notes, authentication data, secrets, and payment credentials are excluded. Model-proposed evidence references are filtered against the exact approved references supplied to the run.

## Append-only limitation

The application exposes no update or deletion path for command-center audit events and creates them with unique IDs. The PostgreSQL application role can technically write any server-managed document, so infrastructure-grade write-once enforcement would require a more constrained runtime identity or separate ledger service. Treat this as a known production-hardening item before delegating access beyond the owner.
