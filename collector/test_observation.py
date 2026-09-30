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


    def test_existing_historical_run_is_master_independent(self):
        archive = Path(__file__).resolve().parents[1] / "collector" / "archive"
        stamp = "2026-09-29_160951Z"
        summary = obs.load_json(archive / "runs" / f"summary_{stamp}.json")
        snapshot_path = archive / "snapshots" / f"snapshot_{stamp}.json"
        snapshot = obs.load_json(snapshot_path, [])
        history = obs.load_json(archive / "latest" / "history.json", [])
        queries = obs.normalized_query_lines(archive / "runs" / f"queries_{stamp}.txt")
        failed = obs.normalized_query_lines(archive / "runs" / f"failed_queries_{stamp}.txt")

        args = dict(
            summary=summary,
            snapshot_rows=snapshot,
            history=history,
            queries=queries,
            failed_queries=failed,
            snapshot_path=snapshot_path,
            runs_dir=archive / "runs",
            snapshots_dir=archive / "snapshots",
            observations_dir=archive / "observations",
            track=None,
            config_key=None,
            evidence_limit=8,
        )
        first, _ = obs.build_bundle(**args)
        with tempfile.TemporaryDirectory() as tmp:
            fake_master = Path(tmp) / "master.json"
            write_json(fake_master, [{"id": "changed-latest-master"}])
            write_json(fake_master, [{"id": "changed-again"}])
        second, _ = obs.build_bundle(**args)

        self.assertEqual(first, second)
        self.assertEqual(first["run"]["run_stamp"], stamp)
        self.assertFalse(first["lineage"]["master_dependency"])
        self.assertLessEqual(first["evidence"]["returned"], 8)



    def test_coverage_complete_can_still_have_sparse_sampling(self):
        current_at = obs.parse_time("2026-09-30T12:00:00Z")
        self.assertIsNotNone(current_at)
        eligible = [
            {"run_stamp":"a","run_at":"2026-09-29T11:00:00Z","unique_signals":10,"new_3h":2,"new_12h":20,"clean_rate_pct":70,"_compatibility":{"config":"compatible"}},
            {"run_stamp":"b","run_at":"2026-09-29T18:00:00Z","unique_signals":11,"new_3h":3,"new_12h":21,"clean_rate_pct":71,"_compatibility":{"config":"compatible"}},
            {"run_stamp":"c","run_at":"2026-09-30T00:00:00Z","unique_signals":12,"new_3h":4,"new_12h":22,"clean_rate_pct":72,"_compatibility":{"config":"compatible"}},
            {"run_stamp":"d","run_at":"2026-09-30T06:00:00Z","unique_signals":13,"new_3h":5,"new_12h":23,"clean_rate_pct":73,"_compatibility":{"config":"compatible"}},
        ]
        baseline = obs.baseline_window("24h", 24, current_at, eligible, [], [], 120)
        self.assertTrue(baseline["complete"])
        self.assertTrue(baseline["coverage_complete"])
        self.assertEqual(baseline["coverage_hours"], 24.0)
        self.assertEqual(baseline["sampling_quality"], "sparse")
        self.assertFalse(baseline["sampling"]["cadence_within_tolerance"])
        self.assertGreater(baseline["max_gap_minutes"], baseline["sampling"]["max_expected_gap_minutes"])

    def test_smoke_run_is_archived_but_excluded_from_previous_baseline(self):
        def setup(runs, snapshots):
            for stamp, at, provenance, eligible in [
                ("2026-09-29_080000Z", "2026-09-29T08:00:00Z", "scheduled", True),
                ("2026-09-29_100000Z", "2026-09-29T10:00:00Z", "smoke", False),
            ]:
                write_json(runs / f"summary_{stamp}.json", {
                    "run_stamp": stamp,
                    "run_at": at,
                    "pipeline_version": "clean-v2.1",
                    "min_score": 30,
                    "since_hours": 12,
                })
                (runs / f"queries_{stamp}.txt").write_text("演唱會\n", encoding="utf-8")
                write_json(snapshots / f"snapshot_{stamp}.json", [row(1)])
                obs_dir = runs.parent / "observations"
                write_json(obs_dir / f"{stamp}.json", {
                    "run": {
                        "run_stamp": stamp,
                        "pipeline_version": "clean-v2.1",
                        "track": "演唱會",
                        "config_key": "concert",
                        "provenance": provenance,
                        "baseline_eligible": eligible,
                    }
                })

        history = [
            {"run_stamp":"2026-09-29_080000Z","run_at":"2026-09-29T08:00:00Z","pipeline_version":"clean-v2.1","unique_signals":1,"new_3h":1,"new_12h":1,"clean_rate_pct":100},
            {"run_stamp":"2026-09-29_100000Z","run_at":"2026-09-29T10:00:00Z","pipeline_version":"clean-v2.1","unique_signals":1,"new_3h":1,"new_12h":1,"clean_rate_pct":100},
        ]
        temp, bundle, _ = self.build(history=history, setup=setup)
        self.addCleanup(temp.cleanup)
        previous = bundle["deterministic_facts"]["previous_comparable_run"]
        self.assertEqual(previous["run_stamp"], "2026-09-29_080000Z")
        baseline = bundle["deterministic_facts"]["baselines"]["24h"]
        self.assertEqual(baseline["compatibility"]["excluded_provenance_counts"].get("smoke"), 1)
        self.assertIn("baseline_ineligible_history_present", bundle["data_quality"]["flags"])

    def test_current_smoke_provenance_is_explicit_and_ineligible(self):
        temp, bundle, event = self.build()
        self.addCleanup(temp.cleanup)
        self.assertEqual(bundle["run"]["provenance"], "unknown")
        self.assertFalse(bundle["run"]["baseline_eligible"])
        self.assertFalse(event["run"]["baseline_eligible"])



if __name__ == "__main__":
    unittest.main()
