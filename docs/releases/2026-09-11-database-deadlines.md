# PostgreSQL deadline candidate

This follow-up has partial disposable PostgreSQL CI evidence; corrected COMMIT cases still need a fresh CI run. The local machine has no PostgreSQL, Docker or Podman executable; the existing Ubuntu WSL distribution has no PostgreSQL tooling either. No software was installed and no live configuration was changed.

## Problem and change

The main pool previously configured connection acquisition and pool-idle timeouts only. `beginTransaction` waits for advisory and row locks before starting the existing 30-second transaction-handle timer; `finishTransaction` clears that timer before writes and `COMMIT`. Those phases therefore had no application-configured SQL deadline.

The main pool now supplies per-session PostgreSQL `lock_timeout=10000` and `statement_timeout=30000`, using the existing 10-second connection and 30-second transaction-handle budgets. A 35-second node-postgres `query_timeout` leaves time to receive server cancellation. Server deadlines cover both reads and mutation statements. They are per statement, not an overall HTTP request or multi-statement transaction deadline. PostgreSQL 16 disables its statement timer before deferred COMMIT work; that phase is bounded at the client, with an unknown server outcome on timeout. The separate readiness pool retains its existing shorter deadline.

Transaction failures attempt rollback before reusing the connection. A client read timeout has an unknown server outcome: the connection is discarded without queuing another statement. Failed rollback also discards the connection, and expiry cleanup handles its own failure. Existing transaction callers receive the original error; this change does not introduce automatic retries. In particular, a lost `COMMIT` response does not prove rollback and must not be treated as a safe request to repeat a mutation.

This affects all PostgreSQL-backed account, billing, course and learner operations. No persisted format, entitlement rule, account authorization boundary or deployment setting changes. The two stale commercial-runbook references now describe the inactive blue/green revision and the existing card-only Checkout contract.

## Validation

- Six guarded PostgreSQL 16 cases in `tests/postgres/deadlines.test.ts` cover blocked advisory acquisition, write-lock rollback for existing and new transactions, explicit server cancellation during observed deferred COMMIT, client response timeout during COMMIT, and client response timeout during a write. Confirmed cancellation asserts rollback/reuse; uncertain COMMIT accepts either a complete commit or a complete rollback and verifies connection replacement, no partial writes and no automatic retry through row versions.
- The tests use the existing explicit loopback-only `FILOSAGE_POSTGRES_TEST_URL` guard. They never fall back to the application's `DATABASE_URL`. Deferred commit work uses session-local temporary objects; other writes remain inside the fixture's UUID namespace.
- The focused pre-fix local attempt stopped at the missing-fixture guard before connecting. This is **not a reproduced lock timeout**. CI run `34637804114`, PostgreSQL job `103389858276` at `a630cc0`, passed advisory/write-lock timeout and uncertain-write connection-discard cases. The original deferred-COMMIT statement-timeout assertion failed: COMMIT completed after about 1.04 seconds instead of raising `57014` at 100ms. PostgreSQL 16 source confirms this expected timer boundary; the test assumption was incorrect. The two corrected COMMIT cases remain pending actual CI execution.
- TypeScript and focused Oxlint/ESLint pass locally. The existing fixture safety checks pass 3/3. These checks do not prove transaction behavior.

The candidate may enter the draft release PR to obtain disposable CI evidence. Before landing on main or releasing, run that PR's `quality-gate.yml` PostgreSQL job at the integrated SHA. With its disposable PostgreSQL 16 service and explicit fixture URL, the commands are:

```text
npm run test:postgres
npm run test:billing
```

The second command must use that PostgreSQL fixture environment; earlier file-store billing results are not a substitute. Review failed-lock timing, rollback/no-partial-write assertions and post-timeout pool recovery before accepting the candidate. No deployment, hosted load test or production database timeout readback was performed.

## Primary references

- [node-postgres client options](https://node-postgres.com/apis/client): server statement/lock timeouts and client query response timeout.
- [node-postgres pool lifecycle](https://node-postgres.com/apis/pool): client options propagate through the pool; `release(true)` removes the connection.
- [PostgreSQL 16 statement and lock deadlines](https://www.postgresql.org/docs/16/runtime-config-client.html): statement cancellation and per-lock semantics.
- [PostgreSQL 16 command completion source](https://github.com/postgres/postgres/blob/REL_16_STABLE/src/backend/tcop/postgres.c#L2624-L2631): disables statement timeout before `CommitTransactionCommand()`.
- [PostgreSQL server signalling functions](https://www.postgresql.org/docs/16/functions-admin.html#FUNCTIONS-ADMIN-SIGNAL): explicit cancellation of the fixture's own observed backend.
- Installed `pg` 8.23.0 source was inspected: its non-pipelined query response timer does not cancel an already-sent server statement.
