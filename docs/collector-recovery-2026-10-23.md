# Public recent-search recovery and guarded watchdog

The primary collector now opts into `search --type recent --depth 1` and uses
the publicly returned `/search?q=...&serp_type=default&filter=recent` HTML.
The `--type` flag previously existed but did not affect retrieval. Top search
remains available for other callers; it is not an automatic fallback for recent
collection. Recent mode does not call the legacy fixed-ID GraphQL query or an
external search engine.

Two bounded, anonymous page inspections on Oct 23 established:

| Public page, query 演唱會 | Matching posts | Matching posts within 12 hours |
| --- | ---: | ---: |
| Default search | 15 | 0 |
| Recent-filtered search | 18 | 14 |

These are source validation observations, not a full production collector run.
No post text, identities, transient request tokens, or raw HTML are committed.
An optional Go test replays the already downloaded page offline. Synthetic tests
verify the URL filter, source diagnostics, and that recent mode makes one GET
without GraphQL calls. Existing 12-hour acceptance, scoring, cleaning, dedupe,
and master preservation rules remain unchanged. Recent mode has its own pipeline
version and collector mode, so baselines do not mix it with legacy depth3 data.

## Schedule recovery

Native GitHub scheduling remains enabled. The existing hourly ChatGPT Collector
Watchdog is the independent recovery mechanism; no second collector is created.
It must use the latest archived *attempt* for age checks, including stale/failed
source attempts, so failures cannot produce a retry storm.

The primary workflow carries `recovery-safe-main-v1`, checks out current `main`
for both cadence and collection, and applies its 120-minute cadence gate to all
trigger types. A workflow-file update on main may start the cadence check but
cannot bypass that gate. This also supplies a versioned, recovery-safe run for
the watchdog to rerun if native schedule delivery is late.

The watchdog must check that no collector run is active, verify the safe marker
in the selected run's workflow version, and rerun only its cadence job (with
dependent jobs) when the latest archived attempt exceeds 150 minutes. It must
not replay old unmarked workflows, rerun collect/archive directly, dispatch a
new workflow, modify repository files, or change the time gate. If permission or
safe-run selection fails, report it rather than improvising another trigger.

Reruns retain their original GitHub event/provenance. A rerun of a push/manual
run therefore remains excluded from scheduled trend baselines. Collection
completeness is limited to a single public recent-search window; it is not an
exhaustive feed. GitHub native cron and the hourly watchdog are best effort,
not a guarantee of exact two-hour start times.
