# Trend Tracking Project V0.1

Isolated upstream observation module for Next Stop Live.

Goal: identify which Artist / Event candidates are beginning to form observable links with transport, lodging, dispersal, return-trip and timing needs.

This module intentionally does not change the existing Collector, Signal Deck, Keyword Network or Observation Bundle semantics.

Pipeline:

```
Artist Seed
→ Event Candidate
→ Budgeted Threads Queries
→ Public Anonymous Retrieval
→ Dedupe / Edge Aggregation
→ Trend Snapshot
→ Observe / Watch / Active
→ MCP + Trend Radar
```

Source of truth remains GitHub archive. Notion sync is human-readable and non-blocking.

Security boundary:
- reuse existing logged-out Threads CLI;
- no private account login;
- no session/token cookies;
- no bypass of verification or rate limits;
- no new public write endpoint;
- read-only MCP surface.
