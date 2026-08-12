# Email ingestion

Email ingestion is deferred. Filosage currently exposes support and legal addresses through `mailto:` links but has no configured inbound email provider.

Before implementation, select a provider and document mailbox ownership, signature verification, thread identifiers, duplicate handling, retention, attachment quarantine and malware scanning, delivery retries, and outbound approval. Phase 1 must not poll or scrape a mailbox.

The full future design and gauntlet gates are recorded in the [hybrid semi-autonomous implementation plan](HYBRID_SEMI_AUTONOMOUS_IMPLEMENTATION_PLAN.md). The preferred starting direction is iCloud forwarding to separate private Support and Legal receiving addresses, followed by a signed provider webhook. This is not an active integration and must not be configured until the owner explicitly starts that plan.
