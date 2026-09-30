#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
import statistics
import unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "observation-bundle-v1"
EVENT_VERSION = "1"
CLASSIFIER_NAME = "dashboard-intent-regex"
CLASSIFIER_VERSION = "v1"
DEFAULT_EVIDENCE_LIMIT = 16
DEFAULT_EXPECTED_CADENCE_MINUTES = 120
VALID_PROVENANCE = {"scheduled", "manual", "smoke", "unknown"}


def parse_time(value: Any) -> datetime | None:
    if not value:
        return None
    s = str(value).strip()
    if not s:
        return None
    try:
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def iso_z(dt: datetime | None) -> str | None:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if dt else None


def load_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def normalized_query_lines(path: Path | None) -> list[str]:
    if path is None or not path.exists():
        return []
    return [
        line.strip()
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]


def query_hash(lines: list[str]) -> str | None:
    return hashlib.sha256("\n".join(lines).encode("utf-8")).hexdigest() if lines else None


def sha256_file(path: Path | None) -> str | None:
    if path is None or not path.exists():
        return None
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(65536), b""):
            h.update(block)
    return h.hexdigest()


def clean_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [row for row in rows if bool(row.get("signal_counted"))]


def post_id(row: dict[str, Any]) -> str:
    return str(row.get("id") or row.get("permalink") or "").strip()


def first_seen(row: dict[str, Any]) -> datetime | None:
    return parse_time(row.get("first_seen_at") or row.get("timestamp") or row.get("searched_at"))


def posted_at(row: dict[str, Any]) -> datetime | None:
    return parse_time(row.get("timestamp") or row.get("first_seen_at"))


def normalize_text(value: Any) -> str:
    return unicodedata.normalize("NFKC", str(value or "")).strip()


def classify_intent(text: str) -> dict[str, str]:
    if re.search(r"Pia帳號|日本門號|本人確認|本確|護照|trip.*門票|現場再換票|抽選|公售|實名制|黃牛.*搶不到|愛心席|退票|客服|手環|購票紀錄|重新買一張票", text, re.I):
        return {"category": "票務／入場摩擦", "kind": "actionable"}
    if re.search(r"中止|取消|淹水|機票|計程車|捷運|行李|趕場|交通|出發", text, re.I):
        return {"category": "取消／交通／行程風險", "kind": "actionable"}
    if re.search(r"節目冊|聯名T|周邊|代購費|缺貨|貨.*充足|戰袍", text, re.I):
        return {"category": "周邊／現場商品", "kind": "actionable"}
    if re.search(r"一個睇|一個人|找個伴|一起走|同行|第一次看演唱會", text, re.I):
        return {"category": "陪同／Solo Attendance", "kind": "actionable"}
    if re.search(r"拍攝|錄音|謝幕.*可以拍|不能拍|唔可以影", text, re.I):
        return {"category": "拍攝／現場規則", "kind": "actionable"}
    if re.search(r"搖滾區|站起來|坐下|工作人員|應援|encore|字幕|翻譯|視線|被擠|超空|外國人.*比例|東南亞人", text, re.I):
        return {"category": "場館／現場體驗", "kind": "context"}
    if re.search(r"徵.*影片|影片.*糊|找.*影片|桌布|找人|哀居|IG", text, re.I):
        return {"category": "演後社群／內容需求", "kind": "context"}
    if re.search(r"海底撈|散場.*吃|演唱會結束.*吃", text, re.I):
        return {"category": "散場後消費", "kind": "actionable"}
    if re.search(r"市長|政見|參選|唯一支持|政治|同框|YG fam|關係逐漸微妙|CP|哥哥們碰面", text, re.I):
        return {"category": "關鍵詞雜訊", "kind": "noise"}
    if re.search(r"請問|想問|有人有相關經驗|怎麼|如何|為什麼|有沒有人", text, re.I):
        return {"category": "其他問題／需求", "kind": "context"}
    return {"category": "粉絲心得／現場紀錄", "kind": "noise"}


