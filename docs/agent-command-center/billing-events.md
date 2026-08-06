# Billing events

Stripe lifecycle processing already has signature validation, bounded raw bodies, idempotent claims, and operational alerts. Command-center Phase 1 does not alter that path and does not ingest billing events into tickets.

`BILLING_ENABLED=false` must remain unchanged until billing is separately authorized. Future billing intake may link event identifiers and safe metadata, but must never store full card data or make refunds, cancellations, or adjustments automatically.
