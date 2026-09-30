# Phase 2 — Next Stop Live Observation Automation

Event: `nextstop.observation.bundle.ready`

When the event arrives, use `data.run_id` and call:

```json
{
  "run_id": "<event data.run_id>",
  "evidence_limit": 16
}
```

through `get_observation_bundle`.

Do not read the master dataset first. Only drill down with existing signal tools if Bundle evidence is insufficient.

## ObservationDecision

Return exactly one:

- `no_change`
- `watch`
- `notable`
- `data_quality_issue`

### Policy

- `deterministic_facts` and `data_quality` are authoritative pipeline facts.
- `derived_annotations` are non-authoritative annotations; interpretations must be checked against evidence.
- Never treat incomplete coverage as zero.
- Never treat `coverage_complete=true` as adequate sampling. Inspect `sampling_quality`, `sample_count`, and `max_gap_minutes`.
- Never modify Raw, Clean, Dedupe, classifier, deterministic rules, Notion, or Collector.
- If a blind spot is found, report only `rule_candidate` or `classifier_candidate`.
- Never auto-publish, create affiliate actions, write back an Observation, or trigger Collector.

### Notification boundary

**no_change** — silent.

**watch** — silent by default; may remain only in the ChatGPT automation execution record.

**notable** — notify the user with an Observation Draft containing deterministic facts, evidence refs, explicit derived annotations, and uncertainty.

**data_quality_issue** — notify the user and name the deterministic issue: coverage, sampling, query failure, pipeline incompatibility, stale data, or another deterministic quality problem. Do not explain a trend.

Only `notable` and `data_quality_issue` may notify.