def derived_clusters(rows: list[dict[str, Any]]) -> dict[str, Any]:
    counts: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        ann = classify_intent(normalize_text(row.get("text")))
        key = (ann["kind"], ann["category"])
        item = counts.setdefault(key, {"kind": ann["kind"], "category": ann["category"], "count": 0, "authors": set(), "post_ids": []})
        item["count"] += 1
        username = str(row.get("username") or "").strip().lower()
        if username:
            item["authors"].add(username)
        pid = post_id(row)
        if pid:
            item["post_ids"].append(pid)
    clusters = [
        {
            "kind": item["kind"],
            "category": item["category"],
            "count": item["count"],
            "unique_authors": len(item["authors"]),
            "post_ids": item["post_ids"],
        }
        for item in counts.values()
    ]
    clusters.sort(key=lambda x: (-x["count"], x["kind"], x["category"]))
    return {
        "authoritative": False,
        "classifier": {
            "name": CLASSIFIER_NAME,
            "version": CLASSIFIER_VERSION,
            "deterministic": True,
            "note": "Derived annotation only; it does not alter Collector Clean / Dedupe source of truth.",
        },
        "clusters": clusters,
    }


def summary_pipeline_version(summary: dict[str, Any]) -> str | None:
    value = summary.get("pipeline_version")
    return str(value).strip() if value not in (None, "") else None


def normalize_provenance(value: Any) -> str:
    provenance = str(value or "unknown").strip().lower()
    return provenance if provenance in VALID_PROVENANCE else "unknown"


def provenance_baseline_eligible(provenance: str) -> bool:
    return provenance == "scheduled"


def archive_context(run_stamp: str, runs_dir: Path, observations_dir: Path) -> dict[str, Any]:
    observation = load_json(observations_dir / f"{run_stamp}.json")
    summary = load_json(runs_dir / f"summary_{run_stamp}.json")
    queries = normalized_query_lines(runs_dir / f"queries_{run_stamp}.txt")
    run = observation.get("run", {}) if isinstance(observation, dict) else {}
    provenance = normalize_provenance(run.get("provenance"))
    baseline_eligible = (
        bool(run.get("baseline_eligible"))
        if "baseline_eligible" in run
        else False
    )
    return {
        "summary": summary if isinstance(summary, dict) else {},
        "query_hash": query_hash(queries),
        "config_key": run.get("config_key"),
        "track": run.get("track"),
        "provenance": provenance,
        "baseline_eligible": baseline_eligible,
    }


def compatibility(current_summary: dict[str, Any], current_qhash: str | None, config_key: str | None, track: str | None, other: dict[str, Any]) -> dict[str, Any]:
    current_pipeline = summary_pipeline_version(current_summary)
    other_pipeline = summary_pipeline_version(other.get("summary") or {})
    pipeline = "compatible" if current_pipeline and other_pipeline and current_pipeline == other_pipeline else ("unknown" if not current_pipeline or not other_pipeline else "incompatible")

    other_qhash = other.get("query_hash")
    query = "compatible" if current_qhash and other_qhash and current_qhash == other_qhash else ("unknown" if not current_qhash or not other_qhash else "incompatible")

    current_cfg = {"window_hours": current_summary.get("since_hours"), "min_score": current_summary.get("min_score")}
    other_summary = other.get("summary") or {}
    other_cfg = {"window_hours": other_summary.get("since_hours"), "min_score": other_summary.get("min_score")}
    numeric_known = all(current_cfg[k] is not None and other_cfg[k] is not None for k in current_cfg)
    numeric_match = numeric_known and all(current_cfg[k] == other_cfg[k] for k in current_cfg)
    if config_key and other.get("config_key") and track and other.get("track") and numeric_known:
        config = "compatible" if numeric_match and config_key == other.get("config_key") and track == other.get("track") else "incompatible"
    elif numeric_known:
        config = "partial" if numeric_match else "incompatible"
    else:
        config = "unknown"

    structurally_compatible = pipeline == "compatible" and query == "compatible" and config in {"compatible", "partial"}
    baseline_eligible = bool(other.get("baseline_eligible"))
    return {
        "pipeline_version": pipeline,
        "query": query,
        "config": config,
        "provenance": normalize_provenance(other.get("provenance")),
        "baseline_eligible": baseline_eligible,
        "structurally_compatible": structurally_compatible,
        "compatible_for_baseline": structurally_compatible and baseline_eligible,
    }


