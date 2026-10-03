#!/usr/bin/env python3
import argparse, json, re, unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path

def norm(text):
    text=unicodedata.normalize("NFKC",str(text or "")).lower()
    text=re.sub(r"https?://\S+"," ",text)
    text=re.sub(r"[@#]","",text)
    return re.sub(r"[^0-9a-z\u3400-\u9fff]+","",text)

def parse_ts(v):
    try:
        s=str(v or "")
        if s.endswith("Z"): s=s[:-1]+"+00:00"
        d=datetime.fromisoformat(s)
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except Exception:
        return None

def load_rows(raw_dir):
    rows=[]
    for path in sorted(Path(raw_dir).glob("query_*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip(): continue
            try: rows.append(json.loads(line))
            except json.JSONDecodeError: pass
    return rows

def dedupe(rows):
    exact=set(); kept=[]; author_groups=defaultdict(list)
    for row in sorted(rows,key=lambda r: parse_ts(r.get("timestamp")) or datetime.min.replace(tzinfo=timezone.utc)):
        key=str(row.get("permalink") or row.get("id") or "")
        if key and key in exact: continue
        if key: exact.add(key)
        author=str(row.get("username") or "").strip().lower()
        n=norm(row.get("text"))
        duplicate=False
        for prior in author_groups[author][-8:]:
            if n and (n==prior or SequenceMatcher(None,n,prior,autojunk=False).ratio()>=0.90):
                duplicate=True; break
        if duplicate: continue
        author_groups[author].append(n)
        kept.append(row)
    return kept

def event_status(edges):
    signal_count=sum(e["signal_count"] for e in edges)
    authors=len(set(a for e in edges for a in e["authors"]))
    persistent=sum(1 for e in edges if e["snapshot_persistence"]>=2)
    if len(edges)>=2 and authors>=2 and persistent>=2: return "active"
    if (len(edges)>=2 and signal_count>=2) or (authors>=2 and persistent>=1): return "watch"
    return "observe"

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--raw-dir",required=True)
    p.add_argument("--query-plan",required=True)
    p.add_argument("--artists",required=True)
    p.add_argument("--events",required=True)
    p.add_argument("--previous")
    p.add_argument("--run-stamp",required=True)
    p.add_argument("--output",required=True)
    args=p.parse_args()

    plan=json.loads(Path(args.query_plan).read_text(encoding="utf-8"))
    artists=json.loads(Path(args.artists).read_text(encoding="utf-8"))["artists"]
    events={e["event_id"]:dict(e) for e in json.loads(Path(args.events).read_text(encoding="utf-8"))["events"]
    previous={}
    if args.previous and Path(args.previous).exists():
        try: previous=json.loads(Path(args.previous).read_text(encoding="utf-8"))
        except Exception: previous={}
    prev_edges={(e["source_entity"],e["target_need"]):e for e in previous.get("edges",[])}

    raw=load_rows(args.raw_dir)
    clean=dedupe(raw)
    query_map={q["query"]:q for q in plan["queries"]}
    edge_posts=defaultdict(list)
    edge_authors=defaultdict(set)

    for row in clean:
        q=query_map.get(str(row.get("query") or "").strip())
        if not q: continue
        text=str(row.get("text") or "")
        lower=text.lower()
        entity_hit=(
            any(a.lower() in lower for a in q.get("aliases",[]) if a)
            or any(v.lower() in lower for v in q.get("venue_names",[]) if v)
            or any(n.lower() in lower for n in q.get("event_names",[]) if n)
        )
        need_hit=any(str(term).lower() in lower for term in q.get("need_terms",[]) if term)
        if not (entity_hit and need_hit):
            continue
        author=str(row.get("username") or "unknown").strip().lower()
        for event_id in q["event_ids"]:
            key=(event_id,q["need_id"],q["need_label"])
            # Same-author burst cap: one independent signal per author per edge per snapshot.
            if author in edge_authors[key]:
                continue
            edge_authors[key].add(author)
            edge_posts[key].append(row)

    edges=[]
    now=datetime.now(timezone.utc).isoformat().replace("+00:00","Z")
    for (event_id,need_id,need_label),posts in edge_posts.items():
        authors=sorted({str(p.get("username") or "unknown") for p in posts})
        times=[parse_ts(p.get("timestamp")) for p in posts if parse_ts(p.get("timestamp"))]
        prev=prev_edges.get((event_id,need_id),{})
        supporting=[]; seen_links=set()
        for p in posts:
            link=str(p.get("permalink") or "")
            if link in seen_links: continue
            seen_links.add(link)
            supporting.append({"id":str(p.get("id") or ""),"username":str(p.get("username") or ""),"text":str(p.get("text") or "")[:500],"permalink":link,"timestamp":p.get("timestamp")})
            if len(supporting)>=5: break
        edges.append({
            "source_entity":event_id,"target_need":need_id,"target_label":need_label,
            "signal_count":len(posts),"unique_author_count":len(authors),"authors":authors,
            "first_seen":min(times).isoformat().replace("+00:00","Z") if times else now,
            "last_seen":max(times).isoformat().replace("+00:00","Z") if times else now,
            "window":"current_snapshot","change":len(posts)-int(prev.get("signal_count",0)),
            "snapshot_persistence":int(prev.get("snapshot_persistence",0))+1,
            "supporting_posts":supporting
        })

    by_event=defaultdict(list)
    for e in edges: by_event[e["source_entity"]].append(e)
    event_rows=[]; status_counts={"observe":0,"watch":0,"active":0}
    for event_id,event in events.items():
        es=sorted(by_event[event_id],key=lambda x:(-x["unique_author_count"],-x["signal_count"],x["target_label"]))
        status=event_status(es)
        status_counts[status]+=1
        event_rows.append({**event,"trend_status":status,"signal_count":sum(x["signal_count"] for x in es),"unique_author_count":len(set(a for x in es for a in x["authors"])),"need_edge_count":len(es),"need_edges":[x["target_label"] for x in es],"last_updated":now})
    event_rows.sort(key=lambda e:({"active":0,"watch":1,"observe":2}[e["trend_status"]],e["event_date"],-e["signal_count"]))

    payload={
        "schema_version":"trend-radar-v0.1","generated_at":now,"run_stamp":args.run_stamp,"window":"upcoming_90d",
        "artist_seed_count":len(artists),"event_candidate_count":len(events),
        "query_count":plan["query_count"],"raw_result_count":len(raw),"clean_result_count":len(clean),
        "active_edge_count":len(edges),"status_counts":status_counts,"events":event_rows,"edges":edges,
        "supporting_evidence":[p for e in edges for p in e["supporting_posts"]][:30]
    }
    Path(args.output).parent.mkdir(parents=True,exist_ok=True)
    Path(args.output).write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("[trend-snapshot]",json.dumps({k:payload[k] for k in ["artist_seed_count","event_candidate_count","query_count","raw_result_count","clean_result_count","active_edge_count","status_counts"]},ensure_ascii=False))
if __name__=="__main__": main()
