# Next Stop Live Collector V0.2

Collector V0.2 uses an anonymous real Chromium browser as the production retrieval layer. It opens public Threads search pages without logging in and reads rendered post cards from the DOM. It does not use brand-account cookies, does not impersonate Googlebot, does not use stealth plugins, does not rotate proxies, does not bypass CAPTCHA/access challenges, and does not replay internal Threads GraphQL endpoints.

The downstream data pipeline remains stable:

```
Notion Collector Control
  -> anonymous Chromium public search page
  -> bounded page settle + at most 2 scrolls
  -> raw JSONL candidates
  -> 12-hour window + relevance threshold
  -> content dedupe
  -> ticket-resale clean rules
  -> snapshot
  -> accumulated master
  -> observation bundle
  -> Notion sync
```

## Collector modes

- `browser` — production V0.2 mode. Real Chromium, logged out, public DOM only.
- `http` — transparent HTTP client retained for diagnostics and isolated A/B testing only.

A/B tests use isolated state directories and never write test rows into the production master or Notion.

## Coverage semantics

A successful browser request can still return zero matching rows. That is treated as a coverage observation, not proof that discussion volume is zero. Browser diagnostics record each query's status, HTTP status, row count, final URL, and any visible login-wall/access-challenge condition.

## Schedule

The production GitHub workflow wakes at redundant schedule slots and uses the existing cadence gate. The effective target remains about one production collection every 2 hours.

## Persistence

Production snapshots, master files, run summaries, browser diagnostics, and observation bundles are archived in the repository. Downloadable workflow artifacts remain available for 30 days.

## Notion

Collector Runs and Query Run History record `Collector Mode`; Query Run History also records `Browser Hits`. Historical V0.1 fields remain in place so old runs stay readable.
