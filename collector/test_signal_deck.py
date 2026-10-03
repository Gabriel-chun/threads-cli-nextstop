import unittest
from datetime import datetime, timezone

from collector.build_signal_deck import build_deck


class SignalDeckV03Tests(unittest.TestCase):
    def test_each_post_becomes_its_own_card(self):
        now = datetime(2026, 10, 1, 3, 0, tzinfo=timezone.utc)
        posts = [
            {
                "id": "a",
                "text": "第一次參加 FEniX 演唱會，抽到合照資格，想問合照是坐著還是站著？",
                "username": "one",
                "permalink": "https://www.threads.com/@one/post/a",
                "timestamp": "2026-10-01T01:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60,
            },
            {
                "id": "b",
                "text": "VIP 合照可以自己想動作嗎？有人有經驗嗎",
                "username": "two",
                "permalink": "https://www.threads.com/@two/post/b",
                "timestamp": "2026-09-30T23:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60,
            },
            {
                "id": "c",
                "text": "演唱會散場捷運末班車來得及嗎？",
                "username": "three",
                "permalink": "https://www.threads.com/@three/post/c",
                "timestamp": "2026-09-29T09:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60,
            },
        ]

        deck = build_deck(posts, now)
        self.assertEqual(deck["schema_version"], "signal-deck-v0.4")
        self.assertEqual(deck["card_granularity"], "post")

        one_day = deck["windows"]["1d"]
        self.assertEqual(one_day["card_count"], 2)
        self.assertEqual(one_day["display_limit"], 5)
        self.assertEqual(one_day["default_review_limit"], 2)
        self.assertEqual(one_day["extend_step"], 10)
        self.assertEqual({card["post_id"] for card in one_day["cards"]}, {"a", "b"})
        self.assertEqual(len({card["post_key"] for card in one_day["cards"]}), 2)
        self.assertTrue(all(card["snapshot_id"].startswith("deck_2026-10-01_1d_") for card in one_day["cards"]))
        self.assertTrue(all("vip_benefit" in card["feature_tags"] for card in one_day["cards"]))

        three_day_categories = {card["category"] for card in deck["windows"]["3d"]["cards"]}
        self.assertIn("交通／散場", three_day_categories)

    def test_resale_is_excluded_but_generic_fandom_post_is_kept_for_triage(self):
        now = datetime(2026, 10, 1, 3, 0, tzinfo=timezone.utc)
        posts = [
            {
                "id": "sale",
                "text": "出兩張 BIGBANG 演唱會門票，原價出售，有意私訊",
                "username": "seller",
                "permalink": "https://www.threads.com/@seller/post/sale",
                "timestamp": "2026-10-01T01:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
            },
            {
                "id": "fan",
                "text": "BIGBANG 演唱會真的太感動了，今天到現在還在回味。",
                "username": "fan",
                "permalink": "https://www.threads.com/@fan/post/fan",
                "timestamp": "2026-10-01T01:30:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
            },
        ]

        deck = build_deck(posts, now)
        cards = deck["windows"]["1d"]["cards"]
        self.assertEqual([card["post_id"] for card in cards], ["fan"])
        self.assertEqual(cards[0]["category"], "其他演出內容")
        self.assertNotEqual(cards[0]["category"], "演後社群／內容需求")

    def test_cp_narrative_is_not_deleted_and_gets_text_features(self):
        now = datetime(2026, 10, 1, 3, 0, tzinfo=timezone.utc)
        text = (
            "演唱會結束後他又溫柔地靠向對方，眼神一直盯著他，"
            "耳邊說了很多話，接著輕輕拉著肩膀靠近。"
            "這段 CP 互動真的讓人一直回想。"
        ) * 3
        posts = [{
            "id": "cp",
            "text": text,
            "username": "shipper",
            "permalink": "https://www.threads.com/@shipper/post/cp",
            "timestamp": "2026-10-01T02:00:00Z",
            "signal_counted": True,
            "clean_exclusion_reason": "",
        }]

        deck = build_deck(posts, now)
        cards = deck["windows"]["1d"]["cards"]
        self.assertEqual(len(cards), 1)
        self.assertIn("cp_fandom_language", cards[0]["feature_tags"])
        self.assertIn("fan_narrative", cards[0]["feature_tags"])
        self.assertIn("long_fandom_story", cards[0]["feature_tags"])


    def test_reserve_pool_can_exceed_default_review_limit(self):
        now = datetime(2026, 10, 1, 3, 0, tzinfo=timezone.utc)
        posts = []
        for i in range(55):
            posts.append({
                "id": f"p{i}",
                "text": f"演唱會心得 {i}",
                "username": "fan",
                "permalink": f"https://www.threads.com/@fan/post/p{i}",
                "timestamp": "2026-10-01T01:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60 - (i / 100),
            })
        deck = build_deck(posts, now)
        one_day = deck["windows"]["1d"]
        self.assertEqual(one_day["card_count"], 55)
        self.assertEqual(one_day["default_review_limit"], 40)
        self.assertEqual(one_day["extend_step"], 10)

    def test_need_network_ranks_actionable_mobility_above_generic_question(self):
        now = datetime(2026, 10, 3, 2, 0, tzinfo=timezone.utc)
        posts = [
            {
                "id": "generic",
                "text": "第一次看演唱會，想問大家覺得值得去嗎？",
                "username": "generic",
                "permalink": "https://www.threads.com/@generic/post/generic",
                "timestamp": "2026-10-03T01:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60,
            },
            {
                "id": "mobility",
                "text": "Concert ends at 10:30. Can I catch the last metro, or should I stay near the venue?",
                "username": "traveler",
                "permalink": "https://www.threads.com/@traveler/post/mobility",
                "timestamp": "2026-10-03T01:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60,
            },
        ]

        deck = build_deck(posts, now)
        cards = deck["windows"]["1d"]["cards"]
        self.assertEqual(cards[0]["post_id"], "mobility")
        self.assertEqual(cards[0]["language_context"], "english")
        self.assertIn("mobility", cards[0]["need_nodes"])
        self.assertIn("stay", cards[0]["need_nodes"])
        self.assertIn("mobility->venue_outside", cards[0]["need_edges"])
        self.assertEqual(cards[0]["actionability_band"], "high")
        self.assertGreater(cards[0]["score"], cards[1]["score"])

    def test_language_context_is_context_not_a_filter(self):
        now = datetime(2026, 10, 3, 2, 0, tzinfo=timezone.utc)
        posts = [
            {
                "id": "hk",
                "text": "聽日去睇演唱會，散場後港鐵仲有冇車返酒店？",
                "username": "hk",
                "permalink": "https://www.threads.com/@hk/post/hk",
                "timestamp": "2026-10-03T01:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60,
            },
            {
                "id": "hans",
                "text": "第一次去看演唱会，散场以后地铁来得及吗？酒店住哪里比较方便？",
                "username": "hans",
                "permalink": "https://www.threads.com/@hans/post/hans",
                "timestamp": "2026-10-03T01:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 60,
            },
        ]
        cards = {card["post_id"]: card for card in build_deck(posts, now)["windows"]["1d"]["cards"]}
        self.assertEqual(cards["hk"]["language_context"], "hk_zh")
        self.assertEqual(cards["hans"]["language_context"], "zh_hans")
        self.assertTrue(cards["hk"]["need_nodes"])
        self.assertTrue(cards["hans"]["need_nodes"])

    def test_generic_fandom_is_kept_but_moved_to_low_actionability(self):
        now = datetime(2026, 10, 3, 2, 0, tzinfo=timezone.utc)
        posts = [{
            "id": "fan-only",
            "text": "演唱會真的太感動了，今天還在回味，下一場一定還要去！",
            "username": "fan",
            "permalink": "https://www.threads.com/@fan/post/fan-only",
            "timestamp": "2026-10-03T01:00:00Z",
            "signal_counted": True,
            "clean_exclusion_reason": "",
            "relevance_score": 60,
        }]
        card = build_deck(posts, now)["windows"]["1d"]["cards"][0]
        self.assertEqual(card["actionability_band"], "low")
        self.assertEqual(card["need_nodes"], [])

    def test_other_latin_is_not_misclassified_as_english(self):
        now = datetime(2026, 10, 3, 3, 0, tzinfo=timezone.utc)
        posts = [{
            "id": "other-latin",
            "text": "Esok siapa pergi concert wali band live di jb? Korang tema yang mana satu?",
            "username": "other",
            "permalink": "https://www.threads.com/@other/post/other",
            "timestamp": "2026-10-03T02:00:00Z",
            "signal_counted": True,
            "clean_exclusion_reason": "",
            "relevance_score": 60,
        }]
        card = build_deck(posts, now)["windows"]["1d"]["cards"][0]
        self.assertEqual(card["language_context"], "other_latin")
        self.assertEqual(card["actionability_band"], "low")


if __name__ == "__main__":
    unittest.main()
