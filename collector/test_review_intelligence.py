from __future__ import annotations

import unittest
from datetime import datetime, timezone

from collector.build_review_intelligence import build


class ReviewIntelligenceTest(unittest.TestCase):
    def test_builds_transport_and_stay_clusters_without_mutating_labels(self):
        rows = [
            {
                "post_key": "r1",
                "label": "relevant",
                "category": "交通／散場",
                "reviewed_at": "2026-10-11T01:00:00Z",
                "text_excerpt": "演唱會17:00開始，21:30高鐵來得及嗎？不知道該買哪班回程。",
                "feature_tags": ["question_intent", "transport_need"],
            },
            {
                "post_key": "r2",
                "label": "relevant",
                "category": "住宿／落腳",
                "reviewed_at": "2026-10-11T01:01:00Z",
                "text_excerpt": "想問Impact附近有沒有酒店推薦，散場後想直接回飯店。",
                "feature_tags": ["question_intent", "accommodation_need"],
            },
            {
                "post_key": "i1",
                "label": "irrelevant",
                "category": "票務／入場摩擦",
                "reviewed_at": "2026-10-11T01:02:00Z",
                "text_excerpt": "求票，朋友臨時不能去，有票請私訊。",
                "feature_tags": ["ticketing_need"],
            },
        ]

        payload = build(rows, datetime(2026, 10, 11, 2, 0, tzinfo=timezone.utc))
        self.assertEqual(payload["review_counts"], {"total": 3, "relevant": 2, "irrelevant": 1})

        clusters = {row["cluster_id"]: row for row in payload["demand_clusters"]}
        self.assertEqual(clusters["post_show_return"]["affiliate_fit"], "ready")
        self.assertEqual(clusters["post_show_return"]["relevant_count"], 1)
        self.assertIn("intercity_transport_booking", clusters["post_show_return"]["solution_map"])

        self.assertEqual(clusters["accommodation"]["affiliate_fit"], "ready")
        self.assertEqual(clusters["accommodation"]["relevant_count"], 1)
        self.assertIn("accommodation_booking", clusters["accommodation"]["solution_map"])

        self.assertEqual(payload["negative_patterns"]["resale"]["irrelevant"], 1)
        self.assertEqual(rows[0]["label"], "relevant")
        self.assertEqual(rows[2]["label"], "irrelevant")

    def test_question_intent_is_not_treated_as_the_decision_boundary(self):
        rows = [
            {
                "post_key": "r1",
                "label": "relevant",
                "category": "交通／散場",
                "reviewed_at": "2026-10-11T01:00:00Z",
                "text_excerpt": "請問散場後趕最後一班高鐵來得及嗎？",
                "feature_tags": ["question_intent", "transport_need"],
            },
            {
                "post_key": "i1",
                "label": "irrelevant",
                "category": "VIP／互動福利",
                "reviewed_at": "2026-10-11T01:01:00Z",
                "text_excerpt": "請問大家覺得VIP哪一區最好看？",
                "feature_tags": ["question_intent", "vip_benefit"],
            },
        ]

        payload = build(rows, datetime(2026, 10, 11, 2, 0, tzinfo=timezone.utc))
        self.assertEqual(payload["review_counts"]["relevant"], 1)
        self.assertEqual(payload["review_counts"]["irrelevant"], 1)
        self.assertEqual(payload["positive_patterns"]["time_constraint"]["relevant"], 1)
        self.assertEqual(payload["positive_patterns"]["time_constraint"]["irrelevant"], 0)


if __name__ == "__main__":
    unittest.main()
