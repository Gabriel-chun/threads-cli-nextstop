import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from collector.assess_coverage import assess, quality_allows_baseline


def diagnostics(status="ok"):
    return {"queries": [{"query": "concert", "pages": [
        {"source": "threads_ssr", "page": 1, "status": "ok"},
        {"source": "threads_graphql", "page": 2, "status": status},
    ]}]}


class CoverageTest(unittest.TestCase):
    def test_fresh_ssr_does_not_hide_failed_pagination(self):
        result = assess({"raw_rows": 20, "filter_diagnostics": {"accepted_raw_rows": 4}},
                        diagnostics("graphql_errors"), ["concert"], [])
        self.assertEqual(result["coverage_status"], "partial")
        self.assertEqual(result["source_failure_count"], 1)
        self.assertEqual(result["source_failure_kinds"], ["graphql_errors"])
        self.assertFalse(result["quality_baseline_eligible"])

    def test_replay_actual_latest_stale_archive(self):
        archive = Path(__file__).parent / "archive/runs"
        summary = json.loads((archive / "summary_2026-10-23_004641Z.json").read_text())
        sources = json.loads((archive / "search_source_diagnostics_2026-10-23_004641Z.json").read_text())
        queries = [r["query"] for r in sources["queries"]]
        result = assess(summary, sources, queries, [])
        self.assertEqual(result["coverage_status"], "stale")
        self.assertEqual(result["source_failure_count"], 3)
        self.assertFalse(quality_allows_baseline(result))
        self.assertEqual(summary["master_unique_rows"], result["master_unique_rows"])
        self.assertEqual(summary["unique_signals"], result["unique_signals"])

    def test_missing_query_diagnostics_fail_closed(self):
        result = assess({"raw_rows": 20, "filter_diagnostics": {"accepted_raw_rows": 4}},
                        diagnostics(), ["concert", "演唱會"], [])
        self.assertEqual(result["coverage_status"], "partial")
        self.assertFalse(result["quality_baseline_eligible"])
        self.assertEqual(result["missing_diagnostic_queries"], ["演唱會"])

    def test_healthy_empty_of_clean_signals_can_be_a_baseline(self):
        # Fresh accepted candidates can legitimately all be resale transactions.
        result = assess({"raw_rows": 20, "unique_signals": 0,
                         "filter_diagnostics": {"accepted_raw_rows": 4}},
                        diagnostics(), ["concert"], [])
        self.assertTrue(result["quality_baseline_eligible"])

    def test_old_mislabelled_archive_with_rejection_evidence_is_excluded(self):
        self.assertFalse(quality_allows_baseline({"coverage_status": "observed",
                         "raw_rows": 34, "filter_diagnostics": {"accepted_raw_rows": 0}}))

    def test_pre_diagnostic_empty_snapshot_is_not_a_healthy_baseline(self):
        self.assertFalse(quality_allows_baseline({"coverage_status": "observed",
                                                 "raw_rows": 34, "snapshot_unique_rows": 0}))

    def test_zero_rows_is_degraded(self):
        result = assess({"raw_rows": 0}, diagnostics("http_429"), ["concert"], ["concert"])
        self.assertEqual(result["coverage_status"], "degraded")
        self.assertEqual(result["run_status"], "Failed")


class WorkflowRegressionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = (Path(__file__).parents[1] / ".github/workflows/nextstop-collector.yml").read_text()

    def step_script(self, name):
        section = self.workflow.split(f"      - name: {name}\n", 1)[1]
        block = section.split("        run: |\n", 1)[1]
        lines = []
        for line in block.splitlines():
            if line and not line.startswith("          "):
                break
            lines.append(line[10:] if line else "")
        return "\n".join(lines)

    def test_every_trigger_obeys_cadence(self):
        self.assertIn("# recovery-safe-main-v1", self.workflow)
        script = self.step_script("Decide whether collection is due")
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "collector/archive/runs").mkdir(parents=True)
            from datetime import datetime, timezone
            (root / "collector/archive/runs/summary_recent.json").write_text(json.dumps({"run_at": datetime.now(timezone.utc).isoformat()}))
            for event in ["schedule", "workflow_dispatch", "push", "workflow_run"]:
                output = root / f"{event}.txt"
                subprocess.run(["bash", "-e", "-c", script], cwd=root,
                               env={**os.environ, "GITHUB_OUTPUT": str(output), "GITHUB_EVENT_NAME": event},
                               check=True, capture_output=True)
                self.assertIn("should_run=false", output.read_text())

    def test_final_quality_output_is_used_by_archive(self):
        self.assertIn("baseline_eligible: ${{ steps.quality.outputs.baseline_eligible }}", self.workflow)

    def test_stale_failure_happens_after_archive_is_saved(self):
        self.assertGreater(self.workflow.index("      - name: Report archived source health"),
                           self.workflow.index("git push origin HEAD:main"))
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "collector/archive/runs").mkdir(parents=True)
            path = root / "collector/archive/runs/summary_test.json"
            for coverage, code in [("stale", 1), ("degraded", 1), ("partial", 0), ("observed", 0)]:
                path.write_text(json.dumps({"coverage_status": coverage, "notion_sync_status": "success"}))
                result = subprocess.run(["bash", "-e", "-c", self.step_script("Report archived source health")], cwd=root,
                                        env={**os.environ, "RUN_STAMP": "test"}, capture_output=True)
                self.assertEqual(result.returncode, code)
            path.write_text(json.dumps({"coverage_status": "observed", "notion_sync_status": "failure"}))
            result = subprocess.run(["bash", "-e", "-c", self.step_script("Report archived source health")], cwd=root,
                                    env={**os.environ, "RUN_STAMP": "test"}, capture_output=True)
            self.assertEqual(result.returncode, 1)

    def test_backup_heartbeats_cannot_loop_back_from_collector_dependents(self):
        heartbeat = self.workflow.split("  workflow_run:", 1)[1].split("  workflow_dispatch:", 1)[0]
        self.assertIn('"Next Stop Trend Tracking"', heartbeat)
        self.assertIn('"Language Need Exploration"', heartbeat)
        for dependent in ["Daily Signal Deck", "Daily Keyword Network", "Observation Event"]:
            self.assertNotIn(dependent, heartbeat)
        self.assertIn("head_repository.full_name == github.repository", self.workflow)
        self.assertIn("id: notion\n        timeout-minutes: 5\n        continue-on-error: true", self.workflow)


if __name__ == "__main__":
    unittest.main()
