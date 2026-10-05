#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

NOTION_VERSION = "2026-03-11"
TAIPEI = ZoneInfo("Asia/Taipei")


def notion_request(path: str, token: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        "https://api.notion.com/v1" + path,
        data=data,
        method="POST" if body is not None else "GET",
        headers={
            "Authorization": "Bearer " + token,
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
            "User-Agent": "next-stop-live-review-archive",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def plain_text(prop: dict | None) -> str:
    if not prop:
        return ""
    if prop.get("type") == "rich_text":
        return "".join(str(x.get("plain_text") or "") for x in prop.get("rich_text") or [])
    if prop.get("type") == "title":
        return "".join(str(x.get("plain_text") or "") for x in prop.get("title") or [])
    return ""


def select_name(prop: dict | None) -> str:
    if not prop or prop.get("type") != "select":
        return ""
    return str((prop.get("select") or {}).get("name") or "")


def date_value(prop: dict | None) -> str:
    if not prop or prop.get("type") != "date":
        return ""
    return str((prop.get("date") or {}).get("start") or "")


def url_value(prop: dict | None) -> str:
    if not prop or prop.get("type") != "url":
        return ""
    return str(prop.get("url") or "")


def number_value(prop: dict | None) -> float:
    if not prop or prop.get("type") != "number":
        return 0.0
    value = prop.get("number")
    return float(value) if isinstance(value, (int, float)) else 0.0


def multi_select_values(prop: dict | None) -> list[str]:
    if not prop or prop.get("type") != "multi_select":
        return []
    return [
        str(x.get("name") or "")
        for x in prop.get("multi_select") or []
        if str(x.get("name") or "")
    ]


def taipei_date(value: str) -> str:
    if not value:
        return ""
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(TAIPEI).date().isoformat()


def page_to_row(page: dict) -> dict | None:
    props = page.get("properties") or {}
    post_key = plain_text(props.get("Post Key"))
    label_name = select_name(props.get("Label"))
    label = (
        "relevant" if label_name == "Relevant"
        else "irrelevant" if label_name == "Irrelevant"
        else "unsure" if label_name == "Unsure"
        else ""
    )
    if not post_key or not label:
        return None

    window_name = select_name(props.get("Window"))
    reviewed_at = (
        date_value(props.get("Reviewed At"))
        or str(page.get("last_edited_time") or page.get("created_time") or "")
    )

    return {
        "id": "notion_" + str(page.get("id") or post_key),
        "post_key": post_key,
        "post_id": plain_text(props.get("Post ID")) or None,
        "permalink": url_value(props.get("Original Link")) or None,
        "snapshot_id": plain_text(props.get("Snapshot ID")),
        "window": window_name if window_name in {"1d", "3d", "5d"} else "3d",
        "label": label,
        "original_label": None,
        "label_updated_at": None,
        "category": plain_text(props.get("Category")) or "Uncategorized",
        "original_category": None,
        "category_source": "system",
        "category_updated_at": None,
        "username": plain_text(props.get("Username")) or None,
        "posted_at": date_value(props.get("Posted At")) or None,
        "query": plain_text(props.get("Query")) or None,
        "text_excerpt": plain_text(props.get("Text")),
        "feature_tags": multi_select_values(props.get("Feature Tags")),
        "base_score": number_value(props.get("Base Score")),
        "deck_generated_at": reviewed_at,
        "reviewed_at": reviewed_at,
    }


def list_rows(data_source_id: str, token: str) -> list[dict]:
    rows: list[dict] = []
    cursor = None
    while True:
        body = {"page_size": 100}
        if cursor:
            body["start_cursor"] = cursor
        response = notion_request("/data_sources/" + data_source_id + "/query", token, body)
        for item in response.get("results") or []:
            if item.get("object") != "page":
                continue
            row = page_to_row(item)
            if row:
                rows.append(row)
        if not response.get("has_more"):
            break
        cursor = response.get("next_cursor")
        if not cursor:
            break
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument(
        "--data-source-id",
        default=os.environ.get("NOTION_SIGNAL_REVIEW_DATA_SOURCE_ID", "1c78f7c4-8325-4838-aa5b-64c6c1b88a22"),
    )
    args = parser.parse_args()

    token = os.environ.get("NOTION_TOKEN", "")
    if not token:
        raise SystemExit("NOTION_TOKEN is missing")

    datetime.strptime(args.date, "%Y-%m-%d")
    rows = list_rows(args.data_source_id, token)
    selected = [row for row in rows if taipei_date(str(row.get("reviewed_at") or "")) == args.date]
    selected.sort(key=lambda row: str(row.get("reviewed_at") or ""))

    payload = {
        "schema_version": "signal-review-archive-v0.1",
        "archive_date": args.date,
        "timezone": "Asia/Taipei",
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "notion:signal-review",
        "count": len(selected),
        "relevant_count": sum(1 for row in selected if row["label"] == "relevant"),
        "irrelevant_count": sum(1 for row in selected if row["label"] == "irrelevant"),
        "unsure_count": sum(1 for row in selected if row["label"] == "unsure"),
        "rows": selected,
    }

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        "[review-archive]",
        "date=" + args.date,
        "count=" + str(payload["count"]),
        "relevant=" + str(payload["relevant_count"]),
        "irrelevant=" + str(payload["irrelevant_count"]),
        "unsure=" + str(payload["unsure_count"]),
    )


if __name__ == "__main__":
    main()
