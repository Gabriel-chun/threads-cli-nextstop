#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEMAND_RULES = [
    ("post_show_return", "散場返程", "Post-show return",
     re.compile(r"高鐵|高铁|火車|火车|客運|客运|車票|车票|末班|回程|趕不上|赶不上|來不及|来不及|回不了|uber|計程車|计程车|地鐵|地铁|捷運|捷运|機場|机场|航班|機票|机票", re.I),
     "ready", ["intercity_transport_booking", "local_mobility_or_transfer", "accommodation_booking"]),
    ("accommodation", "住宿／落腳", "Stay / lodging",
     re.compile(r"飯店|饭店|酒店|住宿|旅館|旅馆|民宿|機加酒|机加酒|hotel|hostel|住一晚|住哪", re.I),
     "ready", ["accommodation_booking", "hotel_near_venue", "flight_hotel_bundle"]),
    ("recording_gear", "拍攝／手機", "Recording / phone",
     re.compile(r"錄影|录影|录像|錄像|相機|相机|手機|手机|對焦|对焦|防手震|防抖|zoom|camera\s*assistant|放大.*糊|收音", re.I),
     "adjacent", ["recording_device_or_accessory", "power_bank_or_charger", "camera_or_lens"]),
    ("venue_prep", "現場準備", "Venue preparation",
     re.compile(r"長袖|长袖|短袖|外套|a3|寄存|寄物|包包|背包|透明包|雨衣|雨具|耳塞|dress\s*code", re.I),
     "adjacent", ["apparel_or_outerwear", "concert_bag_or_clear_bag", "rain_gear", "earplugs"]),
    ("post_event_experience", "演前／演後周邊", "Pre / post-show nearby",
     re.compile(r"附近|711|7-11|餐廳|餐厅|美食|吃|逛逛|拍照|集合", re.I),
     "adjacent", ["local_experience_or_activity", "restaurant_reservation"]),
    ("merch_prep", "手燈／應援／周邊", "Lightstick / fan goods",
     re.compile(r"手燈|手灯|周邊|周边|場t|场t|無料|應援|应援|postcard", re.I),
     "adjacent", ["official_merch_or_lightstick", "fan_goods"]),
    ("ticket_entry", "票務／入場流程", "Ticketing / entry process",
     re.compile(r"實名|实名|身分證|身份证|證件|证件|手環|手环|入場|入场|抽選|抽选|升等|本確|本确|票務|票务", re.I),
     "insight_only", []),
]

POSITIVE_PATTERNS = [
    ("self_need", re.compile(r"我想|我要|我怕|我需要|我不知道|我準備|我准备|我打算|想問|想问|請問|请问|有人知道|有沒有人|有没有人", re.I)),
    ("time_constraint", re.compile(r"幾點|几点|多久|準時|准时|結束|结束|散場|散场|最後一班|最后一班|來得及|来得及|趕不上|赶不上", re.I)),
    ("booking_decision", re.compile(r"買幾點|买几点|訂幾點|订几点|訂哪|订哪|住哪|推薦|推荐|怎麼回|怎么回|要不要訂|要不要订", re.I)),
    ("actionable_friction", re.compile(r"怎麼|怎么|如何|建議|建议|可以嗎|可以吗|能不能|該怎麼|该怎么|怎麼辦|怎么办|很擔心|很担心", re.I)),
]
NEGATIVE_PATTERNS = [
    ("resale", re.compile(r"出售|出票|收票|賣票|卖票|轉讓|转让|私訊|私信|dm\s*me|wts|resell|求票", re.I)),
    ("fan_opinion", re.compile(r"好看|很棒|感動|感动|失望|開心|开心|難過|难过|喜歡|喜欢|可愛|可爱|太帥|太帅|表現|表现|音控|感想|心得", re.I)),
    ("third_party_narrative", re.compile(r"哥哥|姐姐|妹妹|藝人|艺人|歌手|成員|成员|偶像|他們|他们|她們|她们", re.I)),
    ("announcement", re.compile(r"官宣|海報|海报|補場|补场|timeline|rehearsal|開賣|开卖|售票資訊|售票信息|宣傳|宣传", re.I)),
]

