#!/usr/bin/env python3
import argparse
import csv
import hashlib
import json
import re
import unicodedata
from difflib import SequenceMatcher
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

CSV_FIELDS = [
    "id",
    "text",
    "query",
    "username",
    "permalink",
    "timestamp",
    "media_type",
    "relevance_score",
    "relevance_tier",
    "matched_terms",
    "source_queries",
    "retrieval_sources",
    "searched_at",
    "first_seen_at",
    "last_seen_at",
    "seen_count",
    "content_cluster_id",
    "signal_counted",
    "duplicate_group_size",
    "duplicate_reason",
]

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

def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def unique(values: list[Any]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for value in values:
        if value is None:
            continue
        s = str(value).strip()
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out

def key_for(row: dict[str, Any]) -> str:
    return str(row.get("permalink") or row.get("id") or "").strip()

def normalize_content(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).lower()
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"[@#]", "", text)
    text = re.sub(r"[^0-9a-z\u3400-\u9fff]+", "", text)
    return text

def cluster_id_for(username: str, canonical: str) -> str:
    digest = hashlib.sha1(f"{username.lower()}|{canonical}".encode("utf-8")).hexdigest()[:16]
    return f"dup_{digest}"

def assign_content_clusters(rows: list[dict[str, Any]], window_hours: int = 12, threshold: float = 0.90) -> list[dict[str, Any]]:
    ordered = sorted(
        rows,
        key=lambda r: (
            str(r.get("username") or "").lower(),
            parse_time(r.get("timestamp")) or parse_time(r.get("first_seen_at")) or datetime.max.replace(tzinfo=timezone.utc),
            key_for(r),
        ),
    )
    groups: list[dict[str, Any]] = []

    for row in ordered:
        username = str(row.get("username") or "").strip().lower()
        norm = normalize_content(row.get("text"))
        row_time = parse_time(row.get("timestamp")) or parse_time(row.get("first_seen_at"))
        matched_group = None
        matched_rule = ""

        if username and norm:
            for group in reversed(groups):
                if group["username"] != username:
                    continue
                group_time = group["last_time"]
                if row_time and group_time and abs((row_time - group_time).total_seconds()) > window_hours * 3600:
                    continue
                if norm == group["canonical"]:
                    matched_group = group
                    matched_rule = "same_author_exact"
                    break
                ratio = SequenceMatcher(None, norm, group["canonical"], autojunk=False).ratio()
                if ratio >= threshold:
                    matched_group = group
                    matched_rule = "same_author_near_duplicate"
                    break

        if matched_group is None:
            cid = cluster_id_for(username or "unknown", norm or key_for(row))
            matched_group = {
                "id": cid,
                "username": username,
                "canonical": norm or key_for(row),
                "rows": [],
                "last_time": row_time,
                "rule": "",
            }
            groups.append(matched_group)
        else:
            if matched_rule == "same_author_near_duplicate":
                matched_group["rule"] = "same_author_near_duplicate"
            elif matched_rule == "same_author_exact" and matched_group["rule"] != "same_author_near_duplicate":
                matched_group["rule"] = "same_author_exact"
            if row_time and (matched_group["last_time"] is None or row_time > matched_group["last_time"]):
                matched_group["last_time"] = row_time

        matched_group["rows"].append(row)

    for group in groups:
        size = len(group["rows"])
        reason = group["rule"] if size > 1 else ""
        representative = min(
            group["rows"],
            key=lambda r: (
                parse_time(r.get("timestamp")) or parse_time(r.get("first_seen_at")) or datetime.max.replace(tzinfo=timezone.utc),
                key_for(r),
            ),
        )
        rep_key = key_for(representative)
        for row in group["rows"]:
            row["content_cluster_id"] = group["id"]
            row["duplicate_group_size"] = size
            row["duplicate_reason"] = reason
            row["signal_counted"] = key_for(row) == rep_key
    return rows

