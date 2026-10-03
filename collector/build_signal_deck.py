#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
from itertools import combinations
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

WINDOWS = {"1d": 1, "3d": 3, "5d": 5}
MAX_CANDIDATES = 100
DEFAULT_REVIEW_LIMIT = 40
EXTEND_STEP = 10
DISPLAY_LIMIT = 5

CATEGORY_RULES = [
    (
        "票務／入場摩擦",
        "actionable",
        re.compile(r"Pia帳號|日本門號|本人確認|本確|護照|抽選|公售|實名制|实名制|入場|入场|手環|手环|購票|购票|退票|客服|票務|票务|門票|门票", re.I),
    ),
    (
        "VIP／互動福利",
        "actionable",
        re.compile(r"合照|拍立得|簽名|签名|福利|VIP|meet\s*&?\s*greet|hi[- ]?bye|soundcheck|彩排|擊掌|击掌|歡送|欢送", re.I),
    ),
    (
        "住宿／落腳",
        "actionable",
        re.compile(r"住宿|飯店|酒店|hotel|hostel|民宿|住哪|住哪裡|住哪里|stay in|accommodation", re.I),
    ),
    (
        "交通／散場",
        "actionable",
        re.compile(r"接駁|接驳|捷運|地鐵|地铁|高鐵|高铁|火車|火车|公車|公交|計程車|出租车|uber|交通|散場|散场|末班|機場|机场|航班|趕場|赶场|行李|怎麼回|怎么回", re.I),
    ),
    (
        "周邊／現場商品",
        "actionable",
        re.compile(r"節目冊|节目册|聯名|联名|周邊|周边|代購|代购|缺貨|缺货|戰袍|战袍|手燈|手灯|merch|goods|物販|場販|场贩", re.I),
    ),
    (
        "陪同／Solo Attendance",
        "actionable",
        re.compile(r"一個人|一个人|找個伴|找个伴|同行|solo|第一次看演唱會|第一次看演唱会|第一次參加.*演唱會|第一次参加.*演唱会", re.I),
    ),
    (
        "拍攝／現場規則",
        "actionable",
        re.compile(r"拍攝|拍摄|錄音|录音|不能拍|可以拍|謝幕|谢幕|攝影|摄影|規則|规则", re.I),
    ),
    (
        "散場後消費",
        "actionable",
        re.compile(r"散場.*吃|散场.*吃|演唱會結束.*吃|演唱会结束.*吃|宵夜|海底撈|海底捞|餐廳|餐厅", re.I),
    ),
    (
        "場館／現場體驗",
        "context",
        re.compile(r"搖滾區|摇滚区|站起來|站起来|坐下|工作人員|工作人员|應援|应援|視線|视线|被擠|被挤|字幕|翻譯|翻译|場館|场馆", re.I),
    ),
    (
        "演後社群／內容需求",
        "context",
        re.compile(r"徵.*影片|征.*影片|找.*影片|影片.*糊|桌布|壁紙|壁纸|找人|\bIG\b|哀居", re.I),
    ),
]

QUESTION = re.compile(
    r"請問|请问|想問|想问|有人有.*經驗|有人有.*经验|怎麼|怎么|如何|為什麼|为什么|有沒有人|有没有人"
    r"|\bhow\b|\bwhere\b|\bcan\s+i\b|\bshould\s+i\b|\bis\s+there\b|\bwhat\b",
    re.I,
)

FEATURE_PATTERNS = {
    "question_intent": QUESTION,
    "first_timer": re.compile(r"第一次|小白|完全沒有概念|完全没有概念", re.I),
    "transport_need": re.compile(r"接駁|接驳|捷運|地鐵|地铁|高鐵|高铁|火車|火车|公車|公交|計程車|出租车|uber|散場|散场|末班|機場|机场|航班|趕場|赶场|行李|車票|车票|shuttle|metro|subway|train|bus|taxi|airport|flight|last\s+(?:train|metro)|get\s+back|return\s+trip", re.I),
    "ticketing_need": re.compile(r"購票|购票|門票|门票|實名制|实名制|抽選|公售|退票|入場|入场|手環|手环|票務|票务", re.I),
    "vip_benefit": re.compile(r"VIP|合照|拍立得|簽名|签名|福利|meet\s*&?\s*greet|hi[- ]?bye|soundcheck|彩排|擊掌|击掌|歡送|欢送", re.I),
    "merch_need": re.compile(r"周邊|周边|場販|场贩|手燈|手灯|代購|代购|缺貨|缺货|merch|goods|物販", re.I),
    "venue_experience": re.compile(r"場館|场馆|視線|视线|搖滾區|摇滚区|站起來|站起来|坐下|被擠|被挤|工作人員|工作人员|應援|应援", re.I),
    "accommodation_need": re.compile(r"住宿|飯店|酒店|hotel|hostel|民宿|住哪|stay in|accommodation", re.I),
    "solo_attendance": re.compile(r"一個人|一个人|找個伴|找个伴|同行|solo", re.I),
    "cp_fandom_language": re.compile(r"\bCP\b|同人|磕|嗑|夢女|梦女|ship|配對|配对", re.I),
    "political_noise": re.compile(r"市長|市长|政見|政见|參選|参选|唯一支持|政治", re.I),
}

