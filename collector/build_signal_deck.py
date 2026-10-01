#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

WINDOWS = {"1d": 1, "3d": 3, "5d": 5}
MAX_CARDS = 5
MAX_EVIDENCE = 5

RULES = [
    (
        "VIP／互動福利",
        "actionable",
        "VIP、合照與互動流程正在被問",
        re.compile(r"合照|拍立得|簽名|签名|福利|VIP|meet\s*&?\s*greet|hi[- ]?bye|soundcheck|彩排|擊掌|击掌", re.I),
    ),
    (
        "住宿／落腳",
        "actionable",
        "演出前後的住宿與落腳選擇",
        re.compile(r"住宿|飯店|酒店|hotel|hostel|民宿|住哪|住哪裡|住哪里|stay in|accommodation", re.I),
    ),
    (
        "交通／散場",
        "actionable",
        "進場、散場與跨城移動安排",
        re.compile(r"接駁|捷運|地鐵|高鐵|火車|公車|計程車|uber|交通|散場|末班|機場|航班|趕場|行李|怎麼回|怎么回", re.I),
    ),
    (
        "票務／入場摩擦",
        "actionable",
        "購票、實名與入場流程的摩擦",
        re.compile(r"Pia帳號|日本門號|本人確認|本確|護照|抽選|公售|實名制|入場|手環|購票|退票|客服|票務|門票", re.I),
    ),
    (
        "周邊／現場商品",
        "actionable",
        "周邊、現場商品與購買時機",
        re.compile(r"節目冊|联名|聯名|周邊|周边|代購|缺貨|缺货|戰袍|merch|goods|物販", re.I),
    ),
    (
        "陪同／Solo Attendance",
        "actionable",
        "一個人看演出與同行需求",
        re.compile(r"一個人|一个人|找個伴|找个伴|同行|solo|第一次看演唱會|第一次參加.*演唱會|第一次参加.*演唱会", re.I),
    ),
    (
        "拍攝／現場規則",
        "actionable",
        "拍攝、錄音與現場規則",
        re.compile(r"拍攝|拍摄|錄音|录音|不能拍|可以拍|謝幕|谢幕|攝影|摄影|規則|规则", re.I),
    ),
    (
        "散場後消費",
        "actionable",
        "散場後吃什麼、去哪裡與延伸行程",
        re.compile(r"散場.*吃|散场.*吃|演唱會結束.*吃|演唱会结束.*吃|宵夜|海底撈|餐廳|餐厅", re.I),
    ),
    (
        "場館／現場體驗",
        "context",
        "場館視線、站坐與現場體驗",
        re.compile(r"搖滾區|摇滚区|站起來|站起来|坐下|工作人員|工作人员|應援|应援|視線|视线|被擠|被挤|字幕|翻譯|翻译|場館|场馆", re.I),
    ),
    (
        "演後社群／內容需求",
        "context",
        "演後找影片、照片與社群內容",
        re.compile(r"徵.*影片|征.*影片|找.*影片|影片.*糊|桌布|壁紙|壁纸|找人|\\bIG\\b|哀居", re.I),
    ),
]

NOISE = re.compile(r"市長|市长|政見|政见|參選|参选|唯一支持|政治|同框|CP|哥哥們碰面|哥哥们碰面", re.I)
QUESTION = re.compile(r"請問|请问|想問|想问|有人有.*經驗|有人有.*经验|怎麼|怎么|如何|為什麼|为什么|有沒有人|有没有人", re.I)

PRESERVE_TICKET_FRICTION = re.compile(
    r"Pia帳號|日本門號|本人確認|本確|護照|退票|客服|實名制|黃牛.*搶不到|买不到票|買不到票|抽選|公售|入場|手環|購票紀錄",
    re.I,
)
RESALE = re.compile(
    r"讓票|让票|出票|售票|原價讓|原价让|原價出|原价出|多搶到|多抢到|搶多了|抢多了|多搶一張|多抢一张|轉讓|转让|降價賣|降价卖|降售|#售|pm\\s*帶價|带价|帶價|可拆|票.*私訊|票.*私信|私訊.*票|私信.*票|求售|現場給票|现场给票",
    re.I,
)


def is_transaction(text: str) -> bool:
    if PRESERVE_TICKET_FRICTION.search(text):
        return False
    if RESALE.search(text):
        return True
    ticket_context = re.search(r"演唱會|演唱会|concert|門票|门票|票種|票种|小巨蛋|巨蛋", text, re.I)
    sale_context = re.search(r"連號|连号|連坐|连坐|面交|匯款|汇款|原價|原价|票價|票价|有意|兩張|两张|2張|2张|一張可賣|一张可卖|付款|僅一張|仅一张", text, re.I)
    return bool(ticket_context and sale_context)


def parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def post_time(post: dict[str, Any]) -> datetime | None:
    for key in ("timestamp", "last_seen_at", "first_seen_at"):
        value = parse_dt(post.get(key))
        if value:
            return value
    return None


def is_clean_signal(post: dict[str, Any]) -> bool:
    if post.get("clean_exclusion_reason"):
        return False
    if "signal_counted" in post:
        return bool(post.get("signal_counted"))
    return bool(post.get("text"))


