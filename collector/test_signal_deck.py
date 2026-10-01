import unittest
from datetime import datetime, timezone

from collector.build_signal_deck import build_deck


class SignalDeckTests(unittest.TestCase):
    def test_builds_daily_windows_and_evidence(self):
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
            },
            {
                "id": "b",
                "text": "VIP 合照可以自己想動作嗎？有人有經驗嗎",
                "username": "two",
                "permalink": "https://www.threads.com/@two/post/b",
                "timestamp": "2026-09-30T23:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
            },
            {
                "id": "c",
                "text": "演唱會散場捷運末班車來得及嗎？",
                "username": "three",
                "permalink": "https://www.threads.com/@three/post/c",
                "timestamp": "2026-09-29T09:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
            },
            {
                "id": "noise",
                "text": "市長政治演講演唱會",
                "username": "four",
                "permalink": "https://www.threads.com/@four/post/noise",
                "timestamp": "2026-10-01T02:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
            },
        ]

        deck = build_deck(posts, now)
        self.assertEqual(deck["schema_version"], "signal-deck-v0.1")
        self.assertEqual(deck["refresh_policy"], "daily")
        self.assertEqual(set(deck["windows"]), {"1d", "3d", "5d"})

        one_day = deck["windows"]["1d"]
        self.assertEqual(one_day["card_count"], 1)
        self.assertEqual(one_day["cards"][0]["category"], "VIP／互動福利")
        self.assertEqual(one_day["cards"][0]["mentions"], 2)
        self.assertEqual(one_day["cards"][0]["authors"], 2)
        self.assertEqual(len(one_day["cards"][0]["evidence"]), 2)

        three_day_categories = {card["category"] for card in deck["windows"]["3d"]["cards"]}
        self.assertIn("交通／散場", three_day_categories)

    def test_excludes_resale_and_does_not_match_bigbang_as_ig(self):
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
                "id": "bigbang",
                "text": "BIGBANG 演唱會真的太感動了",
                "username": "fan",
                "permalink": "https://www.threads.com/@fan/post/bigbang",
                "timestamp": "2026-10-01T01:30:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
            },
        ]
        deck = build_deck(posts, now)
        categories = {card["category"] for card in deck["windows"]["1d"]["cards"]}
        self.assertNotIn("演後社群／內容需求", categories)
        self.assertEqual(deck["windows"]["1d"]["signal_count"], 0)


if __name__ == "__main__":
    unittest.main()
