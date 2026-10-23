# Collector resilience review and patch — 2026-10-23

Base: `2eb4de05beb059b7fbc9b35e16d17c8eba7d8085` (main).

## Scope and evidence

Reviewed the collector trigger/cadence, recent-search CLI integration, query retry
wrapper, coverage assessment, snapshot/master persistence, Notion configuration
and synchronization, observation/baseline generation, dashboard history/health,
trend rendering, deployment workflows, and write/event security boundaries.
This is a review of that end-to-end path, not a security certification of every
repository module or an audit of production secrets/provider settings.

The 10/21 outage was an availability gap in usable fresh source rows. Earlier
archives labelled some all-rejected collections observed/Success; those are not
measurements of zero demand. PR #63 repaired recent-source retrieval. This patch
adds failure isolation and truthful presentation; it does not backfill missing
observations or alter historical archive facts.

## Findings and fixes

| Priority | Location | Trigger and impact | Patch |
| --- | --- | --- | --- |
| P1 | `.github/workflows/nextstop-collector.yml` | Notion write failure failed the collect job, preventing the archive job from saving a valid downloaded artifact. | Bound Notion synchronization to five minutes, continue to archive, propagate the actual step outcome, then report failure **after** pushing source data. |
| P1 | `collector/archive_resilience.py` (new) | No named last-good snapshot; the latest attempt could contain unusable source data. | Preserve `last_good_snapshot.json`, `last_good_summary.json`, `last_good_observation.json` only for observed successful source quality. A later failed/partial attempt retains the previous backup. Sync failures are separate from source quality. |
| P1 | `dashboard/lib/signals.ts`, `collectorQuality.ts` | Partial was coerced to Success; failed attempts were removed; missing fields became zero; old all-rejected rows looked like demand collapse. | Preserve Partial/Failed markers and explicit source validity. Infer legacy all-rejected gaps from raw > 0, dedupe = 0, clean = 0. Missing metric values remain unavailable. Legitimate clean zero with accepted candidates remains zero. |
| P2 | `TrendChart.tsx`, `app/page.tsx`, `i18n.ts` | Uniform index spacing hid elapsed hours and polylines connected incompatible collection methods. | Use timestamps for x positions; split lines at invalid samples, intervals over three hours, and pipeline changes. Show isolated valid points and bilingual gap explanations; unavailable latest metrics show a dash. |
| P2 | `signals.ts`, `collectorQuality.ts` | Health accepted four-hour-old and arbitrarily future-dated timestamps, and did not consistently check degraded/partial source or Notion failure. | Three-hour freshness window for the two-hour target, five-minute clock tolerance, consistent source/sync health; remove application revalidation caches on health/current/history requests. |
| P2 | `collect.sh` | Recent mode inherited two shell attempts multiplied by eight CLI retries per query, amplifying source outages. | Default recent mode to one shell invocation and a CLI retry budget of one; retain diagnostics/failed query recording. Top-mode legacy defaults remain configurable. Ignore query comments. |
| P2 | `nextstop-collector.yml` | Primary cron may be delayed or dropped. | Add completion heartbeats from the independently scheduled Trend Tracking and Language Need Exploration workflows. Same concurrency group, latest-main checkout, and 120-minute attempt gate apply. Same-repository/main guard; recovery provenance remains unknown/ineligible rather than scheduled. |

## Safety and operational boundaries

- Heartbeats deliberately exclude Signal Deck, Keyword Network, and Observation
  Event workflows: those depend on collector completion and could create a loop.
  The two selected workflows do not subscribe to collector completion.
- Heartbeats still share GitHub infrastructure and their existing schedules
  (Trend Tracking every eight hours; exploration daily). They add recovery
  opportunities, not a guaranteed independent two-hour clock. No additional
  source collection is forced by this patch. All triggers wait 120 minutes from
  the latest archived attempt, including an unsuccessful source attempt.
- An earlier external Collector Watchdog update acknowledged enabled state, but
  a subsequent lookup could not access that task. It is **not counted as verified
  backup**. Establishing a verified external scheduler remains an operational gap.
- Notion configuration lookup remains a fail-closed prerequisite. An API outage
  before a downloadable snapshot exists, a whole-job cancellation, artifact
  upload failure, or a repository push failure cannot be repaired by the
  downstream-sync isolation here. Existing archives and last-good files remain;
  these conditions must not be advertised as healthy collection.
- A successful source archive with failed Notion sync is valid backup evidence,
  but has `notion_sync_status=failure` and the overall workflow reports failure.
  No automatic re-write/retry of partially completed Notion operations is added.
- Last-good files are created on the next observed successful source archive;
  the current patch does not fabricate or rewrite production archive data.
  The summary's original `run_at` identifies backup age. Treat backup data as
  historical, never as a current sample. Master download remains the cumulative
  authoritative master; an empty current snapshot does not erase master rows.
- Recent mode covers one public SSR search window, not every Threads post.
  Gaps cannot be reconstructed reliably. The exact external platform change
  time is not established by repository evidence.
- Existing write-intent/origin validation and event bearer-token comparison were
  inspected and their regression tests pass. Browser origin checks are CSRF
  controls, not user authentication. No credentials or permissions were changed.
- Dashboard production deployment follows successful Dashboard CI on main.
  Local builds do not prove production credentials or runtime bindings work.

## Validation

- Python collector suites used by Hardening CI, including resilience/fault tests.
- All dashboard `lib/*.test.ts` and `lib/mcpEvents/*.test.ts` tests.
- TypeScript checking, bilingual dictionary parity and production-copy checker.
- Next production build; Cloudflare/vinext production build and client-secret
  boundary checker. Local build reports absent runtime secrets, as expected in
  this unauthenticated local environment; no live Notion write was attempted.
- Failure fixtures: valid source plus failed Notion sync saves backup and reports
  failure; subsequent stale attempt preserves backup; rate-limited query stays
  within bounded shell attempts; failed and Partial history points survive;
  all-resale real zero remains zero; missing/future/overdue samples are rejected;
  chart lines split at gaps and method changes; all triggers obey cadence.
- The standalone patch includes source, regression tests, CI changes, and this
  review. It excludes itself and generated build/dependency files. Apply from
  the stated base with `git apply --check patches/2026-10-23-collector-resilience.patch`
  after obtaining the patch externally (the target patch path need not exist).
