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

`POST /api/courses/[courseId]/repair` is flag-gated and applies only two deterministic, allowlisted removals: an unsupported lab (`CQ_LAB_001`) or unsupported visual (`CQ_VISUAL_003`). It binds the plan to the aggregate snapshot and every course/lesson fingerprint, applies inside a Firestore transaction, writes before/after audit data, fully revalidates, and provides undo that refuses to overwrite newer edits. A missing lesson returns `LESSON_GENERATION_REQUIRED` instead of replacing unrelated content.

Semantic patches and editor deep links remain incomplete. Those issues are assisted/manual rather than falsely advertised as automatic. The legacy repair-all regeneration control is hidden once a V2 report exists and is not described as a typed patch.