def duplicate_review_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_cluster: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        cid = str(row.get("content_cluster_id") or "")
        if cid:
            by_cluster.setdefault(cid, []).append(row)

    out: list[dict[str, Any]] = []
    for cid, members in by_cluster.items():
        if len(members) <= 1:
            continue
        representative = next((r for r in members if r.get("signal_counted")), members[0])
        links = unique([r.get("permalink") for r in members])
        rule = "same_author_near_duplicate" if any(
            r.get("duplicate_reason") == "same_author_near_duplicate" for r in members
        ) else "same_author_exact"
        out.append({
            "cluster_id": cid,
            "username": representative.get("username") or "",
            "query": representative.get("query") or "",
            "raw_posts": len(members),
            "suppressed": max(0, len(members) - 1),
            "rule": rule,
            "sample_text": representative.get("text") or "",
            "representative_url": representative.get("permalink") or "",
            "duplicate_links": links,
        })
    return sorted(out, key=lambda r: (-int(r["raw_posts"]), r["cluster_id"]))

def normalize_row(row: dict[str, Any], run_at: str) -> dict[str, Any]:
    item = dict(row)
    query = str(item.get("query") or "").strip()

    source_queries = item.get("source_queries")
    if not isinstance(source_queries, list):
        source_queries = []
    item["source_queries"] = unique([*source_queries, query])

    matched_terms = item.get("matched_terms")
    if not isinstance(matched_terms, list):
        matched_terms = []
    item["matched_terms"] = unique(matched_terms)

    retrieval_sources = item.get("retrieval_sources")
    if not isinstance(retrieval_sources, list):
        retrieval_sources = []
    item["retrieval_sources"] = unique(retrieval_sources)

    item["relevance_score"] = int(item.get("relevance_score") or 0)
    item["first_seen_at"] = str(item.get("first_seen_at") or run_at)
    item["last_seen_at"] = run_at
    item["seen_count"] = int(item.get("seen_count") or 1)
    return item

def merge_rows(existing: dict[str, Any], incoming: dict[str, Any], *, increment_seen: bool) -> dict[str, Any]:
    out = dict(existing)

    out["source_queries"] = unique([
        *(existing.get("source_queries") if isinstance(existing.get("source_queries"), list) else []),
        *(incoming.get("source_queries") if isinstance(incoming.get("source_queries"), list) else []),
    ])
    out["matched_terms"] = unique([
        *(existing.get("matched_terms") if isinstance(existing.get("matched_terms"), list) else []),
        *(incoming.get("matched_terms") if isinstance(incoming.get("matched_terms"), list) else []),
    ])
    out["retrieval_sources"] = unique([
        *(existing.get("retrieval_sources") if isinstance(existing.get("retrieval_sources"), list) else []),
        *(incoming.get("retrieval_sources") if isinstance(incoming.get("retrieval_sources"), list) else []),
    ])

    old_score = int(existing.get("relevance_score") or 0)
    new_score = int(incoming.get("relevance_score") or 0)
    if new_score > old_score:
        for field in [
            "query", "text", "username", "permalink", "timestamp",
            "media_type", "relevance_score", "relevance_tier", "searched_at",
        ]:
            if incoming.get(field) not in (None, ""):
                out[field] = incoming[field]
    else:
        old_searched = parse_time(existing.get("searched_at"))
        new_searched = parse_time(incoming.get("searched_at"))
        if new_searched and (not old_searched or new_searched > old_searched):
            out["searched_at"] = incoming.get("searched_at")

    first_candidates = [
        parse_time(existing.get("first_seen_at")),
        parse_time(incoming.get("first_seen_at")),
    ]
    first_candidates = [x for x in first_candidates if x is not None]
    if first_candidates:
        out["first_seen_at"] = min(first_candidates).isoformat().replace("+00:00", "Z")

    last_candidates = [
        parse_time(existing.get("last_seen_at")),
        parse_time(incoming.get("last_seen_at")),
    ]
    last_candidates = [x for x in last_candidates if x is not None]
    if last_candidates:
        out["last_seen_at"] = max(last_candidates).isoformat().replace("+00:00", "Z")

    if increment_seen:
        out["seen_count"] = int(existing.get("seen_count") or 1) + 1
    else:
        out["seen_count"] = max(
            int(existing.get("seen_count") or 1),
            int(incoming.get("seen_count") or 1),
        )

    return out

def load_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or not line.startswith("{"):
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(value, dict):
                rows.append(value)
    return rows

