# Command Center v2 contract-suite exclusions

The focused Command Center v2 suite is deliberately local, deterministic, and
single-process. Passing it does not prove:

- Cloudflare D1 ordering, cursor, transaction, or multi-instance concurrency
  semantics. Those require a D1 integration fixture initialized with
  `infra/cloudflare/d1/001_document_store.sql`.
- Hosted document-store ordering, aggregation-count, transaction, and cursor
  behavior. The fixture exercises the shared adapter contract through the
  local store, not a hosted D1 database.
- Cloudflare Google OAuth reauthentication redirects and
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
separate D1, OAuth/browser-resume, mixed-version,
live-model, and production checks that actually ran.