def load_rows(review_dir: Path) -> list[dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for path in sorted(review_dir.glob("20??-??-??.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        for row in payload.get("rows") or []:
            if not isinstance(row, dict):
                continue
            key = str(row.get("post_key") or "")
            label = str(row.get("label") or "")
            if not key or label not in {"relevant", "irrelevant"}:
                continue
            current = latest.get(key)
            if current is None or str(row.get("reviewed_at") or "") >= str(current.get("reviewed_at") or ""):
                latest[key] = row
    return list(latest.values())

def pattern_counts(rows: list[dict[str, Any]], patterns: list[tuple[str, re.Pattern[str]]]) -> dict[str, dict[str, int]]:
    out = {name: {"relevant": 0, "irrelevant": 0} for name, _ in patterns}
    for row in rows:
        text = str(row.get("text_excerpt") or "")
        label = str(row.get("label") or "")
        for name, pattern in patterns:
            if pattern.search(text):
                out[name][label] += 1
    return out

def build(rows: list[dict[str, Any]], now: datetime) -> dict[str, Any]:
    relevant = [row for row in rows if row.get("label") == "relevant"]
    irrelevant = [row for row in rows if row.get("label") == "irrelevant"]
    clusters: list[dict[str, Any]] = []

    for cluster_id, zh, en, pattern, affiliate_fit, solutions in DEMAND_RULES:
        rel_rows = [row for row in relevant if pattern.search(str(row.get("text_excerpt") or ""))]
        irr_rows = [row for row in irrelevant if pattern.search(str(row.get("text_excerpt") or ""))]
        evidence = [
            {
                "post_key": str(row.get("post_key") or ""),
                "category": str(row.get("category") or ""),
                "text": str(row.get("text_excerpt") or "")[:900],
                "reviewed_at": row.get("reviewed_at"),
            }
            for row in sorted(rel_rows, key=lambda x: str(x.get("reviewed_at") or ""), reverse=True)[:5]
        ]
        if not rel_rows and not irr_rows:
            continue
        clusters.append({
            "cluster_id": cluster_id,
            "label_zh": zh,
            "label_en": en,
            "relevant_count": len(rel_rows),
            "irrelevant_count": len(irr_rows),
            "affiliate_fit": affiliate_fit,
            "solution_map": solutions,
            "evidence": evidence,
        })

    clusters.sort(key=lambda row: (
        0 if row["affiliate_fit"] == "ready" else 1 if row["affiliate_fit"] == "adjacent" else 2,
        -row["relevant_count"],
        row["cluster_id"],
    ))

    positives = pattern_counts(rows, POSITIVE_PATTERNS)
    negatives = pattern_counts(rows, NEGATIVE_PATTERNS)

    category_stats: dict[str, dict[str, int]] = defaultdict(lambda: {"relevant": 0, "irrelevant": 0})
    feature_stats: dict[str, dict[str, int]] = defaultdict(lambda: {"relevant": 0, "irrelevant": 0})
    for row in rows:
        label = str(row.get("label") or "")
        category_stats[str(row.get("category") or "其他演出內容")][label] += 1
        for tag in set(row.get("feature_tags") or []):
            feature_stats[str(tag)][label] += 1

    return {
        "schema_version": "review-intelligence-v0.1",
        "generated_at": now.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "github:collector/archive/reviews",
        "review_counts": {
            "total": len(rows),
            "relevant": len(relevant),
            "irrelevant": len(irrelevant),
        },
        "positive_patterns": positives,
        "negative_patterns": negatives,
        "category_stats": dict(sorted(category_stats.items())),
        "feature_stats": dict(sorted(feature_stats.items())),
        "demand_clusters": clusters,
        "note": "Derived from the latest human label per post. Human labels remain unchanged; this file is an interpretation layer only.",
    }

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reviews", default="collector/archive/reviews")
    parser.add_argument("--output", default="collector/archive/latest/review_intelligence.json")
    parser.add_argument("--now", default="")
    args = parser.parse_args()
    now = datetime.now(timezone.utc)
    if args.now:
        now = datetime.fromisoformat(args.now.replace("Z", "+00:00"))
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
    payload = build(load_rows(Path(args.reviews)), now)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("[review-intelligence]", payload["review_counts"], "clusters=", len(payload["demand_clusters"]))

if __name__ == "__main__":
    main()
