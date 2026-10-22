#!/usr/bin/env python3
"""Aggregate privacy-safe per-query search diagnostics. No raw post text, IDs, or cursors."""
import argparse
import json
from pathlib import Path


def aggregate(raw_dir: Path) -> dict:
    reports = []
    for p in sorted(raw_dir.glob("query_*_source_diagnostics.json")):
        try:
            payload = json.loads(p.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            reports.append({"file": p.name, "status": "invalid_diagnostics_file"})
            continue
        pages = payload.get("pages", [])
        if not isinstance(pages, list):
            pages = []
        reports.append({
            "query": payload.get("query", ""),
            "depth_requested": payload.get("depth_requested"),
            "pages": pages,
            "returned_total_by_page": sum(int(x.get("returned", 0)) for x in pages),
            "fresh_12h_by_page": sum(int(x.get("fresh_12h", 0)) for x in pages),
            "any_pagination_failure": any(x.get("status") == "request_failed" for x in pages),
        })
    return {"schema_version": "search-source-v1", "query_count": len(reports), "queries": reports}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", type=Path, default=Path("collector/raw"))
    parser.add_argument("--output", type=Path, default=Path("collector/output/search_source_diagnostics.json"))
    args = parser.parse_args()
    result = aggregate(args.raw_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for item in result["queries"]:
        print("[search-diagnostics] query=", item.get("query"), "page_count=", len(item.get("pages", [])),
              "fresh_12h=", item.get("fresh_12h_by_page"), "pagination_failure=", item.get("any_pagination_failure"))


if __name__ == "__main__":
    main()