LANGUAGE_HINTS = {
    "hk_zh": re.compile(r"港鐵|紅館|睇|唔|冇|咁|喺|嘅|啲|邊個|聽日|撳|嗰|俾|返|仲|今鋪", re.I),
    "zh_hans": re.compile(r"演唱会|高铁|地铁|门票|周边|散场|场馆|酒店|怎么|哪里|买票|入场|应援"),
    "zh_hant": re.compile(r"演唱會|高鐵|捷運|門票|周邊|散場|場館|飯店|怎麼|哪裡|買票|入場|應援"),
    "english": re.compile(r"\bconcert\b|\blive\s+show\b|\bmetro\b|\bsubway\b|\bhotel\b|\bshuttle\b|\bvenue\b|\btrain\b|\bbus\b", re.I),
}

NEED_NODE_RULES = [
    ("wear_support", re.compile(r"穿搭|應援|应援|周邊|周边|手燈|手灯|dress\s*code|outfit|merch|goods|lightstick", re.I)),
    ("food", re.compile(r"餐廳|餐厅|宵夜|吃什麼|吃什么|美食|restaurant|food|dinner|late[- ]?night", re.I)),
    ("stay", re.compile(r"住宿|飯店|酒店|民宿|住哪|住哪裡|住哪里|hotel|hostel|accommodation|check[- ]?in|stay\s+(?:near|at|in)", re.I)),
    ("mobility", re.compile(r"高鐵|高铁|捷運|地鐵|地铁|港鐵|火車|火车|公車|公交|接駁|接驳|計程車|出租车|機場|机场|航班|metro|subway|mtr|train|bus|shuttle|uber|taxi|airport|flight", re.I)),
    ("venue_inside", re.compile(r"入場|入场|寄物|寄存|置物|座位|安檢|安检|入口|視線|视线|實名|实名|本人確認|locker|seat|security\s*check|entrance|gate|line\s+of\s+sight", re.I)),
    ("venue_outside", re.compile(r"散場|散场|回程|末班|動線|动线|離場|离场|怎麼回|怎么回|after\s+(?:the\s+)?concert|after\s+(?:the\s+)?show|get\s+back|return\s+trip|last\s+(?:train|metro|bus)", re.I)),
    ("trip_extension", re.compile(r"景點|景点|逛街|旅遊|旅游|行程|附近|周邊行程|周边行程|sightseeing|itinerary|day\s+trip|shopping|what\s+to\s+do\s+nearby", re.I)),
]

NEED_NODE_WEIGHTS = {
    "wear_support": 2.0,
    "food": 4.0,
    "stay": 9.0,
    "mobility": 9.0,
    "venue_inside": 6.0,
    "venue_outside": 8.0,
    "trip_extension": 4.0,
}

ACTION_MARKERS = re.compile(
    r"推薦|推荐|附近|來得及|来得及|幾點|几点|多久|怎麼去|怎么去|怎麼回|怎么回|要不要|可不可以"
    r"|\brecommend\b|\bnearby\b|\bhow\s+to\b|\bhow\s+do\s+i\b|\bcan\s+i\b|\bshould\s+i\b|\bwhat\s+time\b|\bmake\s+it\b",
    re.I,
)


def detect_language_context(text: str) -> tuple[str, list[str]]:
    matches = {
        name: [m.group(0) for m in pattern.finditer(text)]
        for name, pattern in LANGUAGE_HINTS.items()
    }
    hk_hits = len(matches["hk_zh"])
    hans_hits = len(matches["zh_hans"])
    hant_hits = len(matches["zh_hant"])
    english_words = re.findall(r"\b[A-Za-z][A-Za-z'-]{2,}\b", text)
    has_cjk = bool(re.search(r"[\u3400-\u9fff]", text))

    if hk_hits >= 2:
        context = "hk_zh"
    elif has_cjk and len(english_words) >= 4:
        context = "mixed"
    elif has_cjk:
        context = "zh_hans" if hans_hits > hant_hits else "zh_hant"
    elif len(english_words) >= 3:
        context = "english"
    else:
        context = "mixed"

    tokens = []
    for values in matches.values():
        for value in values:
            if value not in tokens:
                tokens.append(value)
    return context, tokens[:8]


