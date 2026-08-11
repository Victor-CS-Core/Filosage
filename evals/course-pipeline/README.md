# Course Pipeline Evaluations

`dataset/v1.ts` is the stable 100-case request corpus. `scorers/invariants.ts` scores contract structure without comparing generated prose. Recorded provider fixtures and reports belong under `fixtures/` and `reports/`; live runs must record dataset, contract, prompt, and model versions.

Live execution is intentionally separate from regular CI because it is nondeterministic and cost-bearing.
