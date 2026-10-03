#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from build_signal_deck import NEED_NODE_RULES, build_deck, parse_dt

TAIPEI = ZoneInfo("Asia/Taipei")
RECALL_ORDER = ["演唱會", "演唱会", "concert"]
LANGUAGE_ORDER = ["zh_hant", "zh_hans", "hk_zh", "english", "other_latin", "mixed"]
NEED_LABELS = {
    "wear_support": "衣／應援／周邊",
    "food": "食",
    "stay": "住",
    "mobility": "行／移動",
    "venue_inside": "場館內",
    "venue_outside": "場館外",
    "trip_extension": "延伸行程",
}

def safe_query(card: dict) -> str:
    queries = card.get("source_queries") or []
    for q in queries:
        q = str(q).strip()
        if q in RECALL_ORDER:
            return q
    q = str(card.get("query") or "").strip()
    return q if q in RECALL_ORDER else "演唱會"

def build_network(posts: list[dict], now: datetime) -> dict:
    deck = build_deck(posts, now)
    cards = deck.get("windows", {}).get("1d", {}).get("cards", [])
    node_counts = Counter()
    edges = Counter()
    keyword_counts = defaultdict(Counter)

    for card in cards:
        recall = safe_query(card)
        lang = str(card.get("language_context") or "mixed")
        needs = [str(x) for x in (card.get("need_nodes") or []) if str(x) in NEED_LABELS]
        text = str(card.get("text") or "")
        recall_id = "recall:" + recall
        lang_id = "lang:" + lang
        node_counts[recall_id] += 1
        node_counts[lang_id] += 1
        edges[(recall_id, lang_id)] += 1

        for need in needs:
            need_id = "need:" + need
            node_counts[need_id] += 1
            edges[(lang_id, need_id)] += 1
            for rule_node, pattern in NEED_NODE_RULES:
                if rule_node != need:
                    continue
                for match in pattern.finditer(text):
                    term = match.group(0).strip()
                    if term:
                        keyword_counts[need][term] += 1

    nodes = []
    for recall in RECALL_ORDER:
        nid = "recall:" + recall
        nodes.append({"id": nid, "label": recall, "layer": "recall", "count": node_counts[nid]})
    for lang in LANGUAGE_ORDER:
        nid = "lang:" + lang
        nodes.append({"id": nid, "label": lang, "layer": "language", "count": node_counts[nid]})
    for need, label in NEED_LABELS.items():
        nid = "need:" + need
        nodes.append({"id": nid, "label": label, "layer": "need", "count": node_counts[nid]})

    top_keywords = {}
    for need in NEED_LABELS:
        selected = keyword_counts[need].most_common(3)
        top_keywords[need] = [{"term": term, "count": count} for term, count in selected]
        need_id = "need:" + need
        for term, count in selected:
            kid = "kw:" + need + ":" + term
            nodes.append({"id": kid, "label": term, "layer": "keyword", "count": count, "need_node": need})
            edges[(need_id, kid)] += count

    edge_rows = [
        {"source": source, "target": target, "weight": weight}
        for (source, target), weight in sorted(edges.items(), key=lambda item: (-item[1], item[0][0], item[0][1]))
        if weight > 0
    ]

    return {
        "schema_version": "keyword-network-v0.1",
        "generated_at": now.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "network_date": now.astimezone(TAIPEI).date().isoformat(),
        "timezone": "Asia/Taipei",
        "refresh_policy": "daily_00:00_with_collector_fallback",
        "source_master_count": len(posts),
        "source_card_count": len(cards),
        "layers": ["recall", "language", "need", "keyword"],
        "nodes": nodes,
        "edges": edge_rows,
        "top_keywords": top_keywords,
    }

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--master", default="collector/archive/latest/master.json")
    parser.add_argument("--output", default="collector/archive/latest/keyword_network.json")
    parser.add_argument("--archive-dir", default="collector/archive/networks")
    parser.add_argument("--now", default="")
    args = parser.parse_args()

    posts = json.loads(Path(args.master).read_text(encoding="utf-8"))
    if not isinstance(posts, list):
        raise SystemExit("master must be a JSON array")
    now = parse_dt(args.now) if args.now else datetime.now(timezone.utc)
    if not now:
        raise SystemExit("--now must be ISO-8601")

    payload = build_network(posts, now)
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    out.write_text(text, encoding="utf-8")

    archive_dir = Path(args.archive_dir)
    archive_dir.mkdir(parents=True, exist_ok=True)
    (archive_dir / (payload["network_date"] + ".json")).write_text(text, encoding="utf-8")
    print("[keyword-network]", payload["network_date"], "cards", payload["source_card_count"], "nodes", len(payload["nodes"]), "edges", len(payload["edges"]))

if __name__ == "__main__":
    main()
