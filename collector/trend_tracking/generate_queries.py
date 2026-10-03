#!/usr/bin/env python3
import argparse, json
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / "config"

def load(name):
    return json.loads((CONFIG / name).read_text(encoding="utf-8"))

def build_plan(today: date, budget: int):
    artists = {a["artist_id"]: a for a in load("artists.json")["artists"]}
    needs = sorted(load("needs.json")["action_terms"], key=lambda x: -int(x["priority"]))
    events = load("events.json")["events"]
    grouped = {}
    for event in events:
        event_day = date.fromisoformat(event["event_date"])
        days = (event_day - today).days
        if days < -1 or days > 90:
            continue
        artist = artists[event["artist_id"]]
        per_event = 5 if days <= 30 else 4 if days <= 60 else 3
        for need in needs[:per_event]:
            query = f"{artist['canonical_name']} {need['terms'][0]}"
            key = (event["artist_id"], need["need_id"], query)
            score = int(need["priority"]) + max(0, 90 - days) / 30
            if key not in grouped:
                grouped[key] = {
                    "artist_id": event["artist_id"],
                    "artist_name": artist["canonical_name"],
                    "need_id": need["need_id"],
                    "need_label": need["label"],
                    "need_terms": need["terms"],
                    "query": query,
                    "priority": score,
                    "aliases": artist["aliases"],
                    "event_ids": [],
                    "event_names": [],
                    "event_dates": [],
                    "venue_names": [],
                    "cities": []
                }
            row = grouped[key]
            row["priority"] = max(row["priority"], score)
            row["event_ids"].append(event["event_id"])
            row["event_names"].append(event["event_name"])
            row["event_dates"].append(event["event_date"])
            row["venue_names"].append(event["venue_name"])
            row["cities"].append(event["city"])
    rows = sorted(grouped.values(), key=lambda x: (-x["priority"], min(x["event_dates"]), x["artist_name"], x["need_label"]))
    selected = rows[:budget]
    return {
        "schema_version": "trend-query-plan-v0.1",
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00","Z"),
        "today": today.isoformat(),
        "budget": budget,
        "candidate_count": len(rows),
        "query_count": len(selected),
        "queries": selected
    }

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--budget", type=int, default=18)
    p.add_argument("--date")
    p.add_argument("--output-dir", default=str(ROOT / "output"))
    args=p.parse_args()
    today=date.fromisoformat(args.date) if args.date else date.today()
    plan=build_plan(today, max(1,min(args.budget,40)))
    out=Path(args.output_dir); out.mkdir(parents=True, exist_ok=True)
    (out/"query_plan.json").write_text(json.dumps(plan,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (out/"queries.txt").write_text("\n".join(q["query"] for q in plan["queries"])+"\n",encoding="utf-8")
    print(f"[trend-query] selected={plan['query_count']} candidates={plan['candidate_count']} budget={plan['budget']}")
if __name__=="__main__": main()