def load_raw_dir(raw_dir: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for path in sorted(raw_dir.glob("*.jsonl")):
        rows.extend(load_jsonl(path))
    return rows

def sort_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        rows,
        key=lambda r: (
            -int(r.get("relevance_score") or 0),
            str(r.get("timestamp") or ""),
            str(r.get("permalink") or r.get("id") or ""),
        ),
    )

def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")

def write_json(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(rows, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

def csv_value(value: Any) -> Any:
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return value

def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({field: csv_value(row.get(field, "")) for field in CSV_FIELDS})

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", default="collector/raw")
    parser.add_argument("--output-dir", default="collector/output")
    parser.add_argument("--state-dir", default="collector/state")
    parser.add_argument("--min-score", type=int, default=30)
    parser.add_argument("--since-hours", type=int, default=12)
    parser.add_argument("--since-days", type=int, default=None, help="legacy override; converted to hours")
    parser.add_argument("--run-stamp", required=True)
    args = parser.parse_args()

    run_at = iso_now()
    window_hours = args.since_days * 24 if args.since_days is not None else args.since_hours
    since = datetime.now(timezone.utc) - timedelta(hours=window_hours)
    raw_rows = load_raw_dir(Path(args.raw_dir))

    snapshot_by_key: dict[str, dict[str, Any]] = {}
    for raw in raw_rows:
        row = normalize_row(raw, run_at)
        if int(row.get("relevance_score") or 0) < args.min_score:
            continue

        ts = parse_time(row.get("timestamp"))
        if ts is None or ts < since:
            continue

        key = key_for(row)
        if not key:
            continue

        if key in snapshot_by_key:
            snapshot_by_key[key] = merge_rows(snapshot_by_key[key], row, increment_seen=False)
        else:
            snapshot_by_key[key] = row

    snapshot_rows = sort_rows(assign_content_clusters(list(snapshot_by_key.values()), window_hours=window_hours))

    output_dir = Path(args.output_dir)
    snapshot_jsonl = output_dir / f"snapshot_{args.run_stamp}.jsonl"
    snapshot_json = output_dir / f"snapshot_{args.run_stamp}.json"
    snapshot_csv = output_dir / f"snapshot_{args.run_stamp}.csv"
    write_jsonl(snapshot_jsonl, snapshot_rows)
    write_json(snapshot_json, snapshot_rows)
    write_csv(snapshot_csv, snapshot_rows)

    state_dir = Path(args.state_dir)
    master_jsonl = state_dir / "master.jsonl"
    master_rows = load_jsonl(master_jsonl)

    master_by_key: dict[str, dict[str, Any]] = {}
    for raw in master_rows:
        row = normalize_row(raw, str(raw.get("last_seen_at") or run_at))
        key = key_for(row)
        if key:
            master_by_key[key] = row

    for row in snapshot_rows:
        key = key_for(row)
        if key in master_by_key:
            master_by_key[key] = merge_rows(master_by_key[key], row, increment_seen=True)
        else:
            master_by_key[key] = row

    master = sort_rows(assign_content_clusters(list(master_by_key.values()), window_hours=window_hours))
    write_jsonl(master_jsonl, master)
    write_csv(state_dir / "master.csv", master)

    write_jsonl(output_dir / "master.jsonl", master)
    write_json(output_dir / "master.json", master)
    write_csv(output_dir / "master.csv", master)

    duplicate_rows = duplicate_review_rows(snapshot_rows)
    write_jsonl(output_dir / "duplicate_review.jsonl", duplicate_rows)
    write_json(output_dir / "duplicate_review.json", duplicate_rows)

    unique_signals = sum(1 for row in snapshot_rows if row.get("signal_counted"))
    suppressed_duplicates = max(0, len(snapshot_rows) - unique_signals)
    duplicate_clusters = len(duplicate_rows)

    summary = {
        "run_at": run_at,
        "run_stamp": args.run_stamp,
        "raw_rows": len(raw_rows),
        "snapshot_unique_rows": len(snapshot_rows),
        "master_unique_rows": len(master),
        "min_score": args.min_score,
        "since_hours": window_hours,
        "unique_signals": unique_signals,
        "suppressed_duplicates": suppressed_duplicates,
        "duplicate_clusters": duplicate_clusters,
    }
    (output_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False))

if __name__ == "__main__":
    main()
