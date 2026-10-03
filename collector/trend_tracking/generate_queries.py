#!/usr/bin/env python3
import argparse, json
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / "config"

QUERY_CATALOG = [
    {"query":"高鐵","family":"mobility_hsr","axis":"mobility","language_context":"zh-Hant"},
    {"query":"火車","family":"mobility_rail","axis":"mobility","language_context":"zh-Hant"},
    {"query":"捷運","family":"mobility_metro","axis":"mobility","language_context":"zh-Hant"},
    {"query":"客運","family":"mobility_bus","axis":"mobility","language_context":"zh-Hant"},
    {"query":"飛機","family":"mobility_flight","axis":"mobility","language_context":"zh-Hant"},
    {"query":"機票","family":"mobility_airfare","axis":"mobility","language_context":"zh-Hant"},
    {"query":"接駁","family":"mobility_shuttle","axis":"mobility","language_context":"zh-Hant"},
    {"query":"train","family":"mobility_train_en","axis":"mobility","language_context":"English"},
    {"query":"flight","family":"mobility_flight_en","axis":"mobility","language_context":"English"},
    {"query":"散場","family":"timing_dispersal","axis":"timing","language_context":"zh-Hant"},
    {"query":"末班車","family":"timing_last_train","axis":"timing","language_context":"zh-Hant"},
    {"query":"來得及","family":"timing_feasibility","axis":"timing","language_context":"zh-Hant"},
    {"query":"幾點結束","family":"timing_end_time","axis":"timing","language_context":"zh-Hant"},
    {"query":"last train","family":"timing_last_train_en","axis":"timing","language_context":"English"},
    {"query":"住宿","family":"stay_lodging","axis":"stay","language_context":"zh-Hant"},
    {"query":"飯店","family":"stay_hotel","axis":"stay","language_context":"zh-Hant"},
    {"query":"過夜","family":"stay_overnight","axis":"stay","language_context":"zh-Hant"},
    {"query":"隔天回","family":"stay_next_day_return","axis":"stay","language_context":"zh-Hant"},
]
def load(name):
    return json.loads((CONFIG / name).read_text(encoding="utf-8"))

def build_plan(today: date, budget: int):
    events = []
    for event in load("events.json")["events"]:
        try:
            days = (date.fromisoformat(event["event_date"]) - today).days
        except Exception:
            continue
        if -1 <= days <= 90:
            events.append(event)

    bounded = max(1, min(int(budget), 40))
    selected = QUERY_CATALOG[:bounded]
    rows = []
    for index, row in enumerate(selected, start=1):
        rows.append({
            "query_id": f"q{index:02d}",
            **row,
            "event_context": "concert_or_resolved_entity_post_filter",
            "upcoming_event_count": len(events),
        })

    return {
        "schema_version": "trend-query-plan-v0.2",
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00","Z"),
        "today": today.isoformat(),
        "sampling_strategy": "need_led_observation",
        "budget": bounded,
        "candidate_count": len(QUERY_CATALOG),
        "query_count": len(rows),
        "language_contexts_supported": ["zh-Hant","zh-Hans","HK Chinese","English","mixed"],
        "queries": rows,
    }

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--budget", type=int, default=18)
    p.add_argument("--date")
    p.add_argument("--output-dir", default=str(ROOT / "output"))
    args=p.parse_args()
    today=date.fromisoformat(args.date) if args.date else date.today()
    plan=build_plan(today,args.budget)
    out=Path(args.output_dir); out.mkdir(parents=True, exist_ok=True)
    (out/"query_plan.json").write_text(json.dumps(plan,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (out/"queries.txt").write_text("\n".join(q["query"] for q in plan["queries"])+"\n",encoding="utf-8")
    print(f"[trend-query] strategy={plan['sampling_strategy']} selected={plan['query_count']} candidates={plan['candidate_count']} budget={plan['budget']}")
if __name__=="__main__": main()
