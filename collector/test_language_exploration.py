import unittest

from collector.summarize_language_exploration import summarize, validate_config


class LanguageExplorationTests(unittest.TestCase):
    def test_tracks_language_yield_without_mixing_baseline(self):
        config = {
            "baseline_policy": "unchanged",
            "baseline_queries": ["演唱會", "演唱会", "concert"],
            "review_policy": "exploration samples stay outside the Daily Signal Deck",
            "comparison_policy": "compare target-language and need-node yield by track and query before promotion",
            "tracks": {
                "zh_hant_need": {
                    "role": "control_exploration",
                    "target_language": "zh_hant",
                    "queries": ["演唱會 高鐵", "演唱會 飯店", "演唱會 散場"],
                },
                "zh_hans_need": {
                    "role": "exploration",
                    "target_language": "zh_hans",
                    "queries": ["演唱会 高铁", "演唱会 酒店", "演唱会 散场"],
                },
                "en_need": {
                    "role": "exploration",
                    "target_language": "english",
                    "queries": ["concert last train", "concert hotel near venue"],
                },
            },
        }
        rows = [
            {
                "id": "hant1",
                "query": "演唱會 高鐵",
                "text": "演唱會散場後還趕得上高鐵末班車嗎？",
                "signal_counted": True,
                "timestamp": "2026-10-04T01:00:00Z",
                "permalink": "https://example.com/hant1",
            },
            {
                "id": "hans1",
                "query": "演唱会 高铁",
                "text": "演唱会散场后还能赶上高铁末班车吗？",
                "signal_counted": True,
                "timestamp": "2026-10-04T01:05:00Z",
                "permalink": "https://example.com/hans1",
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
        hant = result["tracks"]["zh_hant_need"]
        hans = result["tracks"]["zh_hans_need"]
        en = result["tracks"]["en_need"]

        self.assertEqual(hant["clean_signals"], 1)
        self.assertEqual(hant["target_language_signals"], 1)
        self.assertEqual(hant["target_language_need_signals"], 1)
        self.assertIn("mobility", hant["need_node_distribution"])

        self.assertEqual(hans["clean_signals"], 1)
        self.assertEqual(hans["target_language_signals"], 1)
        self.assertEqual(hans["target_language_need_signals"], 1)
        self.assertIn("mobility", hans["need_node_distribution"])

        self.assertEqual(en["clean_signals"], 2)
        self.assertEqual(en["target_language_signals"], 1)
        self.assertEqual(en["other_latin_signals"], 1)
        self.assertIn("stay", en["need_node_distribution"])

        self.assertEqual(
            hant["query_metrics"]["演唱會 高鐵"]["target_need_share_pct"],
            100.0,
        )
        self.assertEqual(result["baseline_policy"], "unchanged")

    def test_rejects_overlap_with_baseline_and_duplicate_language_targets(self):
        with self.assertRaises(ValueError):
            validate_config({
                "baseline_queries": ["演唱會"],
                "tracks": {
                    "a": {"target_language": "zh_hant", "queries": ["演唱會"]},
                },
            })

        with self.assertRaises(ValueError):
            validate_config({
                "baseline_queries": ["演唱會"],
                "tracks": {
                    "a": {"target_language": "zh_hant", "queries": ["演唱會 高鐵"]},
                    "b": {"target_language": "zh_hant", "queries": ["演唱會 飯店"]},
                },
            })


if __name__ == "__main__":
    unittest.main()
