# Next Stop Live Collector V0.4

Production retrieval has been restored to the last known high-coverage anonymous mode that was working before the 2026-10-01 hardening regression.

The production query remains exactly:

```
演唱會
```

No additional keywords are added.

## Retrieval

Production uses:

1. crawler-rendered Threads SSR search;
2. logged-out Threads persisted GraphQL search pagination;
3. depth 3 total search windows.

Google site fallback remains disabled. No login/session cookies are required for the production collector.

This is the same retrieval behavior that produced the stable 16–27 raw rows per run before the coverage regression. The downstream pipeline is unchanged:

```
演唱會
  -> SSR + logged-out GraphQL depth 3
  -> relevance threshold
  -> permalink/content dedupe
  -> ticket-resale clean rules
  -> snapshot
  -> accumulated Master
  -> Observation
  -> Notion sync
  -> Daily Signal Deck
```

An empty retrieval run never clears prior Master data. Coverage zero is marked degraded.

## Schedule

The GitHub workflow keeps the existing effective target of about one collection every 2 hours.

## Data responsibility

Retrieval only affects candidate coverage. Clean rules, Master accumulation, Signal Deck review, Relevant / Irrelevant feedback, and weekly relevance learning remain separate downstream layers.
