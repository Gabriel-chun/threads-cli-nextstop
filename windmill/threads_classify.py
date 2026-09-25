import json
import re
from datetime import datetime
from typing import Any

CATEGORY_RULES = {
    "event": [
        "演唱會", "演出", "開唱", "場次", "官宣", "巡迴", "world tour",
        "live", "concert", "暖身夜", "應援"
    ],
    "ticket": [
        "票", "售票", "抽票", "抽選", "中籤", "中選", "搶票", "讓票",
        "退票", "原價", "實名制", "拓元", "klook", "取票", "票價"
    ],
    "seat": [
        "座位", "視野", "哪一區", "看台", "搖滾區", "魔王席", "四面舞台",
        "3d場館", "3d模擬", "實拍", "幾排", "幾區"
    ],
    "transport": [
        "交通", "捷運", "接駁", "包車", "停車", "火車站", "高鐵", "公車",
        "來回接送", "單程接送", "遊覽車", "9人座", "上車點"
    ],
    "exit": [
        "散場", "退場", "離場", "散場後", "趕車", "末班車"
    ],
    "stay": [
        "住宿", "飯店", "旅館", "酒店", "民宿", "hotel"
    ],
    "food": [
        "美食", "餐廳", "咖啡", "麵包", "冰淇淋", "試吃", "試喝",
        "吃什麼", "吃到", "飲料", "garden city"
    ],
    "merch": [
        "周邊", "商品部", "官方商店", "手燈", "應援棒", "紀念品",
        "入場禮", "商品", "特典"
    ],
    "sports": [
        "棒球", "富邦", "悍將", "台鋼", "雄鷹", "投手", "三壘",
        "打者", "比賽", "內野", "外野"
    ],
}

QUESTION_TERMS = [
    "請問", "有人知道", "想問", "怎麼", "如何", "哪一區", "哪裡",
    "幾點", "多久", "會不會", "有沒有", "嗎", "？", "?"
]

SALE_TERMS = [
    "售 ", "售\n", "讓票", "原價賣", "降價售", "轉票", "出售",
    "售出", "求售", "面交"
]

ANNOUNCEMENT_TERMS = [
    "官宣", "開放報名", "售票", "開賣", "演出日期", "演出地點",
    "上線", "新開幕", "開幕"
]

RELEVANT_CATEGORIES = {
    "event", "ticket", "seat", "transport", "exit", "stay", "food", "merch"
}

CATEGORY_PRIORITY = [
    "transport", "exit", "seat", "ticket", "merch", "stay", "food", "event", "sports"
]


def _contains(text: str, term: str) -> bool:
    return term.lower() in text.lower()


def _classify_categories(text: str) -> tuple[list[str], dict[str, list[str]]]:
    matched: dict[str, list[str]] = {}
    for category, terms in CATEGORY_RULES.items():
        hits = [term for term in terms if _contains(text, term)]
        if hits:
            matched[category] = hits

    categories = list(matched.keys())
    if not categories:
        categories = ["other"]
    return categories, matched


def _primary_category(categories: list[str]) -> str:
    for category in CATEGORY_PRIORITY:
        if category in categories:
            return category
    return categories[0] if categories else "other"


def _content_type(text: str) -> str:
    if any(_contains(text, term) for term in QUESTION_TERMS):
        return "question"
    if any(_contains(text, term) for term in SALE_TERMS):
        return "sale"
    if any(_contains(text, term) for term in ANNOUNCEMENT_TERMS):
        return "announcement"
    return "discussion"


def _editorial_priority(
    categories: list[str],
    content_type: str,
    relevance_score: int,
) -> str:
    relevant = bool(RELEVANT_CATEGORIES.intersection(categories))
    if not relevant:
        return "low"

    # Questions are especially valuable for Next Stop Live because they expose
    # unmet user needs directly.
    if content_type == "question" and relevance_score >= 30:
        return "high"

    # Strong transport / seat / merch / stay / exit signals are usually
    # actionable editorial topics even when the post is not phrased as a question.
    if relevance_score >= 60 and any(
        c in categories for c in ["transport", "exit", "seat", "merch", "stay"]
    ):
        return "high"

    # Pure resale posts are useful trend evidence but poor standalone content leads.
    if content_type == "sale":
        return "low"

    return "medium"


def _parse_jsonl(raw: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line or not line.startswith("{"):
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            rows.append(value)
    return rows


def main(
    raw: str,
    min_score: int = 30,
    relevant_only: bool = False,
) -> list[dict[str, Any]]:
    """
    Classify JSONL emitted by `th batch-search`.

    Windmill inputs:
      raw            -> stdout/JSONL string from Threads Batch Search
      min_score      -> default 30
      relevant_only  -> default false

    Output:
      A JSON array enriched with:
      - categories
      - primary_category
      - category_terms
      - content_type
      - nextstop_relevant
      - editorial_priority
    """
    rows = _parse_jsonl(raw)
    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    for row in rows:
        score = int(row.get("relevance_score") or 0)
        if score < min_score:
            continue

        key = str(row.get("permalink") or row.get("id") or "")
        if key and key in seen:
            continue
        if key:
            seen.add(key)

        text = str(row.get("text") or "")
        categories, category_terms = _classify_categories(text)
        primary = _primary_category(categories)
        content_type = _content_type(text)
        nextstop_relevant = bool(RELEVANT_CATEGORIES.intersection(categories))

        if relevant_only and not nextstop_relevant:
            continue

        enriched = dict(row)
        enriched["categories"] = categories
        enriched["primary_category"] = primary
        enriched["category_terms"] = category_terms
        enriched["content_type"] = content_type
        enriched["nextstop_relevant"] = nextstop_relevant
        enriched["editorial_priority"] = _editorial_priority(
            categories, content_type, score
        )
        out.append(enriched)

    priority_order = {"high": 0, "medium": 1, "low": 2}
    out.sort(
        key=lambda x: (
            priority_order.get(str(x.get("editorial_priority")), 9),
            -int(x.get("relevance_score") or 0),
            str(x.get("timestamp") or ""),
        )
    )
    return out
