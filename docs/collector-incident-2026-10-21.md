# Collector source degradation, 2026-10-21

All times below are Asia/Taipei. Investigation used existing Git history,
Actions logs, and archived snapshots only; it did not dispatch collection.

| Archived run | Raw rows | Clean signals | Master rows |
| --- | ---: | ---: | ---: |
| Oct 21 15:17 | 104 | 19 | 3,023 |
| Oct 21 17:37 | 34 | 0 | 3,023 |
| Oct 23 03:28 (scheduled) | 35 | 0 | 3,023 |
| Oct 23 06:02 (manual) | 33 | 1 | 3,024 |
| Oct 23 08:47 (manual) | 34 | 0 | 3,024 |

The retrieval, filtering, and workflow code did not change between the last
productive and first empty runs. Diagnostic changes on Oct 22 happened after
the degradation started. Normal snapshots immediately before the incident
attribute all accepted candidates to `threads_ssr`; therefore GraphQL failure
alone is not established as the incident's cause.

The Oct 23 08:47 summary rejects all 34 rows as `older_than_window`, with zero
score, timestamp-parsing, or identifier rejections. Its source diagnostics show
SSR still returning posts, but no posts within 12 hours; all three page-two
requests report `graphql_errors`. The public search surface changed in freshness
and volume. A particular platform change, cache cause, or expired persisted
query ID cannot be established from the retained aggregate records.

## Corrections

- Aggregate page diagnostics before assessing coverage. Fresh SSR candidates
  plus a failed page now mean partial coverage, rather than full observed coverage.
- Require both scheduled provenance and healthy source quality for baseline
  eligibility. Use that final output consistently in the observation and archive.
- Preserve an observation's explicit false eligibility when history says true;
  reject previously archived stale/degraded/partial samples during baseline reads.
- Record degraded observations and Partial Notion/history status. After saving
  the immutable archive, mark a stale/empty collector workflow as failed instead
  of showing a healthy green result. Partial retrieval produces a warning.
- Remove collection on workflow-file pushes. Manual dispatch now uses the same
  two-hour interval as scheduled collection, preventing accidental forced runs.

The existing SSR retrieval, search terms, score threshold, 12-hour window,
master rows, and schedule frequency are unchanged. Archive files are not rewritten.

## Verification and remaining limit

The coverage tests replay the actual stale summary and source diagnostics.
Other regression tests execute the workflow cadence and post-archive health
scripts with temporary local files. No test contacts Threads or Notion.

These changes repair health reporting and baseline integrity. They do not claim
to restore upstream search freshness. Recovery requires subsequent normal
scheduled archives to contain fresh accepted rows and a growing master. An
isolated manual result or successful cadence-only job is insufficient evidence.