def comparable_history(history: list[dict[str, Any]], current_at: datetime, current_summary: dict[str, Any], qhash: str | None, config_key: str | None, track: str | None, runs_dir: Path, observations_dir: Path):
    eligible_rows, incompatible_rows, ineligible_rows = [], [], []
    for row in sorted(history, key=lambda x: str(x.get("run_at") or "")):
        dt = parse_time(row.get("run_at"))
        run_stamp = str(row.get("run_stamp") or "")
        if dt is None or dt >= current_at or not run_stamp:
            continue
        other = archive_context(run_stamp, runs_dir, observations_dir)
        if isinstance(other.get("summary"), dict) and not other["summary"].get("pipeline_version"):
            if row.get("pipeline_version"):
                other["summary"]["pipeline_version"] = row.get("pipeline_version")
        if other.get("provenance") == "unknown" and row.get("provenance"):
            other["provenance"] = normalize_provenance(row.get("provenance"))
        if not other.get("baseline_eligible") and row.get("baseline_eligible") is True:
            other["baseline_eligible"] = True

        comp = compatibility(current_summary, qhash, config_key, track, other)
        item = dict(row)
        item["_compatibility"] = comp
        item["_provenance"] = comp["provenance"]
        item["_baseline_eligible"] = comp["baseline_eligible"]

        if not comp["structurally_compatible"]:
            incompatible_rows.append(item)
        elif not comp["baseline_eligible"]:
            ineligible_rows.append(item)
        else:
            eligible_rows.append(item)
    return eligible_rows, incompatible_rows, ineligible_rows

def median(values: list[float]) -> float | None:
    return float(statistics.median(values)) if values else None


