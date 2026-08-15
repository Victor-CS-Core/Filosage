// Course creation can run research and bibliographic discovery in parallel,
// five parallel source checks, structural
// recovery, two grounding evaluations, and one evidence-specific correction.
// Keep the idempotency lease above that complete bounded envelope, and reserve
// enough budget for the maximum configured output across those stages plus
// input-token headroom.
export const COURSE_OUTLINE_RESERVATION_LOCK_MS = 20 * 60_000;
export const COURSE_OUTLINE_RESERVE_COST_MICROS = 1_500_000;
export const CONTENT_MODERATION_REQUEST_TIMEOUT_MS = 20_000;
