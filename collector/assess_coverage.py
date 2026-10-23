#!/usr/bin/env python3
"""Assess archived retrieval quality without fetching or changing source rows."""
import argparse
import json
from pathlib import Path

OK_PAGE_STATUSES = {"ok", "no_more_pages", "cursor_unavailable_or_unchanged"}
UNHEALTHY_COVERAGE = {"stale", "degraded", "partial"}


def quality_allows_baseline(summary):
    # Older archives may lack coverage, but recorded rejection/failure evidence
    # must override historical success/eligibility flags.
    if summary.get("coverage_status") in UNHEALTHY_COVERAGE:
        return False
    if summary.get("source_failure_count", 0) or summary.get("failed_query_count", 0):
        return False
    diagnostics = summary.get("filter_diagnostics") or {}
    if summary.get("raw_rows", 0) > 0 and diagnostics.get("accepted_raw_rows") == 0:
        return False
    if ("filter_diagnostics" not in summary and summary.get("raw_rows", 0) > 0
            and summary.get("snapshot_unique_rows") == 0):
        return False
    return True


def assess(summary, diagnostics, queries, failed_queries):
    result = dict(summary)
    reports = diagnostics.get("queries") or []
    pages = [page for report in reports for page in report.get("pages", [])]
    failures = [page for page in pages if page.get("status") not in OK_PAGE_STATUSES]
    reported = {report.get("query") for report in reports if report.get("pages")}
    missing = sorted(set(queries) - reported)
    raw = int(summary.get("raw_rows") or 0)
    accepted = int((summary.get("filter_diagnostics") or {}).get("accepted_raw_rows") or 0)
    if raw == 0:
        coverage = "degraded"
    elif accepted == 0:
        coverage = "stale"
    elif failures or missing or failed_queries:
        coverage = "partial"
    else:
        coverage = "observed"
    result.update(
        coverage_status=coverage,
        run_status="Failed" if queries and len(failed_queries) >= len(queries)
                   else "Success" if coverage == "observed" else "Partial",
        source_failure_count=len(failures),
        failed_query_count=len(failed_queries),
        missing_diagnostic_queries=missing,
        source_failure_kinds=sorted({str(page.get("status") or "unknown") for page in failures}),
        quality_baseline_eligible=coverage == "observed",
    )
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--summary", type=Path, required=True)
    parser.add_argument("--diagnostics", type=Path, required=True)
    parser.add_argument("--queries", type=Path, required=True)
    parser.add_argument("--failed-queries", type=Path, required=True)
    args = parser.parse_args()

    def lines(path):
        return [line.strip() for line in path.read_text().splitlines()
                if line.strip() and not line.strip().startswith("#")]

    result = assess(json.loads(args.summary.read_text()), json.loads(args.diagnostics.read_text()),
                    lines(args.queries), lines(args.failed_queries))
    args.summary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(f"[coverage] status={result['coverage_status']} raw_rows={result['raw_rows']} "
          f"source_failures={result['source_failure_count']}")


if __name__ == "__main__":
    main()
