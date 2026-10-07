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
MEDIUM_SAMPLE_LIMIT = 20
DISCOVERY_SAMPLE_LIMIT = 5
PROFILE_DEFAULT = "collector/archive/latest/relevance_profile.json"

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
    r"|嗎|吗|？|\?|\bhow\b|\bwhere\b|\bcan\s+i\b|\bshould\s+i\b|\bis\s+there\b|\bwhat\b",
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
    ("wear_support", re.compile(r"穿搭|應援|应援|周邊|周边|手燈|手灯|長袖|长袖|短袖|外套|怎麼穿|怎么穿|穿什麼|穿什么|dress\s*code|outfit|merch|goods|lightstick", re.I)),
    ("food", re.compile(r"餐廳|餐厅|宵夜|吃什麼|吃什么|美食|restaurant|food|dinner|late[- ]?night", re.I)),
    ("stay", re.compile(r"住宿|飯店|酒店|民宿|住哪|住哪裡|住哪里|hotel|hostel|accommodation|check[- ]?in|stay\s+(?:near|at|in)", re.I)),
    ("mobility", re.compile(r"高鐵|高铁|捷運|地鐵|地铁|港鐵|火車|火车|公車|公交|接駁|接驳|計程車|出租车|機場|机场|航班|metro|subway|mtr|train|bus|shuttle|uber|taxi|airport|flight", re.I)),
    ("venue_inside", re.compile(r"入場|入场|寄物|寄存|置物|座位|安檢|安检|入口|視線|视线|實名|实名|本人確認|手環|手环|證件|证件|驗證|验证|姓名|名字|locker|seat|security\s*check|entrance|gate|line\s+of\s+sight", re.I)),
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

# Human review preference is learned only through relevance_profile.json.
# Keep actionability structural so old snapshots are never double-counted.
CATEGORY_REVIEW_PRIOR: dict[str, float] = {}

ACTION_MARKERS = re.compile(
    r"推薦|推荐|附近|來得及|来得及|幾點|几点|多久|怎麼去|怎么去|怎麼回|怎么回|要不要|可不可以"
    r"|\brecommend\b|\bnearby\b|\bhow\s+to\b|\bhow\s+do\s+i\b|\bcan\s+i\b|\bshould\s+i\b|\bwhat\s+time\b|\bmake\s+it\b",
    re.I,
)


USER_DECISION_MARKERS = re.compile(
    r"我想|我要|我準備|我准备|我打算|我怕|我在糾結|我在纠结|我猶豫|我犹豫|我懶得|我懒得|我們想|我们想|我們要|我们要|想去|準備去|准备去|打算去"
    r"|來不及|来不及|趕不上|赶不上|回不了|住哪|住哪裡|住哪里|怎麼去|怎么去|怎麼回|怎么回"
    r"|推薦|推荐|請問|请问|想問|想问|有人知道|有沒有人知道|有没有人知道"
    r"|\bi\s+(?:need|want|plan|am\s+going|will\s+go|have\s+to)\b"
    r"|\bwe\s+(?:need|want|plan|are\s+going)\b"
    r"|\bshould\s+i\b|\bcan\s+i\b|\bhow\s+(?:do\s+i|can\s+i|to)\b|\bwhere\s+(?:should|can)\b",
    re.I,
)

LOGISTICS_CONTEXT_MARKERS = re.compile(
    r"散場後|散场后|演唱會結束|演唱会结束|結束後|结束后|末班|回程|回家|回飯店|回酒店|附近"
    r"|趕高鐵|赶高铁|趕火車|赶火车|趕捷運|赶地铁|入住|check[- ]?in"
    r"|after\s+(?:the\s+)?(?:concert|show)|last\s+(?:train|metro|bus)|get\s+back|near\s+(?:the\s+)?venue",
    re.I,
)

THIRD_PARTY_LOGISTICS_MARKERS = re.compile(
    r"他|她|哥哥|姐姐|妹妹|成員|成员|隊友|队友|藝人|艺人|偶像|歌手|團員|团员|公司|經紀|经纪"
    r"|回韓|回韩|回國|回国|返韓|返韩|婚禮|婚礼|航班回|飛回|飞回",
    re.I,
)

