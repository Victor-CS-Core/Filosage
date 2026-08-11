# Visual Support Policy

Machine source: `src/lib/course-pipeline/visuals/registry.ts`. Version: `visual-support-v2.0.0`.

Supported structured HTML visuals are concept contrast, process flow, comparison matrix, worked-example trace, and prerequisite map. The course banner is decorative metadata and never counts as instructional support.

Applicability is `essential`, `helpful`, `decorative_only`, or `not_useful`.

- Essential: publication requires the registered visual or an equivalent accessible text/table fallback.
- Helpful: failure produces a warning when the lesson remains accurate and usable.
- Decorative only: ignored by instructional-support metrics.
- Not useful: no visual is requested merely to meet a count.

Structured HTML is preferred for labels, factual relationships, processes, comparisons, and traces. AI image generation is not used for exact text, geometry, equations, charts, or architecture. V2 persists objective IDs, applicability, rationale, policy version, and an optional accessible text/table fallback in the visual plan; each generated visual separately stores its registered type, version, objective mapping, and render content. Existing renderers provide semantic lists/tables and speech summaries, and the learner shows the plan fallback when an essential visual is unavailable. Remaining release evidence is complete keyboard/screen-reader/theme/mobile testing for every registered form and live proof that generated plans select visuals appropriately.
