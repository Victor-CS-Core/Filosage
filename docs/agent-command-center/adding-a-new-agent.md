# Adding a new agent

Do not enable a new agent by adding a prompt alone. A proposal must define:

1. One bounded domain and approved knowledge sources
2. Input schema and untrusted-content boundary
3. Structured output schema and confidence handling
4. Prohibited actions
5. Per-agent kill switch and rate/retry limits
6. Policy version recording
7. Evaluation set, injection cases, and low-confidence cases
8. Human review and audit behavior

The agent must remain draft-only until measured acceptance and rejection behavior is reviewed.
