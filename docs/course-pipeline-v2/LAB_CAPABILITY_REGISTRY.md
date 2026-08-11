# Lab Capability Registry

Machine source: `src/lib/course-pipeline/labs/registry.ts`. Version: `lab-capabilities-v2.0.0`.

| Capability | V2 generation | Runtime | Progress | Fallback |
|---|---|---|---|---|
| Recognition v2 | Registered and optional when objective-appropriate | Implemented | Durable item evidence | Equivalent retrieval questions and explanations |

Legacy classification, sequence, scenario, and signal components remain renderable for existing content but are not advertised by the V2 capability registry because they do not yet satisfy the complete durable-progress contract. `code-tracing` and `code-runner` are not registered. No learner code executes in the application process.

Every V2 lesson stores `required`, `recommended`, or `not_applicable` with a rationale and objective IDs. Required missing practice blocks; recommended missing practice warns; not-applicable practice never denies publication. The model can emit only the registered Recognition schema, and invalid optional candidates are omitted rather than misrepresented as successful labs. Per-item responses are server-verified, receipt-bound, payload/idempotency-key-bound, and hydrated on reload before full lesson completion. Course and account deletion remove both evidence and retry records.