STAFFING_OR_PROMO_MARKERS = re.compile(
    r"job\s+drop|crew\s+needed|hiring|recruit(?:ing)?|part[- ]?time|staff\s+needed"
    r"|招募|招聘|徵人|征人|工作人員招募|工作人员招募|兼職|兼职",
    re.I,
)


LIVE_RECORDING_SETUP_MARKERS = re.compile(
    r"錄影|录像|錄像|錄製|录制|拍攝|拍摄|相機|相机|手機|手机|camera|video"
    r"|防手震|防抖|對焦|对焦|fps|4k|8k|zoom|曝光|快門|快门|iso|camera\s*assistant",
    re.I,
)

VENUE_OPERATION_MARKERS = re.compile(
    r"寄物|寄存|置物|行李|入口|安檢|安检|接待處|接待处|再次進入|再次进入|離場|离场"
    r"|手環|手环|證件|证件|身分證|身份证|實名驗證|实名验证|查證件|查证件|領手環|领手环"
    r"|名字對不上|名字对不上|姓名.*對不上|姓名.*对不上"
    r"|locker|bag\s*(?:size|policy)|security\s*check|re[- ]?entry|entrance|gate|id\s*check",
    re.I,
)

ATTENDEE_PREP_MARKERS = re.compile(
    r"長袖|长袖|短袖|外套|薄長袖|薄长袖|怎麼穿|怎么穿|穿什麼|穿什么|dress\s*code|what\s+to\s+wear",
    re.I,
)

PARTICIPATION_ELIGIBILITY_MARKERS = re.compile(
    r"外國人|外国人|海外.*(?:報名|报名|申請|申请)|能不能.*(?:報名|报名|申請|申请|參加|参加)"
    r"|可不可以.*(?:報名|报名|申請|申请|參加|参加)|資格|资格|eligib(?:le|ility)|registration",
    re.I,
)


EXPERIENCE_GEAR_MARKERS = re.compile(
    r"手機推薦|手机推荐|哪支手機|哪支手机|什麼手機|什么手机|收音|變焦|变焦|幾倍\s*zoom|几倍\s*zoom"
    r"|行動電源|行动电源|充電|充电|電量|电量|續航|续航|power\s*bank|battery|charger"
    r"|望遠鏡|望远镜|binocular|相機推薦|相机推荐|camera\s*recommend",
    re.I,
)

ATTENDEE_GEAR_MARKERS = re.compile(
    r"包包|背包|小包|透明包|防水|雨衣|雨具|耳塞|耳塞推薦|耳塞推荐"
    r"|bag|backpack|clear\s*bag|raincoat|earplug",
    re.I,
)

MEDIA_RETRIEVAL_MARKERS = re.compile(
    r"有人.*(?:拍到|錄到|录到)|有沒有.*影片|有没有.*影片|求.*影片|找.*影片|徵.*影片|征.*影片"
    r"|anyone.*(?:film|record|capture)|looking\s+for.*(?:video|clip)",
    re.I,
)

ATTENDANCE_LOGISTICS_SIGNALS = {
    "mobility",
    "stay",
    "venue_outside",
    "post_event_nearby",
    "venue_operation",
    "solo_or_cross_city",
    "cross_city_commitment",
    "trip_commitment",
    "participation_eligibility",
}

EXPERIENCE_UTILITY_SIGNALS = {
    "live_recording_setup",
    "experience_gear",
    "attendee_gear",
    "attendee_prep",
    "media_retrieval",
}

PARTICIPATION_PREP_MARKERS = re.compile(
    r"手燈.*(?:連線|连线|中控)|(?:連線|连线|中控).*手燈|應援.*交換|应援.*交换"
    r"|場T|场T|(?:排隊|排队).*(?:場T|场T|周邊|周边|物販|merch)",
    re.I,
)

