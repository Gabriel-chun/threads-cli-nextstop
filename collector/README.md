# Next Stop Live Collector V0.3

Collector V0.3 uses two conservative public retrieval paths for the same query set and merges them before the existing clean/dedupe pipeline:

1. anonymous real Chromium, logged out, reading the rendered public Threads DOM;
2. a transparent HTTP client reading the public Threads search page.

Production currently keeps the broad `演唱會` query only. V0.3 does **not** add more keywords.

The collector does not use brand-account cookies, Googlebot impersonation, stealth plugins, proxy rotation, CAPTCHA bypass, or internal Threads GraphQL pagination.

## Production flow

```
Notion Collector Control
  -> same query (currently: 演唱會)
  -> Anonymous Chromium public DOM
  -> Transparent public HTTP
  -> merge raw candidates
  -> permalink/content dedupe
  -> 12-hour window + relevance threshold
  -> ticket-resale clean rules
  -> snapshot
  -> accumulated master
  -> observation bundle
  -> Notion sync
```

Overlapping posts from browser + HTTP are merged downstream. Their `retrieval_sources` are preserved, so one post can show both `threads_browser_dom` and `threads_public_html`.

## Collector modes

- `hybrid` — production mode. Runs both conservative public retrieval paths and merges them.
- `browser` — anonymous Chromium only, retained for diagnostics.
- `http` — transparent public HTTP only, retained for diagnostics.

## Coverage semantics

A browser HTTP 200 with no rendered post cards is not treated as zero market demand. In hybrid mode, the HTTP path still contributes candidates. A run is marked `coverage_status=degraded` only when the **combined** hybrid raw set is empty.

`collector/raw/hybrid_diagnostics.json` records browser rows, HTTP rows, merged raw rows, merged unique candidates, and hard query failures.

## Schedule

The production GitHub workflow keeps the existing cadence gate: target about one real collection every 2 hours.

## Persistence

Production snapshots, master files, run summaries, hybrid/browser diagnostics, and observation bundles are archived in the repository. Master remains append/merge oriented; an empty retrieval run never clears prior Master data.
