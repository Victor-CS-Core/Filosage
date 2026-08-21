# Security Threat Model

## Preserved controls

- Server-side ownership and plan authorization on course, lesson, banner, repair, validation, manual review, and publish mutations.
- Recent owner authentication and audit for quality override and manual-review decisions.
- Same-origin mutation checks and bounded JSON bodies.
- Deny-all direct browser document-store access.
- Structured Zod model output, bounded tokens/timeouts, `store:false`.
- Topic/source content isolated as untrusted data and input/output moderation.
- CSP, public DTO redaction of source notes, React Markdown without raw HTML, and typed visual data rather than raw SVG.
- No untrusted code execution.

## Threats and status

| Threat | Status |
|---|---|
| Topic/source prompt injection | Prompt isolation and adversarial deterministic fixtures present; full live API eval pending |
| Generated script/event markup | Raw HTML is not enabled in the Markdown runtime; live malicious-output fixture pending |
| Malicious SVG | Raw SVG unsupported; generated instructional visuals are typed data |
| Dangerous URLs | Only public HTTPS URLs present in OpenAI `url_citation` annotations and covered by the versioned server authority registry can become sources; local hosts, credentials, IPs, and lookalikes are rejected |
| SSRF | The application does not fetch or proxy source URLs; research uses the provider web-search tool with an allowlisted domain set, and displayed deep links remain outbound link-only references |
| Cross-course substitution | Ownership and canonical lesson membership checks present; full emulator matrix pending |
| Stale publish | Exact candidate and document fingerprints are rechecked transactionally; nested IDs invalidate readiness |
| Stale repair overwrite | V2 patch and undo transactions check exact course/lesson fingerprints and reject newer edits |
| Duplicate mutation | Generation replay recovers completed course/lesson results; publication and owner override bind keys to the snapshot transaction |
| Oversized model output | Token and schema field bounds present |
| Sensitive logging | New pipeline events/rejection logs use privacy-safe actor hashes; UIDs remain only in protected audit/access-control records |

Private creation has no human-review gate. It runs provider web research, server provenance/reputation checks, course-plan grounding, lesson claim-support evaluation, and bounded automatic repair before saving. A later explicit public-release action remains separate: high-stakes publication approval is owner-only, recently authenticated, exact-snapshot bound, and audited. `COURSE_PUBLICATION_V2` remains conservative until live security evaluation and transaction/emulator coverage are complete.
