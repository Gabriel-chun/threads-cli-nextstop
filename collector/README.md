# Next Stop Live Collector V0.1

This collector keeps the data layer separate from the intelligence layer. Each scheduled run is a 12-hour collection window; the master database keeps accumulating unique posts across windows.

## Schedule

GitHub Actions runs at **00:30 and 12:30 Taiwan time** every day. You can also run it manually from the Actions tab.

## Pipeline

```
queries.txt
  -> anonymous Threads search
  -> keep posts from the last 12 hours
  -> relevance_score >= 30
  -> deduplicate by permalink / post id
  -> snapshot JSONL + CSV
  -> merge into deduplicated master JSONL + CSV
```

The collector does **not** run the rule-based classifier. GPT/ChatGPT analysis can happen later against the raw master data.

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
