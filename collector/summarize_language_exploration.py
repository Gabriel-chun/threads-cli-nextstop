#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from collector.build_signal_deck import detect_language_context, extract_need_network


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_config(config: dict[str, Any]) -> None:
    baseline = {str(query) for query in (config.get("baseline_queries") or [])}
    seen: dict[str, str] = {}
    target_languages: set[str] = set()

    for track, spec in (config.get("tracks") or {}).items():
        target_language = str(spec.get("target_language") or "").strip()
        queries = [str(query).strip() for query in (spec.get("queries") or []) if str(query).strip()]

        if not target_language:
            raise ValueError(f"{track}: target_language is required")
        if target_language in target_languages:
            raise ValueError(f"duplicate target_language: {target_language}")
        target_languages.add(target_language)

        if not queries:
            raise ValueError(f"{track}: at least one query is required")

        for query in queries:
            if query in baseline:
                raise ValueError(f"exploration query overlaps baseline: {query}")
            if query in seen:
                raise ValueError(f"exploration query duplicated across tracks: {query}")
            seen[query] = str(track)


def build_query_map(config: dict[str, Any]) -> dict[str, str]:
    validate_config(config)
    out: dict[str, str] = {}
    for track, spec in (config.get("tracks") or {}).items():
        for query in spec.get("queries") or []:
            out[str(query)] = str(track)
    return out


def summarize(config: dict[str, Any], rows: list[dict[str, Any]], run_stamp: str) -> dict[str, Any]:
    query_map = build_query_map(config)
    tracks: dict[str, Any] = {}

    for track, spec in (config.get("tracks") or {}).items():
        target_language = str(spec.get("target_language") or "")
        queries = [str(query) for query in (spec.get("queries") or [])]
        scoped = [row for row in rows if query_map.get(str(row.get("query") or "")) == track]
        clean = [row for row in scoped if bool(row.get("signal_counted"))]

        language_counts: Counter[str] = Counter()
        need_counts: Counter[str] = Counter()
        query_counts: Counter[str] = Counter()
        target_rows: list[dict[str, Any]] = []
        target_need_rows = 0
        other_latin = 0
        per_query: dict[str, dict[str, Any]] = defaultdict(
            lambda: {
                "snapshot_rows": 0,
                "clean_signals": 0,
                "target_language_signals": 0,
                "target_language_need_signals": 0,
                "need_node_distribution": Counter(),
                "language_distribution": Counter(),
            }
        )

        for row in scoped:
            query = str(row.get("query") or "")
            per_query[query]["snapshot_rows"] += 1

        for row in clean:
            text = str(row.get("text") or "")
            query = str(row.get("query") or "")
            language, _ = detect_language_context(text)
            language_counts[language] += 1
            query_counts[query] += 1
            per_query[query]["clean_signals"] += 1
            per_query[query]["language_distribution"][language] += 1

            if language == "other_latin":
                other_latin += 1

            nodes, terms, edges = extract_need_network(text)
            for node in nodes:
                need_counts[node] += 1
                per_query[query]["need_node_distribution"][node] += 1

            if language == target_language:
                per_query[query]["target_language_signals"] += 1
                if nodes:
                    target_need_rows += 1
                    per_query[query]["target_language_need_signals"] += 1
                target_rows.append({
                    "post_id": row.get("id"),
                    "query": row.get("query"),
                    "language_context": language,
                    "need_nodes": nodes,
                    "need_terms": terms,
                    "need_edges": edges,
                    "permalink": row.get("permalink"),
                    "posted_at": row.get("timestamp"),
                    "excerpt": text[:320] + ("..." if len(text) > 320 else ""),
                })

        target_rows.sort(key=lambda row: str(row.get("posted_at") or ""), reverse=True)

        query_metrics: dict[str, Any] = {}
        for query in queries:
            metrics = per_query[query]
            target_count = int(metrics["target_language_signals"])
            query_metrics[query] = {
                "snapshot_rows": int(metrics["snapshot_rows"]),
                "clean_signals": int(metrics["clean_signals"]),
                "target_language_signals": target_count,
                "target_language_need_signals": int(metrics["target_language_need_signals"]),
                "target_language_share_pct": round(
                    100.0 * target_count / max(1, int(metrics["clean_signals"])), 1
                ),
                "target_need_share_pct": round(
                    100.0 * int(metrics["target_language_need_signals"]) / max(1, target_count), 1
                ),
                "language_distribution": dict(metrics["language_distribution"]),
                "need_node_distribution": dict(metrics["need_node_distribution"]),
            }

        target_language_signals = language_counts.get(target_language, 0)
        tracks[track] = {
            "role": spec.get("role"),
            "target_language": target_language,
            "queries": queries,
            "snapshot_rows": len(scoped),
            "clean_signals": len(clean),
            "target_language_signals": target_language_signals,
            "target_language_need_signals": target_need_rows,
            "target_language_share_pct": round(
                100.0 * target_language_signals / max(1, len(clean)), 1
            ),
            "target_need_share_pct": round(
                100.0 * target_need_rows / max(1, target_language_signals), 1
            ),
            "other_latin_signals": other_latin,
            "language_distribution": dict(language_counts),
            "query_distribution": dict(query_counts),
            "need_node_distribution": dict(need_counts),
            "query_metrics": query_metrics,
            "sample": target_rows[:12],
        }

    return {
        "schema_version": "language-exploration-result-v0.2",
        "run_stamp": run_stamp,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "baseline_policy": config.get("baseline_policy"),
        "baseline_queries": config.get("baseline_queries") or [],
        "review_policy": config.get("review_policy"),
        "comparison_policy": config.get("comparison_policy"),
        "tracks": tracks,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="collector/language_exploration.json")
    parser.add_argument("--snapshot", required=True)
    parser.add_argument("--run-stamp", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    config = load_json(Path(args.config))
    rows = load_json(Path(args.snapshot))
    if not isinstance(rows, list):
        raise SystemExit("snapshot must be a JSON array")

    result = summarize(config, rows, args.run_stamp)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    for track, row in result["tracks"].items():
        print(
            "[language-exploration]",
            track,
            f"clean={row['clean_signals']}",
            f"target={row['target_language_signals']}",
            f"target_need={row['target_language_need_signals']}",
            f"target_share={row['target_language_share_pct']}%",
            f"target_need_share={row['target_need_share_pct']}%",
            f"needs={row['need_node_distribution']}",
        )


if __name__ == "__main__":
    main()
