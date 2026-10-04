import unittest
from datetime import datetime, timezone

from collector.build_relevance_profile import build_profile
from collector.build_signal_deck import build_deck


class RelevanceProfileTests(unittest.TestCase):
    def test_profile_learns_positive_transport_signal(self):
        rows = [
            {
                "post_key": f"rel-{i}",
                "label": "relevant",
                "category": "交通／散場",
                "feature_tags": ["transport_need", "question_intent"],
                "reviewed_at": "2026-10-04T00:00:00Z",
            }
            for i in range(8)
        ] + [
            {
                "post_key": f"irr-{i}",
                "label": "irrelevant",
                "category": "其他演出內容",
                "feature_tags": ["question_intent"],
                "reviewed_at": "2026-10-04T00:00:00Z",
            }
            for i in range(12)
        ]

        profile = build_profile(rows, datetime(2026, 10, 4, tzinfo=timezone.utc))
        self.assertGreater(profile["feature_weights"]["transport_need"], 0)
        self.assertGreater(profile["category_weights"]["交通／散場"], 0)
        self.assertLess(profile["category_weights"]["其他演出內容"], 0)

    def test_positive_profile_reorders_without_filtering(self):
        now = datetime(2026, 10, 4, 4, 0, tzinfo=timezone.utc)
        profile = {
            "schema_version": "relevance-profile-v0.3",
            "generated_at": "2026-10-04T00:00:00Z",
            "feedback_count": 20,
            "feature_weights": {
                "transport_need": 4.0,
                "question_intent": -3.0,
            },
            "category_weights": {
                "交通／散場": 2.0,
                "其他演出內容": -2.0,
            },
        }
        posts = [
            {
                "id": "generic",
                "text": "想問大家這場演唱會值得去嗎？",
                "username": "generic",
                "permalink": "https://www.threads.com/@generic/post/generic",
                "timestamp": "2026-10-04T03:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 70,
            },
            {
                "id": "mobility",
                "text": "演唱會散場後要趕高鐵，末班車來得及嗎？",
                "username": "mobility",
                "permalink": "https://www.threads.com/@mobility/post/mobility",
                "timestamp": "2026-10-04T03:00:00Z",
                "signal_counted": True,
                "clean_exclusion_reason": "",
                "relevance_score": 70,
            },
        ]

        cards = build_deck(posts, now, profile)["windows"]["1d"]["cards"]
        self.assertEqual(len(cards), 2)
        self.assertEqual(cards[0]["post_id"], "mobility")
        self.assertGreater(cards[0]["ranking_delta"], 0)
        self.assertLess(cards[1]["ranking_delta"], 0)


if __name__ == "__main__":
    unittest.main()
