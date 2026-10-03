import json, tempfile, unittest
from pathlib import Path
from collector.trend_tracking.generate_queries import build_plan
from collector.trend_tracking.build_trend_snapshot import dedupe, norm
from datetime import date

class TrendTrackingTests(unittest.TestCase):
    def test_query_budget_is_bounded(self):
        plan=build_plan(date(2026,10,3), 18)
        self.assertLessEqual(plan["query_count"],18)
        self.assertGreater(plan["query_count"],0)
        self.assertEqual(len({q["query"] for q in plan["queries"]}), plan["query_count"])

    def test_same_author_near_duplicate_is_suppressed(self):
        rows=[
            {"id":"1","username":"a","text":"藤井風 高鐵 怎麼回去","permalink":"u1","timestamp":"2026-10-03T01:00:00Z"},
            {"id":"2","username":"a","text":"藤井風高鐵怎麼回去！","permalink":"u2","timestamp":"2026-10-03T01:01:00Z"},
            {"id":"3","username":"b","text":"藤井風 高鐵 怎麼回去","permalink":"u3","timestamp":"2026-10-03T01:02:00Z"}
        ]
        self.assertEqual(len(dedupe(rows)),2)

    def test_normalization_removes_noise_not_meaning(self):
        self.assertEqual(norm("#SKZ 末班車?"),"skz末班車")

if __name__=="__main__": unittest.main()