def extract_need_network(text: str) -> tuple[list[str], list[str], list[str]]:
    nodes: list[str] = []
    terms: list[str] = []
    for node, pattern in NEED_NODE_RULES:
        matches = [m.group(0) for m in pattern.finditer(text)]
        if not matches:
            continue
        nodes.append(node)
        for value in matches:
            if value not in terms:
                terms.append(value)

    edges = [f"{a}->{b}" for a, b in combinations(nodes, 2)]
    return nodes, terms[:12], edges[:12]


def actionability_score(
    text: str,
    category: str,
    features: set[str],
    need_nodes: list[str],
    need_edges: list[str],
) -> float:
    score = sum(NEED_NODE_WEIGHTS.get(node, 0.0) for node in need_nodes)
    score += min(6.0, len(need_edges) * 2.0)

    if QUESTION.search(text):
        score += 2.0
    if ACTION_MARKERS.search(text):
        score += 2.0
    if "first_timer" in features and need_nodes:
        score += 1.0

    if "long_fandom_story" in features:
        score -= 5.0
    if "fan_narrative" in features:
        score -= 7.0
    if "dialogue_narrative" in features:
        score -= 4.0
    if "cp_fandom_language" in features:
        score -= 6.0
    if "political_noise" in features:
        score -= 10.0

    if not need_nodes:
        if "ticketing_need" in features:
            score -= 1.0
        if "vip_benefit" in features:
            score -= 3.0
        if "merch_need" in features:
            score -= 2.0
        if category == "其他演出內容":
            score -= 4.0

    return round(score, 3)


def actionability_band(score: float) -> str:
    if score >= 12:
        return "high"
    if score >= 5:
        return "medium"
    return "low"


NARRATIVE_MARKERS = re.compile(
    r"溫柔|温柔|耳邊|耳边|眼神|身體|身体|碎髮|碎发|拉著|拉着|靠向|撥著|拨着|笑笑|輕輕|轻轻|不自覺|不自觉|低聲|低声|盯著|盯着|抱住|摟著|搂着|肩膀|靠近",
    re.I,
)

PRESERVE_TICKET_FRICTION = re.compile(
    r"Pia帳號|日本門號|本人確認|本確|護照|退票|客服|實名制|实名制|黃牛.*搶不到|黄牛.*抢不到|買不到票|买不到票|抽選|公售|入場|入场|手環|手环|購票紀錄|购票记录",
    re.I,
)

RESALE = re.compile(
    r"讓票|让票|出票|售票|原價讓|原价让|原價出|原价出|多搶到|多抢到|搶多了|抢多了|多搶一張|多抢一张|轉讓|转让|降價賣|降价卖|降售|#售|pm\s*帶價|pm\s*带价|帶價|带价|可拆|票.*私訊|票.*私信|私訊.*票|私信.*票|求售|現場給票|现场给票",
    re.I,
)


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


def is_transaction(text: str) -> bool:
    if PRESERVE_TICKET_FRICTION.search(text):
        return False
    if RESALE.search(text):
        return True
    ticket_context = re.search(r"演唱會|演唱会|concert|門票|门票|票種|票种|小巨蛋|巨蛋", text, re.I)
    sale_context = re.search(
        r"連號|连号|連坐|连坐|面交|匯款|汇款|原價|原价|票價|票价|有意|兩張|两张|2張|2张|一張可賣|一张可卖|付款|僅一張|仅一张",
        text,
        re.I,
    )
    return bool(ticket_context and sale_context)


def extract_features(text: str) -> set[str]:
    tags = {tag for tag, pattern in FEATURE_PATTERNS.items() if pattern.search(text)}
    narrative_hits = len(NARRATIVE_MARKERS.findall(text))
    if len(text) >= 180 and narrative_hits >= 3 and not QUESTION.search(text):
        tags.add("fan_narrative")
    if len(text) >= 180 and not QUESTION.search(text) and re.search(r"演唱會|演唱会", text, re.I):
        tags.add("long_fandom_story")
    if len(re.findall(r"[「『“\"]", text)) >= 3 and len(text) >= 180 and not QUESTION.search(text):
        tags.add("dialogue_narrative")
    return tags


