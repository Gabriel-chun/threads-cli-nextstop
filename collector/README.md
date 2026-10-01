# Next Stop Live Collector V0.1

This collector keeps the data layer separate from the intelligence layer. Each scheduled run is a 12-hour collection window; the master database keeps accumulating unique posts across windows. The collector does not log in to Threads, does not use brand-account cookies, does not impersonate Googlebot or another crawler, does not rotate proxies, and does not bypass access controls. If the public page does not expose enough data, the run accepts that coverage gap.

## Schedule

GitHub Actions has two fallback schedule slots per hour. A cadence gate checks the latest successful archive and only runs collection when the previous successful run is at least 45 minutes old. This keeps the effective cadence roughly hourly while reducing gaps caused by delayed or dropped GitHub scheduled events. You can also run it manually from the Actions tab.

## Pipeline

```
queries.txt
  -> anonymous public Threads search page
  -> keep posts from the last 12 hours
  -> relevance_score >= 30
  -> deduplicate by permalink / post id
  -> content-level dedupe (Dedupe Counted)
  -> ticket-resale clean rule (Signal Counted)
  -> snapshot JSONL + CSV
  -> merge into accumulated master JSONL + CSV
```

The collector now runs deterministic dedupe + ticket-resale clean rules. Raw rows remain preserved; `dedupe_counted`, `signal_counted`, and `clean_exclusion_reason` record how each row moves through the pipeline. Higher-level semantic classification can still happen later against the clean master data.

## Queries

Edit `collector/queries.txt`. The initial set contains 10 venue/event/user-need queries.

## Downloads

Each successful workflow run uploads one artifact named like:

```
nextstop-threads-2026-09-26_043000Z
```

It contains:

- `snapshot_*.jsonl` — unique posts found in that run
- `snapshot_*.csv` — spreadsheet-friendly version of the same snapshot
- `master.jsonl` — deduplicated accumulated database
- `master.csv` — spreadsheet-friendly master
- `summary.json` — row counts and filter settings
- `failed_queries.txt` — queries that failed during this run
- `queries.txt` — the exact query set used

## Persistence

The master database is restored/saved using GitHub Actions cache and is also included in every downloadable artifact.

This is suitable for an MVP collector, not permanent archival storage. The next stage can mirror master/snapshots into Notion or another durable database.
