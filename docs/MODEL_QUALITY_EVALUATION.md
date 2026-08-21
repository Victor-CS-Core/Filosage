# Model-quality evaluation

This harness measures the real Filosage course-to-first-lesson generation flow against representative topics. It records endpoint success, latency, structural quality, the final execution profile, prompt version, recovery usage, and token-cost telemetry returned only to an authenticated owner evaluation request.

The suite is deliberately opt-in because it creates private evaluation courses and consumes OpenAI quota. It refuses known production hosts unless the operator adds a second explicit production override. Prefer a local or preview environment backed by a dedicated Azure PostgreSQL database.

## Dry run

```powershell
npm.cmd run eval:model-quality -- --dry-run
```

## Live run

Start the app with its normal server configuration, then use a short-lived owner session token:

```powershell
$env:MODEL_QUALITY_EVAL_LIVE="1"
$env:MODEL_QUALITY_EVAL_BASE_URL="http://127.0.0.1:3000"
$env:MODEL_QUALITY_EVAL_AUTH_TOKEN="<short-lived owner session token>"
npm.cmd run eval:model-quality
```

Run a subset with `MODEL_QUALITY_EVAL_CASES=morse-code,sql-debugging`. The built-in cases cover a procedural skill, a high-stakes consumer topic, and a technical diagnostic skill. A passing run completes every course-to-lesson flow and has a mean structural-quality score of at least `0.90`.

The JSON report is suitable for comparing prompt or model changes. Compare at least:

- completion and quality-gate pass rate;
- mean and tail latency;
- recovery rate, especially Sol recovery rate;
- cached input, cache-write, output tokens, and estimated cost;
- prompt version and execution profile for every attempt.

Do not paste a long-lived token into source control, terminal history, or a report. Evaluation courses are intentionally not auto-deleted, because cleanup against the wrong project would be destructive. Remove them through the normal owner UI after reviewing the outputs.
