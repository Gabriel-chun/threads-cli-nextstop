#!/usr/bin/env python3
"""Record downstream sync health and preserve the last usable source snapshot.

Run after artifact download and before copying output into the archive. Source
quality and Notion availability are deliberately independent.
"""
import json
import os
import shutil
from pathlib import Path
from assess_coverage import quality_allows_baseline


def prepare(output, latest, sync_status):
    summary_path = output / "summary.json"
    observation_path = output / "observation_bundle.json"
    summary = json.loads(summary_path.read_text())
    observation = json.loads(observation_path.read_text())
    summary["notion_sync_status"] = sync_status
    observation.setdefault("run", {})["notion_sync_status"] = sync_status
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    observation_path.write_text(json.dumps(observation, ensure_ascii=False, indent=2) + "\n")
    usable = (summary.get("coverage_status") == "observed"
              and summary.get("run_status") == "Success"
              and quality_allows_baseline(summary))
    if usable:
        latest.mkdir(parents=True, exist_ok=True)
        # Validate all inputs before replacing the prior good backup.
        snapshot = output / f"snapshot_{summary['run_stamp']}.json"
        json.loads(snapshot.read_text())
        shutil.copyfile(snapshot, latest / "last_good_snapshot.json")
        shutil.copyfile(summary_path, latest / "last_good_summary.json")
        shutil.copyfile(observation_path, latest / "last_good_observation.json")
    return usable


if __name__ == "__main__":
    prepare(Path("collector/output"), Path("collector/archive/latest"),
            os.environ.get("NOTION_SYNC_STATUS", "unknown"))