def baseline_window(
    label: str,
    hours: int,
    current_at: datetime,
    eligible_rows: list[dict[str, Any]],
    incompatible_rows: list[dict[str, Any]],
    ineligible_rows: list[dict[str, Any]],
    expected_cadence_minutes: int,
) -> dict[str, Any]:
    start = current_at - timedelta(hours=hours)
    within, anchor = [], None
    for row in eligible_rows:
        dt = parse_time(row.get("run_at"))
        if dt is None:
            continue
        if dt <= start:
            anchor = row
        elif dt < current_at:
            within.append(row)

    earliest = parse_time(within[0].get("run_at")) if within else None
    coverage_hours = float(hours) if anchor is not None else round((current_at - earliest).total_seconds() / 3600, 2) if earliest else 0.0
    coverage_complete = anchor is not None and bool(within)

    timeline = ([parse_time(anchor.get("run_at"))] if anchor else []) + [parse_time(row.get("run_at")) for row in within] + [current_at]
    timeline = sorted({dt for dt in timeline if dt})
    gaps = [(timeline[i] - timeline[i - 1]).total_seconds() / 60 for i in range(1, len(timeline))]
    max_gap_minutes = round(max(gaps), 1) if gaps else None
    max_expected_gap_minutes = int(expected_cadence_minutes * 1.5)
    cadence_within_tolerance = bool(gaps) and max_gap_minutes <= max_expected_gap_minutes
    sampling_quality = "insufficient" if not within else ("adequate" if cadence_within_tolerance else "sparse")

    incompatible_in_window = []
    for row in incompatible_rows:
        dt = parse_time(row.get("run_at"))
        if dt and start <= dt < current_at:
            incompatible_in_window.append(row)

    ineligible_in_window = []
    for row in ineligible_rows:
        dt = parse_time(row.get("run_at"))
        if dt and start <= dt < current_at:
            ineligible_in_window.append(row)

    def nums(key: str) -> list[float]:
        return [float(row[key]) for row in within if isinstance(row.get(key), (int, float))]

    provenance_counts: dict[str, int] = {}
    for row in ineligible_in_window:
        provenance = str(row.get("_provenance") or "unknown")
        provenance_counts[provenance] = provenance_counts.get(provenance, 0) + 1

    return {
        "window": label,
        "hours": hours,
        "complete": coverage_complete,
        "coverage_complete": coverage_complete,
        "coverage_hours": coverage_hours,
        "sample_count": len(within),
        "max_gap_minutes": max_gap_minutes,
        "sampling_quality": sampling_quality,
        "sampling": {
            "quality": sampling_quality,
            "eligible_sample_count": len(within),
            "expected_cadence_minutes": expected_cadence_minutes,
            "max_expected_gap_minutes": max_expected_gap_minutes,
            "max_gap_minutes": max_gap_minutes,
            "cadence_within_tolerance": cadence_within_tolerance,
        },
        "compatibility": {
            "pipeline_version": "compatible",
            "query": "compatible",
            "config": "compatible" if all((row.get("_compatibility") or {}).get("config") == "compatible" for row in within) else "partial",
            "excluded_incompatible_samples": len(incompatible_in_window),
            "excluded_pipeline_mismatch": sum(1 for row in incompatible_in_window if (row.get("_compatibility") or {}).get("pipeline_version") == "incompatible"),
            "excluded_query_mismatch": sum(1 for row in incompatible_in_window if (row.get("_compatibility") or {}).get("query") == "incompatible"),
            "excluded_config_mismatch": sum(1 for row in incompatible_in_window if (row.get("_compatibility") or {}).get("config") == "incompatible"),
            "excluded_baseline_ineligible_samples": len(ineligible_in_window),
            "excluded_provenance_counts": provenance_counts,
        },
        "metrics": {
            "clean_signals_median": median(nums("unique_signals")),
            "new_3h_median": median(nums("new_3h")),
            "new_12h_median": median(nums("new_12h")),
            "clean_rate_pct_median": median(nums("clean_rate_pct")),
        },
    }

def evidence_entry(row: dict[str, Any], is_new: bool) -> dict[str, Any]:
    ann = classify_intent(normalize_text(row.get("text")))
    text = normalize_text(row.get("text"))
    return {
        "post_id": post_id(row),
        "username": row.get("username"),
        "posted_at": iso_z(posted_at(row)),
        "first_seen_at": iso_z(first_seen(row)),
        "permalink": row.get("permalink"),
        "is_new_since_previous": is_new,
        "excerpt": text if len(text) <= 360 else text[:357] + "...",
        "derived_annotation": {
            "authoritative": False,
            "classifier": f"{CLASSIFIER_NAME}:{CLASSIFIER_VERSION}",
            "kind": ann["kind"],
            "category": ann["category"],
        },
    }


