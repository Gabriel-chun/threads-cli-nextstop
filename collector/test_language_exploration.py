import unittest

from collector.summarize_language_exploration import summarize


class LanguageExplorationTests(unittest.TestCase):
    def test_tracks_language_yield_without_mixing_baseline(self):
        config = {
            "baseline_policy": "unchanged",
            "baseline_queries": ["演唱會", "演唱会", "concert"],
            "review_policy": "exploration samples stay outside the Daily Signal Deck",
            "tracks": {
                "zh_hans_need": {
                    "target_language": "zh_hans",
                    "queries": ["演唱会 高铁", "演唱会 酒店", "演唱会 散场"],
                },
                "en_need": {
                    "target_language": "english",
                    "queries": ["concert last train", "concert hotel near venue"],
                },
            },
        }
        rows = [
            {
                "id": "zh1",
                "query": "演唱会 高铁",
                "text": "演唱会散场后还能赶上高铁末班车吗？",
                "signal_counted": True,
                "timestamp": "2026-10-04T01:00:00Z",
                "permalink": "https://example.com/zh1",
            },
            {
                "id": "en1",
                "query": "concert hotel near venue",
                "text": "Which hotel should I stay at near the concert venue?",
                "signal_counted": True,
                "timestamp": "2026-10-04T01:10:00Z",
                "permalink": "https://example.com/en1",
            },
            {
                "id": "other",
                "query": "concert last train",
                "text": "Konsert malam ini sangat meriah dan seronok.",
                "signal_counted": True,
                "timestamp": "2026-10-04T01:20:00Z",
                "permalink": "https://example.com/other",
            },
            {
                "id": "baseline",
                "query": "演唱會",
                "text": "演唱會散場怎麼回家？",
                "signal_counted": True,
                "timestamp": "2026-10-04T01:30:00Z",
                "permalink": "https://example.com/baseline",
            },
        ]

        result = summarize(config, rows, "test")
        zh = result["tracks"]["zh_hans_need"]
        en = result["tracks"]["en_need"]

        self.assertEqual(zh["clean_signals"], 1)
        self.assertEqual(zh["target_language_signals"], 1)
        self.assertIn("mobility", zh["need_node_distribution"])

        self.assertEqual(en["clean_signals"], 2)
        self.assertEqual(en["target_language_signals"], 1)
        self.assertEqual(en["other_latin_signals"], 1)
        self.assertIn("stay", en["need_node_distribution"])

        self.assertEqual(result["baseline_policy"], "unchanged")


if __name__ == "__main__":
    unittest.main()
