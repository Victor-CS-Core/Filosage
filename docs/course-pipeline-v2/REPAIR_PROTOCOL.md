# Repair Protocol

Machine source: `src/lib/course-pipeline/repair.ts`, `schemas.ts`, `src/app/api/courses/[courseId]/repair/route.ts`, and the repair transactions in `src/lib/firebase-server.ts`.

## Required sequence

1. Load the exact failed snapshot and report.
2. Confirm snapshot and contract versions.
3. Plan only issues whose repairability permits it.
4. Apply deterministic operations first.
5. Validate operation schema and allowed paths.
6. Reject when the current snapshot or any document fingerprint differs from the plan base.
7. Revalidate the affected subtree and full course.
8. Persist before/after hashes, operations, actor, idempotency key, and undo material.

The implemented deterministic limit is one pass per automatic issue code and is persisted on the course. The intended future semantic limit remains at most two constrained attempts. No unbounded repair loop is allowed.

## Current safe automatic scope

`POST /api/courses/[courseId]/repair` is flag-gated and applies only three deterministic, allowlisted changes: remove an unsupported lab (`CQ_LAB_001`), add a text fallback for an essential visual from the lesson's existing validated objective, summary, rationale, and takeaways (`CQ_VISUAL_001`), or remove an unsupported visual (`CQ_VISUAL_003`). It binds the plan to the aggregate snapshot and every course/lesson fingerprint, applies inside a document-store transaction (`firebase-server.ts` remains the Azure PostgreSQL adapter under that leftover name), writes before/after audit data, fully revalidates, and provides undo that refuses to overwrite newer edits. A missing lesson returns `LESSON_GENERATION_REQUIRED` instead of replacing unrelated content.

The authoring UI does not expose whole-course or whole-lesson regeneration as repair. It offers `Apply safe fixes` only when the current report contains one of the three allowlisted deterministic defects, explains that lesson text and author edits are preserved, and retains undo. All other blockers link to the affected lesson or require an explicit human decision. Snapshot staleness triggers revalidation rather than pretending to be a content repair.

Semantic patches and broad regeneration remain unavailable. Those issues are assisted/manual rather than falsely advertised as automatic. Ordinary generation failures retain their separate retry action because no accepted lesson exists to preserve yet.