TRIP_COMMITMENT_MARKERS = re.compile(
    r"機票.*(?:買|买|訂|订)|(?:買|买|訂|订).*機票|車票.*(?:買|买|訂|订)|车票.*(?:买|订)"
    r"|飯店.*(?:訂|订)|酒店.*(?:訂|订)|hotel.*booked|flight.*booked|ticket.*booked",
    re.I,
)

POST_PROCESSING_MARKERS = re.compile(
    r"下載到相冊|下载到相册|下載到相簿|下载到相簿|網盤|网盘|夸克|解碼|解码"
    r"|重新下載|重新下载|轉檔|转档|codec|cloud\s*storage",
    re.I,
)

CROSS_CITY_ATTENDANCE_MARKERS = re.compile(
    r"去香港|去澳門|去澳门|去台北|去臺北|去高雄|去日本|去韓國|去韩国|去曼谷|去深圳"
    r"|跨城|外地|機票|机票|火車去|火车去|高鐵去|高铁去|飛去|飞去"
    r"|travel\s+to|fly\s+to|train\s+to",
    re.I,
)

POST_EVENT_NEARBY_MARKERS = re.compile(
    r"(?:演唱會結束|演唱会结束|散場|散场|結束後|结束后).{0,90}(?:附近|711|7-11|餐廳|餐厅|宵夜|集合|逛|景點|景点|吃)"
    r"|(?:附近|711|7-11|餐廳|餐厅|宵夜|集合|逛|景點|景点|吃).{0,90}(?:散場後|散场后|演唱會結束後|演唱会结束后)",
    re.I,
)

GENERIC_CONCERT_DECISION_MARKERS = re.compile(
    r"推薦看嗎|推荐看吗|值不值得看|值得去嗎|值得去吗|氛圍如何|氛围如何"
    r"|抽中率|中籤率|中签率|選全區|选全区|standing\s+or\s+seat"
    r"|有拍到|有没有拍到|有沒有拍到|找.*影片|徵.*影片|征.*影片"
    r"|下載到相冊|下载到相册|網盤|网盘|解碼|解码",
    re.I,
)


