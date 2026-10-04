#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from collector.build_signal_deck import detect_language_context, extract_need_network


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def build_query_map(config: dict[str, Any]) -> dict[str, str]:
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
        scoped = [row for row in rows if query_map.get(str(row.get("query") or "")) == track]
        clean = [row for row in scoped if bool(row.get("signal_counted"))]

        language_counts: Counter[str] = Counter()
        need_counts: Counter[str] = Counter()
        query_counts: Counter[str] = Counter()
        target_rows: list[dict[str, Any]] = []
        other_latin = 0

        for row in clean:
            text = str(row.get("text") or "")
            language, _ = detect_language_context(text)
            language_counts[language] += 1
            query_counts[str(row.get("query") or "")] += 1
            if language == "other_latin":
                other_latin += 1
            nodes, terms, edges = extract_need_network(text)
            for node in nodes:
                need_counts[node] += 1
            if language == target_language:
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
        tracks[track] = {
            "target_language": target_language,
            "queries": list(spec.get("queries") or []),
            "snapshot_rows": len(scoped),
            "clean_signals": len(clean),
            "target_language_signals": language_counts.get(target_language, 0),
            "target_language_share_pct": round(
                100.0 * language_counts.get(target_language, 0) / max(1, len(clean)), 1
            ),
            "other_latin_signals": other_latin,
            "language_distribution": dict(language_counts),
            "query_distribution": dict(query_counts),
            "need_node_distribution": dict(need_counts),
            "sample": target_rows[:12],
        }

    return {
        "schema_version": "language-exploration-result-v0.1",
        "run_stamp": run_stamp,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "baseline_policy": config.get("baseline_policy"),
        "baseline_queries": config.get("baseline_queries") or [],
        "review_policy": config.get("review_policy"),
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
            f"target_share={row['target_language_share_pct']}%",
            f"needs={row['need_node_distribution']}",
        )


if __name__ == "__main__":
    main()
