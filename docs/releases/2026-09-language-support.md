# Requested course language: September release boundary

The application interface remains English. Eligible creators can request a course language or bilingual pairing. Accepting that request and passing automated checks do not establish translation accuracy, fluent teaching, cultural suitability, or full interface localization. This release makes no universal supported-language or native-quality claim.

English is the default instruction language. The bounded automated regression set covers English, Spanish, English/Spanish, Japanese, English/Japanese, Greek, English/Greek, and Arabic text. These are tested input cases, not a certified launch catalog. Actual catalog entries require review by people competent in the requested languages before language-quality acceptance is complete. No non-English launch catalog has been certified by this implementation.

| Case | Automated expected outcome | Remaining evidence |
| --- | --- | --- |
| English and Spanish | Reject clearly opposite-language instructional prose; preserve concise valid instructions | Fluency, correctness, ambiguous Latin-language cases |
| Bilingual requests | Each substantial instructional field must contain meaningful evidence of each requested language; headings can be short | Equivalent instructional meaning and balanced teaching, beyond character distribution |
| Japanese | Count Han, Hiragana, and Katakana as alternative writing systems; tiny script padding cannot validate an English body | Natural Japanese usage and actual catalog review |
| Greek and STEM | Preserve requested Greek prose, isolated symbols, short adjacent variables in explicit STEM context, and quoted/fenced examples | Domain correctness and mixed-language instructional quality |
| Arabic | Preserve Arabic letters, diacritics, and natural direction markers | Browser layout, mixed-direction numbers/tables, accessibility and competent RTL content review |
| AI/API teaching | Preserve ordinary tool-call vocabulary, API identifiers, and inert quoted/fenced role syntax | Actual lessons remain subject to content and security review |
| Other languages | Existing script checks remain; no confident EN/ES evidence means no Latin-language mismatch verdict | Language-specific fixtures and competent content review before support claims |

Instructional fields are evaluated separately. Course topics, IDs, source metadata, citations, code, quotations, and example-only fields cannot certify surrounding instruction. Short or ambiguous text is not rejected merely for lacking length. The 40-letter single-language and 80-letter bilingual evidence thresholds are confidence cutoffs for mismatch checks, not minimum lesson lengths or quality scores. Script checks cannot distinguish every language sharing a script. The exported evaluation result always requires language review, including when no mismatch is detected; this flag describes the heuristic's limitation and does not implement an additional publication approval workflow.

A substantial instructional body containing only quoted or coded examples cannot erase all language evidence and pass; a neutral label or wrong-language preface does not certify the body. A concise complete instruction with confident requested-language evidence can introduce a long example, and short standalone instructions remain valid. English/Spanish evidence is assigned within sentence/phrase boundaries with duplicate words discounted consistently in both the evidence count and comparison denominator; repeated function words are not a translated explanation. Fence matching respects the opening marker's length, and deliberate single-quoted examples are preserved along with double-quoted ones.

Display sanitization removes malformed characters and unexpected unquoted script runs and cuts actual unquoted control fragments. It preserves legitimate educational tool text and literal examples. A language mismatch that cannot be repaired by these operations is not labeled as a display repair.

One integration question remains: `src/lib/lesson-interactions.ts` replaces generated sequence-interaction prompts with a fixed English instruction during curation. That is application-supplied practice guidance, not generated translated prose. Review must decide whether it belongs to the intentional English interface boundary or needs language-aware guidance before asserting an entirely translated learning experience.

Local fixtures do not prove hosted browser presentation, provider generation quality, catalog review, or production behavior. Candidate review uses the one-app blue/green deployment contract; no separate QA site is required.