ENGLISH_CONTEXT = re.compile(
    r"\b(?:the|a|an|is|are|was|were|to|from|at|in|on|for|with|after|before|near|"
    r"how|where|what|when|can|could|should|would|need|want|stay|hotel|hostel|"
    r"train|metro|subway|bus|shuttle|venue|concert|ticket|tickets|show)\b",
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
    english_context_hits = len(ENGLISH_CONTEXT.findall(text))
    has_cjk = bool(re.search(r"[\u3400-\u9fff]", text))
    has_latin = bool(english_words)

    if hk_hits >= 2:
        context = "hk_zh"
    elif has_cjk and len(english_words) >= 4:
        context = "mixed"
    elif has_cjk:
        context = "zh_hans" if hans_hits > hant_hits else "zh_hant"
    elif has_latin and english_context_hits >= 3:
        context = "english"
    elif has_latin:
        context = "other_latin"
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


def intent_profile(
    text: str,
    need_nodes: list[str],
) -> tuple[float, list[str], list[str]]:
    score = 0.0
    signals: list[str] = []
    penalties: list[str] = []

    if USER_DECISION_MARKERS.search(text):
        score += 4.0
        signals.append("user_decision")
    if TRIP_COMMITMENT_MARKERS.search(text):
        score += 3.0
        signals.append("trip_commitment")
    if PARTICIPATION_ELIGIBILITY_MARKERS.search(text) and QUESTION.search(text):
        score += 3.0
        signals.append("participation_eligibility")
    if EXPERIENCE_GEAR_MARKERS.search(text) and QUESTION.search(text):
        score += 4.0
        signals.append("experience_gear_need")
    if ATTENDEE_GEAR_MARKERS.search(text) and QUESTION.search(text):
        score += 3.0
        signals.append("attendee_gear_need")
    if MEDIA_RETRIEVAL_MARKERS.search(text) and QUESTION.search(text):
        score += 2.0
        signals.append("media_request")
    if QUESTION.search(text) and need_nodes:
        score += 2.0
        signals.append("need_question")
    if ACTION_MARKERS.search(text) and need_nodes:
        score += 2.0
        signals.append("action_marker")
    if LOGISTICS_CONTEXT_MARKERS.search(text) and need_nodes:
        score += 3.0
        signals.append("logistics_context")

    # A need keyword alone is weak evidence. This catches artist itineraries,
    # fan narratives, staffing posts, and other mentions that are not the
    # author's own planning problem.
    if need_nodes and not signals:
        score -= 4.0
        penalties.append("keyword_only_need")

    if need_nodes and THIRD_PARTY_LOGISTICS_MARKERS.search(text) and not USER_DECISION_MARKERS.search(text):
        score -= 4.0
        penalties.append("third_party_logistics")

    if STAFFING_OR_PROMO_MARKERS.search(text):
        score -= 8.0
        penalties.append("staffing_or_promo")

    return round(max(-10.0, min(10.0, score)), 3), signals, penalties


def need_weight_multiplier(intent_score: float) -> float:
    if intent_score >= 4:
        return 1.0
    if intent_score >= 1:
        return 0.65
    if intent_score > -4:
        return 0.4
    return 0.2


def actionability_score(
    text: str,
    category: str,
    features: set[str],
    need_nodes: list[str],
    need_edges: list[str],
    intent_score: float,
) -> float:
    score = CATEGORY_REVIEW_PRIOR.get(category, 0.0)
    multiplier = need_weight_multiplier(intent_score)
    score += sum(NEED_NODE_WEIGHTS.get(node, 0.0) for node in need_nodes) * multiplier
    score += min(6.0, len(need_edges) * 2.0) * multiplier
    score += intent_score

    # Questions only help when they are attached to an actual need. Generic
    # fandom questions should not outrank planning/friction signals.
    if QUESTION.search(text) and need_nodes:
        score += 1.0
    if ACTION_MARKERS.search(text) and need_nodes:
        score += 1.0
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

    language_context, _ = detect_language_context(text)
    if language_context == "other_latin":
        score -= 8.0

    if not need_nodes:
        if "ticketing_need" in features:
            score -= 1.0
        if "vip_benefit" in features:
            score -= 3.0
        if "merch_need" in features:
            score -= 2.0
        if category == "其他演出內容":
            score -= 7.0

    return round(score, 3)


def actionability_band(score: float) -> str:
    if score >= 12:
        return "high"
    if score >= 5:
        return "medium"
    return "low"


def target_fit_profile(
    text: str,
    features: set[str],
    need_nodes: list[str],
) -> tuple[float, list[str], list[str]]:
    score = 0.0
    signals: list[str] = []
    penalties: list[str] = []
    nodes = set(need_nodes)

    if "mobility" in nodes:
        score += 4.0
        signals.append("mobility")
    if "stay" in nodes:
        score += 4.0
        signals.append("stay")
    if "venue_outside" in nodes:
        score += 4.0
        signals.append("venue_outside")
    if "trip_extension" in nodes and POST_EVENT_NEARBY_MARKERS.search(text):
        score += 3.0
        signals.append("post_event_nearby")
    if "venue_inside" in nodes and VENUE_OPERATION_MARKERS.search(text):
        score += 4.0
        signals.append("venue_operation")
    if "wear_support" in nodes and ATTENDEE_PREP_MARKERS.search(text) and (
        QUESTION.search(text) or USER_DECISION_MARKERS.search(text)
    ):
        score += 2.0
        signals.append("attendee_prep")
    if PARTICIPATION_ELIGIBILITY_MARKERS.search(text) and QUESTION.search(text):
        score += 3.0
        signals.append("participation_eligibility")
    if LIVE_RECORDING_SETUP_MARKERS.search(text) and QUESTION.search(text):
        score += 4.0
        signals.append("live_recording_setup")
    if EXPERIENCE_GEAR_MARKERS.search(text) and QUESTION.search(text):
        score += 4.0
        signals.append("experience_gear")
    if ATTENDEE_GEAR_MARKERS.search(text) and QUESTION.search(text):
        score += 3.0
        signals.append("attendee_gear")
    if MEDIA_RETRIEVAL_MARKERS.search(text) and QUESTION.search(text):
        score += 1.0
        signals.append("media_retrieval")
    if POST_PROCESSING_MARKERS.search(text):
        score -= 7.0
        penalties.append("post_processing_only")
    if PARTICIPATION_PREP_MARKERS.search(text) and (QUESTION.search(text) or USER_DECISION_MARKERS.search(text)):
        score += 3.0
        signals.append("participation_prep")
    if "solo_attendance" in features and (
        CROSS_CITY_ATTENDANCE_MARKERS.search(text) or USER_DECISION_MARKERS.search(text)
    ):
        score += 3.0
        signals.append("solo_or_cross_city")
    if CROSS_CITY_ATTENDANCE_MARKERS.search(text) and USER_DECISION_MARKERS.search(text):
        score += 2.0
        signals.append("cross_city_commitment")
    if TRIP_COMMITMENT_MARKERS.search(text):
        score += 4.0
        signals.append("trip_commitment")

    if GENERIC_CONCERT_DECISION_MARKERS.search(text) and not signals:
        score -= 4.0
        penalties.append("generic_concert_question")
    if "ticketing_need" in features and not (
        CROSS_CITY_ATTENDANCE_MARKERS.search(text) or "venue_inside" in nodes
    ):
        score -= 2.0
        penalties.append("ticketing_only")
    if "merch_need" in features and not PARTICIPATION_PREP_MARKERS.search(text):
        score -= 2.0
        penalties.append("merch_only")
    if "vip_benefit" in features and "trip_extension" not in nodes and not CROSS_CITY_ATTENDANCE_MARKERS.search(text):
        score -= 2.0
        penalties.append("vip_only")

    return round(max(-10.0, min(12.0, score)), 3), signals, penalties


def candidate_confidence(intent_score: float, target_fit_score: float) -> str:
    if intent_score >= 4 and target_fit_score >= 4:
        return "high"
    if intent_score >= 1 and target_fit_score >= 2:
        return "medium"
    return "low"


def target_fit_paths(signals: list[str]) -> list[str]:
    signal_set = set(signals)
    paths: list[str] = []
    if signal_set & ATTENDANCE_LOGISTICS_SIGNALS:
        paths.append("attendance_logistics")
    if signal_set & EXPERIENCE_UTILITY_SIGNALS:
        paths.append("experience_utility")
    return paths


def review_lane_for_card(card: dict[str, Any]) -> str:
    paths = set(card.get("target_fit_paths") or [])
    if "attendance_logistics" in paths:
        return "core"
    if "experience_utility" in paths:
        return "adjacent"
    return "core"


DISCOVERY_BLOCKING_PENALTIES = {
    "generic_concert_question",
    "post_processing_only",
    "vip_only",
    "merch_only",
}


def is_discovery_candidate(card: dict[str, Any]) -> bool:
    if card.get("candidate_confidence") != "low":
        return False
    if float(card.get("intent_score") or 0) < 2:
        return False

    penalties = set(card.get("target_fit_penalties") or [])
    intent_penalties = set(card.get("intent_penalties") or [])
    if penalties & DISCOVERY_BLOCKING_PENALTIES:
        if "media_retrieval" not in set(card.get("target_fit_signals") or []):
            return False
    if intent_penalties & {"staffing_or_promo", "third_party_logistics"}:
        return False

    features = set(card.get("feature_tags") or [])
    meaningful_features = features - {
        "question_intent",
        "long_fandom_story",
        "fan_narrative",
        "dialogue_narrative",
        "cp_fandom_language",
        "political_noise",
    }
    meaningful_nodes = set(card.get("need_nodes") or []) - {"trip_extension"}

    return bool(
        meaningful_features
        or meaningful_nodes
        or "media_retrieval" in set(card.get("target_fit_signals") or [])
    )


def load_relevance_profile(path: str | Path | None) -> dict[str, Any] | None:
    if not path:
        return None
    profile_path = Path(path)
    if not profile_path.exists():
        return None
    try:
        payload = json.loads(profile_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    if not isinstance(payload.get("feature_weights"), dict):
        return None
    if not isinstance(payload.get("category_weights"), dict):
        return None
    return payload


def learned_ranking_delta(
    category: str,
    features: set[str],
    profile: dict[str, Any] | None,
    intent_score: float,
) -> float:
    if not profile:
        return 0.0

    category_weights = profile.get("category_weights") or {}
    feature_weights = profile.get("feature_weights") or {}

    raw = float(category_weights.get(category) or 0.0)
    for feature in features:
        raw += float(feature_weights.get(feature) or 0.0)

    if raw > 0:
        # Positive human preference should reinforce confirmed user needs, not
        # keyword-only mentions such as artist travel schedules.
        if intent_score >= 4:
            raw *= 1.15
        elif intent_score >= 1:
            raw *= 0.7
        else:
            raw *= 0.15
    elif raw < 0:
        # Negative learning remains soft: it demotes rather than deletes.
        raw *= 0.35

    return round(max(-4.0, min(8.0, raw)), 3)


NARRATIVE_MARKERS = re.compile(
    r"溫柔|温柔|耳邊|耳边|眼神|身體|身体|碎髮|碎发|拉著|拉着|靠向|撥著|拨着|笑笑|輕輕|轻轻|不自覺|不自觉|低聲|低声|盯著|盯着|抱住|摟著|搂着|肩膀|靠近",
    re.I,
)

PRESERVE_TICKET_FRICTION = re.compile(
    r"Pia帳號|日本門號|本人確認|本確|護照|退票|客服|實名制|实名制|黃牛.*搶不到|黄牛.*抢不到|買不到票|买不到票|抽選|公售|入場|入场|手環|手环|購票紀錄|购票记录",
    re.I,
)

RESALE = re.compile(
    r"讓票|让票|出票|售票|原價讓|原价让|原價出|原价出|多搶到|多抢到|搶多了|抢多了|多搶一張|多抢一张|轉讓|转让|降價賣|降价卖|降售|#售|pm\s*帶價|pm\s*带价|帶價|带价|可拆|票.*私訊|票.*私信|私訊.*票|私信.*票|求售|現場給票|现场给票"
    r"|\bWTS\b|\bselling\s+(?:my\s+)?(?:concert\s+)?tickets?\b|\btickets?\s+for\s+sale\b|\bDM\s+me\s+for\s+tickets?\b",
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


def build_post_card(
    post: dict[str, Any],
    now: datetime,
    window_key: str,
    profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
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
    intent_score, intent_signals, intent_penalties = intent_profile(text, need_nodes)
    target_fit_score, target_fit_signals, target_fit_penalties = target_fit_profile(
        text,
        feature_set,
        need_nodes,
    )
    base = base_score(post, text, ts, now)
    action_score = actionability_score(
        text,
        category,
        feature_set,
        need_nodes,
        need_edges,
        intent_score,
    )
    ranking_delta = learned_ranking_delta(category, feature_set, profile, intent_score)
    score = round(base + action_score + ranking_delta, 3)
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
        "ranking_delta": ranking_delta,
        "intent_score": intent_score,
        "intent_band": "high" if intent_score >= 4 else "medium" if intent_score >= 1 else "low",
        "candidate_confidence": candidate_confidence(intent_score, target_fit_score),
        "target_fit_score": target_fit_score,
        "target_fit_band": "high" if target_fit_score >= 4 else "medium" if target_fit_score >= 2 else "low",
        "target_fit_signals": target_fit_signals,
        "target_fit_penalties": target_fit_penalties,
        "target_fit_paths": target_fit_paths(target_fit_signals),
        "intent_signals": intent_signals,
        "intent_penalties": intent_penalties,
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


def build_deck(
    posts: list[dict[str, Any]],
    now: datetime,
    profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    prepared: list[dict[str, Any]] = []
    for post in posts:
        if not is_clean_signal(post):
            continue
        text = str(post.get("text") or "")
        ts = post_time(post)
        if not text or not ts or is_transaction(text):
            continue
        language_context, _ = detect_language_context(text)
        if language_context == "other_latin":
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

        all_cards = [build_post_card(post, now, key, profile) for post in scoped]
        all_cards.sort(key=lambda card: (-card["score"], card["post_key"]))

        high_cards = [card for card in all_cards if card["candidate_confidence"] == "high"]
        medium_cards = [card for card in all_cards if card["candidate_confidence"] == "medium"]
        low_cards = [card for card in all_cards if card["candidate_confidence"] == "low"]

        sampled_medium = medium_cards[:MEDIUM_SAMPLE_LIMIT]
        discovery_cards = [
            card for card in low_cards
            if is_discovery_candidate(card)
        ][:DISCOVERY_SAMPLE_LIMIT]

        for card in high_cards + sampled_medium:
            card["review_lane"] = review_lane_for_card(card)
        for card in discovery_cards:
            card["review_lane"] = "discovery"

        cards = (high_cards + sampled_medium + discovery_cards)[:MAX_CANDIDATES]
        cards.sort(key=lambda card: (-card["score"], card["post_key"]))

        windows[key] = {
            "label": f"{days}日",
            "days": days,
            "signal_count": len(scoped),
            "core_eligible_count": sum(
                1 for card in high_cards + sampled_medium
                if card.get("review_lane") == "core"
            ),
            "adjacent_count": sum(
                1 for card in high_cards + sampled_medium
                if card.get("review_lane") == "adjacent"
            ),
            "discovery_count": len(discovery_cards),
            "eligible_count": len(high_cards) + len(medium_cards) + len(discovery_cards),
            "high_confidence_count": len(high_cards),
            "medium_confidence_count": len(medium_cards),
            "medium_sampled_count": len(sampled_medium),
            "low_confidence_count": len(low_cards),
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
        "relevance_profile": {
            "applied": bool(profile),
            "schema_version": profile.get("schema_version") if profile else None,
            "generated_at": profile.get("generated_at") if profile else None,
            "feedback_count": profile.get("feedback_count", 0) if profile else 0,
        },
        "windows": windows,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--master", default="collector/archive/latest/master.json")
    parser.add_argument("--output", default="collector/archive/latest/signal_deck.json")
    parser.add_argument("--now", default="")
    parser.add_argument("--profile", default=PROFILE_DEFAULT)
    args = parser.parse_args()

    master_path = Path(args.master)
    output_path = Path(args.output)
    posts = json.loads(master_path.read_text(encoding="utf-8"))
    if not isinstance(posts, list):
        raise SystemExit("master must be a JSON array")

    now = parse_dt(args.now) if args.now else datetime.now(timezone.utc)
    if not now:
        raise SystemExit("--now must be ISO-8601")

    profile = load_relevance_profile(args.profile)
    deck = build_deck(posts, now, profile)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(deck, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    index_payload = {
        key: value
        for key, value in deck.items()
        if key != "windows"
    }
    index_payload["windows"] = {
        key: {field: value for field, value in window.items() if field != "cards"}
        for key, window in deck["windows"].items()
    }
    index_path = output_path.with_name("signal_deck_index.json")
    index_path.write_text(
        json.dumps(index_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    for key, window in deck["windows"].items():
        window_payload = {
            "schema_version": deck["schema_version"],
            "generated_at": deck["generated_at"],
            "refresh_policy": deck["refresh_policy"],
            "window_key": key,
            "window": window,
        }
        window_path = output_path.with_name(f"signal_deck_{key}.json")
        window_path.write_text(
            json.dumps(window_payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    print(
        "[signal-deck] generated post-level deck",
        {key: value["card_count"] for key, value in deck["windows"].items()},
        "from",
        len(posts),
        "master rows",
        "profile_feedback=",
        deck["relevance_profile"]["feedback_count"],
    )


if __name__ == "__main__":
    main()
