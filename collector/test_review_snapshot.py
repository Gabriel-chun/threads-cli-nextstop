from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from collector.build_review_intelligence import load_rows as load_intelligence
from collector.build_relevance_profile import load_rows as load_profile


class CurrentReviewSnapshotTests(unittest.TestCase):
    def test_current_snapshot_overrides_historical_labels(self):
        with tempfile.TemporaryDirectory() as root:
            archive = Path(root) / "reviews"
            archive.mkdir()
            (archive / "2026-10-01.json").write_text(json.dumps({"rows": [
                {"post_key": "a", "label": "irrelevant", "reviewed_at": "2026-10-01T01:00:00Z"},
                {"post_key": "b", "label": "relevant", "reviewed_at": "2026-10-01T02:00:00Z"}
            ]}), encoding="utf-8")
            current = Path(root) / "snapshot.json"
            current.write_text(json.dumps({
                "schema_version": "signal-review-current-v0.1",
                "rows": [
                    {"post_key": "a", "label": "relevant", "reviewed_at": "2026-10-01T01:00:00Z",
                     "notion_edited_at": "2026-10-11T01:00:00Z"},
                    {"post_key": "b", "label": "irrelevant", "reviewed_at": "2026-10-01T02:00:00Z",
                     "notion_edited_at": "2026-10-11T01:00:00Z"}
                ]
            }), encoding="utf-8")
            for loader in (load_intelligence, load_profile):
                old = {row["post_key"]: row["label"] for row in loader(archive)}
                self.assertEqual(old, {"a": "irrelevant", "b": "relevant"})
                new = {row["post_key"]: row["label"] for row in loader(archive, current)}
                self.assertEqual(new, {"a": "relevant", "b": "irrelevant"})

    def test_current_snapshot_does_not_fall_back_on_empty_data(self):
        with tempfile.TemporaryDirectory() as root:
            archive = Path(root)
            current = archive / "snapshot.json"
            current.write_text(json.dumps({"schema_version": "signal-review-current-v0.1", "rows": []}), encoding="utf-8")
            for loader in (load_intelligence, load_profile):
                with self.assertRaises(ValueError):
                    loader(archive, current)


if __name__ == "__main__":
    unittest.main()
