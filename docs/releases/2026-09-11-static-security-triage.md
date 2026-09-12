# Static security finding triage — September 11, 2026

This review accounts for all **43 entries** retained from the earlier OpenGrep result: three intentional fixture errors, eight SSRF errors and 32 warnings. Counts below refer to original entries, not the number of current call sites. Source references describe integrated commit `4d872dc01b1c0deeea6b31914b1607f9e6aa5bc1`; older line numbers were checked against current behavior. No raw console output, private source excerpts or credentials are included.

Two availability problems were reproduced and repaired. The remaining reviewed entries did not demonstrate another release vulnerability. This is finding triage, **not a complete or clean security scan**. It does not close incomplete scanner results, establish hosted security, or justify excluding these files from future analysis.

## Intentional fixtures and browser fetches

The three `eval-nodejs` errors are the deliberately vulnerable `input.js`, `input.ts` and `input.tsx` fixture cases from the old scanner harness. They are test evidence, not application execution paths.

All eight `node-ssrf` matches execute in client components through effects or event callbacks. Their callers construct same-origin API paths; none supplies a server-side network destination. The browser classification does not replace authorization in the destination APIs.

| Entries | Current evidence | Disposition |
| --- | --- | --- |
| 1 | [Command Center V2:483](../../src/app/admin/command-center/CommandCenterV2.tsx#L483), callers at 526–886 | Fixed `/api/admin/command-center/` paths; dynamic IDs encoded. |
| 1 | [Command Center:298](../../src/app/admin/command-center/page.tsx#L298), callers at 329–638 | Same local API construction, including resumed public replies. |
| 2 | [Admin:204](../../src/app/admin/page.tsx#L204) and [230](../../src/app/admin/page.tsx#L230) | Encoded user/report IDs after fixed API prefixes. |
| 1 | [Course map:142](../../src/app/course/[topic]/page.tsx#L142), callers at 154, 265 and 356–703 | IDs are interpolated after fixed local prefixes; they cannot choose an external authority. This is not a claim that every ID is encoded. |
| 1 | [LearnerHome:107](../../src/components/LearnerHome.tsx#L107), fixed callers at 114–116 | Former home-page finding moved with the component split; progress, public-course and own-course paths remain local literals. |
| 1 | [Pricing:206](../../src/app/pricing/page.tsx#L206), kind at 191 | `checkout` or `portal`, selected by local button handlers. |
| 1 | [FlashcardStudio:112](../../src/components/flashcards/FlashcardStudio.tsx#L112), callers at 126–326 | Local flashcard/course/progress paths; dynamic IDs encoded. |

## All 32 warning entries

`regex-dos` accounts for 28 warnings; the remaining four are `node-timing-attack`, `node-insecure-random-generator` and two `layer7-object-dos` matches. A warning label alone is not evidence of exploitation.

| Entries | Current evidence | Dataflow and conclusion |
| --- | --- | --- |
| 3 | [Greek notation:50–67](../../src/lib/content-language.ts#L50) | **Fixed:** context was rescanned for each short Greek run. The bounded run regex was harmless by itself; repeated whole-string context work was quadratic. |
| 2 | [Language policy:270,273](../../src/lib/content-language.ts#L270) | Predefined keyword/script predicates; no nested ambiguous repetition or attacker-selected regex. |
| 2 | [Diagram checks:64,92](../../src/lib/lesson-quality.ts#L64), shared pattern at 10 | **Fixed:** multiline leading whitespace repeatedly scanned remaining blank lines. |
| 2 | [Deployment run ID:43](../../scripts/azure-blue-green.mjs#L43), [database identifier:6](../../scripts/provision-azure-postgres-roles.ts#L6) | Operator inputs; anchored digits are linear, database names capped at 63 characters. |
| 2 | [Authentication audit:55–56](../../src/lib/auth-audit.ts#L55), patterns at 43–44 | Fixed-length UUID/HMAC validation, no ambiguous repetition. |
| 1 | [Snapshot cursor:248](../../src/lib/command-center-schemas.ts#L248) | Anchored base64url alphabet capped at 4,096 characters before decoding. |
| 2 | [Banner deletion:71](../../src/lib/course-banner-storage.ts#L71), [banner reuse:70](../../src/lib/course-banners.ts#L70) | Exactly 32 hexadecimal characters. |
| 1 | [Course DTO:39](../../src/lib/course-dto.ts#L39), also 156, 262, 278 | Historical line 72 no longer identifies a regex. All four current regex sites validate bounded criterion/reason IDs or fixed-length proof/asset hashes. |
| 4 | [Document queries:486](../../src/lib/document-store.ts#L486), 504, 544, 579 | Anchored collection/field alphabets capped at 80/120 characters; page cursor additionally capped at 1,500. No nested ambiguous repetition. |
| 3 | [Link intent:110](../../src/lib/identity-link-policy.ts#L110), [390–391](../../src/lib/identity-link-policy.ts#L390) | Token alphabet capped at 128; identity/email hashes exactly 64 hexadecimal characters. |
| 1 | [Flashcard prompt:204](../../src/lib/flashcards.ts#L204), pattern at 201 | Fixed alternatives with disjoint whitespace/digit runs. Input schemas cap prompts at 240 characters and decks at 200 cards; generated decks at 24. |
| 1 | [Learning objective:862](../../src/lib/learning-design.ts#L862), pattern at 435 | Anchored fixed alternatives, not an unbounded backtracking construction; normal objective schema caps at 400 characters. |
| 1 | [Markdown fence:99](../../src/lib/markdown.ts#L99) | Anchored whitespace check runs on already split individual lines, unlike the repaired multiline diagram pattern. |
| 3 | [Release identity:112–115](../../src/lib/release-capabilities.ts#L112) | Trusted release metadata checked with delimiter-separated or single-character-class patterns and a fixed-length hash; no nested ambiguous repetition. |
| 1 | [Deletion lease:135](../../src/lib/account-deletion.ts#L135), token creation at 123 | Compares a server-generated `randomUUID` with its stored transaction lease. No attacker-supplied guess or secret-prefix oracle was identified. |
| 1 | [Learner notification:70](../../src/lib/learner-storage.ts#L70) | `Math.random` differentiates storage notifications. Authorization uses canonical identity, generation/revision and abort state; this suffix grants no access. |
| 2 | [Publication issues:126–127](../../src/lib/publication-assessment.ts#L126) | Fixed callbacks filter an array constructed by internal validation. No attacker-provided function or coercion callback; outline/lesson schemas bound normal stored content. |

## Repairs, exposure and verification

Both repairs are in implementation commit `28bea973595bb6f50b0a74dc4240f92da42d87f5`, integrated as `4d872dc01b1c0deeea6b31914b1607f9e6aa5bc1`.

Greek inspection and sanitation now compute mathematical context once per prose operation, preserving isolated symbols, short adjacent notation, real Greek-language requests and rejection of unrelated Greek prose. Diagram detection now keeps leading indentation on one line while retaining Unicode whitespace, CRLF, all JavaScript line terminators, fenced syntax and direction tokens on subsequent lines.

Exposure is generated or stored lesson content. [Lesson content schemas](../../src/lib/validation.ts#L133) cap normal bodies at 24,000 characters, but that bound still permitted substantial synchronous work. Generated content reaches [quality checks](../../src/app/api/generate-lesson/route.ts#L587) after preparation; schema-valid stored lessons reach them through [publication readiness](../../src/lib/publication-readiness.ts#L27). No direct anonymous request-body exploit or production incident was demonstrated.

Three local before/after samples used Node 24.13.1 on Windows, with the unchanged root helpers followed by the repaired helpers in the same process. Greek input was 8,000 repetitions of `αβ ` (24,000 characters). Diagram input was `Intro`, 23,990 newlines and `End.` (23,999 characters); it must remain classified as non-diagram prose. These are adversarial-shaped local measurements, not production throughput estimates.

| Operation | Before median | After median |
| --- | ---: | ---: |
| Greek sanitation | 315.23ms | 10.64ms |
| Greek inspection | 350.66ms | 17.44ms |
| Introduction lesson quality, blank-heavy input | 707.19ms | 56.74ms |

The new [Greek regression](../../tests/content-language.spec.ts#L136) failed before with 16 context scans instead of one. The [diagram regression](../../tests/lesson-pedagogy.spec.ts#L16) failed because its match consumed 2,000 preceding blank lines. Both now pass without wall-clock assertions; output and whitespace cases remain covered. The two complete contract files pass **28/28**, with TypeScript, focused ESLint/Oxlint and diff checks passing. The coordinator independently reran the same 28 contracts after integration. No new browser test, remote scan, CI run or production change was required for these repairs.