def categorize(text: str) -> tuple[str, str]:
    for category, kind, pattern in CATEGORY_RULES:
        if pattern.search(text):
            return category, kind
    return "其他演出內容", "context"


def trimmed(text: str, limit: int = 180) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def stable_post_key(post: dict[str, Any]) -> str:
    identity = str(post.get("id") or post.get("permalink") or "")
    if not identity:
        identity = "\n".join([
            str(post.get("username") or ""),
            str(post.get("timestamp") or ""),
            str(post.get("text") or ""),
        ])
    return "post_" + hashlib.sha1(identity.encode("utf-8")).hexdigest()[:16]


def status_for(ts: datetime, now: datetime) -> str:
    age_hours = max(0.0, (now - ts).total_seconds() / 3600)
    if age_hours <= 8:
        return "現在"
    if age_hours <= 24:
        return "今日"
    return "近期"


def base_score(post: dict[str, Any], text: str, ts: datetime, now: datetime) -> float:
    source = float(post.get("relevance_score") or 0)
    age_hours = max(0.0, (now - ts).total_seconds() / 3600)
    recency = max(0.0, 12.0 - age_hours / 4.0)
    return round(source + recency, 3)


def build_post_card(post: dict[str, Any], now: datetime, window_key: str) -> dict[str, Any]:
    text = str(post.get("text") or "")
    ts = post_time(post)
    if not ts:
        raise ValueError("post timestamp missing")

    post_key = stable_post_key(post)
    category, kind = categorize(text)
    feature_set = extract_features(text)
    features = sorted(feature_set)
    language_context, language_tokens = detect_language_context(text)
    need_nodes, need_terms, need_edges = extract_need_network(text)
    base = base_score(post, text, ts, now)
    action_score = actionability_score(text, category, feature_set, need_nodes, need_edges)
    score = round(base + action_score, 3)
    snapshot_id = f"deck_{now.date().isoformat()}_{window_key}_{post_key.removeprefix('post_')}"

    return {
        "id": post_key,
        "post_key": post_key,
        "snapshot_id": snapshot_id,
        "post_id": post.get("id"),
        "category": category,
        "kind": kind,
        "status": status_for(ts, now),
        "score": score,
        "base_score": base,
        "actionability_score": action_score,
        "actionability_band": actionability_band(action_score),
        "language_context": language_context,
        "language_tokens": language_tokens,
        "need_nodes": need_nodes,
        "need_terms": need_terms,
        "need_edges": need_edges,
        "feature_tags": features,
        "username": post.get("username"),
        "text": text,
        "summary": trimmed(text, 180),
        "permalink": post.get("permalink"),
        "posted_at": ts.isoformat().replace("+00:00", "Z"),
        "media_type": post.get("media_type"),
        "query": post.get("query"),
        "source_queries": post.get("source_queries") or [],
        "retrieval_sources": post.get("retrieval_sources") or [],
        "source": "Threads",
    }


def build_deck(posts: list[dict[str, Any]], now: datetime) -> dict[str, Any]:
    prepared: list[dict[str, Any]] = []
    for post in posts:
        if not is_clean_signal(post):
            continue
        text = str(post.get("text") or "")
        ts = post_time(post)
        if not text or not ts or is_transaction(text):
            continue
        prepared.append(post)

    windows: dict[str, Any] = {}
    for key, days in WINDOWS.items():
        start = now - timedelta(days=days)
        scoped = [
            post
            for post in prepared
            if (post_time(post) and start <= post_time(post) <= now)
        ]

        cards = [build_post_card(post, now, key) for post in scoped]
        cards.sort(key=lambda card: (-card["score"], card["post_key"]))
        cards = cards[:MAX_CANDIDATES]

        windows[key] = {
            "label": f"{days}日",
            "days": days,
            "signal_count": len(scoped),
            "card_count": len(cards),
            "default_review_limit": min(DEFAULT_REVIEW_LIMIT, len(cards)),
            "extend_step": EXTEND_STEP,
            "display_limit": DISPLAY_LIMIT,
            "cards": cards,
        }

    return {
        "schema_version": "signal-deck-v0.4",
        "card_granularity": "post",
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
        "[signal-deck] generated post-level deck",
        {key: value["card_count"] for key, value in deck["windows"].items()},
        "from",
        len(posts),
        "master rows",
    )


if __name__ == "__main__":
    main()
