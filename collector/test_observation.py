import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("build_observation.py")
SPEC = importlib.util.spec_from_file_location("build_observation", MODULE_PATH)
obs = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(obs)


def write_json(path: Path, value):
    path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")


def row(i: int):
    return {
        "id": f"p{i}",
        "text": f"演唱會測試 {i}",
        "username": f"u{i}",
        "permalink": f"https://threads.example/p{i}",
        "timestamp": f"2026-09-29T0{i}:00:00Z",
        "first_seen_at": f"2026-09-29T0{i}:00:00Z",
        "signal_counted": True,
        "dedupe_counted": True,
    }


class ObservationBundleTest(unittest.TestCase):
    def build(self, history=None, evidence_limit=16, pipeline="clean-v2.1", setup=None):
        temp = tempfile.TemporaryDirectory()
        root = Path(temp.name)
        runs, snapshots, observations = root/"runs", root/"snapshots", root/"observations"
        for p in (runs, snapshots, observations): p.mkdir()
        if setup: setup(runs, snapshots)
        snapshot = [row(i) for i in range(1, 6)]
        snapshot_path = root/"snapshot.json"
        write_json(snapshot_path, snapshot)
        summary = {
            "run_stamp":"2026-09-29_120000Z","run_at":"2026-09-29T12:00:00Z",
            "pipeline_version":pipeline,"raw_rows":5,"snapshot_unique_rows":5,
            "min_score":30,"since_hours":12,"dedupe_unique_signals":5,
            "unique_signals":5,"suppressed_duplicates":0,"excluded_transactions":0,
            "clean_rate_pct":100.0,"new_3h":2,"new_12h":5,
        }
        bundle, event = obs.build_bundle(
            summary=summary,snapshot_rows=snapshot,history=history or [],
            queries=["演唱會"],failed_queries=[],snapshot_path=snapshot_path,
            runs_dir=runs,snapshots_dir=snapshots,observations_dir=observations,
            track="演唱會",config_key="concert",evidence_limit=evidence_limit,
        )
        return temp, bundle, event

    def test_evidence_limit(self):
        temp, bundle, _ = self.build(evidence_limit=2)
        self.addCleanup(temp.cleanup)
        self.assertEqual(bundle["evidence"]["returned"], 2)

    def test_incomplete_baselines(self):
        temp, bundle, _ = self.build()
        self.addCleanup(temp.cleanup)
        self.assertFalse(bundle["deterministic_facts"]["baselines"]["72h"]["complete"])
        self.assertFalse(bundle["deterministic_facts"]["baselines"]["7d"]["complete"])

    def test_incompatible_pipeline_is_excluded(self):
        def setup(runs, snapshots):
            write_json(runs/"summary_2026-09-29_100000Z.json", {
                "run_stamp":"2026-09-29_100000Z","run_at":"2026-09-29T10:00:00Z",
                "pipeline_version":"clean-v2","min_score":30,"since_hours":12})
            (runs/"queries_2026-09-29_100000Z.txt").write_text("演唱會\n", encoding="utf-8")
            write_json(snapshots/"snapshot_2026-09-29_100000Z.json", [row(1)])
        history=[{"run_stamp":"2026-09-29_100000Z","run_at":"2026-09-29T10:00:00Z",
                  "pipeline_version":"clean-v2","unique_signals":1,"new_3h":1,
                  "new_12h":1,"clean_rate_pct":100}]
        temp, bundle, _ = self.build(history=history, setup=setup)
        self.addCleanup(temp.cleanup)
        self.assertIsNone(bundle["deterministic_facts"]["previous_comparable_run"])
        self.assertIn("incompatible_pipeline_history_present", bundle["data_quality"]["flags"])

    def test_manifest_never_emits(self):
        temp, bundle, event = self.build()
        self.addCleanup(temp.cleanup)
        self.assertEqual(event["event_id"], bundle["observation_id"])
        self.assertEqual(event["delivery"], {"mode":"manifest_only","emitted":False,"phase":"phase1"})


if __name__ == "__main__":
    unittest.main()
