# Command Center v2 contract-suite exclusions

The focused Command Center v2 suite is deliberately local, deterministic, and
single-process. Passing it does not prove:

- Azure PostgreSQL ordering, cursor, transaction, or multi-instance concurrency
  semantics. Those require an ephemeral PostgreSQL database initialized with
  `infra/azure/database/001_document_store.sql`.
- Firebase/Firestore ordering, aggregation-count, transaction, and cursor
  behavior. The fixture exercises the shared adapter contract through the
  local store, not a hosted Firestore project.
- Azure Container Apps Easy Auth or Google reauthentication redirects and
  `auth_time` claims. The local suite proves only missing, wrong-identity, and
  current allowlisted proof behavior.
- A real browser redirect/resume cycle for approval reconciliation or learner
  publication. Local tests prove the payload-bound operation records and exact
  replay responses, while the hosted identity round trip remains external.
- Live OpenAI model quality. The focused server clears `OPENAI_API_KEY` and uses
  the local structured-output stub. The separately approved two-repetition live
  evaluation remains the model release gate.
- Deployment, hosted configuration, feature activation, provider setup, or
  production health.
- Mixed-version rollout behavior while old and new application instances share
  records. Schema compatibility is tested in one application version only.

These are exclusions, not skipped passing tests. Release evidence must list the
separate PostgreSQL, Firestore, Easy Auth/browser-resume, mixed-version,
live-model, and production checks that actually ran.
