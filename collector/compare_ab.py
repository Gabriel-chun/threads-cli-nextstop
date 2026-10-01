#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))

def load_rows(path):
    p=Path(path)
    if not p.exists():
        return []
    return [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip().startswith("{")]

def ids(rows):
    return {str(r.get("permalink") or r.get("id") or "") for r in rows if (r.get("permalink") or r.get("id"))}

p=argparse.ArgumentParser()
p.add_argument("--http-summary", required=True)
p.add_argument("--browser-summary", required=True)
p.add_argument("--http-snapshot", required=True)
p.add_argument("--browser-snapshot", required=True)
p.add_argument("--output-json", required=True)
p.add_argument("--output-md", required=True)
a=p.parse_args()

hs=load_json(a.http_summary)
bs=load_json(a.browser_summary)
hr=load_rows(a.http_snapshot)
br=load_rows(a.browser_snapshot)
hi,bi=ids(hr),ids(br)

result={
 "test":"Collector V0.2 A/B",
 "A":{"mode":"http","raw_rows":hs.get("raw_rows",0),"snapshot_unique":hs.get("snapshot_unique_rows",0),"clean_signals":hs.get("unique_signals",0),"failed_queries":None},
 "B":{"mode":"browser","raw_rows":bs.get("raw_rows",0),"snapshot_unique":bs.get("snapshot_unique_rows",0),"clean_signals":bs.get("unique_signals",0),"failed_queries":None},
 "overlap":{"snapshot_posts":len(hi & bi),"http_only":len(hi-bi),"browser_only":len(bi-hi)},
 "browser_gain":{"raw_rows":bs.get("raw_rows",0)-hs.get("raw_rows",0),"snapshot_unique":bs.get("snapshot_unique_rows",0)-hs.get("snapshot_unique_rows",0),"clean_signals":bs.get("unique_signals",0)-hs.get("unique_signals",0)}
}
Path(a.output_json).write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
md=[
 "# Collector V0.2 A/B Test",
 "",
 "| Metric | A: HTTP public page | B: Anonymous Chromium | Δ B-A |",
 "|---|---:|---:|---:|",
 f"| Raw rows | {result['A']['raw_rows']} | {result['B']['raw_rows']} | {result['browser_gain']['raw_rows']} |",
 f"| Snapshot unique | {result['A']['snapshot_unique']} | {result['B']['snapshot_unique']} | {result['browser_gain']['snapshot_unique']} |",
 f"| Clean signals | {result['A']['clean_signals']} | {result['B']['clean_signals']} | {result['browser_gain']['clean_signals']} |",
 f"| Snapshot overlap | - | {result['overlap']['snapshot_posts']} | - |",
 f"| HTTP-only posts | {result['overlap']['http_only']} | - | - |",
 f"| Browser-only posts | - | {result['overlap']['browser_only']} | - |",
]
Path(a.output_md).write_text("\n".join(md)+"\n",encoding="utf-8")
print(json.dumps(result,ensure_ascii=False))
