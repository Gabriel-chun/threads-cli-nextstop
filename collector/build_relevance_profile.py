#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def smooth_weight(relevant: int, irrelevant: int, scale: float) -> float:
    total = relevant + irrelevant
    if total <= 0:
        return 0.0
    posterior = (relevant + 1) / (total + 2)
    centered = (posterior - 0.5) * 2
    confidence = min(1.0, total / 20)
    return round(centered * scale * confidence, 3)


def load_rows(review_dir: Path) -> list[dict[str, Any]]:
    latest_by_post: dict[str, dict[str, Any]] = {}

    for path in sorted(review_dir.glob("20??-??-??.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        rows = payload.get("rows") or []
        if not isinstance(rows, list):
            continue

        for row in rows:
            if not isinstance(row, dict):
                continue
            post_key = str(row.get("post_key") or "")
            label = str(row.get("label") or "")
            if not post_key or label not in {"relevant", "irrelevant"}:
                continue

            current = latest_by_post.get(post_key)
            if current is None or str(row.get("reviewed_at") or "") >= str(current.get("reviewed_at") or ""):
                latest_by_post[post_key] = row

    return list(latest_by_post.values())


def build_profile(rows: list[dict[str, Any]], now: datetime) -> dict[str, Any]:
    feature_stats: dict[str, dict[str, int]] = defaultdict(lambda: {"relevant": 0, "irrelevant": 0})
    category_stats: dict[str, dict[str, int]] = defaultdict(lambda: {"relevant": 0, "irrelevant": 0})

    for row in rows:
        label = str(row["label"])
        category = str(row.get("category") or "其他演出內容")
        category_stats[category][label] += 1

        for tag in set(row.get("feature_tags") or []):
            tag = str(tag)
            if tag:
                feature_stats[tag][label] += 1

    feature_stats = dict(sorted(feature_stats.items()))
    category_stats = dict(sorted(category_stats.items()))

    return {
        "schema_version": "relevance-profile-v0.3",
        "generated_at": now.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "github:collector/archive/reviews",
        "learning_mode": "positive-ranking",
        "feedback_count": len(rows),
        "relevant_count": sum(1 for row in rows if row["label"] == "relevant"),
        "irrelevant_count": sum(1 for row in rows if row["label"] == "irrelevant"),
        "note": (
            "Human review learning is a soft ranking signal only. "
            "Positive evidence receives full weight; negative evidence is attenuated at deck ranking time."
        ),
        "feature_stats": feature_stats,
        "category_stats": category_stats,
        "feature_weights": {
            tag: smooth_weight(stats["relevant"], stats["irrelevant"], 8.0)
            for tag, stats in feature_stats.items()
        },
        "category_weights": {
            category: smooth_weight(stats["relevant"], stats["irrelevant"], 4.0)
            for category, stats in category_stats.items()
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reviews", default="collector/archive/reviews")
    parser.add_argument("--output", default="collector/archive/latest/relevance_profile.json")
    parser.add_argument("--now", default="")
    args = parser.parse_args()

    now = datetime.now(timezone.utc)
    if args.now:
        now = datetime.fromisoformat(args.now.replace("Z", "+00:00"))
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)

    rows = load_rows(Path(args.reviews))
    profile = build_profile(rows, now)

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        "[relevance-profile]",
        f"feedback={profile['feedback_count']}",
        f"relevant={profile['relevant_count']}",
        f"irrelevant={profile['irrelevant_count']}",
        f"features={len(profile['feature_weights'])}",
        f"categories={len(profile['category_weights'])}",
    )


if __name__ == "__main__":
    main()