def classify(text: str) -> tuple[str, str, str] | None:
    if is_transaction(text):
        return None
    if NOISE.search(text):
        return None
    for category, kind, headline, pattern in RULES:
        if pattern.search(text):
            return category, kind, headline
    if QUESTION.search(text):
        return "其他問題／需求", "context", "演出相關問題正在重複出現"
    return None


def trimmed(text: str, limit: int = 180) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def card_id(category: str) -> str:
    return "sig_" + hashlib.sha1(category.encode("utf-8")).hexdigest()[:10]


def activity_buckets(posts: list[dict[str, Any]], now: datetime, days: int) -> list[int]:
    bucket_count = 6 if days < 5 else 5
    window_seconds = days * 86400
    bucket_seconds = window_seconds / bucket_count
    values = [0 for _ in range(bucket_count)]
    start = now - timedelta(days=days)
    for post in posts:
        ts = post_time(post)
        if not ts or ts < start or ts > now:
            continue
        idx = int((ts - start).total_seconds() / bucket_seconds)
        idx = min(bucket_count - 1, max(0, idx))
        values[idx] += 1
    return values


def build_card(category: str, rows: list[dict[str, Any]], now: datetime, days: int) -> dict[str, Any]:
    rows = sorted(rows, key=lambda row: post_time(row) or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    representative = next((row for row in rows if QUESTION.search(str(row.get("text") or ""))), rows[0])
    first = min((post_time(row) for row in rows if post_time(row)), default=None)
    last = max((post_time(row) for row in rows if post_time(row)), default=None)
    authors = sorted({str(row.get("username") or "").strip() for row in rows if row.get("username")})
    kind = rows[0]["_deck_kind"]
    headline = rows[0]["_deck_headline"]
    span_hours = ((last - first).total_seconds() / 3600) if first and last else 0
    age_hours = ((now - last).total_seconds() / 3600) if last else 9999

    if len(rows) >= 2 and span_hours >= 18:
        status = "持續"
    elif age_hours <= 8:
        status = "現在"
    else:
        status = "近期"

    score = round(len(rows) * 3 + len(authors) * 2 + max(0, 6 - min(6, age_hours / 4)) + min(span_hours / 12, 6), 2)

    evidence = []
    for row in rows[:MAX_EVIDENCE]:
        evidence.append({
            "id": row.get("id"),
            "username": row.get("username"),
            "text": trimmed(str(row.get("text") or ""), 220),
            "permalink": row.get("permalink"),
            "posted_at": (post_time(row).isoformat().replace("+00:00", "Z") if post_time(row) else None),
            "query": row.get("query"),
            "source_queries": row.get("source_queries") or [],
            "source": "Threads",
        })

    return {
        "id": card_id(category),
        "category": category,
        "kind": kind,
        "headline": headline,
        "summary": trimmed(str(representative.get("text") or ""), 170),
        "status": status,
        "score": score,
        "mentions": len(rows),
        "authors": len(authors),
        "first_seen": first.isoformat().replace("+00:00", "Z") if first else None,
        "last_seen": last.isoformat().replace("+00:00", "Z") if last else None,
        "activity": activity_buckets(rows, now, days),
        "source_breakdown": [{"source": "Threads", "count": len(rows)}],
        "evidence": evidence,
    }


def build_deck(posts: list[dict[str, Any]], now: datetime) -> dict[str, Any]:
    prepared = []
    for post in posts:
        if not is_clean_signal(post):
            continue
        text = str(post.get("text") or "")
        result = classify(text)
        ts = post_time(post)
        if not result or not ts:
            continue
        category, kind, headline = result
        row = dict(post)
        row["_deck_category"] = category
        row["_deck_kind"] = kind
        row["_deck_headline"] = headline
        prepared.append(row)

    windows: dict[str, Any] = {}
    for key, days in WINDOWS.items():
        start = now - timedelta(days=days)
        scoped = [row for row in prepared if (post_time(row) and start <= post_time(row) <= now)]
        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in scoped:
            grouped[row["_deck_category"]].append(row)

        cards = [build_card(category, rows, now, days) for category, rows in grouped.items()]
        cards.sort(key=lambda card: (-card["score"], -card["mentions"], card["category"]))
        cards = cards[:MAX_CARDS]

        windows[key] = {
            "label": f"{days}日",
            "days": days,
            "signal_count": len(scoped),
            "card_count": len(cards),
            "cards": cards,
        }

    return {
        "schema_version": "signal-deck-v0.1",
        "generated_at": now.isoformat().replace("+00:00", "Z"),
        "refresh_policy": "daily",
        "source": "collector/archive/latest/master.json",
        "source_master_count": len(posts),
        "windows": windows,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--master", default="collector/archive/latest/master.json")
    parser.add_argument("--output", default="collector/archive/latest/signal_deck.json")
    parser.add_argument("--now", default="")
    args = parser.parse_args()

    master_path = Path(args.master)
    output_path = Path(args.output)
    posts = json.loads(master_path.read_text(encoding="utf-8"))
    if not isinstance(posts, list):
        raise SystemExit("master must be a JSON array")

    now = parse_dt(args.now) if args.now else datetime.now(timezone.utc)
    if not now:
        raise SystemExit("--now must be ISO-8601")

    deck = build_deck(posts, now)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(deck, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        "[signal-deck] generated",
        {key: value["card_count"] for key, value in deck["windows"].items()},
        "from",
        len(posts),
        "master rows",
    )


if __name__ == "__main__":
    main()