def build_bundle(*, summary: dict[str, Any], snapshot_rows: list[dict[str, Any]], history: list[dict[str, Any]], queries: list[str], failed_queries: list[str], snapshot_path: Path, runs_dir: Path, snapshots_dir: Path, observations_dir: Path, track: str | None, config_key: str | None, evidence_limit: int = DEFAULT_EVIDENCE_LIMIT, run_provenance: str = "unknown", workflow_event: str | None = None, github_run_id: str | None = None, expected_cadence_minutes: int = DEFAULT_EXPECTED_CADENCE_MINUTES):
    run_stamp = str(summary.get("run_stamp") or "")
    run_at = parse_time(summary.get("run_at"))
    if not run_stamp or run_at is None:
        raise ValueError("summary.run_stamp and summary.run_at are required")

    pipeline_version = summary_pipeline_version(summary)
    qhash = query_hash(queries)
    provenance = normalize_provenance(run_provenance)
    baseline_eligible = provenance_baseline_eligible(provenance)
    expected_cadence_minutes = max(1, int(expected_cadence_minutes))
    current_clean = clean_rows(snapshot_rows)
    current_ids = {post_id(row) for row in current_clean if post_id(row)}
    authors = {str(row.get("username") or "").strip().lower() for row in current_clean if str(row.get("username") or "").strip()}

    eligible_rows, incompatible_rows, ineligible_rows = comparable_history(history, run_at, summary, qhash, config_key, track, runs_dir, observations_dir)
    previous = eligible_rows[-1] if eligible_rows else None
    previous_stamp = str(previous.get("run_stamp") or "") if previous else ""
    previous_path = snapshots_dir / f"snapshot_{previous_stamp}.json" if previous_stamp else None
    previous_rows = load_json(previous_path, []) if previous_path and previous_path.exists() else []
    previous_ids = {post_id(row) for row in clean_rows(previous_rows) if post_id(row)}
    overlap_available = bool(previous and previous_path and previous_path.exists())
    new_ids = current_ids - previous_ids if overlap_available else set()
    retained_ids = current_ids & previous_ids if overlap_available else set()

    baselines = {
        "24h": baseline_window("24h", 24, run_at, eligible_rows, incompatible_rows, ineligible_rows, expected_cadence_minutes),
        "72h": baseline_window("72h", 72, run_at, eligible_rows, incompatible_rows, ineligible_rows, expected_cadence_minutes),
        "7d": baseline_window("7d", 168, run_at, eligible_rows, incompatible_rows, ineligible_rows, expected_cadence_minutes),
    }

    flags = []
    for key, value in baselines.items():
        if not value["coverage_complete"]:
            flags.extend([f"baseline_{key}_incomplete", f"baseline_{key}_coverage_incomplete"])
        if value["sampling_quality"] == "sparse":
            flags.append(f"baseline_{key}_sampling_sparse")
        elif value["sampling_quality"] == "insufficient":
            flags.append(f"baseline_{key}_sampling_insufficient")
    if previous is None:
        flags.append("previous_comparable_run_missing")
    elif not overlap_available:
        flags.append("previous_snapshot_missing")
    if failed_queries:
        flags.append("all_queries_failed" if len(failed_queries) >= len(queries) and queries else "partial_query_failure")
    if any((row.get("_compatibility") or {}).get("pipeline_version") == "incompatible" for row in incompatible_rows):
        flags.append("incompatible_pipeline_history_present")
    if any((row.get("_compatibility") or {}).get("query") == "incompatible" for row in incompatible_rows):
        flags.append("incompatible_query_history_present")
    if any((row.get("_compatibility") or {}).get("config") == "incompatible" for row in incompatible_rows):
        flags.append("incompatible_config_history_present")
    if ineligible_rows:
        flags.append("baseline_ineligible_history_present")
    if any(str(row.get("_provenance") or "unknown") == "unknown" for row in ineligible_rows):
        flags.append("unknown_provenance_history_present")

    current = {
        "raw_rows": summary.get("raw_rows", 0),
        "snapshot_unique": summary.get("snapshot_unique_rows", len(snapshot_rows)),
        "dedupe_unique": summary.get("dedupe_unique_signals", 0),
        "clean_signals": summary.get("unique_signals", len(current_clean)),
        "excluded_transactions": summary.get("excluded_transactions", 0),
        "suppressed_duplicates": summary.get("suppressed_duplicates", 0),
        "clean_rate_pct": summary.get("clean_rate_pct", 0),
        "new_3h": summary.get("new_3h", 0),
        "new_12h": summary.get("new_12h", 0),
        "unique_authors": len(authors),
        "author_diversity_ratio": round(len(authors) / len(current_clean), 4) if current_clean else None,
        "duplicate_adjusted_volume": summary.get("dedupe_unique_signals", 0),
    }

    previous_obj = None
    if previous:
        prev_at = parse_time(previous.get("run_at"))
        previous_obj = {
            "run_stamp": previous.get("run_stamp"),
            "run_at": previous.get("run_at"),
            "elapsed_minutes": round((run_at - prev_at).total_seconds() / 60, 1) if prev_at else None,
            "pipeline_version": previous.get("pipeline_version"),
            "clean_signals": previous.get("unique_signals"),
            "new_3h": previous.get("new_3h"),
            "new_12h": previous.get("new_12h"),
            "clean_rate_pct": previous.get("clean_rate_pct"),
            "compatibility": previous.get("_compatibility"),
        }

    ranked = sorted(current_clean, key=lambda row: (0 if post_id(row) in new_ids else 1, -(posted_at(row).timestamp() if posted_at(row) else 0), post_id(row)))
    evidence_limit = max(1, min(50, int(evidence_limit)))
    evidence = [evidence_entry(row, post_id(row) in new_ids) for row in ranked[:evidence_limit]]

    observation_id = f"{config_key or 'unknown'}:{run_stamp}:{pipeline_version or 'unknown'}"
    fingerprint = sha256_file(snapshot_path)
    bundle = {
        "schema_version": SCHEMA_VERSION,
        "observation_id": observation_id,
        "run": {
            "run_stamp": run_stamp,
            "run_at": iso_z(run_at),
            "status": "failed" if queries and len(failed_queries) >= len(queries) else "degraded" if failed_queries else "success",
            "pipeline_version": pipeline_version,
            "track": track,
            "config_key": config_key,
            "query_hash": qhash,
            "query_count": len(queries),
            "window_hours": summary.get("since_hours"),
            "min_score": summary.get("min_score"),
            "provenance": provenance,
            "baseline_eligible": baseline_eligible,
            "workflow_event": workflow_event,
            "github_run_id": github_run_id,
        },
        "lineage": {
            "snapshot_ref": f"collector/archive/snapshots/snapshot_{run_stamp}.json",
            "summary_ref": f"collector/archive/runs/summary_{run_stamp}.json",
            "queries_ref": f"collector/archive/runs/queries_{run_stamp}.txt",
            "failed_queries_ref": f"collector/archive/runs/failed_queries_{run_stamp}.txt",
            "snapshot_fingerprint": f"sha256:{fingerprint}" if fingerprint else None,
            "master_dependency": False,
        },
        "deterministic_facts": {
            "current": current,
            "previous_comparable_run": previous_obj,
            "delta": {
                "overlap_available": overlap_available,
                "new_signal_count": len(new_ids) if overlap_available else None,
                "retained_signal_count": len(retained_ids) if overlap_available else None,
                "clean_signal_delta": current["clean_signals"] - int(previous.get("unique_signals") or 0) if previous else None,
                "rolling_3h_delta": current["new_3h"] - int(previous.get("new_3h") or 0) if previous else None,
                "rolling_12h_delta": current["new_12h"] - int(previous.get("new_12h") or 0) if previous else None,
            },
            "baselines": baselines,
        },
        "derived_annotations": derived_clusters(current_clean),
        "evidence": {
            "total_clean_evidence": len(current_clean),
            "limit": evidence_limit,
            "returned": len(evidence),
            "items": evidence,
        },
        "data_quality": {
            "flags": sorted(set(flags)),
            "failed_query_count": len(failed_queries),
            "query_count": len(queries),
            "baseline_complete_24h": baselines["24h"]["coverage_complete"],
            "baseline_complete_72h": baselines["72h"]["coverage_complete"],
            "baseline_complete_7d": baselines["7d"]["coverage_complete"],
            "baseline_sampling_quality_24h": baselines["24h"]["sampling_quality"],
            "baseline_sampling_quality_72h": baselines["72h"]["sampling_quality"],
            "baseline_sampling_quality_7d": baselines["7d"]["sampling_quality"],
            "incompatible_history_sample_count": len(incompatible_rows),
            "baseline_ineligible_history_sample_count": len(ineligible_rows),
        },
    }
    event = {
        "event_type": "nextstop.observation.bundle.ready",
        "event_version": EVENT_VERSION,
        "event_id": observation_id,
        "idempotency_key": observation_id,
        "occurred_at": iso_z(run_at),
        "delivery": {"mode": "manifest_only", "emitted": False, "phase": "phase1"},
        "run": {"run_stamp": run_stamp, "pipeline_version": pipeline_version, "status": bundle["run"]["status"], "provenance": provenance, "baseline_eligible": baseline_eligible},
        "bundle_ref": f"collector/archive/observations/{run_stamp}.json",
        "summary": {
            "clean_count": current["clean_signals"],
            "new_signal_count": bundle["deterministic_facts"]["delta"]["new_signal_count"],
            "quality_flag_count": len(bundle["data_quality"]["flags"]),
        },
    }
    return bundle, event


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--summary", required=True)
    parser.add_argument("--snapshot", required=True)
    parser.add_argument("--history", required=True)
    parser.add_argument("--queries", required=True)
    parser.add_argument("--failed-queries")
    parser.add_argument("--archive-runs-dir", default="collector/archive/runs")
    parser.add_argument("--archive-snapshots-dir", default="collector/archive/snapshots")
    parser.add_argument("--archive-observations-dir", default="collector/archive/observations")
    parser.add_argument("--track")
    parser.add_argument("--config-key")
    parser.add_argument("--evidence-limit", type=int, default=DEFAULT_EVIDENCE_LIMIT)
    parser.add_argument("--run-provenance", choices=sorted(VALID_PROVENANCE), default="unknown")
    parser.add_argument("--workflow-event")
    parser.add_argument("--github-run-id")
    parser.add_argument("--expected-cadence-minutes", type=int, default=DEFAULT_EXPECTED_CADENCE_MINUTES)
    parser.add_argument("--output", default="collector/output/observation_bundle.json")
    parser.add_argument("--event-output", default="collector/output/observation_event.json")
    args = parser.parse_args()

    summary = load_json(Path(args.summary))
    snapshot = load_json(Path(args.snapshot), [])
    history = load_json(Path(args.history), [])
    if not isinstance(summary, dict) or not isinstance(snapshot, list):
        raise SystemExit("invalid observation inputs")
    if not isinstance(history, list):
        history = []

    bundle, event = build_bundle(
        summary=summary,
        snapshot_rows=snapshot,
        history=history,
        queries=normalized_query_lines(Path(args.queries)),
        failed_queries=normalized_query_lines(Path(args.failed_queries)) if args.failed_queries else [],
        snapshot_path=Path(args.snapshot),
        runs_dir=Path(args.archive_runs_dir),
        snapshots_dir=Path(args.archive_snapshots_dir),
        observations_dir=Path(args.archive_observations_dir),
        track=args.track,
        config_key=args.config_key,
        evidence_limit=args.evidence_limit,
        run_provenance=args.run_provenance,
        workflow_event=args.workflow_event,
        github_run_id=args.github_run_id,
        expected_cadence_minutes=args.expected_cadence_minutes,
    )
    write_json(Path(args.output), bundle)
    write_json(Path(args.event_output), event)
    print(json.dumps({
        "observation_id": bundle["observation_id"],
        "evidence_returned": bundle["evidence"]["returned"],
        "quality_flags": bundle["data_quality"]["flags"],
        "event_emitted": event["delivery"]["emitted"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
